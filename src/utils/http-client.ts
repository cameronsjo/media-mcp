import { request, type Dispatcher } from 'undici';
import { Logger } from './logger.js';
import { RateLimiter, sleep } from './rate-limiter.js';

export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export interface HttpClientOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  /** Query params merged into every request (per-call params take precedence). */
  params?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
}

// User agents for anti-bot evasion. Updated January 2026.
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
];

/**
 * HTTP client wrapper with rate limiting and retry support
 */
export class HttpClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private params: Record<string, string | number | boolean | undefined>;
  private timeout: number;
  private logger: Logger;
  private rateLimiter: RateLimiter;
  private source: string;

  constructor(
    source: string,
    options: HttpClientOptions,
    logger: Logger,
    rateLimiter: RateLimiter
  ) {
    this.source = source;
    this.baseUrl = options.baseUrl ?? '';
    this.headers = options.headers ?? {};
    this.params = options.params ?? {};
    this.timeout = options.timeout ?? 30000;
    this.logger = logger;
    this.rateLimiter = rateLimiter;
  }

  /**
   * Get a random user agent for scraping
   */
  static getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  /**
   * Make an HTTP GET request
   */
  async get<T>(
    path: string,
    options?: {
      params?: Record<string, string | number | boolean | undefined>;
      headers?: Record<string, string>;
      retries?: number;
    }
  ): Promise<HttpResponse<T>> {
    const url = this.buildUrl(path, options?.params);
    return this.request<T>('GET', url, undefined, options?.headers, options?.retries);
  }

  /**
   * Make an HTTP POST request
   */
  async post<T>(
    path: string,
    body?: unknown,
    options?: {
      headers?: Record<string, string>;
      retries?: number;
    }
  ): Promise<HttpResponse<T>> {
    const url = this.buildUrl(path);
    return this.request<T>('POST', url, body, options?.headers, options?.retries);
  }

  /**
   * Resolve a request path against the base URL, preserving any path component
   * in the base. `new URL('/x', 'https://h/3')` treats the leading slash as
   * root-relative and drops the `/3`; when the base carries its own path (e.g.
   * TMDB's `/3`, Google Books' `/books/v1`) we strip the leading slash and join
   * against a slash-terminated base so the base path survives. Origin-only bases
   * and absolute/empty paths fall through to plain resolution unchanged.
   */
  private resolveUrl(path: string): URL {
    if (this.baseUrl && path.startsWith('/')) {
      const basePath = new URL(this.baseUrl).pathname.replace(/\/+$/, '');
      if (basePath !== '') {
        const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
        return new URL(path.slice(1), base);
      }
    }
    return new URL(path, this.baseUrl);
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = this.resolveUrl(path);

    // Default params first, then per-call params so callers can override defaults.
    const merged = { ...this.params, ...params };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  /**
   * Internal request method with retry logic
   */
  private async request<T>(
    method: Dispatcher.HttpMethod,
    url: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
    retries: number = 3
  ): Promise<HttpResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Wait for rate limit slot
        await this.rateLimiter.waitForSlot(this.source);

        const startTime = Date.now();

        const response = await request(url, {
          method,
          headers: {
            ...this.headers,
            ...extraHeaders,
            'Accept': 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          bodyTimeout: this.timeout,
          headersTimeout: this.timeout,
        });

        this.rateLimiter.recordRequest(this.source);

        const responseBody = await response.body.text();
        const duration = Date.now() - startTime;

        // Log the request
        this.logger.debug('http', {
          method,
          url,
          status: response.statusCode,
          duration_ms: duration,
          source: this.source,
        });

        // Handle rate limiting
        if (response.statusCode === 429) {
          const retryAfter = response.headers['retry-after'];
          const backoffMs = this.rateLimiter.triggerBackoff(this.source, attempt);

          if (attempt < retries) {
            this.logger.warning('http', {
              action: 'rate_limited',
              url,
              retry_after: retryAfter,
              attempt,
              backoff_ms: backoffMs,
            });
            await sleep(backoffMs);
            continue;
          }
        }

        // Parse response
        let data: T;
        try {
          data = JSON.parse(responseBody) as T;
        } catch {
          // If not JSON, return as string
          data = responseBody as T;
        }

        // Convert headers to simple object
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(response.headers)) {
          if (typeof value === 'string') {
            headers[key] = value;
          } else if (Array.isArray(value)) {
            headers[key] = value.join(', ');
          }
        }

        return {
          status: response.statusCode,
          data,
          headers,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        this.logger.error('http', {
          action: 'request_failed',
          method,
          url,
          error: lastError.message,
          attempt,
          source: this.source,
        });

        if (attempt < retries) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          await sleep(backoffMs);
        }
      }
    }

    throw lastError ?? new Error('Request failed after retries');
  }
}
