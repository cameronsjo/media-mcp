import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleBooksSource } from '../../src/sources/google-books.js';
import { GoodreadsSource } from '../../src/sources/goodreads.js';
import { HardcoverSource } from '../../src/sources/hardcover.js';
import { OpenLibrarySource } from '../../src/sources/open-library.js';
import { TMDBSource } from '../../src/sources/tmdb.js';
import { SQLiteCache } from '../../src/cache/sqlite-cache.js';
import { Logger } from '../../src/utils/logger.js';
import { RateLimiter } from '../../src/utils/rate-limiter.js';

vi.mock('undici', () => ({
  request: vi.fn(),
}));

import { request } from 'undici';

const mockRequest = vi.mocked(request);

function jsonResponse(payload: unknown, statusCode = 200): any {
  const responseBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    statusCode,
    headers: {},
    body: {
      text: vi.fn().mockResolvedValue(responseBody),
    },
  };
}

describe('source response validation', () => {
  let cache: SQLiteCache;

  beforeEach(() => {
    const logger = new Logger('test');
    cache = new SQLiteCache({ path: ':memory:', defaultTTLHours: 24, enabled: true }, logger);
    vi.clearAllMocks();
  });

  afterEach(() => {
    cache.close();
  });

  it('returns null for a malformed successful TMDB search response', async () => {
    const logger = new Logger('test');
    const source = new TMDBSource('test-api-key', cache, logger, new RateLimiter(logger));
    mockRequest.mockResolvedValueOnce(
      jsonResponse({
        page: 1,
        total_results: 1,
        total_pages: 1,
        results: [{ id: 'not-a-number', title: 'Malformed', popularity: 1 }],
      })
    );

    await expect(source.searchMovie('Malformed')).resolves.toBeNull();
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(cache.get(SQLiteCache.makeKey('tmdb', 'search-movie', 'Malformed'))).toBeNull();
  });

  it('returns null for a malformed successful TMDB TV search response', async () => {
    const logger = new Logger('test');
    const source = new TMDBSource('test-api-key', cache, logger, new RateLimiter(logger));
    mockRequest.mockResolvedValueOnce(
      jsonResponse({
        page: 1,
        total_results: 1,
        total_pages: 1,
        results: [{ id: 'not-a-number', name: 'Malformed', popularity: 1 }],
      })
    );

    await expect(source.searchTV('Malformed')).resolves.toBeNull();
    expect(cache.get(SQLiteCache.makeKey('tmdb', 'search-tv', 'Malformed'))).toBeNull();
  });

  it('returns null for a malformed successful TMDB TV details response', async () => {
    const logger = new Logger('test');
    const source = new TMDBSource('test-api-key', cache, logger, new RateLimiter(logger));
    mockRequest.mockResolvedValueOnce(
      jsonResponse({
        id: 'not-a-number',
        name: 'Malformed',
        original_name: 'Malformed',
        first_air_date: '',
        last_air_date: null,
        status: 'Ended',
        genres: [],
        overview: '',
        tagline: '',
        poster_path: null,
        backdrop_path: null,
        vote_average: 0,
        vote_count: 0,
        created_by: [],
        networks: [],
        episode_run_time: [],
        number_of_seasons: 0,
        number_of_episodes: 0,
        seasons: [],
      })
    );

    await expect(source.getTVDetails(7, false)).resolves.toBeNull();
    expect(cache.get(SQLiteCache.makeKey('tmdb', 'tv', 7, 'no-seasons', 'no-episodes'))).toBeNull();
  });

  it('returns null for a malformed successful TMDB season response', async () => {
    const logger = new Logger('test');
    const source = new TMDBSource('test-api-key', cache, logger, new RateLimiter(logger));
    mockRequest.mockResolvedValueOnce(
      jsonResponse({
        id: 'not-a-number',
        season_number: 1,
        name: 'Malformed',
        air_date: null,
        episodes: [],
      })
    );

    const sourceWithPrivateMethods = source as unknown as {
      getSeasonDetails: (tvId: number, seasonNumber: number) => Promise<unknown>;
    };
    await expect(sourceWithPrivateMethods.getSeasonDetails(7, 1)).resolves.toBeNull();
    expect(cache.get(SQLiteCache.makeKey('tmdb', 'season', 7, 1))).toBeNull();
  });

  it('returns an empty collection for a malformed successful TMDB collection response', async () => {
    const logger = new Logger('test');
    const source = new TMDBSource('test-api-key', cache, logger, new RateLimiter(logger));
    mockRequest.mockResolvedValueOnce(
      jsonResponse({
        id: 'not-a-number',
        name: 'Malformed',
        parts: [],
      })
    );

    const sourceWithPrivateMethods = source as unknown as {
      getCollectionPosition: (collectionId: number, movieId: number) => Promise<unknown>;
    };
    await expect(sourceWithPrivateMethods.getCollectionPosition(9, 7)).resolves.toEqual({
      name: null,
      position: null,
      total_films: null,
    });
    expect(cache.get(SQLiteCache.makeKey('tmdb', 'collection', 9))).toBeNull();
  });

  it('keeps a sparse TMDB movie when optional credits or providers are malformed', async () => {
    const logger = new Logger('test');
    const emitter = vi.fn();
    logger.setEmitter(emitter);
    logger.setLevel('warning');
    const source = new TMDBSource('test-api-key', cache, logger, new RateLimiter(logger));
    mockRequest
      .mockResolvedValueOnce(
        jsonResponse({
          id: 1,
          title: 'Sparse Movie',
          runtime: null,
          genres: [],
          production_companies: [],
          extra_field: true,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ cast: 'malformed', crew: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: {} }));

    const result = await source.getMovieDetails(1);

    expect(result?.title).toBe('Sparse Movie');
    expect(result?.cast).toEqual([]);
    expect(result?.directors).toEqual([]);
    expect(result?.watch_providers).toEqual({});
    expect(cache.get(SQLiteCache.makeKey('tmdb', 'movie', 1))).toBeNull();
    const validationWarnings = emitter.mock.calls
      .map(([entry]) => entry)
      .filter((entry) => entry.data.action === 'response_validation_failed');
    expect(validationWarnings.map((entry) => entry.data.endpoint)).toEqual(['/movie/1/credits']);
    expect(validationWarnings[0].data.issues).toEqual([
      { path: 'cast', message: 'Expected array, received string' },
    ]);
  });

  it('logs malformed TMDB providers while keeping the primary movie result', async () => {
    const logger = new Logger('test');
    const emitter = vi.fn();
    logger.setEmitter(emitter);
    logger.setLevel('warning');
    const source = new TMDBSource('test-api-key', cache, logger, new RateLimiter(logger));
    mockRequest
      .mockResolvedValueOnce(
        jsonResponse({
          id: 2,
          title: 'Sparse Movie',
          runtime: null,
          genres: [],
          production_companies: [],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ cast: [], crew: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));

    const result = await source.getMovieDetails(2);

    expect(result?.title).toBe('Sparse Movie');
    const validationWarnings = emitter.mock.calls
      .map(([entry]) => entry)
      .filter((entry) => entry.data.action === 'response_validation_failed');
    expect(validationWarnings.map((entry) => entry.data.endpoint)).toEqual([
      '/movie/2/watch/providers',
    ]);
    expect(cache.get(SQLiteCache.makeKey('tmdb', 'movie', 2))).toBeNull();
  });

  it('returns null for a malformed successful Open Library search response', async () => {
    const logger = new Logger('test');
    const source = new OpenLibrarySource(cache, logger, new RateLimiter(logger));
    mockRequest.mockResolvedValueOnce(
      jsonResponse({
        numFound: 1,
        start: 0,
        docs: [{ key: '/works/1', title: 'Malformed', author_name: 'not-an-array' }],
      })
    );

    await expect(source.searchByTitleAuthor('Malformed')).resolves.toBeNull();
    expect(cache.get(SQLiteCache.makeKey('open_library', 'search', 'Malformed'))).toBeNull();
  });

  it('accepts sparse Open Library ISBN data with extra fields', async () => {
    const logger = new Logger('test');
    const source = new OpenLibrarySource(cache, logger, new RateLimiter(logger));
    mockRequest.mockResolvedValueOnce(
      jsonResponse({
        title: 'Sparse Book',
        unexpected_field: 'preserved upstream data',
      })
    );

    const result = await source.searchByISBN('1234567890');

    expect(result?.title).toBe('Sparse Book');
    expect(result?.isbn_10).toBe('1234567890');
    expect(result?.source).toBe('open_library');
  });

  it('accepts nullable Open Library ISBN metadata and caches the valid book', async () => {
    const logger = new Logger('test');
    const source = new OpenLibrarySource(cache, logger, new RateLimiter(logger));
    mockRequest.mockResolvedValueOnce(
      jsonResponse({
        title: 'Nullable Book',
        publishers: null,
        publish_date: null,
        number_of_pages: null,
        isbn_10: null,
        isbn_13: null,
        covers: null,
        description: null,
        works: null,
        authors: null,
      })
    );

    const firstResult = await source.searchByISBN('1234567890');
    const cachedResult = await source.searchByISBN('1234567890');

    expect(firstResult?.title).toBe('Nullable Book');
    expect(cachedResult?.title).toBe('Nullable Book');
    expect(cachedResult?.isbn_10).toBe('1234567890');
    expect(cachedResult?.source).toBe('open_library');
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('accepts nullable Open Library work metadata and caches the valid work', async () => {
    const logger = new Logger('test');
    const source = new OpenLibrarySource(cache, logger, new RateLimiter(logger));
    mockRequest.mockResolvedValueOnce(
      jsonResponse({
        title: 'Nullable Work',
        description: null,
        subjects: null,
        subject_places: null,
        subject_people: null,
        subject_times: null,
        covers: null,
      })
    );

    const firstResult = await source.getWorkDetails('/works/nullable');
    const cachedResult = await source.getWorkDetails('/works/nullable');

    expect(firstResult).toEqual({ description: undefined, subjects: undefined });
    expect(cachedResult?.description).toBeUndefined();
    expect(cachedResult?.subjects).toBeUndefined();
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('returns null for an Open Library ISBN response without its required title', async () => {
    const logger = new Logger('test');
    const source = new OpenLibrarySource(cache, logger, new RateLimiter(logger));
    mockRequest.mockResolvedValueOnce(
      jsonResponse({
        publishers: null,
        description: null,
      })
    );

    await expect(source.searchByISBN('1234567890')).resolves.toBeNull();
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('returns null for a malformed successful Google Books response', async () => {
    const logger = new Logger('test');
    const source = new GoogleBooksSource(null, cache, logger, new RateLimiter(logger));
    mockRequest.mockResolvedValueOnce(
      jsonResponse({
        kind: 'books#volumes',
        totalItems: 1,
        items: [{ id: 'malformed', volumeInfo: { title: 42 } }],
      })
    );

    await expect(source.searchByISBN('1234567890')).resolves.toBeNull();
    expect(cache.get(SQLiteCache.makeKey('google_books', 'isbn', '1234567890'))).toBeNull();
  });

  it('accepts sparse Google Books volume data with extra fields', async () => {
    const logger = new Logger('test');
    const source = new GoogleBooksSource(null, cache, logger, new RateLimiter(logger));
    mockRequest.mockResolvedValueOnce(
      jsonResponse({
        kind: 'books#volumes',
        totalItems: 1,
        items: [
          {
            id: 'sparse-volume',
            volumeInfo: { title: 'Sparse Book', extra_field: { source: 'test' } },
          },
        ],
      })
    );

    const result = await source.searchByISBN('1234567890');

    expect(result?.title).toBe('Sparse Book');
    expect(result?.identifier).toBe('sparse-volume');
    expect(result?.source).toBe('google_books');
  });

  it('returns null for a malformed successful Google Books by-id response', async () => {
    const logger = new Logger('test');
    const source = new GoogleBooksSource(null, cache, logger, new RateLimiter(logger));
    mockRequest.mockResolvedValueOnce(
      jsonResponse({
        id: 'malformed',
        volumeInfo: { title: 42 },
      })
    );

    await expect(source.getBookById('malformed')).resolves.toBeNull();
    expect(cache.get(SQLiteCache.makeKey('google_books', 'id', 'malformed'))).toBeNull();
  });

  it('returns null before Cheerio for a non-string Goodreads response', async () => {
    const logger = new Logger('test');
    const source = new GoodreadsSource(
      { enabled: true, delayMs: 0 },
      cache,
      logger,
      new RateLimiter(logger)
    );
    mockRequest.mockResolvedValueOnce(jsonResponse({ html: '<html />' }));

    await expect(source.getBookDetails('1')).resolves.toBeNull();
  });

  it('accepts sparse Goodreads HTML', async () => {
    const logger = new Logger('test');
    const source = new GoodreadsSource(
      { enabled: true, delayMs: 0 },
      cache,
      logger,
      new RateLimiter(logger)
    );
    mockRequest.mockResolvedValueOnce(
      jsonResponse('<html><h1 class="seriesTitle">Sparse Series</h1></html>')
    );

    const result = await source.getSeriesInfo('1');

    expect(result?.name).toBe('Sparse Series');
    expect(result?.seriesId).toBe('1');
  });

  it('returns null for malformed successful Hardcover GraphQL data', async () => {
    const logger = new Logger('test');
    const source = new HardcoverSource(
      { apiKey: 'test-api-key' },
      cache,
      logger,
      new RateLimiter(logger)
    );
    mockRequest
      .mockResolvedValueOnce(
        jsonResponse({
          data: { search: { results: { hits: [] } } },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            books: [{ id: 'not-a-number', title: 'Malformed', slug: 'malformed' }],
          },
        })
      );

    await expect(source.searchByTitleAuthor('Malformed')).resolves.toBeNull();
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(cache.get(SQLiteCache.makeKey('hardcover', 'search', 'Malformed'))).toBeNull();
  });

  it('accepts sparse Hardcover book data with extra fields', async () => {
    const logger = new Logger('test');
    const source = new HardcoverSource(
      { apiKey: 'test-api-key' },
      cache,
      logger,
      new RateLimiter(logger)
    );
    mockRequest
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            search: {
              results: {
                hits: [
                  {
                    document: {
                      id: 1,
                      title: 'Sparse Book',
                      slug: 'sparse-book',
                      extra_field: true,
                    },
                  },
                ],
              },
            },
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            books: [
              {
                id: 1,
                title: 'Sparse Book',
                slug: 'sparse-book',
                extra_field: true,
              },
            ],
          },
        })
      );

    const result = await source.searchByTitleAuthor('Sparse Book');

    expect(result?.title).toBe('Sparse Book');
    expect(result?.identifier).toBe('1');
    expect(result?.source).toBe('hardcover');
  });

  it('returns null for a malformed successful Hardcover ISBN response', async () => {
    const logger = new Logger('test');
    const source = new HardcoverSource(
      { apiKey: 'test-api-key' },
      cache,
      logger,
      new RateLimiter(logger)
    );
    mockRequest.mockResolvedValueOnce(
      jsonResponse({
        data: {
          editions: [
            {
              book: { id: 'not-a-number', title: 'Malformed', slug: 'malformed' },
            },
          ],
        },
      })
    );

    await expect(source.searchByISBN('1234567890')).resolves.toBeNull();
    expect(cache.get(SQLiteCache.makeKey('hardcover', 'isbn', '1234567890'))).toBeNull();
  });

  it('returns null for a malformed successful Open Library work response', async () => {
    const logger = new Logger('test');
    const source = new OpenLibrarySource(cache, logger, new RateLimiter(logger));
    mockRequest.mockResolvedValueOnce(
      jsonResponse({
        title: 5,
        description: null,
      })
    );

    await expect(source.getWorkDetails('/works/malformed')).resolves.toBeNull();
    expect(cache.get(SQLiteCache.makeKey('open_library', 'work', '/works/malformed'))).toBeNull();
  });

  it.each([
    ['a nullable image URL', { image: { url: null } }, 'cover_url'],
    [
      'a nullable series relation',
      {
        book_series: [{ series: null, position: null }],
      },
      'series',
    ],
    [
      'a nullable contribution author',
      {
        contributions: [{ author: null }],
      },
      'authors',
    ],
  ])('accepts Hardcover source data with %s', async (_label, nullableField, expectedField) => {
    const logger = new Logger('test');
    const source = new HardcoverSource(
      { apiKey: 'test-api-key' },
      cache,
      logger,
      new RateLimiter(logger)
    );
    mockRequest
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            search: {
              results: {
                hits: [
                  {
                    document: { id: 3, title: 'Nullable Book', slug: 'nullable-book' },
                  },
                ],
              },
            },
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            books: [
              {
                id: 3,
                title: 'Nullable Book',
                slug: 'nullable-book',
                [Object.keys(nullableField)[0]]: Object.values(nullableField)[0],
              },
            ],
          },
        })
      );

    const result = await source.searchByTitleAuthor('Nullable Book');

    expect(result?.title).toBe('Nullable Book');
    expect(result?.source).toBe('hardcover');
    if (expectedField === 'cover_url') expect(result?.cover_url).toBeNull();
    if (expectedField === 'series') expect(result?.series).toBeUndefined();
    if (expectedField === 'authors') expect(result?.authors).toEqual([]);
  });
});
