import { z } from 'zod';

/**
 * Environment configuration schema with validation
 */
export const ConfigSchema = z.object({
  // API Keys
  tmdbApiKey: z.string().optional(),
  googleBooksApiKey: z.string().optional(),

  // Cache settings
  cacheDir: z.string().default('./cache'),
  cacheTtlBooks: z.number().default(86400 * 7), // 7 days
  cacheTtlMovies: z.number().default(86400), // 1 day
  cacheTtlTv: z.number().default(86400), // 1 day

  // Rate limiting
  rateLimitRequestsPerMinute: z.number().default(30),
  rateLimitRetryAttempts: z.number().default(3),

  // Transport settings
  httpPort: z.number().default(3000),
  httpHost: z.string().default('localhost'),

  // Feature flags
  enableGoodreadsScraping: z.boolean().default(true),
  enableCoverDownload: z.boolean().default(false),
  coverDownloadDir: z.string().default('./covers'),

  // Logging
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // OpenTelemetry
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
    tmdbApiKey: process.env.TMDB_API_KEY,
    googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY,
    cacheDir: process.env.CACHE_DIR,
    cacheTtlBooks: process.env.CACHE_TTL_BOOKS
      ? parseInt(process.env.CACHE_TTL_BOOKS, 10)
      : undefined,
    cacheTtlMovies: process.env.CACHE_TTL_MOVIES
      ? parseInt(process.env.CACHE_TTL_MOVIES, 10)
      : undefined,
    cacheTtlTv: process.env.CACHE_TTL_TV ? parseInt(process.env.CACHE_TTL_TV, 10) : undefined,
    rateLimitRequestsPerMinute: process.env.RATE_LIMIT_RPM
      ? parseInt(process.env.RATE_LIMIT_RPM, 10)
      : undefined,
    rateLimitRetryAttempts: process.env.RATE_LIMIT_RETRIES
      ? parseInt(process.env.RATE_LIMIT_RETRIES, 10)
      : undefined,
    httpPort: process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT, 10) : undefined,
    httpHost: process.env.HTTP_HOST,
    enableGoodreadsScraping: process.env.ENABLE_GOODREADS_SCRAPING !== 'false',
    enableCoverDownload: process.env.ENABLE_COVER_DOWNLOAD === 'true',
    coverDownloadDir: process.env.COVER_DOWNLOAD_DIR,
    logLevel: process.env.LOG_LEVEL as Config['logLevel'] | undefined,
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
