import { Logger } from './logger.js';

interface RateLimitConfig {
  requestsPerWindow: number;
  windowMs: number;
}

interface RateLimitState {
  requests: number;
  windowStart: number;
  backoffUntil: number;
}

/**
 * Simple rate limiter with exponential backoff
 */
export class RateLimiter {
  private states: Map<string, RateLimitState> = new Map();
  private configs: Map<string, RateLimitConfig> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Configure rate limit for a source
   */
  configure(source: string, config: RateLimitConfig): void {
    this.configs.set(source, config);
    this.states.set(source, {
      requests: 0,
      windowStart: Date.now(),
      backoffUntil: 0,
    });
  }

  /**
   * Check if a request can be made
   */
  canRequest(source: string): boolean {
    const config = this.configs.get(source);
    const state = this.states.get(source);

    if (!config || !state) return true; // No limit configured

    const now = Date.now();

    // Check backoff
    if (state.backoffUntil > now) {
      return false;
    }

    // Reset window if expired
    if (now - state.windowStart >= config.windowMs) {
      state.requests = 0;
      state.windowStart = now;
    }

    return state.requests < config.requestsPerWindow;
  }

  /**
   * Record a request
   */
  recordRequest(source: string): void {
    const state = this.states.get(source);
    if (state) {
      state.requests++;
    }
  }

  /**
   * Trigger exponential backoff after a rate limit hit
   */
  triggerBackoff(source: string, attempt: number = 1): number {
    const state = this.states.get(source);
    if (!state) return 0;

    // Exponential backoff: 2^attempt seconds (2s, 4s, 8s, 16s, 32s, max 60s)
    const backoffMs = Math.min(Math.pow(2, attempt) * 1000, 60000);
    state.backoffUntil = Date.now() + backoffMs;

    this.logger.warning('rate-limiter', {
      action: 'backoff_triggered',
      source,
      attempt,
      backoff_ms: backoffMs,
    });

    return backoffMs;
  }

  /**
   * Wait until a request can be made
   */
  async waitForSlot(source: string): Promise<void> {
    const config = this.configs.get(source);
    const state = this.states.get(source);

    if (!config || !state) return;

    const now = Date.now();

    // Wait for backoff to clear
    if (state.backoffUntil > now) {
      const waitMs = state.backoffUntil - now;
      this.logger.debug('rate-limiter', {
        action: 'waiting_backoff',
        source,
        wait_ms: waitMs,
      });
      await this.sleep(waitMs);
    }

    // Wait for window to reset if at limit
    if (state.requests >= config.requestsPerWindow) {
      const windowEnd = state.windowStart + config.windowMs;
      if (windowEnd > Date.now()) {
        const waitMs = windowEnd - Date.now();
        this.logger.debug('rate-limiter', {
          action: 'waiting_window',
          source,
          wait_ms: waitMs,
        });
        await this.sleep(waitMs);
        // Reset after waiting
        state.requests = 0;
        state.windowStart = Date.now();
      }
    }
  }

  /**
   * Get time until next request is allowed
   */
  getWaitTime(source: string): number {
    const config = this.configs.get(source);
    const state = this.states.get(source);

    if (!config || !state) return 0;

    const now = Date.now();

    // Check backoff first
    if (state.backoffUntil > now) {
      return state.backoffUntil - now;
    }

    // Check window limit
    if (state.requests >= config.requestsPerWindow) {
      const windowEnd = state.windowStart + config.windowMs;
      if (windowEnd > now) {
        return windowEnd - now;
      }
    }

    return 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Simple delay utility for anti-detection in scraping
 */
export async function delay(minMs: number, maxMs?: number): Promise<void> {
  const ms = maxMs ? minMs + Math.random() * (maxMs - minMs) : minMs;
  return new Promise(resolve => setTimeout(resolve, ms));
}
