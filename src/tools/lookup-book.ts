import { z } from 'zod';
import type { BookResult, PartialBookData, LookupBookInput, BookSource } from '../types/book.js';
import { OpenLibrarySource } from '../sources/open-library.js';
import { GoogleBooksSource } from '../sources/google-books.js';
import { GoodreadsSource } from '../sources/goodreads.js';
import { Logger } from '../utils/logger.js';
import { mergeBookResults } from '../utils/merge-results.js';
import { extractSeriesFromTitle } from '../utils/fuzzy-match.js';

export const LookupBookInputSchema = z.object({
  title: z.string().min(1).describe('Book title to search for'),
  author: z.string().optional().describe('Author name (recommended for better matching)'),
  isbn: z.string().optional().describe('ISBN-10 or ISBN-13 (preferred if available)'),
  sources: z
    .array(z.enum(['open_library', 'google_books', 'goodreads', 'hardcover']))
    .optional()
    .describe('Sources to query (defaults to all available)'),
});

export interface BookSources {
  openLibrary: OpenLibrarySource;
  googleBooks: GoogleBooksSource;
  goodreads: GoodreadsSource;
}

export class LookupBookTool {
  private openLibrary: OpenLibrarySource;
  private googleBooks: GoogleBooksSource | null;
  private goodreads: GoodreadsSource | null;
  private logger: Logger;

  constructor(
    openLibrary: OpenLibrarySource,
    logger: Logger,
    additionalSources?: Partial<BookSources>
  ) {
    this.openLibrary = openLibrary;
    this.googleBooks = additionalSources?.googleBooks ?? null;
    this.goodreads = additionalSources?.goodreads ?? null;
    this.logger = logger;
  }

  async execute(input: LookupBookInput): Promise<BookResult> {
    const startTime = Date.now();
    const sourcesQueried: BookSource[] = [];
    const sourcesFailed: BookSource[] = [];
    const results: PartialBookData[] = [];

    this.logger.info('lookup-book', {
      action: 'start',
      title: input.title,
      author: input.author,
      isbn: input.isbn,
    });

    // Determine which sources to query
    const requestedSources = input.sources ?? ['open_library', 'google_books', 'goodreads'];

    // Query sources in parallel for better performance
    const searchPromises: Promise<void>[] = [];

    // Open Library
    if (requestedSources.includes('open_library')) {
      searchPromises.push(this.searchOpenLibrary(input, results, sourcesQueried, sourcesFailed));
    }

    // Google Books
    if (requestedSources.includes('google_books') && this.googleBooks) {
      searchPromises.push(this.searchGoogleBooks(input, results, sourcesQueried, sourcesFailed));
    }

    // Goodreads (after other sources to avoid rate limiting)
    if (requestedSources.includes('goodreads') && this.goodreads?.isEnabled()) {
      searchPromises.push(this.searchGoodreads(input, results, sourcesQueried, sourcesFailed));
    }

    // Wait for all searches to complete
    await Promise.all(searchPromises);

    // If no results found, throw error
    if (results.length === 0) {
      this.logger.warning('lookup-book', {
        action: 'not_found',
        title: input.title,
        author: input.author,
        isbn: input.isbn,
        sources_queried: sourcesQueried,
        sources_failed: sourcesFailed,
        duration_ms: Date.now() - startTime,
      });

      throw {
        code: 'NOT_FOUND',
        message: `No book found matching "${input.title}"${input.author ? ` by ${input.author}` : ''}`,
        retryable: false,
      };
    }

    // Try to extract series info from title if not found in results
    for (const result of results) {
      if (!result.series?.name) {
        const seriesInfo = extractSeriesFromTitle(result.title || input.title);
        if (seriesInfo.seriesName || seriesInfo.seriesPosition) {
          result.series = {
            name: seriesInfo.seriesName ?? undefined,
            position: seriesInfo.seriesPosition ?? undefined,
          };
          // Update title to clean version if we extracted series
          if (seriesInfo.cleanTitle !== result.title) {
            result.title = seriesInfo.cleanTitle;
          }
        }
      }
    }

    // Merge results from all sources
    const bookResult = mergeBookResults(results, sourcesQueried, sourcesFailed);

    this.logger.info('lookup-book', {
      action: 'complete',
      title: bookResult.title,
      author: bookResult.author,
      sources_queried: sourcesQueried,
      sources_succeeded: results.length,
      sources_failed: sourcesFailed,
      duration_ms: Date.now() - startTime,
    });

    return bookResult;
  }

  private async searchOpenLibrary(
    input: LookupBookInput,
    results: PartialBookData[],
    sourcesQueried: BookSource[],
    sourcesFailed: BookSource[]
  ): Promise<void> {
    sourcesQueried.push('open_library');

    try {
      let result: PartialBookData | null = null;

      // Try ISBN first if available
      if (input.isbn) {
        result = await this.openLibrary.searchByISBN(input.isbn);
      }

      // Fall back to title/author search
      if (!result) {
        result = await this.openLibrary.searchByTitleAuthor(input.title, input.author);
      }

      if (result) {
        results.push(result);
      } else {
        sourcesFailed.push('open_library');
      }
    } catch (error) {
      this.logger.error('lookup-book', {
        action: 'source_error',
        source: 'open_library',
        error: error instanceof Error ? error.message : String(error),
      });
      sourcesFailed.push('open_library');
    }
  }

  private async searchGoogleBooks(
    input: LookupBookInput,
    results: PartialBookData[],
    sourcesQueried: BookSource[],
    sourcesFailed: BookSource[]
  ): Promise<void> {
    if (!this.googleBooks) return;

    sourcesQueried.push('google_books');

    try {
      let result: PartialBookData | null = null;

      // Try ISBN first if available
      if (input.isbn) {
        result = await this.googleBooks.searchByISBN(input.isbn);
      }

      // Fall back to title/author search
      if (!result) {
        result = await this.googleBooks.searchByTitleAuthor(input.title, input.author);
      }

      if (result) {
        results.push(result);
      } else {
        sourcesFailed.push('google_books');
      }
    } catch (error) {
      this.logger.error('lookup-book', {
        action: 'source_error',
        source: 'google_books',
        error: error instanceof Error ? error.message : String(error),
      });
      sourcesFailed.push('google_books');
    }
  }

  private async searchGoodreads(
    input: LookupBookInput,
    results: PartialBookData[],
    sourcesQueried: BookSource[],
    sourcesFailed: BookSource[]
  ): Promise<void> {
    if (!this.goodreads?.isEnabled()) return;

    sourcesQueried.push('goodreads');

    try {
      const result = await this.goodreads.searchBook(input.title, input.author);

      if (result) {
        results.push(result);
      } else {
        sourcesFailed.push('goodreads');
      }
    } catch (error) {
      this.logger.error('lookup-book', {
        action: 'source_error',
        source: 'goodreads',
        error: error instanceof Error ? error.message : String(error),
      });
      sourcesFailed.push('goodreads');
    }
  }
}
