import { z } from 'zod';
import { RATE_LIMITS, TIMING } from './constants.js';

function safeParseInt(value: string): number | undefined {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

// The SDK guards compare hostnames, not URLs or ports. Reject wildcard or URL
// configuration rather than accidentally treating a broad value as permission.
const HostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => {
    const dnsName = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.?$/;
    const ipv6 = /^\[[0-9a-f:.]+\]$/;
    if (!dnsName.test(value) && !ipv6.test(value)) return false;
    try {
      const url = new URL(`http://${value}`);
      return !url.port && !url.username && !url.password && url.pathname === '/';
    } catch {
      return false;
    }
  }, 'Expected a hostname without scheme, port, path or wildcard')
  .transform((value) => new URL(`http://${value}`).hostname);

function parseHostnameList(value: string | undefined): string[] | undefined {
  return value === undefined ? undefined : value.split(',');
}

/**
 * Environment configuration schema with validation
 *
 * All environment variables use the MCP_ prefix for app-specific settings.
 * Standard variables (TMDB_API_KEY, GOOGLE_BOOKS_API_KEY, OTEL_*) retain their
 * conventional names for interoperability with external tools.
 */
export const ConfigSchema = z.object({
  // API Keys (standard names for interoperability)
  tmdbApiKey: z.string().optional(),
  googleBooksApiKey: z.string().optional(),
  hardcoverApiKey: z.string().optional(),

  // Transport settings
  transport: z.enum(['stdio', 'http']).default('stdio'),
  httpPort: z.number().default(3000),
  httpHost: z.string().default('127.0.0.1'),
  httpPath: z.string().default('/mcp'),
  httpAllowedHosts: z.array(HostnameSchema).min(1).optional(),
  httpAllowedOrigins: z.array(HostnameSchema).min(1).optional(),
  httpAuthToken: z
    .string()
    .regex(/^\S{32,}$/, 'Expected at least 32 characters with no whitespace')
    .optional(),
  httpAllowUnauthenticated: z.boolean().default(false),

  // Cache settings
  cacheEnabled: z.boolean().default(true),
  cachePath: z.string().default('./cache.db'),
  cacheTtlBooks: z.number().default(TIMING.SECONDS_PER_DAY * 7), // 7 days in seconds
  cacheTtlMovies: z.number().default(TIMING.SECONDS_PER_DAY), // 1 day in seconds
  cacheTtlTv: z.number().default(TIMING.SECONDS_PER_DAY), // 1 day in seconds
  cacheCleanupIntervalMs: z
    .number()
    .int()
    .positive()
    .max(2_147_483_647)
    .default(TIMING.CACHE_CLEANUP_INTERVAL_MS), // 1 hour

  // Rate limiting
  rateLimitRequestsPerMinute: z.number().default(RATE_LIMITS.DEFAULT_REQUESTS_PER_MINUTE),
  rateLimitRetryAttempts: z.number().default(RATE_LIMITS.DEFAULT_RETRY_ATTEMPTS),

  // Feature flags
  enableGoodreadsScraping: z.boolean().default(true),

  // Logging
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // OpenTelemetry (standard OTEL_ prefix for interoperability)
  otelEnabled: z.boolean().default(false),
  otelEndpoint: z.string().optional(),
  otelServiceName: z.string().default('media-metadata-mcp'),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Source availability status
 */
export interface SourceStatus {
  name: string;
  available: boolean;
  reason?: string;
}

/**
 * Validates environment and returns configuration with available sources
 */
export function loadConfig(): { config: Config; sources: SourceStatus[] } {
  const rawConfig = {
    // API Keys (standard names for interoperability)
    tmdbApiKey: process.env.TMDB_API_KEY,
    googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY,
    hardcoverApiKey: process.env.HARDCOVER_API_KEY,

    // Transport settings (MCP_ prefix)
    transport: process.env.MCP_TRANSPORT as Config['transport'] | undefined,
    httpPort: process.env.MCP_HTTP_PORT ? safeParseInt(process.env.MCP_HTTP_PORT) : undefined,
    httpHost: process.env.MCP_HTTP_HOST,
    httpPath: process.env.MCP_HTTP_PATH,
    httpAllowedHosts: parseHostnameList(process.env.MCP_ALLOWED_HOSTS),
    httpAllowedOrigins: parseHostnameList(process.env.MCP_ALLOWED_ORIGINS),
    // An empty value (e.g. an unset Compose interpolation) means no token.
    httpAuthToken: process.env.MCP_AUTH_TOKEN || undefined,
    httpAllowUnauthenticated: ['1', 'true'].includes(process.env.MCP_ALLOW_UNAUTHENTICATED ?? ''),

    // Cache settings (MCP_ prefix)
    cacheEnabled: process.env.MCP_CACHE_ENABLED !== 'false',
    cachePath: process.env.MCP_CACHE_PATH,
    cacheTtlBooks: process.env.MCP_CACHE_TTL_BOOKS
      ? safeParseInt(process.env.MCP_CACHE_TTL_BOOKS)
      : undefined,
    cacheTtlMovies: process.env.MCP_CACHE_TTL_MOVIES
      ? safeParseInt(process.env.MCP_CACHE_TTL_MOVIES)
      : undefined,
    cacheTtlTv: process.env.MCP_CACHE_TTL_TV
      ? safeParseInt(process.env.MCP_CACHE_TTL_TV)
      : undefined,
    cacheCleanupIntervalMs: process.env.MCP_CACHE_CLEANUP_INTERVAL_MS
      ? Number(process.env.MCP_CACHE_CLEANUP_INTERVAL_MS)
      : undefined,

    // Rate limiting (MCP_ prefix)
    rateLimitRequestsPerMinute: process.env.MCP_RATE_LIMIT_RPM
      ? safeParseInt(process.env.MCP_RATE_LIMIT_RPM)
      : undefined,
    rateLimitRetryAttempts: process.env.MCP_RATE_LIMIT_RETRIES
      ? safeParseInt(process.env.MCP_RATE_LIMIT_RETRIES)
      : undefined,

    // Feature flags (MCP_ prefix)
    enableGoodreadsScraping: process.env.MCP_ENABLE_GOODREADS_SCRAPING !== 'false',

    // Logging (MCP_ prefix)
    logLevel: process.env.MCP_LOG_LEVEL as Config['logLevel'] | undefined,

    // OpenTelemetry (standard OTEL_ prefix for interoperability)
    otelEnabled: process.env.OTEL_ENABLED === 'true',
    otelEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    otelServiceName: process.env.OTEL_SERVICE_NAME,
  };

  // Filter out undefined values
  const filteredConfig = Object.fromEntries(
    Object.entries(rawConfig).filter(([, v]) => v !== undefined)
  );

  const config = ConfigSchema.parse(filteredConfig);

  // Check source availability
  const sources: SourceStatus[] = [
    {
      name: 'OpenLibrary',
      available: true,
      reason: 'No API key required',
    },
    {
      name: 'GoogleBooks',
      available: !!config.googleBooksApiKey,
      reason: config.googleBooksApiKey ? undefined : 'GOOGLE_BOOKS_API_KEY not set',
    },
    {
      name: 'TMDB',
      available: !!config.tmdbApiKey,
      reason: config.tmdbApiKey ? undefined : 'TMDB_API_KEY not set',
    },
    {
      name: 'Goodreads',
      available: config.enableGoodreadsScraping,
      reason: config.enableGoodreadsScraping ? undefined : 'Goodreads scraping disabled',
    },
    {
      name: 'Hardcover',
      available: !!config.hardcoverApiKey,
      reason: config.hardcoverApiKey ? undefined : 'HARDCOVER_API_KEY not set',
    },
  ];

  return { config, sources };
}

/**
 * Get a human-readable status message for available sources
 */
export function getSourceStatusMessage(sources: SourceStatus[]): string {
  const available = sources.filter((s) => s.available);
  const unavailable = sources.filter((s) => !s.available);

  let message = `Available sources: ${available.map((s) => s.name).join(', ')}`;

  if (unavailable.length > 0) {
    message += `\nUnavailable sources: ${unavailable.map((s) => `${s.name} (${s.reason})`).join(', ')}`;
  }

  return message;
}
