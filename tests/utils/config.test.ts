import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import {
  ConfigSchema,
  getSourceStatusMessage,
  loadConfig,
  type SourceStatus,
} from '../../src/utils/config.js';

const CONFIG_ENV_KEYS = [
  'TMDB_API_KEY',
  'GOOGLE_BOOKS_API_KEY',
  'HARDCOVER_API_KEY',
  'MCP_TRANSPORT',
  'MCP_HTTP_PORT',
  'MCP_HTTP_HOST',
  'MCP_HTTP_PATH',
  'MCP_ALLOWED_HOSTS',
  'MCP_ALLOWED_ORIGINS',
  'MCP_AUTH_TOKEN',
  'MCP_ALLOW_UNAUTHENTICATED',
  'MCP_CACHE_ENABLED',
  'MCP_CACHE_PATH',
  'MCP_CACHE_CLEANUP_INTERVAL_MS',
  'MCP_CACHE_TTL_BOOKS',
  'MCP_CACHE_TTL_MOVIES',
  'MCP_CACHE_TTL_TV',
  'MCP_RATE_LIMIT_RPM',
  'MCP_RATE_LIMIT_RETRIES',
  'MCP_ENABLE_GOODREADS_SCRAPING',
  'MCP_LOG_LEVEL',
  'OTEL_ENABLED',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_SERVICE_NAME',
] as const;

function clearConfigEnv(): void {
  for (const key of CONFIG_ENV_KEYS) {
    vi.stubEnv(key, undefined);
  }
}

function expectValidationIssue(action: () => unknown, path: string, message: string): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(ZodError);
  if (caught instanceof ZodError) {
    expect(caught.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: [path], message })])
    );
  }
}

