import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from 'undici';
import { GoogleBooksSource } from '../../src/sources/google-books.js';
import { SQLiteCache } from '../../src/cache/sqlite-cache.js';
import { Logger } from '../../src/utils/logger.js';
import { RateLimiter } from '../../src/utils/rate-limiter.js';

vi.mock('undici', () => ({
  request: vi.fn(),
}));

const mockRequest = vi.mocked(request);

type VolumeInfoOverrides = Record<string, unknown>;

function makeVolume(
  id = 'volume-1',
  infoOverrides: VolumeInfoOverrides = {}
): Record<string, unknown> {
  return {
    id,
    volumeInfo: {
      title: 'The Left Hand of Darkness',
      subtitle: 'A Novel',
      authors: ['Ursula K. Le Guin'],
      publisher: 'Ace Books',
      publishedDate: '1969',
      description: 'A novel about identity, politics, and belonging.',
      industryIdentifiers: [
        { type: 'ISBN_10', identifier: '0441478123' },
        { type: 'ISBN_13', identifier: '9780441478123' },
      ],
      pageCount: 304,
      categories: ['Fiction', 'Science Fiction'],
      averageRating: 4.6,
      ratingsCount: 120,
      imageLinks: {
        large: 'https://books.example/large.jpg',
        medium: 'https://books.example/medium.jpg',
        thumbnail: 'https://books.example/thumbnail.jpg?zoom=1',
      },
      infoLink: 'https://books.google.com/books?id=volume-1',
      ...infoOverrides,
    },
  };
}

function makeSearchResponse(items: unknown[], totalItems = items.length): Record<string, unknown> {
  return { kind: 'books#volumes', totalItems, items };
}

function makeResponse(statusCode: number, body: unknown): Record<string, unknown> {
  return {
    statusCode,
    headers: {},
    body: {
      text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
    },
  };
}

function getRequestUrl(call = 0): URL {
  return new URL(String(mockRequest.mock.calls[call]?.[0]));
}

