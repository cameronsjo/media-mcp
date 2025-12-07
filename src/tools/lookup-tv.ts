import { z } from 'zod';
import type { TVResult, LookupTVInput } from '../types/tv.js';
import { TMDBSource } from '../sources/tmdb.js';
import { Logger } from '../utils/logger.js';

export const LookupTVInputSchema = z.object({
  title: z.string().min(1).describe('TV show title to search for'),
  year: z.number().int().min(1900).max(2100).optional()
    .describe('First air year (improves matching accuracy)'),
  tmdb_id: z.number().int().positive().optional()
    .describe('TMDB ID if known (preferred for exact match)'),
  include_seasons: z.boolean().default(true)
    .describe('Include season information'),
  include_episodes: z.boolean().default(false)
    .describe('Include episode details for each season'),
});

export class LookupTVTool {
  private tmdb: TMDBSource;
  private logger: Logger;

  constructor(tmdb: TMDBSource, logger: Logger) {
    this.tmdb = tmdb;
    this.logger = logger;
  }

  async execute(input: LookupTVInput): Promise<TVResult> {
    const startTime = Date.now();

    this.logger.info('lookup-tv', {
      action: 'start',
      title: input.title,
      year: input.year,
      tmdb_id: input.tmdb_id,
      include_seasons: input.include_seasons,
      include_episodes: input.include_episodes,
    });

    let tmdbId: number | undefined = input.tmdb_id;

    // Search for TV show if no ID provided
    if (!tmdbId) {
      const searchResult = await this.tmdb.searchTV(input.title, input.year);
      tmdbId = searchResult ?? undefined;

      if (!tmdbId) {
        this.logger.warning('lookup-tv', {
          action: 'not_found',
          title: input.title,
          year: input.year,
          duration_ms: Date.now() - startTime,
        });

        throw {
          code: 'NOT_FOUND',
          message: `No TV show found matching "${input.title}"${input.year ? ` (${input.year})` : ''}`,
          retryable: false,
        };
      }
    }

    // Get full TV show details
    const result = await this.tmdb.getTVDetails(
      tmdbId,
      input.include_seasons ?? true,
      input.include_episodes ?? false
    );

    if (!result) {
      this.logger.error('lookup-tv', {
        action: 'details_failed',
        tmdb_id: tmdbId,
        duration_ms: Date.now() - startTime,
      });

      throw {
        code: 'SOURCE_ERROR',
        message: `Failed to retrieve TV show details for TMDB ID ${tmdbId}`,
        source: 'tmdb',
        retryable: true,
      };
    }

    this.logger.info('lookup-tv', {
      action: 'complete',
      title: result.title,
      tmdb_id: tmdbId,
      total_seasons: result.total_seasons,
      duration_ms: Date.now() - startTime,
    });

    return result;
  }
}
