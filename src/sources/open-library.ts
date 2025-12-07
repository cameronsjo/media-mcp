import { HttpClient, Logger, RateLimiter } from '../utils/index.js';
import { SQLiteCache, CacheTTL } from '../cache/sqlite-cache.js';
import type { PartialBookData, BookSource } from '../types/book.js';

const SOURCE: BookSource = 'open_library';
const BASE_URL = 'https://openlibrary.org';
const COVERS_URL = 'https://covers.openlibrary.org';

interface OpenLibrarySearchDoc {
  key: string;
  title: string;
  author_name?: string[];
  author_key?: string[];
  first_publish_year?: number;
  isbn?: string[];
  publisher?: string[];
  subject?: string[];
  number_of_pages_median?: number;
  cover_i?: number;
  ratings_average?: number;
  ratings_count?: number;
}

interface OpenLibrarySearchResponse {
  numFound: number;
  start: number;
  docs: OpenLibrarySearchDoc[];
}

interface OpenLibraryWorkResponse {
  title: string;
  description?: string | { value: string };
  subjects?: string[];
  subject_places?: string[];
  subject_people?: string[];
  subject_times?: string[];
  covers?: number[];
}

interface OpenLibraryEditionResponse {
  title: string;
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  isbn_10?: string[];
  isbn_13?: string[];
  covers?: number[];
  description?: string | { value: string };
}

interface OpenLibraryISBNResponse extends OpenLibraryEditionResponse {
  works?: { key: string }[];
  authors?: { key: string }[];
}

export class OpenLibrarySource {
  private client: HttpClient;
  private cache: SQLiteCache;
  private logger: Logger;

  constructor(cache: SQLiteCache, logger: Logger, rateLimiter: RateLimiter) {
    this.cache = cache;
    this.logger = logger;

    // Configure rate limiting - Open Library is generous but be respectful
    rateLimiter.configure(SOURCE, {
      requestsPerWindow: 100,
      windowMs: 60000, // 100 requests per minute
    });

    this.client = new HttpClient(
      SOURCE,
      { baseUrl: BASE_URL },
      logger,
      rateLimiter
    );
  }

