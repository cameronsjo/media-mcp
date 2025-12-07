import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenLibrarySource } from '../../src/sources/open-library.js';
import { SQLiteCache } from '../../src/cache/sqlite-cache.js';
import { Logger } from '../../src/utils/logger.js';
import { RateLimiter } from '../../src/utils/rate-limiter.js';

// Mock undici
vi.mock('undici', () => ({
  request: vi.fn(),
}));

import { request } from 'undici';

const mockRequest = vi.mocked(request);

describe('OpenLibrarySource', () => {
  let source: OpenLibrarySource;
  let cache: SQLiteCache;
  let logger: Logger;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    logger = new Logger('test');
    rateLimiter = new RateLimiter(logger);
    cache = new SQLiteCache(
      { path: ':memory:', defaultTTLHours: 24, enabled: true },
      logger
    );
    source = new OpenLibrarySource(cache, logger, rateLimiter);
    vi.clearAllMocks();
  });

  afterEach(() => {
    cache.close();
  });

  describe('searchByISBN', () => {
    it('should fetch book by ISBN', async () => {
      const mockResponse = {
        title: 'The Name of the Wind',
        publishers: ['DAW Books'],
        publish_date: 'March 27, 2007',
        number_of_pages: 662,
        isbn_10: ['0756404746'],
        isbn_13: ['9780756404741'],
        covers: [8739161],
        works: [{ key: '/works/OL5732753W' }],
      };

      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue(JSON.stringify(mockResponse)),
        },
      } as any);

      // Mock work details call
      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue(
            JSON.stringify({
              title: 'The Name of the Wind',
              description: 'A fantasy novel',
              subjects: ['Fantasy', 'Magic'],
            })
          ),
        },
      } as any);

      const result = await source.searchByISBN('9780756404741');

      expect(result).not.toBeNull();
      expect(result?.title).toBe('The Name of the Wind');
      expect(result?.isbn_13).toBe('9780756404741');
      expect(result?.source).toBe('open_library');
    });

    it('should return null for non-existent ISBN', async () => {
      mockRequest.mockResolvedValueOnce({
        statusCode: 404,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue('Not found'),
        },
      } as any);

      const result = await source.searchByISBN('0000000000');

      expect(result).toBeNull();
    });

    it('should use cached results', async () => {
      const mockResponse = {
        title: 'Test Book',
        works: [{ key: '/works/OL123W' }],
      };

      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue(JSON.stringify(mockResponse)),
        },
      } as any);

      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue(JSON.stringify({ title: 'Test Book' })),
        },
      } as any);

      // First call
      await source.searchByISBN('1234567890');

      // Second call should use cache
      const result = await source.searchByISBN('1234567890');

      expect(result).not.toBeNull();
      // Should only have made the initial API calls
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('searchByTitleAuthor', () => {
    it('should search by title and author', async () => {
      const mockSearchResponse = {
        numFound: 1,
        start: 0,
        docs: [
          {
            key: '/works/OL5732753W',
            title: 'The Name of the Wind',
            author_name: ['Patrick Rothfuss'],
            first_publish_year: 2007,
            isbn: ['9780756404741'],
            number_of_pages_median: 662,
            cover_i: 8739161,
            ratings_average: 4.52,
            ratings_count: 1000000,
          },
        ],
      };

      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue(JSON.stringify(mockSearchResponse)),
        },
      } as any);

      const result = await source.searchByTitleAuthor(
        'The Name of the Wind',
        'Patrick Rothfuss'
      );

      expect(result).not.toBeNull();
      expect(result?.title).toBe('The Name of the Wind');
      expect(result?.author).toBe('Patrick Rothfuss');
    });

    it('should return null when no results found', async () => {
      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue(
            JSON.stringify({
              numFound: 0,
              start: 0,
              docs: [],
            })
          ),
        },
      } as any);

      const result = await source.searchByTitleAuthor('Nonexistent Book');

      expect(result).toBeNull();
    });
  });

  describe('getCoverUrl', () => {
    it('should generate cover URL from ID', () => {
      const url = source.getCoverUrl(8739161);
      expect(url).toBe('https://covers.openlibrary.org/b/id/8739161-L.jpg');
    });

    it('should return null for undefined cover ID', () => {
      const url = source.getCoverUrl(undefined);
      expect(url).toBeNull();
    });

    it('should support different sizes', () => {
      const urlS = source.getCoverUrl(123, 'S');
      const urlM = source.getCoverUrl(123, 'M');
      const urlL = source.getCoverUrl(123, 'L');

      expect(urlS).toContain('-S.jpg');
      expect(urlM).toContain('-M.jpg');
      expect(urlL).toContain('-L.jpg');
    });
  });

  describe('getSourceUrl', () => {
    it('should generate Open Library URL', () => {
      const url = source.getSourceUrl('/works/OL5732753W');
      expect(url).toBe('https://openlibrary.org/works/OL5732753W');
    });
  });
});
