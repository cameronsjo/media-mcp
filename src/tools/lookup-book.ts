import { z } from 'zod';
import type { BookResult, PartialBookData, LookupBookInput } from '../types/book.js';
import { OpenLibrarySource } from '../sources/open-library.js';
import { Logger } from '../utils/logger.js';

export const LookupBookInputSchema = z.object({
  title: z.string().min(1).describe('Book title to search for'),
  author: z.string().optional().describe('Author name (recommended for better matching)'),
  isbn: z.string().optional().describe('ISBN-10 or ISBN-13 (preferred if available)'),
  sources: z.array(z.enum(['open_library', 'google_books', 'goodreads', 'hardcover']))
    .optional()
    .describe('Sources to query (defaults to all available)'),
});

export class LookupBookTool {
  private openLibrary: OpenLibrarySource;
  private logger: Logger;

  constructor(openLibrary: OpenLibrarySource, logger: Logger) {
    this.openLibrary = openLibrary;
    this.logger = logger;
  }

  async execute(input: LookupBookInput): Promise<BookResult> {
    const startTime = Date.now();
    const sourcesQueried: string[] = [];
    const sourcesFailed: string[] = [];

    this.logger.info('lookup-book', {
      action: 'start',
      title: input.title,
      author: input.author,
      isbn: input.isbn,
    });

    let result: PartialBookData | null = null;

    // Strategy 1: If ISBN provided, use it first
    if (input.isbn) {
      sourcesQueried.push('open_library');
      result = await this.openLibrary.searchByISBN(input.isbn);

      if (!result) {
        sourcesFailed.push('open_library');
      }
    }

    // Strategy 2: Search by title and author
    if (!result) {
      sourcesQueried.push('open_library');
      result = await this.openLibrary.searchByTitleAuthor(input.title, input.author);

      if (!result && !sourcesFailed.includes('open_library')) {
        sourcesFailed.push('open_library');
      }
    }

    // If no result found, throw error
    if (!result) {
      this.logger.warning('lookup-book', {
        action: 'not_found',
        title: input.title,
        author: input.author,
        isbn: input.isbn,
        duration_ms: Date.now() - startTime,
      });

      throw {
        code: 'NOT_FOUND',
        message: `No book found matching "${input.title}"${input.author ? ` by ${input.author}` : ''}`,
        retryable: false,
      };
    }

    // Build the final result
    const bookResult = this.buildResult(result, sourcesQueried, sourcesFailed);

    this.logger.info('lookup-book', {
      action: 'complete',
      title: bookResult.title,
      author: bookResult.author,
      sources_queried: sourcesQueried,
      duration_ms: Date.now() - startTime,
    });

    return bookResult;
  }

  private buildResult(
    data: PartialBookData,
    sourcesQueried: string[],
    sourcesFailed: string[]
  ): BookResult {
    return {
      title: data.title ?? '',
      author: data.author ?? data.authors?.[0] ?? 'Unknown',
      authors: data.authors ?? (data.author ? [data.author] : []),
      isbn_10: data.isbn_10 ?? null,
      isbn_13: data.isbn_13 ?? null,
      genres: data.genres ?? [],
      subjects: data.subjects ?? [],
      page_count: data.page_count ?? null,
      publish_date: data.publish_date ?? null,
      publisher: data.publisher ?? null,
      description: data.description ?? null,
      cover_url: data.cover_url ?? null,
      series: {
        name: data.series?.name ?? null,
        position: data.series?.position ?? null,
        total_books: data.series?.total_books ?? null,
      },
      ratings: {
        open_library: data.rating
          ? { score: data.rating.score, count: data.rating.count }
          : undefined,
      },
      identifiers: {
        open_library: data.identifier ?? null,
        goodreads: null,
        google_books: null,
        hardcover: null,
      },
      source_urls: {
        open_library: data.source_url ?? null,
        goodreads: null,
        google_books: null,
      },
      _meta: {
        sources_queried: sourcesQueried,
        sources_failed: sourcesFailed.length > 0 ? sourcesFailed : undefined,
        primary_source: data.source,
        confidence: this.calculateConfidence(data),
        cached: false,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private calculateConfidence(data: PartialBookData): 'high' | 'medium' | 'low' {
    let score = 0;

    // Title is always present
    score += 10;

    // Author info
    if (data.author || data.authors?.length) score += 15;

    // ISBN
    if (data.isbn_10 || data.isbn_13) score += 20;

    // Cover
    if (data.cover_url) score += 10;

    // Description
    if (data.description) score += 15;

    // Page count
    if (data.page_count) score += 10;

    // Ratings
    if (data.rating) score += 10;

    // Subjects/genres
    if (data.subjects?.length) score += 10;

    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }
}
