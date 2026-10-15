import { describe, expect, it, vi } from 'vitest';
import { Logger } from '../../src/utils/logger.js';
import { LookupBookInputSchema, LookupBookTool } from '../../src/tools/lookup-book.js';
import { LookupMovieInputSchema, LookupMovieTool } from '../../src/tools/lookup-movie.js';
import { LookupTVInputSchema, LookupTVTool } from '../../src/tools/lookup-tv.js';
import {
  BatchLookupInputSchema,
  BatchLookupTool,
  type BatchLookupInput,
} from '../../src/tools/batch-lookup.js';
import type { OpenLibrarySource } from '../../src/sources/open-library.js';
import type { GoogleBooksSource } from '../../src/sources/google-books.js';
import type { GoodreadsSource } from '../../src/sources/goodreads.js';
import type { HardcoverSource } from '../../src/sources/hardcover.js';
import type { TMDBSource } from '../../src/sources/tmdb.js';
import type { PartialBookData, BookResult } from '../../src/types/book.js';
import type { MovieResult } from '../../src/types/movie.js';
import type { LookupTVInput, TVResult } from '../../src/types/tv.js';

function testLogger(): Logger {
  const logger = new Logger('lookup-tests');
  logger.setEmitter(() => undefined);
  return logger;
}

function partialBook(overrides: Partial<PartialBookData> = {}): PartialBookData {
  return {
    title: 'Dune',
    author: 'Frank Herbert',
    authors: ['Frank Herbert'],
    genres: ['Science Fiction'],
    description: 'A long description from an upstream source.',
    shelves: ['science-fiction'],
    source: 'open_library',
    ...overrides,
  };
}

function bookResult(title: string): BookResult {
  return {
    title,
    author: 'Frank Herbert',
    authors: ['Frank Herbert'],
    isbn_10: null,
    isbn_13: null,
    genres: ['Science Fiction'],
    subjects: [],
    tropes: [],
    shelves: ['science-fiction'],
    page_count: 412,
    publish_date: '1965',
    publisher: 'Chilton',
    description: 'A description.',
    cover_url: null,
    series: { name: null, position: null, total_books: null },
    ratings: {},
    identifiers: { open_library: null, goodreads: null, google_books: null, hardcover: null },
    source_urls: { goodreads: null, open_library: null, google_books: null, hardcover: null },
    _meta: {
      sources_queried: ['open_library'],
      primary_source: 'open_library',
      confidence: 'medium',
      cached: false,
      timestamp: '2026-10-14T00:00:00.000Z',
    },
  };
}

