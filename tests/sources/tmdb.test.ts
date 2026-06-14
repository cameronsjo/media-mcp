import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TMDBSource } from '../../src/sources/tmdb.js';
import { SQLiteCache } from '../../src/cache/sqlite-cache.js';
import { Logger } from '../../src/utils/logger.js';
import { RateLimiter } from '../../src/utils/rate-limiter.js';

// Mock undici
vi.mock('undici', () => ({
  request: vi.fn(),
}));

import { request } from 'undici';

const mockRequest = vi.mocked(request);

describe('TMDBSource', () => {
  let source: TMDBSource;
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
    source = new TMDBSource('test-api-key', cache, logger, rateLimiter);
    vi.clearAllMocks();
  });

  afterEach(() => {
    cache.close();
  });

  describe('searchMovie', () => {
    it('should search for a movie by title', async () => {
      const mockSearchResponse = {
        page: 1,
        total_results: 1,
        total_pages: 1,
        results: [
          {
            id: 27205,
            title: 'Inception',
            release_date: '2010-07-16',
            vote_average: 8.4,
            popularity: 100,
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

      const result = await source.searchMovie('Inception', 2010);

      expect(result).toBe(27205);
    });

    it('should return null when no results', async () => {
      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue(
            JSON.stringify({
              page: 1,
              total_results: 0,
              total_pages: 0,
              results: [],
            })
          ),
        },
      } as any);

      const result = await source.searchMovie('Nonexistent Movie');

      expect(result).toBeNull();
    });
  });

  describe('getMovieDetails', () => {
    it('should fetch movie details', async () => {
      const mockMovieDetails = {
        id: 27205,
        title: 'Inception',
        original_title: 'Inception',
        release_date: '2010-07-16',
        runtime: 148,
        genres: [{ id: 28, name: 'Action' }, { id: 878, name: 'Science Fiction' }],
        overview: 'A thief who steals corporate secrets...',
        tagline: 'Your mind is the scene of the crime.',
        poster_path: '/9gk7adHYeDvHkCSEqAvQNLV5Ber.jpg',
        backdrop_path: '/s3TBrRGB1iav7gFOCNx3H31MoES.jpg',
        vote_average: 8.4,
        vote_count: 35000,
        imdb_id: 'tt1375666',
        belongs_to_collection: null,
        production_companies: [],
      };

      const mockCredits = {
        cast: [
          { id: 6193, name: 'Leonardo DiCaprio', character: 'Cobb', order: 0 },
          { id: 24045, name: 'Joseph Gordon-Levitt', character: 'Arthur', order: 1 },
        ],
        crew: [
          { id: 525, name: 'Christopher Nolan', job: 'Director', department: 'Directing' },
        ],
      };

      const mockProviders = {
        results: {
          US: {
            flatrate: [{ provider_name: 'Netflix', provider_id: 8 }],
            rent: [{ provider_name: 'Amazon Video', provider_id: 10 }],
          },
        },
      };

      // Mock movie details
      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue(JSON.stringify(mockMovieDetails)),
        },
      } as any);

      // Mock credits
      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue(JSON.stringify(mockCredits)),
        },
      } as any);

      // Mock providers
      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue(JSON.stringify(mockProviders)),
        },
      } as any);

      const result = await source.getMovieDetails(27205);

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Inception');
      expect(result?.year).toBe(2010);
      expect(result?.runtime_minutes).toBe(148);
      expect(result?.director).toBe('Christopher Nolan');
      expect(result?.genres).toContain('Action');
      expect(result?.genres).toContain('Science Fiction');
      expect(result?.cast.length).toBe(2);
      expect(result?.identifiers.tmdb).toBe(27205);
      expect(result?.identifiers.imdb).toBe('tt1375666');
    });

    it('should return null for invalid ID', async () => {
      mockRequest.mockResolvedValueOnce({
        statusCode: 404,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue('Not found'),
        },
      } as any);

      const result = await source.getMovieDetails(99999999);

      expect(result).toBeNull();
    });
  });

  describe('searchTV', () => {
    it('should search for a TV show', async () => {
      const mockSearchResponse = {
        page: 1,
        total_results: 1,
        total_pages: 1,
        results: [
          {
            id: 1396,
            name: 'Breaking Bad',
            first_air_date: '2008-01-20',
            vote_average: 8.9,
            popularity: 200,
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

      const result = await source.searchTV('Breaking Bad');

      expect(result).toBe(1396);
    });
  });

  describe('getTVDetails', () => {
    it('should fetch TV show details', async () => {
      const mockTVDetails = {
        id: 1396,
        name: 'Breaking Bad',
        original_name: 'Breaking Bad',
        first_air_date: '2008-01-20',
        last_air_date: '2013-09-29',
        status: 'Ended',
        genres: [{ id: 18, name: 'Drama' }],
        overview: 'A high school chemistry teacher...',
        tagline: 'Change the equation.',
        poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
        backdrop_path: '/tsRy63Mu5cu8etL1X7ZLyf7iwsc.jpg',
        vote_average: 8.9,
        vote_count: 12000,
        created_by: [{ id: 17419, name: 'Vince Gilligan' }],
        networks: [{ id: 174, name: 'AMC' }],
        episode_run_time: [45, 47],
        number_of_seasons: 5,
        number_of_episodes: 62,
        seasons: [
          {
            id: 3572,
            season_number: 1,
            name: 'Season 1',
            episode_count: 7,
            air_date: '2008-01-20',
          },
        ],
        external_ids: {
          imdb_id: 'tt0903747',
          tvdb_id: 81189,
        },
      };

      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue(JSON.stringify(mockTVDetails)),
        },
      } as any);

      const result = await source.getTVDetails(1396, true, false);

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Breaking Bad');
      expect(result?.status).toBe('Ended');
      expect(result?.total_seasons).toBe(5);
      expect(result?.total_episodes).toBe(62);
      expect(result?.created_by).toContain('Vince Gilligan');
      expect(result?.networks).toContain('AMC');
      expect(result?.identifiers.tmdb).toBe(1396);
      expect(result?.identifiers.imdb).toBe('tt0903747');
    });
  });

  describe('authentication', () => {
    const V3_KEY = '0123456789abcdef0123456789abcdef';

    function mockSearchHit() {
      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue(
            JSON.stringify({
              page: 1,
              total_results: 1,
              total_pages: 1,
              results: [
                {
                  id: 603,
                  title: 'The Matrix',
                  release_date: '1999-03-30',
                  vote_average: 8.2,
                  popularity: 80,
                },
              ],
            })
          ),
        },
      } as any);
    }

    it('sends a 32-hex v3 key as the api_key query param with no Authorization header', async () => {
      const v3Source = new TMDBSource(V3_KEY, cache, logger, rateLimiter);
      mockSearchHit();

      await v3Source.searchMovie('The Matrix', 1999);

      const calledUrl = String(mockRequest.mock.calls[0][0]);
      const calledHeaders = (mockRequest.mock.calls[0][1] as any).headers;
      // The /3 API-version prefix must survive URL construction (regression: a
      // leading-slash path dropped it, yielding 404s on every TMDB request).
      expect(calledUrl).toContain('https://api.themoviedb.org/3/search/movie');
      expect(calledUrl).toContain(`api_key=${V3_KEY}`);
      expect(calledHeaders.Authorization).toBeUndefined();
    });

    it('sends a non-hex v4 token as a Bearer header with no api_key query param', async () => {
      const v4Token = 'eyJhbGciOiJIUzI1NiJ9.fake.v4token';
      const v4Source = new TMDBSource(v4Token, cache, logger, rateLimiter);
      mockSearchHit();

      await v4Source.searchMovie('The Matrix', 1999);

      const calledUrl = String(mockRequest.mock.calls[0][0]);
      const calledHeaders = (mockRequest.mock.calls[0][1] as any).headers;
      expect(calledUrl).not.toContain('api_key=');
      expect(calledHeaders.Authorization).toBe(`Bearer ${v4Token}`);
    });

    it('logs a warning instead of a silent null when TMDB returns 401', async () => {
      const emitter = vi.fn();
      logger.setEmitter(emitter);
      logger.setLevel('warning');

      mockRequest.mockResolvedValueOnce({
        statusCode: 401,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue(
            JSON.stringify({ status_code: 7, status_message: 'Invalid API key' })
          ),
        },
      } as any);

      const result = await source.searchMovie('The Matrix', 1999);

      expect(result).toBeNull();
      const warnings = emitter.mock.calls
        .map((c) => c[0])
        .filter((e) => e.level === 'warning' && e.data.action === 'search_movie_failed');
      expect(warnings.length).toBe(1);
      expect(warnings[0].data.status).toBe(401);
      expect(warnings[0].data.endpoint).toBe('/search/movie');
    });

    it('logs a warning when TMDB TV search returns 403', async () => {
      const emitter = vi.fn();
      logger.setEmitter(emitter);
      logger.setLevel('warning');

      mockRequest.mockResolvedValueOnce({
        statusCode: 403,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue(JSON.stringify({ status_message: 'Forbidden' })),
        },
      } as any);

      const result = await source.searchTV('Breaking Bad');

      expect(result).toBeNull();
      const warnings = emitter.mock.calls
        .map((c) => c[0])
        .filter((e) => e.level === 'warning' && e.data.action === 'search_tv_failed');
      expect(warnings.length).toBe(1);
      expect(warnings[0].data.status).toBe(403);
      expect(warnings[0].data.endpoint).toBe('/search/tv');
    });

    it('stays a silent null (no warning) when search legitimately finds nothing', async () => {
      const emitter = vi.fn();
      logger.setEmitter(emitter);
      logger.setLevel('warning');

      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          text: vi.fn().mockResolvedValue(
            JSON.stringify({ page: 1, total_results: 0, total_pages: 0, results: [] })
          ),
        },
      } as any);

      const result = await source.searchMovie('Nonexistent Movie');

      expect(result).toBeNull();
      const warnings = emitter.mock.calls
        .map((c) => c[0])
        .filter((e) => e.level === 'warning');
      expect(warnings.length).toBe(0);
    });
  });
});
