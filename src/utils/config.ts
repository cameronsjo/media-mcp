import { z } from 'zod';

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

  // Transport settings
  transport: z.enum(['stdio', 'http']).default('stdio'),
  httpPort: z.number().default(3000),
  httpHost: z.string().default('127.0.0.1'),
  httpPath: z.string().default('/mcp'),

  // Cache settings
  cacheEnabled: z.boolean().default(true),
  cachePath: z.string().default('./cache.db'),
  cacheTtlBooks: z.number().default(86400 * 7), // 7 days in seconds
  cacheTtlMovies: z.number().default(86400), // 1 day in seconds
  cacheTtlTv: z.number().default(86400), // 1 day in seconds

  // Rate limiting
  rateLimitRequestsPerMinute: z.number().default(30),
  rateLimitRetryAttempts: z.number().default(3),

  // Feature flags
  enableGoodreadsScraping: z.boolean().default(true),
  enableCoverDownload: z.boolean().default(false),
  coverDownloadDir: z.string().default('./covers'),

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

    // Transport settings (MCP_ prefix)
    transport: process.env.MCP_TRANSPORT as Config['transport'] | undefined,
    httpPort: process.env.MCP_HTTP_PORT ? parseInt(process.env.MCP_HTTP_PORT, 10) : undefined,
    httpHost: process.env.MCP_HTTP_HOST,
    httpPath: process.env.MCP_HTTP_PATH,

    // Cache settings (MCP_ prefix)
    cacheEnabled: process.env.MCP_CACHE_ENABLED !== 'false',
    cachePath: process.env.MCP_CACHE_PATH,
    cacheTtlBooks: process.env.MCP_CACHE_TTL_BOOKS
      ? parseInt(process.env.MCP_CACHE_TTL_BOOKS, 10)
      : undefined,
    cacheTtlMovies: process.env.MCP_CACHE_TTL_MOVIES
      ? parseInt(process.env.MCP_CACHE_TTL_MOVIES, 10)
      : undefined,
    cacheTtlTv: process.env.MCP_CACHE_TTL_TV
      ? parseInt(process.env.MCP_CACHE_TTL_TV, 10)
      : undefined,

    // Rate limiting (MCP_ prefix)
    rateLimitRequestsPerMinute: process.env.MCP_RATE_LIMIT_RPM
      ? parseInt(process.env.MCP_RATE_LIMIT_RPM, 10)
      : undefined,
    rateLimitRetryAttempts: process.env.MCP_RATE_LIMIT_RETRIES
      ? parseInt(process.env.MCP_RATE_LIMIT_RETRIES, 10)
      : undefined,

    // Feature flags (MCP_ prefix)
    enableGoodreadsScraping: process.env.MCP_ENABLE_GOODREADS_SCRAPING !== 'false',
    enableCoverDownload: process.env.MCP_ENABLE_COVER_DOWNLOAD === 'true',
    coverDownloadDir: process.env.MCP_COVER_DOWNLOAD_DIR,

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

/**
 * Validate that required sources are available for a given media type
 */
export function validateSourcesForMediaType(
  mediaType: 'book' | 'movie' | 'tv',
  sources: SourceStatus[]
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (mediaType === 'book') {
    const bookSources = sources.filter(
      (s) => ['OpenLibrary', 'GoogleBooks', 'Goodreads'].includes(s.name) && s.available
    );
    if (bookSources.length === 0) {
      return { valid: false, warnings: ['No book sources available'] };
    }
    if (!sources.find((s) => s.name === 'GoogleBooks')?.available) {
      warnings.push('Google Books unavailable - results may be less comprehensive');
    }
  }

  if (mediaType === 'movie' || mediaType === 'tv') {
    const tmdb = sources.find((s) => s.name === 'TMDB');
    if (!tmdb?.available) {
      return {
        valid: false,
        warnings: ['TMDB_API_KEY required for movie/TV lookups'],
      };
    }
  }

  return { valid: true, warnings };
}