  /**
   * Search for a book by ISBN
   */
  async searchByISBN(isbn: string): Promise<PartialBookData | null> {
    const cleanISBN = isbn.replace(/[-\s]/g, '');
    const cacheKey = SQLiteCache.makeKey(SOURCE, 'isbn', cleanISBN);

    // Check cache
    const cached = this.cache.get<PartialBookData>(cacheKey);
    if (cached) {
      return cached.value;
    }

    try {
      const response = await this.client.get<OpenLibraryISBNResponse>(
        `/isbn/${cleanISBN}.json`
      );

      if (response.status !== 200) {
        this.logger.debug('open-library', {
          action: 'isbn_not_found',
          isbn: cleanISBN,
        });
        return null;
      }

      const data = response.data;
      const result = await this.buildPartialBookData(data, cleanISBN);

      // Cache the result
      this.cache.set(cacheKey, result, SOURCE, CacheTTL.BOOK_METADATA);

      return result;
    } catch (error) {
      this.logger.error('open-library', {
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
  async searchByTitleAuthor(
    title: string,
    author?: string
  ): Promise<PartialBookData | null> {
    const cacheKey = SQLiteCache.makeKey(SOURCE, 'search', title, author);

    // Check cache
    const cached = this.cache.get<PartialBookData>(cacheKey);
    if (cached) {
      return cached.value;
    }

    try {
      // Build search query
      let query = `title:${title}`;
      if (author) {
        query += ` author:${author}`;
      }

      const response = await this.client.get<OpenLibrarySearchResponse>(
        '/search.json',
        {
          params: {
            q: query,
            limit: 5,
            fields: 'key,title,author_name,author_key,first_publish_year,isbn,publisher,subject,number_of_pages_median,cover_i,ratings_average,ratings_count',
          },
        }
      );

      if (response.status !== 200 || response.data.numFound === 0) {
        this.logger.debug('open-library', {
          action: 'search_no_results',
          title,
          author,
        });
        return null;
      }

      // Find best match
      const doc = this.findBestMatch(response.data.docs, title, author);
      if (!doc) {
        return null;
      }

      const result = this.buildPartialBookDataFromSearch(doc);

      // Cache the result
      this.cache.set(cacheKey, result, SOURCE, CacheTTL.SEARCH_RESULTS);

      return result;
    } catch (error) {
      this.logger.error('open-library', {
        action: 'search_failed',
        title,
        author,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get additional work details (description, subjects)
   */
  async getWorkDetails(workKey: string): Promise<{
    description?: string;
    subjects?: string[];
  } | null> {
    const cacheKey = SQLiteCache.makeKey(SOURCE, 'work', workKey);

    const cached = this.cache.get<{ description?: string; subjects?: string[] }>(cacheKey);
    if (cached) {
      return cached.value;
    }

    try {
      const response = await this.client.get<OpenLibraryWorkResponse>(
        `${workKey}.json`
      );

      if (response.status !== 200) {
        return null;
      }

      const data = response.data;
      const result = {
        description: typeof data.description === 'string'
          ? data.description
          : data.description?.value,
        subjects: data.subjects?.slice(0, 20),
      };

      this.cache.set(cacheKey, result, SOURCE, CacheTTL.BOOK_METADATA);

      return result;
    } catch {
      return null;
    }
  }

  /**
   * Build cover URL from cover ID
   */
  getCoverUrl(coverId: number | undefined, size: 'S' | 'M' | 'L' = 'L'): string | null {
    if (!coverId) return null;
    return `${COVERS_URL}/b/id/${coverId}-${size}.jpg`;
  }

  /**
   * Get Open Library URL for a work or edition
   */
  getSourceUrl(key: string): string {
    return `${BASE_URL}${key}`;
  }

  /**
   * Find the best matching book from search results
   */
  private findBestMatch(
    docs: OpenLibrarySearchDoc[],
    title: string,
    author?: string
  ): OpenLibrarySearchDoc | null {
    if (docs.length === 0) return null;

    const normalizedTitle = this.normalize(title);
    const normalizedAuthor = author ? this.normalize(author) : null;

    // Score each document
    const scored = docs.map(doc => {
      let score = 0;

      // Title similarity
      const docTitle = this.normalize(doc.title);
      if (docTitle === normalizedTitle) {
        score += 100;
      } else if (docTitle.includes(normalizedTitle) || normalizedTitle.includes(docTitle)) {
        score += 50;
      }

      // Author match
      if (normalizedAuthor && doc.author_name) {
        const docAuthors = doc.author_name.map(a => this.normalize(a));
        if (docAuthors.some(a => a === normalizedAuthor)) {
          score += 80;
        } else if (docAuthors.some(a => a.includes(normalizedAuthor) || normalizedAuthor.includes(a))) {
          score += 40;
        }
      }

      // Prefer entries with more data
      if (doc.isbn?.length) score += 10;
      if (doc.cover_i) score += 5;
      if (doc.number_of_pages_median) score += 5;
      if (doc.ratings_count && doc.ratings_count > 100) score += 10;

      return { doc, score };
    });

    // Sort by score and return best match
    scored.sort((a, b) => b.score - a.score);

    // Only return if score is reasonable
    if (scored[0].score >= 50) {
      return scored[0].doc;
    }

    return null;
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

  /**
   * Build partial book data from ISBN lookup response
   */
  private async buildPartialBookData(
    data: OpenLibraryISBNResponse,
    isbn: string
  ): Promise<PartialBookData> {
    let description: string | undefined;
    let subjects: string[] | undefined;

    // Get work details for description and subjects
    if (data.works?.[0]?.key) {
      const workDetails = await this.getWorkDetails(data.works[0].key);
      if (workDetails) {
        description = workDetails.description;
        subjects = workDetails.subjects;
      }
    }

    // Use edition description as fallback
    if (!description && data.description) {
      description = typeof data.description === 'string'
        ? data.description
        : data.description.value;
    }

    return {
      title: data.title,
      isbn_10: data.isbn_10?.[0] || (isbn.length === 10 ? isbn : null),
      isbn_13: data.isbn_13?.[0] || (isbn.length === 13 ? isbn : null),
      publisher: data.publishers?.[0] ?? null,
      publish_date: data.publish_date ?? null,
      page_count: data.number_of_pages ?? null,
      cover_url: this.getCoverUrl(data.covers?.[0]),
      description: description ?? null,
      subjects: subjects ?? [],
      identifier: data.works?.[0]?.key?.replace('/works/', ''),
      source_url: data.works?.[0]?.key ? this.getSourceUrl(data.works[0].key) : undefined,
      source: SOURCE,
    };
  }

  /**
   * Build partial book data from search result
   */
  private buildPartialBookDataFromSearch(doc: OpenLibrarySearchDoc): PartialBookData {
    const isbns = doc.isbn ?? [];
    const isbn10 = isbns.find(i => i.length === 10);
    const isbn13 = isbns.find(i => i.length === 13);

    return {
      title: doc.title,
      author: doc.author_name?.[0],
      authors: doc.author_name,
      isbn_10: isbn10 ?? null,
      isbn_13: isbn13 ?? null,
      publisher: doc.publisher?.[0] ?? null,
      publish_date: doc.first_publish_year?.toString() ?? null,
      page_count: doc.number_of_pages_median ?? null,
      cover_url: this.getCoverUrl(doc.cover_i),
      subjects: doc.subject?.slice(0, 20) ?? [],
      rating: doc.ratings_average && doc.ratings_count
        ? { score: doc.ratings_average, count: doc.ratings_count }
        : undefined,
      identifier: doc.key?.replace('/works/', ''),
      source_url: this.getSourceUrl(doc.key),
      source: SOURCE,
    };
  }
}
