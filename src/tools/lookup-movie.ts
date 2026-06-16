import { z } from 'zod';
import type { MovieResult, LookupMovieInput, RegionalWatchProviders } from '../types/movie.js';
import { TMDBSource } from '../sources/tmdb.js';
import { Logger } from '../utils/logger.js';

export const LookupMovieInputSchema = z.object({
  title: z.string().min(1).describe('Movie title to search for'),
  year: z.number().int().min(1800).max(2100).optional()
    .describe('Release year (improves matching accuracy)'),
  tmdb_id: z.number().int().positive().optional()
    .describe('TMDB ID if known (preferred for exact match)'),
  include_watch_providers: z.boolean().default(false)
    .describe('Include the regional watch-providers map (large — ~100 regions). Off by default to keep responses compact.'),
  watch_provider_regions: z.array(z.string()).optional()
    .describe('Restrict watch_providers to these ISO country codes, e.g. ["US"]. Implies inclusion.'),
});

/**
 * Shape the regional watch-providers map per the caller's request. The full map
 * spans ~100 region keys and dominates the movie payload (a context bomb for
 * agents), so it is omitted unless explicitly asked for. A region filter implies
 * inclusion. Returns a new object — never mutates the (possibly cached) input.
 */
export function shapeWatchProviders(
  providers: RegionalWatchProviders,
  opts: { includeWatchProviders: boolean; watchProviderRegions?: string[] }
): RegionalWatchProviders {
  const hasRegionFilter = !!opts.watchProviderRegions && opts.watchProviderRegions.length > 0;
  if (!opts.includeWatchProviders && !hasRegionFilter) {
    return {};
  }
  if (hasRegionFilter) {
    const wanted = new Set(opts.watchProviderRegions!.map((r) => r.toUpperCase()));
    const filtered: RegionalWatchProviders = {};
    for (const [region, data] of Object.entries(providers)) {
      if (wanted.has(region.toUpperCase())) {
        filtered[region] = data;
      }
    }
    return filtered;
  }
  return providers;
}

export class LookupMovieTool {
  private tmdb: TMDBSource;
  private logger: Logger;

  constructor(tmdb: TMDBSource, logger: Logger) {
    this.tmdb = tmdb;
    this.logger = logger;
  }

  async execute(input: LookupMovieInput): Promise<MovieResult> {
    const startTime = Date.now();

    this.logger.info('lookup-movie', {
      action: 'start',
      title: input.title,
      year: input.year,
      tmdb_id: input.tmdb_id,
    });

    let tmdbId: number | undefined = input.tmdb_id;

    // Search for movie if no ID provided
    if (!tmdbId) {
      const searchResult = await this.tmdb.searchMovie(input.title, input.year);
      tmdbId = searchResult ?? undefined;

      if (!tmdbId) {
        this.logger.warning('lookup-movie', {
          action: 'not_found',
          title: input.title,
          year: input.year,
          duration_ms: Date.now() - startTime,
        });

        throw {
          code: 'NOT_FOUND',
          message: `No movie found matching "${input.title}"${input.year ? ` (${input.year})` : ''}`,
          retryable: false,
        };
      }
    }

    // Get full movie details
    const result = await this.tmdb.getMovieDetails(tmdbId);

    if (!result) {
      this.logger.error('lookup-movie', {
        action: 'details_failed',
        tmdb_id: tmdbId,
        duration_ms: Date.now() - startTime,
      });

      throw {
        code: 'SOURCE_ERROR',
        message: `Failed to retrieve movie details for TMDB ID ${tmdbId}`,
        source: 'tmdb',
        retryable: true,
      };
    }

    this.logger.info('lookup-movie', {
      action: 'complete',
      title: result.title,
      tmdb_id: tmdbId,
      duration_ms: Date.now() - startTime,
    });

    // Trim the watch-providers map (off by default) before returning. Return a
    // new object so the cached MovieResult is never mutated.
    return {
      ...result,
      watch_providers: shapeWatchProviders(result.watch_providers, {
        includeWatchProviders: input.include_watch_providers,
        watchProviderRegions: input.watch_provider_regions,
      }),
    };
  }
}
