import { z } from 'zod';
import type { MovieResult, LookupMovieInput } from '../types/movie.js';
import { TMDBSource } from '../sources/tmdb.js';
import { Logger } from '../utils/logger.js';

export const LookupMovieInputSchema = z.object({
  title: z.string().min(1).describe('Movie title to search for'),
  year: z.number().int().min(1800).max(2100).optional()
    .describe('Release year (improves matching accuracy)'),
  tmdb_id: z.number().int().positive().optional()
    .describe('TMDB ID if known (preferred for exact match)'),
});

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

    return result;
  }
}
