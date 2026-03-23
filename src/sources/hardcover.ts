import { HttpClient, Logger, RateLimiter } from '../utils/index.js';
import { SQLiteCache, CacheTTL } from '../cache/sqlite-cache.js';
import { normalizeForComparison } from '../utils/strings.js';
import type { PartialBookData, BookSource } from '../types/book.js';

const SOURCE: BookSource = 'hardcover';
const API_URL = 'https://api.hardcover.app/v1/graphql';
const SITE_URL = 'https://hardcover.app';

interface HardcoverBookResult {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  pages: number | null;
  release_date: string | null;
  rating: number | null;
  ratings_count: number | null;
  cached_tags: Record<string, { tag: string; count: number }[]> | null;
  cached_contributors: { author: { name: string } }[] | null;
  contributions: { author: { name: string } }[];
  image?: { url: string } | null;
  book_series: { series: { name: string; id: number }; position: number | null }[];
  default_physical_edition?: { isbn_10: string | null; isbn_13: string | null } | null;
}

interface HardcoverSearchResult {
  results: {
    hits: {
      document: {
        id: number;
        title: string;
        slug: string;
        author_names: string[];
        image_url: string | null;
      };
    }[];
  };
}

const BOOK_FIELDS = `
  id title slug description pages release_date
  rating ratings_count cached_tags
  contributions { author { name } }
  image { url }
  book_series { position series { name id } }
  default_physical_edition { isbn_10 isbn_13 }
`;

const BOOK_DETAIL_QUERY = `
  query BookBySearch($title: String!, $author: String) {
    books(
      where: {
        _and: [
          { title: { _ilike: $title } }
        ]
      }
      limit: 5
      order_by: { users_count: desc }
    ) {
      ${BOOK_FIELDS}
    }
  }
`;

const SEARCH_QUERY = `
  query SearchBooks($query: String!) {
    search(
      query: $query
      query_type: "books"
      per_page: 5
      page: 1
    ) {
      results
    }
  }
`;

const BOOK_BY_ID_QUERY = `
  query BookById($id: Int!) {
    books(where: { id: { _eq: $id } }, limit: 1) {
      ${BOOK_FIELDS}
    }
  }
`;

export interface HardcoverConfig {
  apiKey: string | null;
}

export class HardcoverSource {
  private client: HttpClient;
  private cache: SQLiteCache;
  private logger: Logger;
  private apiKey: string | null;

  constructor(
    config: HardcoverConfig,
    cache: SQLiteCache,
    logger: Logger,
    rateLimiter: RateLimiter
  ) {
    this.apiKey = config.apiKey;
    this.cache = cache;
    this.logger = logger;

    rateLimiter.configure(SOURCE, {
      requestsPerWindow: 60,
      windowMs: 60000, // 60 requests per minute
    });

    this.client = new HttpClient(
      SOURCE,
      {
        baseUrl: API_URL,
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
      },
      logger,
      rateLimiter
    );
  }

