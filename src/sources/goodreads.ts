import * as cheerio from 'cheerio';
import { HttpClient, Logger, RateLimiter } from '../utils/index.js';
import { SQLiteCache, CacheTTL } from '../cache/sqlite-cache.js';
import { delay } from '../utils/rate-limiter.js';
import { normalizeShelf } from '../utils/strings.js';
import type { PartialBookData, BookSource } from '../types/book.js';
import { GoodreadsHTMLSchema } from './response-schemas.js';

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

      const html = GoodreadsHTMLSchema.parse(response.data);
      const $ = cheerio.load(html);

      // Find the first book link — use URL pattern (resilient to class name changes)
      const bookLink = $('a[href*="/book/show/"]').first().attr('href');

      if (!bookLink) {
        if (this.isEmptySearchResultsPage($)) {
          this.logger.debug('goodreads', {
            action: 'search_no_results',
            title,
            author,
            message: 'Goodreads search returned a recognized empty-results page',
          });
          return null;
        }

        this.logger.warning('goodreads', {
          action: 'search_selectors_empty',
          title,
          author,
          selector: 'a[href*="/book/show/"]',
          message:
            'No Goodreads book link matched on the search results page; the response may use an unexpected layout',
        });
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

      const html = GoodreadsHTMLSchema.parse(response.data);
      const $ = cheerio.load(html);

      // Extract rating — try multiple selectors (modern → legacy)
      const ratingText =
        $('.RatingStatistics__rating').text().trim() || $('[itemprop="ratingValue"]').text().trim();
      // Look for rating count in page text
      const pageText = $.text();
      const ratingCountMatch = pageText.match(/([\d,]+)\s*ratings/);
      const ratingCountFromAttr = $('[itemprop="ratingCount"]').attr('content');

      const rating = ratingText ? parseFloat(ratingText) : null;
      const ratingCount = ratingCountFromAttr
        ? parseInt(ratingCountFromAttr.replace(/[^\d]/g, ''), 10)
        : ratingCountMatch
          ? parseInt(ratingCountMatch[1].replace(/[^\d]/g, ''), 10)
          : null;

      // Extract genres — URL-pattern based (resilient to class changes)
      const genres: string[] = [];
      $('a[href*="/genres/"]').each((_, el) => {
        const genre = $(el).text().trim();
        if (genre && !genres.includes(genre)) {
          genres.push(genre);
        }
      });

      // Extract shelves/tropes from genre links and shelf sections
      const shelves: string[] = [];
      const tropes: string[] = [];

      // Genres double as shelves on modern Goodreads
      for (const genre of genres) {
        if (!shelves.includes(genre)) {
          shelves.push(genre);
          if (this.isTrope(genre)) {
            tropes.push(genre);
          }
        }
      }

      // Also try legacy shelf selectors as fallback
      $(
        '.ShelfList .Button__labelItem, .actionLinkLite.bookPageGenreLink, .elementList .left a, .bigBox .bigBoxBody .elementList .left a'
      ).each((_, el) => {
        const shelfText = $(el).text().trim();
        if (shelfText && !shelves.includes(shelfText)) {
          shelves.push(shelfText);
          if (this.isTrope(shelfText)) {
            tropes.push(shelfText);
          }
        }
      });

      this.logger.debug('goodreads', {
        action: 'selectors_matched',
        bookId,
        genreCount: genres.length,
        shelfCount: shelves.length,
        tropeCount: tropes.length,
        ratingFound: rating !== null,
      });

      // Extract series info
      const seriesInfo = this.extractSeriesInfo($);

      // Extract page count — look for "N pages" pattern in text
      const pageCountText =
        $('[data-testid="pagesFormat"]').text() || $('[itemprop="numberOfPages"]').text();
      let pageCount: number | null = null;
      if (pageCountText) {
        pageCount = parseInt(pageCountText.replace(/[^\d]/g, ''), 10);
      } else {
        // Fallback: search page text for "N pages" pattern
        const pagesMatch = pageText.match(/(\d+)\s*pages/);
        if (pagesMatch) {
          pageCount = parseInt(pagesMatch[1], 10);
        }
      }

      // Extract description — try multiple selectors
      const description =
        $('[data-testid="description"] .Formatted').text().trim() ||
        $('.DetailsLayoutRightParagraph__widthConstrained').text().trim() ||
        $('[itemprop="description"]').text().trim() ||
        '';

      // Extract cover URL — use image source patterns
      const coverUrl =
        $('img[src*="compressed.photo.goodreads.com"]').first().attr('src') ||
        $('.BookCover__image img').attr('src') ||
        $('[itemprop="image"]').attr('content') ||
        null;

      const usableFields = [
        Number.isFinite(rating) && Number.isFinite(ratingCount) ? 'rating' : null,
        genres.length > 0 ? 'genres' : null,
        shelves.length > 0 ? 'shelves' : null,
        seriesInfo ? 'series' : null,
        Number.isFinite(pageCount) ? 'page_count' : null,
        description ? 'description' : null,
        coverUrl ? 'cover_url' : null,
      ].filter((field): field is string => field !== null);

      if (usableFields.length === 0) {
        this.logger.warning('goodreads', {
          action: 'detail_selectors_empty',
          bookId,
          message:
            'No usable Goodreads detail fields matched; optional fields may be absent, but this response may use an unexpected layout',
          usable_fields: usableFields,
        });
      }

      const result: PartialBookData = {
        rating: rating && ratingCount ? { score: rating, count: ratingCount } : undefined,
        genres,
        shelves: shelves.length > 0 ? shelves : undefined,
        tropes: tropes.length > 0 ? tropes : undefined,
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

      const html = GoodreadsHTMLSchema.parse(response.data);
      const $ = cheerio.load(html);

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

      if (!seriesName) {
        this.logger.warning('goodreads', {
          action: 'series_selectors_empty',
          seriesId,
          selector: 'h1.seriesTitle, .responsiveSeriesHeader__title',
          message: 'No Goodreads series name matched; the response may use an unexpected layout',
        });
      }

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
   * Distinguish a normal zero-result search from a page whose result layout
   * changed. Empty-state selectors and copy are intentionally narrow so an
   * unrelated HTML response still produces a warning.
   */
  private isEmptySearchResultsPage($: cheerio.CheerioAPI): boolean {
    const explicitSearchResults = $(
      '#searchResults, .searchResults, table.tableList, [data-testid="search-results"], [data-testid="searchResults"]'
    ).first();
    const searchResults =
      explicitSearchResults.length > 0
        ? explicitSearchResults
        : $('.leftContainer')
            .filter((_, element) => {
              const container = $(element);
              return (
                container.find(
                  'form[name="searchForm"][action="/search"], form[action="/search"], input#search_query_main'
                ).length > 0
              );
            })
            .first();

    if (searchResults.length === 0) {
      return false;
    }

    const hasSearchContext =
      searchResults.find(
        '.searchResults__header, .searchResults__title, [data-testid="search-query"], [data-testid="searchQuery"]'
      ).length > 0 ||
      searchResults.find(
        'form[name="searchForm"][action="/search"], form[action="/search"], input#search_query_main, input[name="q"], input[name="query"]'
      ).length > 0;

    if (!hasSearchContext) {
      return false;
    }

    const hasEmptyStateSelector =
      searchResults.find(
        '[data-testid="search-no-results"], [data-testid="searchNoResults"], .searchNoResults, .searchResults__empty, h3.searchSubNavContainer'
      ).length > 0;

    const pageText = searchResults.text().replace(/\s+/g, ' ').trim();
    return (
      hasEmptyStateSelector &&
      /(?:no results?\b|no books?\b|nothing found|couldn['’]t find (?:any )?books?|didn['’]t find (?:any )?books?)/i.test(
        pageText
      )
    );
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

  /**
   * Determine if a shelf name is a trope
   */
  private isTrope(shelfName: string): boolean {
    const normalized = normalizeShelf(shelfName);

    // Common romance tropes
    const romanceTropes = [
      'enemiestolovers',
      'friendstolovers',
      'forcedproximity',
      'fakedating',
      'fakemarriage',
      'onebedtrope',
      'grumpysunshine',
      'secondchance',
      'brothersbestfriend',
      'bestfriendsbrother',
      'agegap',
      'forbiddenromance',
      'slowburn',
      'instalove',
      'fatedmates',
      'soulmates',
      'loveatfirstsight',
      'marriageofconvenience',
      'arrangedmarriage',
      'secretrelationship',
      'officeromance',
      'workplaceromance',
      'bossemployee',
      'teacherstudent',
      'royalromance',
      'billionaireromance',
      'smalltown',
      'smalltownromance',
      'hockeyromance',
      'sportsromance',
      'rockstarromance',
      'militaryromance',
      'cowboyromance',
      'alphamale',
      'touchhimanddie',
      'possessive',
      'protectivehero',
      'damselindistress',
      'savedbythehero',
    ];

    // Fantasy/paranormal tropes
    const fantasyTropes = [
      'chosenone',
      'magicschool',
      'academy',
      'foundfamily',
      'mentorship',
      'questadventure',
      'dragonsromance',
      'vampireromance',
      'werewolfromance',
      'shifterromance',
      'witches',
      'faerie',
      'fae',
      'mythologicalbeings',
      'alienromance',
      'timetravel',
      'parallelworlds',
      'prophecy',
      'comingofage',
    ];

    // Dark romance/BDSM/kink tropes
    const darkTropes = [
      'darkromance',
      'bdsm',
      'femdom',
      'maledom',
      'domsubrelationship',
      'powerdynamics',
      'taboo',
      'dubcon',
      'noncon',
      'captive',
      'kidnapping',
      'stalker',
      'obsession',
      'antiherohero',
      'villainromance',
      'morallygray',
      'whychoose',
      'reverseharems',
      'pegging',
      'breeding',
      'daddykink',
      'omegaverse',
      'kinkexploration',
      'bodyworshipromance',
      'spicy',
      'smut',
      'erotica',
      'forbiddenromance',
      'slowburn',
      'forcedproximity',
      'monsterromance',
    ];

    // Other relationship tropes
    const otherTropes = [
      'polyamory',
      'polyamorous',
      'menage',
      'mmf',
      'mfm',
      'mmm',
      'fff',
      'lgbtq',
      'mm',
      'ff',
      'sapphic',
      'queerromance',
      'trans',
      'nonbinary',
      'neurodivergent',
      'disabledprotagonist',
    ];

    const allTropes = [...romanceTropes, ...fantasyTropes, ...darkTropes, ...otherTropes];

    return allTropes.some((trope) => normalized.includes(trope) || trope.includes(normalized));
  }
}
