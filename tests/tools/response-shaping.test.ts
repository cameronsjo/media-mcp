import { describe, it, expect } from 'vitest';
import { shapeWatchProviders, LookupMovieTool } from '../../src/tools/lookup-movie.js';
import { compactBookResult } from '../../src/tools/lookup-book.js';
import { Logger } from '../../src/utils/logger.js';
import type { TMDBSource } from '../../src/sources/tmdb.js';
import type { MovieResult, RegionalWatchProviders } from '../../src/types/movie.js';
import type { BookResult } from '../../src/types/book.js';

const PROVIDERS: RegionalWatchProviders = {
  US: { stream: ['Netflix'], rent: ['Amazon'] },
  GB: { stream: ['Now TV'] },
  DE: { buy: ['Apple TV'] },
};

describe('shapeWatchProviders (#30)', () => {
  it('omits all providers when include is false and no regions given', () => {
    expect(shapeWatchProviders(PROVIDERS, { includeWatchProviders: false })).toEqual({});
  });

  it('returns all providers when include is true and no regions given', () => {
    expect(shapeWatchProviders(PROVIDERS, { includeWatchProviders: true })).toEqual(PROVIDERS);
  });

  it('treats a region filter as implicit inclusion (even when include is false)', () => {
    const out = shapeWatchProviders(PROVIDERS, {
      includeWatchProviders: false,
      watchProviderRegions: ['US'],
    });
    expect(Object.keys(out)).toEqual(['US']);
    expect(out.US).toEqual(PROVIDERS.US);
  });

  it('matches region codes case-insensitively', () => {
    const out = shapeWatchProviders(PROVIDERS, {
      includeWatchProviders: true,
      watchProviderRegions: ['us', 'de'],
    });
    expect(Object.keys(out).sort()).toEqual(['DE', 'US']);
  });

  it('returns an empty map when requested regions are not present', () => {
    const out = shapeWatchProviders(PROVIDERS, {
      includeWatchProviders: true,
      watchProviderRegions: ['ZZ'],
    });
    expect(out).toEqual({});
  });

  it('does not mutate the input map', () => {
    const copy = JSON.parse(JSON.stringify(PROVIDERS));
    shapeWatchProviders(PROVIDERS, { includeWatchProviders: false });
    expect(PROVIDERS).toEqual(copy);
  });
});

function makeBook(): BookResult {
  return {
    title: 'Dune',
    author: 'Frank Herbert',
    authors: ['Frank Herbert'],
    isbn_10: null,
    isbn_13: null,
    genres: ['Science Fiction'],
    subjects: ['Politics', 'Desert', 'Spice', 'noise'],
    tropes: ['chosen one'],
    shelves: ['sci-fi', 'to-read', 'owned', 'favorites'],
    page_count: 412,
    publish_date: '1965',
    publisher: 'Chilton',
    description: 'A long 500-word description that bloats the response...',
    cover_url: null,
    series: { name: 'Dune', position: 1, total_books: 6 },
    ratings: {},
    identifiers: { open_library: null, goodreads: null, google_books: null, hardcover: null },
    source_urls: { goodreads: null, open_library: null, google_books: null, hardcover: null },
    _meta: { sources: ['open_library'], cached: false, timestamp: '2026-06-16T00:00:00.000Z' } as never,
  };
}

describe('compactBookResult (#6)', () => {
  it('nulls the description and empties shelves and subjects', () => {
    const out = compactBookResult(makeBook());
    expect(out.description).toBeNull();
    expect(out.shelves).toEqual([]);
    expect(out.subjects).toEqual([]);
  });

  it('keeps the high-signal fields (genres, tropes, series, ratings, title)', () => {
    const out = compactBookResult(makeBook());
    expect(out.genres).toEqual(['Science Fiction']);
    expect(out.tropes).toEqual(['chosen one']);
    expect(out.series.name).toBe('Dune');
    expect(out.title).toBe('Dune');
  });

  it('does not mutate the input result', () => {
    const book = makeBook();
    compactBookResult(book);
    expect(book.description).not.toBeNull();
    expect(book.shelves.length).toBeGreaterThan(0);
  });
});

function makeMovie(): MovieResult {
  return {
    title: 'The Matrix', original_title: 'The Matrix', year: 1999,
    release_date: '1999-03-31', runtime_minutes: 136, genres: ['Action'],
    description: 'desc', tagline: null, poster_url: null, backdrop_url: null,
    director: 'Lana Wachowski', directors: ['Lana Wachowski'], cast: [],
    collection: { name: null, position: null, total_films: null },
    ratings: {},
    watch_providers: { US: { stream: ['Netflix'] }, GB: { stream: ['Now TV'] } },
    identifiers: { tmdb: 603, imdb: null },
    _meta: { source: 'tmdb', cached: false, timestamp: '2026-06-16T00:00:00.000Z' },
  };
}

describe('LookupMovieTool watch_providers wiring (#30)', () => {
  function toolReturning(movie: MovieResult): LookupMovieTool {
    const tmdb = {
      searchMovie: async () => 603,
      getMovieDetails: async () => movie,
    } as unknown as TMDBSource;
    return new LookupMovieTool(tmdb, new Logger('test'));
  }

  it('omits watch_providers by default (opt-in compact)', async () => {
    const res = await toolReturning(makeMovie()).execute({
      title: 'The Matrix', include_watch_providers: false,
    });
    expect(res.watch_providers).toEqual({});
  });

  it('includes only the requested region when watch_provider_regions is set', async () => {
    const res = await toolReturning(makeMovie()).execute({
      title: 'The Matrix', include_watch_providers: false, watch_provider_regions: ['US'],
    });
    expect(Object.keys(res.watch_providers)).toEqual(['US']);
  });
});
