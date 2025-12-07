import { HttpClient, Logger, RateLimiter } from '../utils/index.js';
import { SQLiteCache, CacheTTL } from '../cache/sqlite-cache.js';
import type { PartialBookData, BookSource } from '../types/book.js';

const SOURCE: BookSource = 'google_books';
const BASE_URL = 'https://www.googleapis.com/books/v1';

interface GoogleBooksVolumeInfo {
  title: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  industryIdentifiers?: {
    type: string;
    identifier: string;
  }[];
  pageCount?: number;
  categories?: string[];
  averageRating?: number;
  ratingsCount?: number;
  imageLinks?: {
    smallThumbnail?: string;
    thumbnail?: string;
    small?: string;
    medium?: string;
    large?: string;
  };
  language?: string;
  previewLink?: string;
  infoLink?: string;
}

interface GoogleBooksVolume {
  id: string;
  volumeInfo: GoogleBooksVolumeInfo;
}

interface GoogleBooksSearchResponse {
  kind: string;
  totalItems: number;
  items?: GoogleBooksVolume[];
}

export class GoogleBooksSource {
  private client: HttpClient;
  private cache: SQLiteCache;
  private logger: Logger;
  private apiKey: string | null;

  constructor(apiKey: string | null, cache: SQLiteCache, logger: Logger, rateLimiter: RateLimiter) {
    this.apiKey = apiKey;
    this.cache = cache;
    this.logger = logger;

    // Configure rate limiting - Google Books allows 1000/day without key, more with key
    rateLimiter.configure(SOURCE, {
      requestsPerWindow: apiKey ? 100 : 50,
      windowMs: 60000,
    });

    this.client = new HttpClient(SOURCE, { baseUrl: BASE_URL }, logger, rateLimiter);
  }