describe('configuration', () => {
  beforeEach(() => {
    clearConfigEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the documented defaults and reports unavailable keyed sources', () => {
    const { config, sources } = loadConfig();

    expect(config).toEqual({
      tmdbApiKey: undefined,
      googleBooksApiKey: undefined,
      hardcoverApiKey: undefined,
      transport: 'stdio',
      httpPort: 3000,
      httpHost: '127.0.0.1',
      httpPath: '/mcp',
      httpAllowedHosts: undefined,
      httpAllowedOrigins: undefined,
      httpAuthToken: undefined,
      httpAllowUnauthenticated: false,
      cacheEnabled: true,
      cachePath: './cache.db',
      cacheCleanupIntervalMs: 3600000,
      cacheTtlBooks: 604800,
      cacheTtlMovies: 86400,
      cacheTtlTv: 86400,
      rateLimitRequestsPerMinute: 30,
      rateLimitRetryAttempts: 3,
      enableGoodreadsScraping: true,
      logLevel: 'info',
      otelEnabled: false,
      otelEndpoint: undefined,
      otelServiceName: 'media-metadata-mcp',
    });
    expect(sources).toEqual([
      { name: 'OpenLibrary', available: true, reason: 'No API key required' },
      { name: 'GoogleBooks', available: false, reason: 'GOOGLE_BOOKS_API_KEY not set' },
      { name: 'TMDB', available: false, reason: 'TMDB_API_KEY not set' },
      { name: 'Goodreads', available: true, reason: undefined },
      { name: 'Hardcover', available: false, reason: 'HARDCOVER_API_KEY not set' },
    ]);
  });

  it('allows operation with only OpenLibrary available', () => {
    vi.stubEnv('MCP_ENABLE_GOODREADS_SCRAPING', 'false');

    const { config, sources } = loadConfig();

    expect(config.tmdbApiKey).toBeUndefined();
    expect(config.googleBooksApiKey).toBeUndefined();
    expect(config.hardcoverApiKey).toBeUndefined();
    expect(sources.filter((source) => source.available).map((source) => source.name)).toEqual([
      'OpenLibrary',
    ]);
  });

  it('maps every supported environment override and marks all keyed sources available', () => {
    vi.stubEnv('TMDB_API_KEY', 'fake-tmdb-key');
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'fake-google-key');
    vi.stubEnv('HARDCOVER_API_KEY', 'fake-hardcover-key');
    vi.stubEnv('MCP_TRANSPORT', 'http');
    vi.stubEnv('MCP_HTTP_PORT', '8123');
    vi.stubEnv('MCP_HTTP_HOST', '0.0.0.0');
    vi.stubEnv('MCP_HTTP_PATH', '/media');
    vi.stubEnv('MCP_AUTH_TOKEN', 'a'.repeat(32));
    vi.stubEnv('MCP_ALLOW_UNAUTHENTICATED', 'true');
    vi.stubEnv('MCP_CACHE_ENABLED', 'false');
    vi.stubEnv('MCP_CACHE_PATH', '/tmp/media-cache.db');
    vi.stubEnv('MCP_CACHE_TTL_BOOKS', '101');
    vi.stubEnv('MCP_CACHE_TTL_MOVIES', '202');
    vi.stubEnv('MCP_CACHE_TTL_TV', '303');
    vi.stubEnv('MCP_RATE_LIMIT_RPM', '404');
    vi.stubEnv('MCP_RATE_LIMIT_RETRIES', '5');
    vi.stubEnv('MCP_ENABLE_GOODREADS_SCRAPING', 'false');
    vi.stubEnv('MCP_LOG_LEVEL', 'debug');
    vi.stubEnv('OTEL_ENABLED', 'true');
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'https://otel.invalid');
    vi.stubEnv('OTEL_SERVICE_NAME', 'config-test');

    const { config, sources } = loadConfig();

    expect(config).toEqual({
      tmdbApiKey: 'fake-tmdb-key',
      googleBooksApiKey: 'fake-google-key',
      hardcoverApiKey: 'fake-hardcover-key',
      transport: 'http',
      httpPort: 8123,
      httpHost: '0.0.0.0',
      httpPath: '/media',
      httpAllowedHosts: undefined,
      httpAllowedOrigins: undefined,
      httpAuthToken: 'a'.repeat(32),
      httpAllowUnauthenticated: true,
      cacheEnabled: false,
      cachePath: '/tmp/media-cache.db',
      cacheCleanupIntervalMs: 3600000,
      cacheTtlBooks: 101,
      cacheTtlMovies: 202,
      cacheTtlTv: 303,
      rateLimitRequestsPerMinute: 404,
      rateLimitRetryAttempts: 5,
      enableGoodreadsScraping: false,
      logLevel: 'debug',
      otelEnabled: true,
      otelEndpoint: 'https://otel.invalid',
      otelServiceName: 'config-test',
    });
    expect(sources).toEqual([
      { name: 'OpenLibrary', available: true, reason: 'No API key required' },
      { name: 'GoogleBooks', available: true, reason: undefined },
      { name: 'TMDB', available: true, reason: undefined },
      { name: 'Goodreads', available: false, reason: 'Goodreads scraping disabled' },
      { name: 'Hardcover', available: true, reason: undefined },
    ]);
  });

  it('uses true-by-default boolean behavior for non-false flag values', () => {
    vi.stubEnv('MCP_CACHE_ENABLED', '0');
    vi.stubEnv('MCP_ENABLE_GOODREADS_SCRAPING', 'yes');
    vi.stubEnv('OTEL_ENABLED', '1');

    const { config } = loadConfig();

    expect(config.cacheEnabled).toBe(true);
    expect(config.enableGoodreadsScraping).toBe(true);
    expect(config.otelEnabled).toBe(false);
  });

  it('treats an empty auth token as unset and only explicit values as the opt-out', () => {
    vi.stubEnv('MCP_AUTH_TOKEN', '');
    vi.stubEnv('MCP_ALLOW_UNAUTHENTICATED', 'yes');
    const { config } = loadConfig();
    expect(config.httpAuthToken).toBeUndefined();
    expect(config.httpAllowUnauthenticated).toBe(false);

    vi.stubEnv('MCP_ALLOW_UNAUTHENTICATED', '1');
    expect(loadConfig().config.httpAllowUnauthenticated).toBe(true);
  });

  it('rejects a short or whitespace-containing auth token', () => {
    const message = 'Expected at least 32 characters with no whitespace';
    vi.stubEnv('MCP_AUTH_TOKEN', 'short-token');
    expectValidationIssue(() => loadConfig(), 'httpAuthToken', message);
    vi.stubEnv('MCP_AUTH_TOKEN', `${'a'.repeat(32)} b`);
    expectValidationIssue(() => loadConfig(), 'httpAuthToken', message);
  });

  it('falls back to integer defaults for malformed values and keeps parseInt behavior', () => {
    vi.stubEnv('MCP_HTTP_PORT', 'not-a-number');
    vi.stubEnv('MCP_CACHE_TTL_BOOKS', 'bad');
    vi.stubEnv('MCP_CACHE_TTL_MOVIES', '');
    vi.stubEnv('MCP_CACHE_TTL_TV', 'still-bad');
    vi.stubEnv('MCP_RATE_LIMIT_RPM', 'nope');
    vi.stubEnv('MCP_RATE_LIMIT_RETRIES', '4retries');

    const { config } = loadConfig();

    expect(config.httpPort).toBe(3000);
    expect(config.cacheTtlBooks).toBe(604800);
    expect(config.cacheTtlMovies).toBe(86400);
    expect(config.cacheTtlTv).toBe(86400);
    expect(config.rateLimitRequestsPerMinute).toBe(30);
    expect(config.rateLimitRetryAttempts).toBe(4);
  });

  it('rejects invalid transport, log level, and schema value types', () => {
    vi.stubEnv('MCP_TRANSPORT', 'websocket');
    expectValidationIssue(
      () => loadConfig(),
      'transport',
      "Invalid enum value. Expected 'stdio' | 'http', received 'websocket'"
    );

    vi.stubEnv('MCP_TRANSPORT', undefined);
    vi.stubEnv('MCP_LOG_LEVEL', 'trace');
    expectValidationIssue(
      () => loadConfig(),
      'logLevel',
      "Invalid enum value. Expected 'debug' | 'info' | 'warn' | 'error', received 'trace'"
    );

    expectValidationIssue(
      () => ConfigSchema.parse({ cacheEnabled: 'true' }),
      'cacheEnabled',
      'Expected boolean, received string'
    );
    expectValidationIssue(
      () => ConfigSchema.parse({ httpPort: '3000' }),
      'httpPort',
      'Expected number, received string'
    );
  });

  it('formats a message with only available sources', () => {
    const sources: SourceStatus[] = [
      { name: 'OpenLibrary', available: true },
      { name: 'TMDB', available: true },
    ];

    expect(getSourceStatusMessage(sources)).toBe('Available sources: OpenLibrary, TMDB');
  });

  it('formats unavailable source reasons after available sources', () => {
    const sources: SourceStatus[] = [
      { name: 'OpenLibrary', available: true },
      { name: 'GoogleBooks', available: false, reason: 'GOOGLE_BOOKS_API_KEY not set' },
      { name: 'Goodreads', available: false, reason: 'Goodreads scraping disabled' },
    ];

    expect(getSourceStatusMessage(sources)).toBe(
      'Available sources: OpenLibrary\n' +
        'Unavailable sources: GoogleBooks (GOOGLE_BOOKS_API_KEY not set), ' +
        'Goodreads (Goodreads scraping disabled)'
    );
  });

  it('formats an empty source list without an unavailable section', () => {
    expect(getSourceStatusMessage([])).toBe('Available sources: ');
  });
});
