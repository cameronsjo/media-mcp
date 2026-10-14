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
    this.resetExpiredWindow(config, state, now);

    // Check backoff
    if (state.backoffUntil > now) {
      return false;
    }

    return state.requests < config.requestsPerWindow;
  }

  /**
   * Record a request
   */
  recordRequest(source: string): void {
    const config = this.configs.get(source);
    const state = this.states.get(source);
    if (config && state) {
      this.resetExpiredWindow(config, state, Date.now());
      state.requests++;
    }
  }

  /**
   * Trigger exponential backoff after a rate limit hit
   */
  triggerBackoff(source: string, attempt: number = 1): number {
    const config = this.configs.get(source);
    const state = this.states.get(source);
    if (!state) return 0;

    if (config) {
      this.resetExpiredWindow(config, state, Date.now());
    }

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

    await this.waitUntilAvailable(source, config, state);
  }

  /**
   * Wait for and atomically reserve a request slot.
   *
   * The reservation happens synchronously after the final availability check,
   * before the returned promise resolves. This keeps concurrent callers from
   * all observing the same available slot before dispatching network work.
   */
  async acquireSlot(source: string): Promise<void> {
    const config = this.configs.get(source);
    const state = this.states.get(source);

    if (!config || !state) return;

    while (true) {
      await this.waitUntilAvailable(source, config, state);

      const now = Date.now();
      this.resetExpiredWindow(config, state, now);

      if (state.backoffUntil <= now && state.requests < config.requestsPerWindow) {
        state.requests++;
        return;
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
    this.resetExpiredWindow(config, state, now);

    let waitTime = Math.max(0, state.backoffUntil - now);
    if (state.requests >= config.requestsPerWindow) {
      const windowEnd = state.windowStart + config.windowMs;
      if (windowEnd > now) {
        waitTime = Math.max(waitTime, windowEnd - now);
      }
    }

    return waitTime;
  }

  private resetExpiredWindow(config: RateLimitConfig, state: RateLimitState, now: number): void {
    if (now - state.windowStart >= config.windowMs) {
      state.requests = 0;
      state.windowStart = now;
    }
  }

  private async waitUntilAvailable(
    source: string,
    config: RateLimitConfig,
    state: RateLimitState
  ): Promise<void> {
    while (true) {
      const now = Date.now();
      this.resetExpiredWindow(config, state, now);

      if (state.backoffUntil > now) {
        const waitMs = state.backoffUntil - now;
        this.logger.debug('rate-limiter', {
          action: 'waiting_backoff',
          source,
          wait_ms: waitMs,
        });
        await sleep(waitMs);
        continue;
      }

      if (state.requests >= config.requestsPerWindow) {
        const windowEnd = state.windowStart + config.windowMs;
        if (windowEnd > now) {
          const waitMs = windowEnd - now;
          this.logger.debug('rate-limiter', {
            action: 'waiting_window',
            source,
            wait_ms: waitMs,
          });
          await sleep(waitMs);
          continue;
        }
      }

      return;
    }
  }
}

/**
 * Sleep for a fixed number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simple delay utility for anti-detection in scraping.
 * If maxMs is provided, uses a random delay between minMs and maxMs.
 */
export function delay(minMs: number, maxMs?: number): Promise<void> {
  const ms = maxMs ? minMs + Math.random() * (maxMs - minMs) : minMs;
  return sleep(ms);
}