  /**
   * Search for a book by ISBN
   */
  async searchByISBN(isbn: string): Promise<PartialBookData | null> {
    const cleanISBN = isbn.replace(/[-\s]/g, '');
    const cacheKey = SQLiteCache.makeKey(SOURCE, 'isbn', cleanISBN);

    const cached = this.cache.get<PartialBookData>(cacheKey);
    if (cached) {
      return cached.value;
    }

    try {
      const response = await this.client.get<GoogleBooksSearchResponse>('/volumes', {
        params: {
          q: `isbn:${cleanISBN}`,
          maxResults: 1,
          ...(this.apiKey ? { key: this.apiKey } : {}),
        },
      });

      if (response.status !== 200 || !response.data.items?.length) {
        return null;
      }

      const result = this.buildPartialBookData(response.data.items[0]);
      this.cache.set(cacheKey, result, SOURCE, CacheTTL.BOOK_METADATA);

      return result;
    } catch (error) {
      this.logger.error('google-books', {
        action: 'isbn_lookup_failed',
        isbn: cleanISBN,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Search for a book by title and author
   */
  async searchByTitleAuthor(title: string, author?: string): Promise<PartialBookData | null> {
    const cacheKey = SQLiteCache.makeKey(SOURCE, 'search', title, author);

    const cached = this.cache.get<PartialBookData>(cacheKey);
    if (cached) {
      return cached.value;
    }

    try {
      // Build search query
      let query = `intitle:${title}`;
      if (author) {
        query += `+inauthor:${author}`;
      }

      const response = await this.client.get<GoogleBooksSearchResponse>('/volumes', {
        params: {
          q: query,
          maxResults: 5,
          orderBy: 'relevance',
          printType: 'books',
          ...(this.apiKey ? { key: this.apiKey } : {}),
        },
      });

      if (response.status !== 200 || !response.data.items?.length) {
        return null;
      }

      // Find best match
      const match = this.findBestMatch(response.data.items, title, author);
      if (!match) {
        return null;
      }

      const result = this.buildPartialBookData(match);
      this.cache.set(cacheKey, result, SOURCE, CacheTTL.SEARCH_RESULTS);

      return result;
    } catch (error) {
      this.logger.error('google-books', {
        action: 'search_failed',
        title,
        author,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get book details by Google Books ID
   */
  async getBookById(googleBooksId: string): Promise<PartialBookData | null> {
    const cacheKey = SQLiteCache.makeKey(SOURCE, 'id', googleBooksId);

    const cached = this.cache.get<PartialBookData>(cacheKey);
    if (cached) {
      return cached.value;
    }

    try {
      const response = await this.client.get<GoogleBooksVolume>(`/volumes/${googleBooksId}`, {
        params: this.apiKey ? { key: this.apiKey } : {},
      });

      if (response.status !== 200) {
        return null;
      }

      const result = this.buildPartialBookData(response.data);
      this.cache.set(cacheKey, result, SOURCE, CacheTTL.BOOK_METADATA);

      return result;
    } catch (error) {
      this.logger.error('google-books', {
        action: 'get_by_id_failed',
        id: googleBooksId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Build partial book data from Google Books volume
   */
  private buildPartialBookData(volume: GoogleBooksVolume): PartialBookData {
    const info = volume.volumeInfo;

    // Extract ISBNs
    let isbn10: string | null = null;
    let isbn13: string | null = null;
    if (info.industryIdentifiers) {
      for (const id of info.industryIdentifiers) {
        if (id.type === 'ISBN_10') isbn10 = id.identifier;
        if (id.type === 'ISBN_13') isbn13 = id.identifier;
      }
    }

    // Get best available cover image
    const coverUrl =
      info.imageLinks?.large ||
      info.imageLinks?.medium ||
      info.imageLinks?.thumbnail?.replace('zoom=1', 'zoom=2') ||
      null;

    return {
      title: info.title + (info.subtitle ? `: ${info.subtitle}` : ''),
      author: info.authors?.[0],
      authors: info.authors,
      isbn_10: isbn10,
      isbn_13: isbn13,
      publisher: info.publisher ?? null,
      publish_date: info.publishedDate ?? null,
      page_count: info.pageCount ?? null,
      description: info.description ?? null,
      cover_url: coverUrl,
      genres: info.categories ?? [],
      subjects: info.categories ?? [],
      rating:
        info.averageRating && info.ratingsCount
          ? { score: info.averageRating, count: info.ratingsCount }
          : undefined,
      identifier: volume.id,
      source_url: info.infoLink ?? `https://books.google.com/books?id=${volume.id}`,
      source: SOURCE,
    };
  }

  /**
   * Find the best matching book from search results
   */
  private findBestMatch(
    items: GoogleBooksVolume[],
    title: string,
    author?: string
  ): GoogleBooksVolume | null {
    if (items.length === 0) return null;

    const normalizedTitle = this.normalize(title);
    const normalizedAuthor = author ? this.normalize(author) : null;

    const scored = items.map((item) => {
      let score = 0;
      const info = item.volumeInfo;

      // Title similarity
      const itemTitle = this.normalize(info.title);
      if (itemTitle === normalizedTitle) {
        score += 100;
      } else if (itemTitle.includes(normalizedTitle) || normalizedTitle.includes(itemTitle)) {
        score += 50;
      }

      // Author match
      if (normalizedAuthor && info.authors) {
        const itemAuthors = info.authors.map((a) => this.normalize(a));
        if (itemAuthors.some((a) => a === normalizedAuthor)) {
          score += 80;
        } else if (
          itemAuthors.some((a) => a.includes(normalizedAuthor) || normalizedAuthor.includes(a))
        ) {
          score += 40;
        }
      }

      // Prefer entries with more data
      if (info.industryIdentifiers?.length) score += 10;
      if (info.imageLinks) score += 5;
      if (info.pageCount) score += 5;
      if (info.ratingsCount && info.ratingsCount > 10) score += 10;

      return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored[0].score >= 50 ? scored[0].item : null;
  }

  /**
   * Normalize string for comparison
   */
  private normalize(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