  isEnabled(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  async searchByISBN(isbn: string): Promise<PartialBookData | null> {
    if (!this.isEnabled()) return null;

    const cleanISBN = isbn.replace(/[-\s]/g, '');
    const cacheKey = SQLiteCache.makeKey(SOURCE, 'isbn', cleanISBN);
    const cached = this.cache.get<PartialBookData>(cacheKey);
    if (cached) return cached.value;

    try {
      const isISBN13 = cleanISBN.length === 13;
      const field = isISBN13 ? 'isbn_13' : 'isbn_10';

      // ISBNs live on editions, so search via the edition relationship
      const query = `
        query BookByISBN($isbn: String!) {
          editions(where: { ${field}: { _eq: $isbn } }, limit: 1) {
            book {
              ${BOOK_FIELDS}
            }
          }
        }
      `;

      const result = await this.graphqlRequest<{
        editions: { book: HardcoverBookResult }[];
      }>(query, { isbn: cleanISBN });

      if (!result?.editions?.length) return null;

      const bookData = this.buildPartialBookData(result.editions[0].book);
      this.cache.set(cacheKey, bookData, SOURCE, CacheTTL.BOOK_METADATA);
      return bookData;
    } catch (error) {
      this.logger.error('hardcover', {
        action: 'isbn_lookup_failed',
        isbn: cleanISBN,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async searchByTitleAuthor(title: string, author?: string): Promise<PartialBookData | null> {
    if (!this.isEnabled()) return null;

    const cacheKey = SQLiteCache.makeKey(SOURCE, 'search', title, author);
    const cached = this.cache.get<PartialBookData>(cacheKey);
    if (cached) return cached.value;

    try {
      // Try search endpoint first
      const searchQuery = author ? `${title} ${author}` : title;
      const searchResult = await this.graphqlRequest<{ search: HardcoverSearchResult }>(
        SEARCH_QUERY,
        { query: searchQuery }
      );

      let bookId: number | null = null;

      if (searchResult?.search?.results?.hits?.length) {
        // Find best match from search results
        const hits = searchResult.search.results.hits;
        const normalizedTitle = normalizeForComparison(title);
        const normalizedAuthor = author ? normalizeForComparison(author) : null;

        for (const hit of hits) {
          const doc = hit.document;
          const hitTitle = normalizeForComparison(doc.title);

          const titleMatch = hitTitle === normalizedTitle ||
            hitTitle.includes(normalizedTitle) ||
            normalizedTitle.includes(hitTitle);

          const authorMatch = !normalizedAuthor ||
            doc.author_names?.some(
              (a) => {
                const na = normalizeForComparison(a);
                return na === normalizedAuthor ||
                  na.includes(normalizedAuthor) ||
                  normalizedAuthor.includes(na);
              }
            );

          if (titleMatch && authorMatch) {
            bookId = doc.id;
            break;
          }
        }

        // Fall back to first result if no exact match
        if (!bookId && hits.length > 0) {
          bookId = hits[0].document.id;
        }
      }

      if (!bookId) {
        // Fallback: direct title query
        const directResult = await this.graphqlRequest<{ books: HardcoverBookResult[] }>(
          BOOK_DETAIL_QUERY,
          { title: `%${title}%`, author }
        );

        if (directResult?.books?.length) {
          const match = author
            ? this.findBestAuthorMatch(directResult.books, author)
            : directResult.books[0];

          if (match) {
            const bookData = this.buildPartialBookData(match);
            this.cache.set(cacheKey, bookData, SOURCE, CacheTTL.SEARCH_RESULTS);
            return bookData;
          }
        }

        this.logger.debug('hardcover', {
          action: 'search_no_results',
          title,
          author,
        });
        return null;
      }

      // Fetch full book details by ID
      const detailResult = await this.graphqlRequest<{ books: HardcoverBookResult[] }>(
        BOOK_BY_ID_QUERY,
        { id: bookId }
      );

      if (!detailResult?.books?.length) return null;

      const bookData = this.buildPartialBookData(detailResult.books[0]);
      this.cache.set(cacheKey, bookData, SOURCE, CacheTTL.SEARCH_RESULTS);
      return bookData;
    } catch (error) {
      this.logger.error('hardcover', {
        action: 'search_failed',
        title,
        author,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async graphqlRequest<T>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<T | null> {
    const response = await this.client.post<{ data?: T; errors?: { message: string }[] }>(
      '',
      { query, variables }
    );

    if (response.status === 401) {
      this.logger.warning('hardcover', {
        action: 'auth_failed',
        message: 'Hardcover API key is invalid or expired',
      });
      return null;
    }

    if (response.status === 429) {
      this.logger.warning('hardcover', {
        action: 'rate_limited',
        message: 'Hardcover API rate limit reached',
      });
      return null;
    }

    if (response.status !== 200) {
      this.logger.warning('hardcover', {
        action: 'request_failed',
        status: response.status,
      });
      return null;
    }

    if (response.data.errors?.length) {
      this.logger.warning('hardcover', {
        action: 'graphql_errors',
        errors: response.data.errors.map((e) => e.message),
      });
      return null;
    }

    return response.data.data ?? null;
  }

  private buildPartialBookData(book: HardcoverBookResult): PartialBookData {
    const authors = book.contributions?.map((c) => c.author.name) ?? [];

    // Extract tags from cached_tags categories
    const genres: string[] = [];
    const tropes: string[] = [];
    const allTags: string[] = [];

    if (book.cached_tags) {
      // Genre category → genres
      for (const entry of book.cached_tags['Genre'] ?? []) {
        genres.push(entry.tag);
        allTags.push(entry.tag);
      }

      // Mood category → tropes (slow burn, spicy, emotional, etc.)
      for (const entry of book.cached_tags['Mood'] ?? []) {
        tropes.push(entry.tag);
        allTags.push(entry.tag);
      }

      // Content Warning category → include as metadata
      for (const entry of book.cached_tags['Content Warning'] ?? []) {
        allTags.push(entry.tag);
      }

      // Tag category — some are trope-like, some are meta
      const metaTags = new Set([
        'loveable characters', 'unloveable characters', 'diverse characters',
        'not diverse characters', 'strong character development',
        'weak character development', 'character driven', 'plot driven',
        'a mix driven', 'fast', 'medium', 'slow', 'challenging',
      ]);
      for (const entry of book.cached_tags['Tag'] ?? []) {
        if (!metaTags.has(entry.tag.toLowerCase())) {
          tropes.push(entry.tag);
        }
        allTags.push(entry.tag);
      }
    }

    // Series info
    const seriesEntry = book.book_series?.[0];
    const series = seriesEntry
      ? {
          name: seriesEntry.series.name,
          position: seriesEntry.position,
        }
      : undefined;

    return {
      title: book.title,
      author: authors[0],
      authors,
      isbn_10: book.default_physical_edition?.isbn_10 ?? null,
      isbn_13: book.default_physical_edition?.isbn_13 ?? null,
      genres,
      subjects: allTags,
      tropes,
      shelves: allTags,
      page_count: book.pages ?? null,
      publish_date: book.release_date ?? null,
      description: book.description ?? null,
      cover_url: book.image?.url ?? null,
      series,
      rating:
        book.rating && book.ratings_count
          ? { score: book.rating, count: book.ratings_count }
          : undefined,
      identifier: String(book.id),
      source_url: `${SITE_URL}/books/${book.slug}`,
      source: SOURCE,
    };
  }

  private findBestAuthorMatch(
    books: HardcoverBookResult[],
    author: string
  ): HardcoverBookResult | null {
    const normalizedAuthor = normalizeForComparison(author);

    for (const book of books) {
      const bookAuthors = book.contributions?.map((c) =>
        normalizeForComparison(c.author.name)
      ) ?? [];

      if (
        bookAuthors.some(
          (a) => a === normalizedAuthor ||
            a.includes(normalizedAuthor) ||
            normalizedAuthor.includes(a)
        )
      ) {
        return book;
      }
    }

    return books[0] ?? null;
  }
}
