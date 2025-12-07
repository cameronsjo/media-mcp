import { z } from 'zod';
import type { BookResult } from '../types/book.js';
import type { MovieResult } from '../types/movie.js';
import type { TVResult } from '../types/tv.js';
import { LookupBookTool } from './lookup-book.js';
import { LookupMovieTool } from './lookup-movie.js';
import { LookupTVTool } from './lookup-tv.js';
import { Logger } from '../utils/logger.js';

const BatchBookItemSchema = z.object({
  type: z.literal('book'),
  title: z.string().min(1),
  author: z.string().optional(),
  isbn: z.string().optional(),
});

const BatchMovieItemSchema = z.object({
  type: z.literal('movie'),
  title: z.string().min(1),
  year: z.number().int().optional(),
  tmdb_id: z.number().int().optional(),
});

const BatchTVItemSchema = z.object({
  type: z.literal('tv'),
  title: z.string().min(1),
  year: z.number().int().optional(),
  tmdb_id: z.number().int().optional(),
});

const BatchItemSchema = z.union([
  BatchBookItemSchema,
  BatchMovieItemSchema,
  BatchTVItemSchema,
]);

export const BatchLookupInputSchema = z.object({
  items: z.array(BatchItemSchema).min(1).max(50)
    .describe('Array of items to look up'),
  concurrency: z.number().int().min(1).max(10).default(3)
    .describe('Number of concurrent lookups'),
});

export type BatchLookupInput = z.infer<typeof BatchLookupInputSchema>;
type BatchItem = z.infer<typeof BatchItemSchema>;

interface BatchResultSuccess {
  index: number;
  type: 'book' | 'movie' | 'tv';
  success: true;
  result: BookResult | MovieResult | TVResult;
}

interface BatchResultError {
  index: number;
  type: 'book' | 'movie' | 'tv';
  success: false;
  error: {
    code: string;
    message: string;
  };
}

type BatchResult = BatchResultSuccess | BatchResultError;

export interface BatchLookupOutput {
  total: number;
  successful: number;
  failed: number;
  results: BatchResult[];
  _meta: {
    duration_ms: number;
    concurrency: number;
  };
}

export class BatchLookupTool {
  private bookTool: LookupBookTool;
  private movieTool: LookupMovieTool;
  private tvTool: LookupTVTool;
  private logger: Logger;

  constructor(
    bookTool: LookupBookTool,
    movieTool: LookupMovieTool,
    tvTool: LookupTVTool,
    logger: Logger
  ) {
    this.bookTool = bookTool;
    this.movieTool = movieTool;
    this.tvTool = tvTool;
    this.logger = logger;
  }

  async execute(input: BatchLookupInput): Promise<BatchLookupOutput> {
    const startTime = Date.now();
    const concurrency = input.concurrency ?? 3;

    this.logger.info('batch-lookup', {
      action: 'start',
      total_items: input.items.length,
      concurrency,
    });

    const results: BatchResult[] = [];

    // Process items in batches
    for (let i = 0; i < input.items.length; i += concurrency) {
      const batch = input.items.slice(i, i + concurrency);
      const batchPromises = batch.map((item, batchIndex) =>
        this.lookupItem(item, i + batchIndex)
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    this.logger.info('batch-lookup', {
      action: 'complete',
      total: input.items.length,
      successful,
      failed,
      duration_ms: Date.now() - startTime,
    });

    return {
      total: input.items.length,
      successful,
      failed,
      results,
      _meta: {
        duration_ms: Date.now() - startTime,
        concurrency,
      },
    };
  }

  private async lookupItem(item: BatchItem, index: number): Promise<BatchResult> {
    try {
      let result: BookResult | MovieResult | TVResult;

      switch (item.type) {
        case 'book':
          result = await this.bookTool.execute({
            title: item.title,
            author: item.author,
            isbn: item.isbn,
          });
          break;

        case 'movie':
          result = await this.movieTool.execute({
            title: item.title,
            year: item.year,
            tmdb_id: item.tmdb_id,
          });
          break;

        case 'tv':
          result = await this.tvTool.execute({
            title: item.title,
            year: item.year,
            tmdb_id: item.tmdb_id,
            include_seasons: true,
            include_episodes: false,
          });
          break;
      }

      return {
        index,
        type: item.type,
        success: true,
        result,
      };
    } catch (error) {
      const errorObj = error as { code?: string; message?: string };

      return {
        index,
        type: item.type,
        success: false,
        error: {
          code: errorObj.code ?? 'UNKNOWN_ERROR',
          message: errorObj.message ?? 'An unknown error occurred',
        },
      };
    }
  }
}