describe('GoogleBooksSource', () => {
  let source: GoogleBooksSource;
  let cache: SQLiteCache;
  let logger: Logger;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    logger = new Logger('test');
    logger.setEmitter(() => undefined);
    rateLimiter = new RateLimiter(logger);
    cache = new SQLiteCache({ path: ':memory:', defaultTTLHours: 24, enabled: true }, logger);
    source = new GoogleBooksSource('test-key', cache, logger, rateLimiter);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    cache.close();
  });

  describe('constructor and rate limiting', () => {
    it('configures the keyed and unkeyed request limits', () => {
      const keyedLimiter = new RateLimiter(logger);
      new GoogleBooksSource('test-key', cache, logger, keyedLimiter);
      for (let index = 0; index < 50; index += 1) {
        keyedLimiter.recordRequest('google_books');
      }
      expect(keyedLimiter.canRequest('google_books')).toBe(true);
      for (let index = 0; index < 50; index += 1) {
        keyedLimiter.recordRequest('google_books');
      }
      expect(keyedLimiter.canRequest('google_books')).toBe(false);

      const unkeyedLimiter = new RateLimiter(logger);
      new GoogleBooksSource(null, cache, logger, unkeyedLimiter);
      for (let index = 0; index < 50; index += 1) {
        unkeyedLimiter.recordRequest('google_books');
      }
      expect(unkeyedLimiter.canRequest('google_books')).toBe(false);
    });
  });

  describe('searchByISBN', () => {
    it('normalizes the ISBN, sends the API key, maps metadata, and writes the cache', async () => {
      mockRequest.mockResolvedValueOnce(
        makeResponse(200, makeSearchResponse([makeVolume()])) as never
      );

      const result = await source.searchByISBN('978-0441 478123');

      expect(result).toEqual({
        title: 'The Left Hand of Darkness: A Novel',
        author: 'Ursula K. Le Guin',
        authors: ['Ursula K. Le Guin'],
        isbn_10: '0441478123',
        isbn_13: '9780441478123',
        publisher: 'Ace Books',
        publish_date: '1969',
        page_count: 304,
        description: 'A novel about identity, politics, and belonging.',
        cover_url: 'https://books.example/large.jpg',
        genres: ['Fiction', 'Science Fiction'],
        subjects: ['Fiction', 'Science Fiction'],
        rating: { score: 4.6, count: 120 },
        identifier: 'volume-1',
        source_url: 'https://books.google.com/books?id=volume-1',
        source: 'google_books',
      });

      const url = getRequestUrl();
      expect(url.origin + url.pathname).toBe('https://www.googleapis.com/books/v1/volumes');
      expect(url.searchParams.get('q')).toBe('isbn:9780441478123');
      expect(url.searchParams.get('maxResults')).toBe('1');
      expect(url.searchParams.get('key')).toBe('test-key');
      expect(cache.get('google_books:isbn:9780441478123')?.value).toEqual(result);
    });

    it('returns a cached ISBN result without making an HTTP request', async () => {
      const cached = { title: 'Cached Book', source: 'google_books' };
      cache.set('google_books:isbn:9780441478123', cached, 'google_books');

      const result = await source.searchByISBN('978-0441478123');

      expect(result).toEqual(cached);
      expect(mockRequest).not.toHaveBeenCalled();
    });

    it('returns null for a valid empty or sparse search response', async () => {
      mockRequest.mockResolvedValueOnce(
        makeResponse(200, { kind: 'books#volumes', totalItems: 0 }) as never
      );

      await expect(source.searchByISBN('0000000000')).resolves.toBeNull();
      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(cache.get('google_books:isbn:0000000000')).toBeNull();

      mockRequest.mockResolvedValueOnce(
        makeResponse(
          200,
          makeSearchResponse([
            makeVolume('sparse', {
              subtitle: undefined,
              authors: undefined,
              publisher: undefined,
              publishedDate: undefined,
              description: undefined,
              industryIdentifiers: undefined,
              pageCount: undefined,
              categories: undefined,
              averageRating: undefined,
              ratingsCount: undefined,
              imageLinks: undefined,
              infoLink: undefined,
            }),
          ])
        ) as never
      );

      const result = await source.searchByISBN('1111111111');
      expect(result).toMatchObject({
        title: 'The Left Hand of Darkness',
        author: undefined,
        authors: undefined,
        isbn_10: null,
        isbn_13: null,
        publisher: null,
        publish_date: null,
        page_count: null,
        description: null,
        cover_url: null,
        genres: [],
        subjects: [],
        rating: undefined,
        identifier: 'sparse',
        source_url: 'https://books.google.com/books?id=sparse',
      });
    });

    it.each([403, 500])('returns null for an HTTP %i response without caching', async (status) => {
      mockRequest.mockResolvedValueOnce(makeResponse(status, { error: 'failed' }) as never);

      await expect(source.searchByISBN('9780441478123')).resolves.toBeNull();
      expect(cache.get('google_books:isbn:9780441478123')).toBeNull();
    });

    it('treats quota status 429 as a failed lookup after the client retries', async () => {
      vi.useFakeTimers();
      mockRequest
        .mockResolvedValueOnce(makeResponse(429, { error: 'quota exceeded' }) as never)
        .mockResolvedValueOnce(makeResponse(429, { error: 'quota exceeded' }) as never)
        .mockResolvedValueOnce(makeResponse(429, { error: 'quota exceeded' }) as never);

      const resultPromise = source.searchByISBN('9780441478123');
      await vi.advanceTimersByTimeAsync(7000);

      await expect(resultPromise).resolves.toBeNull();
      expect(mockRequest).toHaveBeenCalledTimes(3);
      expect(cache.get('google_books:isbn:9780441478123')).toBeNull();
    });

    it('handles malformed JSON payloads and transport failures without caching', async () => {
      mockRequest.mockResolvedValueOnce(makeResponse(200, '{not-json') as never);
      await expect(source.searchByISBN('9780441478123')).resolves.toBeNull();
      expect(cache.get('google_books:isbn:9780441478123')).toBeNull();

      vi.useFakeTimers();
      mockRequest
        .mockRejectedValueOnce(new Error('network unavailable'))
        .mockRejectedValueOnce(new Error('network unavailable'))
        .mockRejectedValueOnce(new Error('network unavailable'));
      const resultPromise = source.searchByISBN('9780441478123');
      await vi.advanceTimersByTimeAsync(7000);
      await expect(resultPromise).resolves.toBeNull();
      expect(mockRequest).toHaveBeenCalledTimes(4);
    });
  });

  describe('searchByTitleAuthor', () => {
    it('searches with title and author and chooses the best matching result', async () => {
      const exactTitleWrongAuthor = makeVolume('wrong-author', {
        title: 'The Left Hand of Darkness',
        authors: ['A Different Author'],
        industryIdentifiers: undefined,
        imageLinks: undefined,
        pageCount: undefined,
        ratingsCount: undefined,
      });
      const partialTitleRightAuthor = makeVolume('right-author', {
        title: 'The Left Hand of Darkness: A Novel',
        subtitle: undefined,
        authors: ['Ursula K. Le Guin'],
      });
      const unrelated = makeVolume('unrelated', {
        title: 'A Completely Different Book',
        authors: undefined,
      });
      mockRequest.mockResolvedValueOnce(
        makeResponse(
          200,
          makeSearchResponse([exactTitleWrongAuthor, unrelated, partialTitleRightAuthor])
        ) as never
      );

      const result = await source.searchByTitleAuthor('Left Hand of Darkness', 'Ursula K. Le Guin');

      expect(result?.identifier).toBe('right-author');
      expect(result?.author).toBe('Ursula K. Le Guin');
      expect(result?.title).toBe('The Left Hand of Darkness: A Novel');
      const url = getRequestUrl();
      expect(url.searchParams.get('q')).toBe(
        'intitle:Left Hand of Darkness+inauthor:Ursula K. Le Guin'
      );
      expect(url.searchParams.get('maxResults')).toBe('5');
      expect(url.searchParams.get('orderBy')).toBe('relevance');
      expect(url.searchParams.get('printType')).toBe('books');
      expect(url.searchParams.get('key')).toBe('test-key');
      expect(
        cache.get('google_books:search:left hand of darkness:ursula k. le guin')
      ).not.toBeNull();
    });

    it('supports an unkeyed title-only query and accepts a partial title match', async () => {
      const unkeyedLimiter = new RateLimiter(logger);
      const unkeyedSource = new GoogleBooksSource(null, cache, logger, unkeyedLimiter);
      mockRequest.mockResolvedValueOnce(
        makeResponse(
          200,
          makeSearchResponse([
            makeVolume('partial', {
              title: 'The Left Hand of Darkness Illustrated',
            }),
          ])
        ) as never
      );

      const result = await unkeyedSource.searchByTitleAuthor('Left Hand of Darkness');

      expect(result?.identifier).toBe('partial');
      const url = getRequestUrl();
      expect(url.searchParams.get('q')).toBe('intitle:Left Hand of Darkness');
      expect(url.searchParams.has('key')).toBe(false);
    });

    it('returns null when no result reaches the match threshold', async () => {
      mockRequest.mockResolvedValueOnce(
        makeResponse(
          200,
          makeSearchResponse([
            makeVolume('unrelated', {
              title: 'A Completely Different Book',
              authors: ['Someone Else'],
              industryIdentifiers: undefined,
              imageLinks: undefined,
              pageCount: undefined,
              ratingsCount: undefined,
            }),
          ])
        ) as never
      );

      await expect(
        source.searchByTitleAuthor('Left Hand of Darkness', 'Ursula K. Le Guin')
      ).resolves.toBeNull();
      expect(cache.get('google_books:search:left hand of darkness:ursula k. le guin')).toBeNull();
    });

    it('returns null for empty, malformed, and failed search responses', async () => {
      mockRequest.mockResolvedValueOnce(makeResponse(200, makeSearchResponse([], 0)) as never);
      await expect(source.searchByTitleAuthor('Missing Book')).resolves.toBeNull();

      mockRequest.mockResolvedValueOnce(
        makeResponse(200, {
          kind: 'books#volumes',
          totalItems: 1,
          items: [{ id: 'missing-info' }],
        }) as never
      );
      await expect(source.searchByTitleAuthor('Malformed Book')).resolves.toBeNull();

      mockRequest.mockResolvedValueOnce(makeResponse(403, { error: 'forbidden' }) as never);
      await expect(source.searchByTitleAuthor('Forbidden Book')).resolves.toBeNull();

      mockRequest.mockResolvedValueOnce(makeResponse(500, { error: 'server error' }) as never);
      await expect(source.searchByTitleAuthor('Broken Book')).resolves.toBeNull();
      expect(cache.get('google_books:search:forbidden book')).toBeNull();
    });

    it('uses the cached title-author result and does not cache failed responses', async () => {
      const cached = { title: 'Cached Search', source: 'google_books' };
      cache.set('google_books:search:cached title:cached author', cached, 'google_books');
      await expect(source.searchByTitleAuthor('Cached Title', 'Cached Author')).resolves.toEqual(
        cached
      );
      expect(mockRequest).not.toHaveBeenCalled();

      mockRequest.mockResolvedValueOnce(makeResponse(500, { error: 'failed' }) as never);
      await expect(source.searchByTitleAuthor('Failed Search', 'Author')).resolves.toBeNull();
      expect(cache.get('google_books:search:failed search:author')).toBeNull();
    });
  });

  describe('getBookById', () => {
    it('fetches a volume by ID, maps the fallback source URL, and caches it', async () => {
      mockRequest.mockResolvedValueOnce(
        makeResponse(200, makeVolume('by-id', { infoLink: undefined })) as never
      );

      const result = await source.getBookById('by-id');

      expect(result?.identifier).toBe('by-id');
      expect(result?.source_url).toBe('https://books.google.com/books?id=by-id');
      expect(getRequestUrl().pathname).toBe('/books/v1/volumes/by-id');
      expect(getRequestUrl().searchParams.get('key')).toBe('test-key');
      expect(cache.get('google_books:id:by-id')).not.toBeNull();
    });

    it('omits the API key for an unkeyed ID lookup and returns cached values', async () => {
      const unkeyedLimiter = new RateLimiter(logger);
      const unkeyedSource = new GoogleBooksSource(null, cache, logger, unkeyedLimiter);
      mockRequest.mockResolvedValueOnce(makeResponse(200, makeVolume('public-id')) as never);

      const first = await unkeyedSource.getBookById('public-id');
      const second = await unkeyedSource.getBookById('public-id');

      expect(second).toEqual(first);
      expect(getRequestUrl().searchParams.has('key')).toBe(false);
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it.each([404, 500])('returns null for HTTP %i and does not write the cache', async (status) => {
      mockRequest.mockResolvedValueOnce(makeResponse(status, { error: 'failed' }) as never);

      await expect(source.getBookById('missing-id')).resolves.toBeNull();
      expect(cache.get('google_books:id:missing-id')).toBeNull();
    });

    it('handles malformed volume payloads and transport errors', async () => {
      mockRequest.mockResolvedValueOnce(makeResponse(200, { id: 'missing-volume-info' }) as never);
      await expect(source.getBookById('malformed-id')).resolves.toBeNull();

      vi.useFakeTimers();
      mockRequest
        .mockRejectedValueOnce(new Error('connection reset'))
        .mockRejectedValueOnce(new Error('connection reset'))
        .mockRejectedValueOnce(new Error('connection reset'));
      const resultPromise = source.getBookById('transport-error');
      await vi.advanceTimersByTimeAsync(7000);
      await expect(resultPromise).resolves.toBeNull();
      expect(cache.get('google_books:id:transport-error')).toBeNull();
    });

    it('selects medium, upgraded thumbnail, and no cover URLs', async () => {
      mockRequest.mockResolvedValueOnce(
        makeResponse(
          200,
          makeVolume('medium-cover', {
            imageLinks: { medium: 'https://books.example/medium-only.jpg' },
            averageRating: 0,
            ratingsCount: 0,
          })
        ) as never
      );
      const medium = await source.getBookById('medium-cover');
      expect(medium?.cover_url).toBe('https://books.example/medium-only.jpg');
      expect(medium?.rating).toBeUndefined();

      mockRequest.mockResolvedValueOnce(
        makeResponse(
          200,
          makeVolume('thumbnail-cover', {
            imageLinks: { thumbnail: 'https://books.example/thumb.jpg?zoom=1' },
          })
        ) as never
      );
      const thumbnail = await source.getBookById('thumbnail-cover');
      expect(thumbnail?.cover_url).toBe('https://books.example/thumb.jpg?zoom=2');

      mockRequest.mockResolvedValueOnce(
        makeResponse(200, makeVolume('no-cover', { imageLinks: undefined })) as never
      );
      const noCover = await source.getBookById('no-cover');
      expect(noCover?.cover_url).toBeNull();
    });
  });
});
