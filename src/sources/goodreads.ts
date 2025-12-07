import * as cheerio from 'cheerio';
import { HttpClient, Logger, RateLimiter } from '../utils/index.js';
import { SQLiteCache, CacheTTL } from '../cache/sqlite-cache.js';
import { delay } from '../utils/rate-limiter.js';
import type { PartialBookData, BookSource } from '../types/book.js';

const SOURCE: BookSource = 'goodreads';
const BASE_URL = 'https://www.goodreads.com';

interface GoodreadsSeriesInfo {
  name: string;
  position: number | null;
  totalBooks: number | null;
  seriesId: string;
}

export interface GoodreadsConfig {
  enabled: boolean;
  delayMs: number;
  proxy?: string | null;
}

export class GoodreadsSource {
  private client: HttpClient;
  private cache: SQLiteCache;
  private logger: Logger;
  private config: GoodreadsConfig;

  constructor(
    config: GoodreadsConfig,
    cache: SQLiteCache,
    logger: Logger,
    rateLimiter: RateLimiter
  ) {
    this.config = config;
    this.cache = cache;
    this.logger = logger;

    // Configure rate limiting - be respectful to Goodreads
    rateLimiter.configure(SOURCE, {
      requestsPerWindow: 20,
      windowMs: 60000, // 20 requests per minute max
    });

    this.client = new HttpClient(
      SOURCE,
      {
        baseUrl: BASE_URL,
        headers: {
          'User-Agent': HttpClient.getRandomUserAgent(),
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      },
      logger,
      rateLimiter
    );
  }

  /**
   * Check if Goodreads scraping is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Search for a book and get ratings/series info
   */
  async searchBook(title: string, author?: string): Promise<PartialBookData | null> {
    if (!this.config.enabled) {
      return null;
    }

    const cacheKey = SQLiteCache.makeKey(SOURCE, 'search', title, author);
    const cached = this.cache.get<PartialBookData>(cacheKey);
    if (cached) {
      return cached.value;
    }

    try {
      // Add delay for anti-detection
      await delay(this.config.delayMs, this.config.delayMs * 1.5);

      // Search for the book
      const searchQuery = author ? `${title} ${author}` : title;
      const response = await this.client.get<string>('/search', {
        params: {
          q: searchQuery,
          search_type: 'books',
        },
        headers: {
          'User-Agent': HttpClient.getRandomUserAgent(),
        },
      });

      if (response.status !== 200) {
        this.logger.warning('goodreads', {
          action: 'search_failed',
          status: response.status,
          title,
          author,
        });
        return null;
      }

      const $ = cheerio.load(response.data as string);

      // Find the first book result
      const firstResult = $('tr[itemtype="http://schema.org/Book"]').first();
      if (firstResult.length === 0) {
        // Try alternative selector
        const altResult = $('.tableList tr').first();
        if (altResult.length === 0) {
          return null;
        }
      }

      // Get the book URL
      const bookLink =
        firstResult.find('a.bookTitle').attr('href') ||
        firstResult.find('.bookTitle a').attr('href');

      if (!bookLink) {
        return null;
      }

      // Fetch the book page for detailed info
      const bookId = this.extractBookId(bookLink);
      if (bookId) {
        return await this.getBookDetails(bookId);
      }

      return null;
    } catch (error) {
      this.logger.error('goodreads', {
        action: 'search_error',
        title,
        author,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get detailed book information from Goodreads book page
   */
  async getBookDetails(bookId: string): Promise<PartialBookData | null> {
    if (!this.config.enabled) {
      return null;
    }

    const cacheKey = SQLiteCache.makeKey(SOURCE, 'book', bookId);
    const cached = this.cache.get<PartialBookData>(cacheKey);
    if (cached) {
      return cached.value;
    }

    try {
      await delay(this.config.delayMs, this.config.delayMs * 1.5);

      const response = await this.client.get<string>(`/book/show/${bookId}`, {
        headers: {
          'User-Agent': HttpClient.getRandomUserAgent(),
        },
      });

      if (response.status !== 200) {
        return null;
      }

      const $ = cheerio.load(response.data as string);

      // Extract rating
      const ratingText =
        $('[itemprop="ratingValue"]').text().trim() || $('.RatingStatistics__rating').text().trim();
      const ratingCountText =
        $('[itemprop="ratingCount"]').attr('content') ||
        $('.RatingStatistics__meta')
          .text()
          .match(/[\d,]+\s*ratings/)?.[0];

      const rating = ratingText ? parseFloat(ratingText) : null;
      const ratingCount = ratingCountText
        ? parseInt(ratingCountText.replace(/[^\d]/g, ''), 10)
        : null;

      // Extract genres
      const genres: string[] = [];
      $(
        '.BookPageMetadataSection__genres .Button__labelItem, .actionLinkLite.bookPageGenreLink'
      ).each((_, el) => {
        const genre = $(el).text().trim();
        if (genre && !genres.includes(genre)) {
          genres.push(genre);
        }
      });

      // Extract series info
      const seriesInfo = this.extractSeriesInfo($);

      // Extract page count
      const pageCountText =
        $('[itemprop="numberOfPages"]').text() || $('[data-testid="pagesFormat"]').text();
      const pageCount = pageCountText ? parseInt(pageCountText.replace(/[^\d]/g, ''), 10) : null;

      // Extract description
      const description =
        $('[data-testid="description"] .Formatted').text().trim() ||
        $('.DetailsLayoutRightParagraph__widthConstrained').text().trim() ||
        $('[itemprop="description"]').text().trim();

      // Extract cover URL
      const coverUrl =
        $('.BookCover__image img').attr('src') || $('[itemprop="image"]').attr('content') || null;

      const result: PartialBookData = {
        rating: rating && ratingCount ? { score: rating, count: ratingCount } : undefined,
        genres,
        series: seriesInfo
          ? {
              name: seriesInfo.name,
              position: seriesInfo.position,
              total_books: seriesInfo.totalBooks,
            }
          : undefined,
        page_count: pageCount || null,
        description: description || null,
        cover_url: coverUrl,
        identifier: bookId,
        source_url: `${BASE_URL}/book/show/${bookId}`,
        source: SOURCE,
      };

      this.cache.set(cacheKey, result, SOURCE, CacheTTL.RATINGS);

      return result;
    } catch (error) {
      this.logger.error('goodreads', {
        action: 'book_details_error',
        bookId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get series information from a series page
   */
  async getSeriesInfo(seriesId: string): Promise<GoodreadsSeriesInfo | null> {
    if (!this.config.enabled) {
      return null;
    }

    const cacheKey = SQLiteCache.makeKey(SOURCE, 'series', seriesId);
    const cached = this.cache.get<GoodreadsSeriesInfo>(cacheKey);
    if (cached) {
      return cached.value;
    }

    try {
      await delay(this.config.delayMs, this.config.delayMs * 1.5);

      const response = await this.client.get<string>(`/series/${seriesId}`, {
        headers: {
          'User-Agent': HttpClient.getRandomUserAgent(),
        },
      });

      if (response.status !== 200) {
        return null;
      }

      const $ = cheerio.load(response.data as string);

      // Extract series name
      const seriesName =
        $('h1.seriesTitle').text().trim() || $('.responsiveSeriesHeader__title').text().trim();

      // Count books in series
      const bookItems = $('.listWithDividers__item, .responsiveBook').length;

      const result: GoodreadsSeriesInfo = {
        name: seriesName,
        position: null,
        totalBooks: bookItems || null,
        seriesId,
      };

      this.cache.set(cacheKey, result, SOURCE, CacheTTL.SERIES_INFO);

      return result;
    } catch (error) {
      this.logger.error('goodreads', {
        action: 'series_error',
        seriesId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Extract series information from book page
   */
  private extractSeriesInfo($: cheerio.CheerioAPI): GoodreadsSeriesInfo | null {
    // Look for series link in the title section
    const seriesLink = $('a[href*="/series/"]').first();

    if (seriesLink.length === 0) {
      return null;
    }

    const href = seriesLink.attr('href') || '';
    const seriesId = this.extractSeriesId(href);
    const seriesText = seriesLink.text().trim();

    // Parse series name and position from text like "The Kingkiller Chronicle #1"
    const match = seriesText.match(/^(.+?)\s*(?:#|Book\s*)(\d+(?:\.\d+)?)?$/i);

    if (match) {
      return {
        name: match[1].trim(),
        position: match[2] ? parseFloat(match[2]) : null,
        totalBooks: null,
        seriesId: seriesId || '',
      };
    }

    return {
      name: seriesText,
      position: null,
      totalBooks: null,
      seriesId: seriesId || '',
    };
  }

  /**
   * Extract book ID from URL
   */
  private extractBookId(url: string): string | null {
    const match = url.match(/\/book\/show\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Extract series ID from URL
   */
  private extractSeriesId(url: string): string | null {
    const match = url.match(/\/series\/(\d+)/);
    return match ? match[1] : null;
  }
}