function makeOpenLibrary(overrides: Record<string, unknown> = {}): OpenLibrarySource {
  return {
    searchByISBN: vi.fn().mockResolvedValue(null),
    searchByTitleAuthor: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as OpenLibrarySource;
}

function makeGoogleBooks(overrides: Record<string, unknown> = {}): GoogleBooksSource {
  return {
    searchByISBN: vi.fn().mockResolvedValue(null),
    searchByTitleAuthor: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as GoogleBooksSource;
}

function makeGoodreads(overrides: Record<string, unknown> = {}): GoodreadsSource {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    searchBook: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as GoodreadsSource;
}

function makeHardcover(overrides: Record<string, unknown> = {}): HardcoverSource {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    searchByISBN: vi.fn().mockResolvedValue(null),
    searchByTitleAuthor: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as HardcoverSource;
}

function makeMovie(overrides: Partial<MovieResult> = {}): MovieResult {
  return {
    title: 'The Matrix',
    original_title: 'The Matrix',
    year: 1999,
    release_date: '1999-03-31',
    runtime_minutes: 136,
    genres: ['Action'],
    description: 'A hacker discovers the truth.',
    tagline: null,
    poster_url: null,
    backdrop_url: null,
    director: 'Lana Wachowski',
    directors: ['Lana Wachowski'],
    cast: [],
    collection: { name: null, position: null, total_films: null },
    ratings: { tmdb: { score: 8.7, count: 1000 } },
    watch_providers: {
      US: { stream: ['Netflix'] },
      GB: { rent: ['Now TV'] },
    },
    identifiers: { tmdb: 603, imdb: 'tt0133093' },
    _meta: {
      source: 'tmdb',
      cached: false,
      timestamp: '2026-10-14T00:00:00.000Z',
    },
    ...overrides,
  };
}

function makeTV(overrides: Partial<TVResult> = {}): TVResult {
  return {
    title: 'Example Show',
    original_title: 'Example Show',
    first_air_date: '2020-01-01',
    last_air_date: null,
    status: 'Returning Series',
    genres: ['Drama'],
    description: 'A continuing show.',
    tagline: null,
    poster_url: null,
    backdrop_url: null,
    created_by: ['A Creator'],
    networks: ['Example Network'],
    episode_runtime: 45,
    total_seasons: 2,
    total_episodes: 16,
    seasons: [
      {
        season_number: 1,
        name: 'Season 1',
        episode_count: 8,
        air_date: '2020-01-01',
        episodes: [
          {
            episode_number: 1,
            name: 'Pilot',
            air_date: '2020-01-01',
            runtime: 45,
            description: 'The pilot episode.',
          },
        ],
      },
    ],
    ratings: { tmdb: { score: 8, count: 500 } },
    identifiers: { tmdb: 100, imdb: 'tt1000000', tvdb: 200 },
    _meta: {
      source: 'tmdb',
      cached: false,
      timestamp: '2026-10-14T00:00:00.000Z',
    },
    ...overrides,
  };
}

function makeTMDB(overrides: Record<string, unknown> = {}): TMDBSource {
  return {
    searchMovie: vi.fn().mockResolvedValue(603),
    getMovieDetails: vi.fn().mockResolvedValue(makeMovie()),
    searchTV: vi.fn().mockResolvedValue(100),
    getTVDetails: vi.fn().mockResolvedValue(makeTV()),
    ...overrides,
  } as unknown as TMDBSource;
}

describe('LookupBookTool integration paths', () => {
  it('tries ISBN first, falls back per source, merges successes, and reports failures', async () => {
    const openLibrary = makeOpenLibrary({
      searchByISBN: vi
        .fn()
        .mockResolvedValue(partialBook({ source: 'open_library', isbn_13: '9780441013593' })),
    });
    const googleBooks = makeGoogleBooks({
      searchByISBN: vi.fn().mockResolvedValue(null),
      searchByTitleAuthor: vi
        .fn()
        .mockResolvedValue(
          partialBook({ source: 'google_books', description: 'Google description.' })
        ),
    });
    const goodreads = makeGoodreads({
      searchBook: vi
        .fn()
        .mockResolvedValue(
          partialBook({ source: 'goodreads', rating: { score: 4.5, count: 9000 } })
        ),
    });
    const hardcover = makeHardcover({
      searchByISBN: vi.fn().mockRejectedValue(new Error('upstream unavailable')),
    });
    const tool = new LookupBookTool(openLibrary, testLogger(), {
      googleBooks,
      goodreads,
      hardcover,
    });

    const result = await tool.execute(
      LookupBookInputSchema.parse({
        title: 'Dune',
        author: 'Frank Herbert',
        isbn: '9780441013593',
      })
    );

    expect(openLibrary.searchByISBN).toHaveBeenCalledWith('9780441013593');
    expect(openLibrary.searchByTitleAuthor).not.toHaveBeenCalled();
    expect(googleBooks.searchByISBN).toHaveBeenCalledWith('9780441013593');
    expect(googleBooks.searchByTitleAuthor).toHaveBeenCalledWith('Dune', 'Frank Herbert');
    expect(goodreads.searchBook).toHaveBeenCalledWith('Dune', 'Frank Herbert');
    expect(hardcover.searchByISBN).toHaveBeenCalledWith('9780441013593');
    expect(result.ratings).toEqual({ goodreads: { score: 4.5, count: 9000 } });
    expect(result.genres).toEqual(['Science Fiction']);
    expect(result.description).toBeNull();
    expect(result.shelves).toEqual([]);
    expect(result._meta.sources_failed).toEqual(['hardcover']);
  });

  it('uses title fallback without ISBN and preserves full results when compact is false', async () => {
    const openLibrary = makeOpenLibrary({
      searchByTitleAuthor: vi.fn().mockResolvedValue(
        partialBook({
          source: 'open_library',
          title: 'Dune (Dune #1)',
          description: 'Open Library description.',
        })
      ),
    });
    const hardcover = makeHardcover({
      searchByTitleAuthor: vi
        .fn()
        .mockResolvedValue(partialBook({ source: 'hardcover', title: 'Dune' })),
    });
    const tool = new LookupBookTool(openLibrary, testLogger(), { hardcover });

    const result = await tool.execute(
      LookupBookInputSchema.parse({
        title: 'Dune',
        sources: ['open_library', 'hardcover'],
        compact: false,
      })
    );

    expect(openLibrary.searchByISBN).not.toHaveBeenCalled();
    expect(openLibrary.searchByTitleAuthor).toHaveBeenCalledWith('Dune', undefined);
    expect(hardcover.searchByTitleAuthor).toHaveBeenCalledWith('Dune', undefined);
    expect(result.description).toBe('A long description from an upstream source.');
    expect(result.shelves).toEqual(['science-fiction']);
    expect(result.title).toBe('Dune');
    expect(result.series.name).toBe('Dune');
    expect(result.series.position).toBe(1);
  });

  it('throws NOT_FOUND when every requested source returns null', async () => {
    const openLibrary = makeOpenLibrary();
    const tool = new LookupBookTool(openLibrary, testLogger());

    await expect(
      tool.execute(
        LookupBookInputSchema.parse({ title: 'Unknown Book', sources: ['open_library'] })
      )
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      retryable: false,
    });
    expect(openLibrary.searchByTitleAuthor).toHaveBeenCalledWith('Unknown Book', undefined);
  });

  it('records non-Error failures and skips disabled optional sources', async () => {
    const openLibrary = makeOpenLibrary({
      searchByTitleAuthor: vi.fn().mockRejectedValue('open library unavailable'),
    });
    const googleBooks = makeGoogleBooks({
      searchByTitleAuthor: vi.fn().mockRejectedValue('google books unavailable'),
    });
    const goodreads = makeGoodreads({ isEnabled: vi.fn().mockReturnValue(false) });
    const hardcover = makeHardcover({ isEnabled: vi.fn().mockReturnValue(false) });
    const tool = new LookupBookTool(openLibrary, testLogger(), {
      googleBooks,
      goodreads,
      hardcover,
    });

    await expect(
      tool.execute(
        LookupBookInputSchema.parse({
          title: 'Unavailable Book',
          sources: ['open_library', 'google_books', 'goodreads', 'hardcover'],
        })
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(goodreads.searchBook).not.toHaveBeenCalled();
    expect(hardcover.searchByTitleAuthor).not.toHaveBeenCalled();

    const noGoogleTool = new LookupBookTool(openLibrary, testLogger());
    await expect(
      noGoogleTool.execute(
        LookupBookInputSchema.parse({ title: 'No Google Source', sources: ['google_books'] })
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('records null results from every enabled source and retains existing series data', async () => {
    const openLibrary = makeOpenLibrary({
      searchByTitleAuthor: vi.fn().mockResolvedValue(
        partialBook({
          source: 'open_library',
          series: { name: 'Existing Series', position: 2 },
        })
      ),
    });
    const googleBooks = makeGoogleBooks();
    const goodreads = makeGoodreads();
    const hardcover = makeHardcover();
    const tool = new LookupBookTool(openLibrary, testLogger(), {
      googleBooks,
      goodreads,
      hardcover,
    });

    const result = await tool.execute(
      LookupBookInputSchema.parse({ title: 'Dune', compact: false })
    );

    expect(result.series.name).toBe('Existing Series');
    expect(result._meta.sources_failed).toEqual(['google_books', 'goodreads', 'hardcover']);
  });

  it('prefers structured series metadata over parsing another source title', async () => {
    const openLibrary = makeOpenLibrary({
      searchByTitleAuthor: vi.fn().mockResolvedValue(
        partialBook({
          source: 'open_library',
          title: 'Book Name - Series Book 1',
        })
      ),
    });
    const hardcover = makeHardcover({
      searchByTitleAuthor: vi.fn().mockResolvedValue(
        partialBook({
          source: 'hardcover',
          title: 'Book Name',
          series: { name: 'Canonical Series', position: 7 },
        })
      ),
    });
    const tool = new LookupBookTool(openLibrary, testLogger(), { hardcover });

    const result = await tool.execute(
      LookupBookInputSchema.parse({
        title: 'Book Name',
        sources: ['open_library', 'hardcover'],
        compact: false,
      })
    );

    expect(result.series).toEqual({
      name: 'Canonical Series',
      position: 7,
      total_books: null,
    });
    expect(result.title).toBe('Book Name');
  });
});

describe('LookupMovieTool integration paths', () => {
  it('uses a direct TMDB ID and applies default US provider shaping', async () => {
    const tmdb = makeTMDB();
    const tool = new LookupMovieTool(tmdb, testLogger());

    const result = await tool.execute(
      LookupMovieInputSchema.parse({ title: 'The Matrix', tmdb_id: 603 })
    );

    expect(tmdb.searchMovie).not.toHaveBeenCalled();
    expect(tmdb.getMovieDetails).toHaveBeenCalledWith(603);
    expect(result.identifiers.tmdb).toBe(603);
    expect(result.watch_providers).toEqual({ US: { stream: ['Netflix'] } });
  });

  it('searches by title and can request every region', async () => {
    const tmdb = makeTMDB();
    const tool = new LookupMovieTool(tmdb, testLogger());

    const result = await tool.execute(
      LookupMovieInputSchema.parse({ title: 'The Matrix', year: 1999, watch_provider_regions: [] })
    );

    expect(tmdb.searchMovie).toHaveBeenCalledWith('The Matrix', 1999);
    expect(tmdb.getMovieDetails).toHaveBeenCalledWith(603);
    expect(Object.keys(result.watch_providers).sort()).toEqual(['GB', 'US']);
  });

  it('omits providers when requested after successful detail shaping', async () => {
    const tmdb = makeTMDB();
    const tool = new LookupMovieTool(tmdb, testLogger());

    const result = await tool.execute(
      LookupMovieInputSchema.parse({
        title: 'The Matrix',
        tmdb_id: 603,
        include_watch_providers: false,
      })
    );

    expect(tmdb.getMovieDetails).toHaveBeenCalledWith(603);
    expect(result.watch_providers).toEqual({});
  });

  it('exposes movie search and detail failures', async () => {
    const notFoundTMDB = makeTMDB({ searchMovie: vi.fn().mockResolvedValue(null) });
    const notFoundTool = new LookupMovieTool(notFoundTMDB, testLogger());
    await expect(
      notFoundTool.execute(LookupMovieInputSchema.parse({ title: 'Missing' }))
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(notFoundTMDB.getMovieDetails).not.toHaveBeenCalled();

    const failedDetailsTMDB = makeTMDB({ getMovieDetails: vi.fn().mockResolvedValue(null) });
    const failedDetailsTool = new LookupMovieTool(failedDetailsTMDB, testLogger());
    await expect(
      failedDetailsTool.execute(
        LookupMovieInputSchema.parse({
          title: 'The Matrix',
          tmdb_id: 603,
        })
      )
    ).rejects.toMatchObject({ code: 'SOURCE_ERROR', source: 'tmdb', retryable: true });
    expect(failedDetailsTMDB.getMovieDetails).toHaveBeenCalledWith(603);
  });
});

describe('LookupTVTool integration paths', () => {
  it('uses a direct ID and passes season exclusion options through', async () => {
    const fullResult = makeTV();
    const getTVDetails = vi.fn(
      (_tmdbId: number, includeSeasons = true, includeEpisodes = false): Promise<TVResult> =>
        Promise.resolve({
          ...fullResult,
          seasons: includeSeasons
            ? fullResult.seasons.map((season) => ({
                ...season,
                episodes: includeEpisodes ? season.episodes : undefined,
              }))
            : [],
        })
    );
    const tmdb = makeTMDB({ getTVDetails });
    const tool = new LookupTVTool(tmdb, testLogger());

    const result = await tool.execute(
      LookupTVInputSchema.parse({
        title: 'Example Show',
        tmdb_id: 100,
        include_seasons: false,
        include_episodes: false,
      })
    );

    expect(tmdb.searchTV).not.toHaveBeenCalled();
    expect(tmdb.getTVDetails).toHaveBeenCalledWith(100, false, false);
    expect(result.seasons).toEqual([]);
  });

  it('uses safe defaults when season options are omitted by a direct caller', async () => {
    const tmdb = makeTMDB();
    const tool = new LookupTVTool(tmdb, testLogger());

    await tool.execute({ title: 'Example Show', tmdb_id: 100 } as LookupTVInput);

    expect(tmdb.getTVDetails).toHaveBeenCalledWith(100, true, false);
  });

  it('searches an ongoing show and passes episode inclusion through', async () => {
    const tmdb = makeTMDB();
    const tool = new LookupTVTool(tmdb, testLogger());

    const result = await tool.execute(
      LookupTVInputSchema.parse({
        title: 'Example Show',
        year: 2020,
        include_seasons: true,
        include_episodes: true,
      })
    );

    expect(tmdb.searchTV).toHaveBeenCalledWith('Example Show', 2020);
    expect(tmdb.getTVDetails).toHaveBeenCalledWith(100, true, true);
    expect(result.status).toBe('Returning Series');
    expect(result.seasons[0].episodes).toHaveLength(1);
  });

  it('reports TV search and detail failures', async () => {
    const notFoundTMDB = makeTMDB({ searchTV: vi.fn().mockResolvedValue(null) });
    const notFoundTool = new LookupTVTool(notFoundTMDB, testLogger());
    await expect(
      notFoundTool.execute(LookupTVInputSchema.parse({ title: 'Missing Show' }))
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(notFoundTMDB.getTVDetails).not.toHaveBeenCalled();

    const failedDetailsTMDB = makeTMDB({ getTVDetails: vi.fn().mockResolvedValue(null) });
    const failedDetailsTool = new LookupTVTool(failedDetailsTMDB, testLogger());
    await expect(
      failedDetailsTool.execute(LookupTVInputSchema.parse({ title: 'Example Show', tmdb_id: 100 }))
    ).rejects.toMatchObject({ code: 'SOURCE_ERROR', source: 'tmdb', retryable: true });
  });
});

describe('BatchLookupTool integration paths', () => {
  it('handles all item types, preserves input order, bounds concurrency, and keeps partial failures', async () => {
    let active = 0;
    let maxActive = 0;

    async function run<T>(value: T, title: string): Promise<T> {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, title === 'slow' ? 12 : 2));
      active -= 1;
      if (title === 'broken') {
        throw { code: 'SOURCE_ERROR', message: 'source unavailable' };
      }
      return value;
    }

    const bookTool = {
      execute: vi.fn((input: { title: string }) => run(bookResult(input.title), input.title)),
    } as unknown as LookupBookTool;
    const movieTool = {
      execute: vi.fn((input: { title: string }) =>
        run(makeMovie({ title: input.title }), input.title)
      ),
    } as unknown as LookupMovieTool;
    const tvTool = {
      execute: vi.fn((input: { title: string }) =>
        run(makeTV({ title: input.title }), input.title)
      ),
    } as unknown as LookupTVTool;
    const tool = new BatchLookupTool(bookTool, movieTool, tvTool, testLogger());

    const result = await tool.execute(
      BatchLookupInputSchema.parse({
        concurrency: 2,
        items: [
          { type: 'book', title: 'slow', compact: true },
          { type: 'movie', title: 'Matrix', tmdb_id: 603 },
          { type: 'tv', title: 'Show', tmdb_id: 100 },
          { type: 'book', title: 'broken', compact: false },
        ],
      })
    );

    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(result.total).toBe(4);
    expect(result.successful).toBe(3);
    expect(result.failed).toBe(1);
    expect(result.results.map((item) => item.index)).toEqual([0, 1, 2, 3]);
    expect(result.results.map((item) => item.type)).toEqual(['book', 'movie', 'tv', 'book']);
    expect(result.results[3]).toMatchObject({
      index: 3,
      type: 'book',
      success: false,
      error: { code: 'SOURCE_ERROR', message: 'source unavailable' },
    });
    expect(bookTool.execute).toHaveBeenCalledTimes(2);
    expect(movieTool.execute).toHaveBeenCalledTimes(1);
    expect(tvTool.execute).toHaveBeenCalledTimes(1);
  });

  it('uses the default concurrency and normalizes Error failures', async () => {
    const bookTool = {
      execute: vi.fn(({ title }: { title: string }) => {
        if (title === 'missing-message') {
          return Promise.reject({ code: 'KNOWN_ERROR' });
        }
        return Promise.reject(new Error('boom'));
      }),
    } as unknown as LookupBookTool;
    const movieTool = { execute: vi.fn() } as unknown as LookupMovieTool;
    const tvTool = { execute: vi.fn() } as unknown as LookupTVTool;
    const tool = new BatchLookupTool(bookTool, movieTool, tvTool, testLogger());

    const result = await tool.execute({
      items: [
        { type: 'book', title: 'broken', compact: true },
        { type: 'book', title: 'missing-message', compact: true },
      ],
    } as BatchLookupInput);

    expect(result._meta.concurrency).toBe(3);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      success: false,
      error: { code: 'SOURCE_ERROR', message: 'boom', retryable: false },
    });
    expect(result.results[1]).toMatchObject({
      success: false,
      error: { code: 'SOURCE_ERROR', message: 'An unknown error occurred', retryable: false },
    });
  });
});
