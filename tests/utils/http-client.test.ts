import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpClient } from '../../src/utils/http-client.js';
import { Logger } from '../../src/utils/logger.js';
import { RateLimiter } from '../../src/utils/rate-limiter.js';

// Mock undici
vi.mock('undici', () => ({
  request: vi.fn(),
}));

import { request } from 'undici';

const mockRequest = vi.mocked(request);

function mockJsonResponse(data: unknown, statusCode = 200): void {
  mockRequest.mockResolvedValueOnce({
    statusCode,
    headers: {},
    body: {
      text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    },
  } as any);
}

describe('HttpClient', () => {
  let logger: Logger;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    logger = new Logger('test');
    rateLimiter = new RateLimiter(logger);
    vi.clearAllMocks();
  });

  describe('default query params', () => {
    it('appends configured default params to every request', async () => {
      const client = new HttpClient(
        'test',
        { baseUrl: 'https://api.example.com', params: { api_key: 'secret123' } },
        logger,
        rateLimiter
      );
      mockJsonResponse({ ok: true });

      await client.get('/search', { params: { query: 'matrix' } });

      const calledUrl = String(mockRequest.mock.calls[0][0]);
      expect(calledUrl).toContain('api_key=secret123');
      expect(calledUrl).toContain('query=matrix');
    });

    it('lets per-call params override defaults', async () => {
      const client = new HttpClient(
        'test',
        { baseUrl: 'https://api.example.com', params: { region: 'US' } },
        logger,
        rateLimiter
      );
      mockJsonResponse({ ok: true });

      await client.get('/x', { params: { region: 'GB' } });

      const calledUrl = String(mockRequest.mock.calls[0][0]);
      expect(calledUrl).toContain('region=GB');
      expect(calledUrl).not.toContain('region=US');
    });

    it('adds no query string when no params are configured (backward compatible)', async () => {
      const client = new HttpClient(
        'test',
        { baseUrl: 'https://api.example.com' },
        logger,
        rateLimiter
      );
      mockJsonResponse({ ok: true });

      await client.get('/plain');

      const calledUrl = String(mockRequest.mock.calls[0][0]);
      expect(calledUrl).toBe('https://api.example.com/plain');
    });
  });

  describe('baseUrl with a path component', () => {
    it('preserves the base path for a leading-slash path (does not drop /3)', async () => {
      const client = new HttpClient(
        'test',
        { baseUrl: 'https://api.themoviedb.org/3' },
        logger,
        rateLimiter
      );
      mockJsonResponse({ ok: true });

      await client.get('/search/movie', { params: { query: 'matrix' } });

      const calledUrl = String(mockRequest.mock.calls[0][0]);
      expect(calledUrl).toContain('https://api.themoviedb.org/3/search/movie');
    });

    it('preserves a multi-segment base path (google-books /books/v1)', async () => {
      const client = new HttpClient(
        'test',
        { baseUrl: 'https://www.googleapis.com/books/v1' },
        logger,
        rateLimiter
      );
      mockJsonResponse({ ok: true });

      await client.get('/volumes');

      const calledUrl = String(mockRequest.mock.calls[0][0]);
      expect(calledUrl).toBe('https://www.googleapis.com/books/v1/volumes');
    });

    it('leaves an origin-only baseUrl unchanged', async () => {
      const client = new HttpClient(
        'test',
        { baseUrl: 'https://openlibrary.org' },
        logger,
        rateLimiter
      );
      mockJsonResponse({ ok: true });

      await client.get('/search.json');

      const calledUrl = String(mockRequest.mock.calls[0][0]);
      expect(calledUrl).toBe('https://openlibrary.org/search.json');
    });

    it('does not append a trailing slash for an empty path against a path base (graphql POST)', async () => {
      const client = new HttpClient(
        'test',
        { baseUrl: 'https://api.hardcover.app/v1/graphql' },
        logger,
        rateLimiter
      );
      mockJsonResponse({ ok: true });

      await client.post('', { query: '{ me { id } }' });

      const calledUrl = String(mockRequest.mock.calls[0][0]);
      expect(calledUrl).toBe('https://api.hardcover.app/v1/graphql');
    });
  });
});
