import { describe, it, expect, beforeEach } from 'vitest';
import { GenerateFrontmatterTool } from '../../src/tools/generate-frontmatter.js';
import { Logger } from '../../src/utils/logger.js';
import type { BookResult } from '../../src/types/book.js';
import type { MovieResult } from '../../src/types/movie.js';
import type { TVResult } from '../../src/types/tv.js';

describe('GenerateFrontmatterTool', () => {
  let tool: GenerateFrontmatterTool;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('test');
    tool = new GenerateFrontmatterTool(logger);
  });

  const mockBookResult: BookResult = {
    title: 'The Name of the Wind',
    author: 'Patrick Rothfuss',
    authors: ['Patrick Rothfuss'],
    isbn_10: '0756404746',
    isbn_13: '9780756404741',
    genres: ['Fantasy', 'Epic Fantasy'],
    subjects: ['Magic', 'Adventure'],
    page_count: 662,
    publish_date: '2007',
    publisher: 'DAW Books',
    description: 'A fantasy novel about a legendary figure.',
    cover_url: 'https://covers.openlibrary.org/b/id/8739161-L.jpg',
    series: {
      name: 'The Kingkiller Chronicle',
      position: 1,
      total_books: 3,
    },
    ratings: {
      goodreads: { score: 4.52, count: 1000000 },
    },
    identifiers: {
      open_library: 'OL5732753W',
      goodreads: '186074',
      google_books: null,
      hardcover: null,
    },
    source_urls: {
      goodreads: 'https://www.goodreads.com/book/show/186074',
      open_library: 'https://openlibrary.org/works/OL5732753W',
      google_books: null,
    },
    _meta: {
      sources_queried: ['open_library'],
      primary_source: 'open_library',
      confidence: 'high',
      cached: false,
      timestamp: '2024-12-07T00:00:00.000Z',
    },
  };

  const mockMovieResult: MovieResult = {
    title: 'Inception',
    original_title: 'Inception',
    year: 2010,
    release_date: '2010-07-16',
    runtime_minutes: 148,
    genres: ['Action', 'Science Fiction'],
    description: 'A thief who steals corporate secrets...',
    tagline: 'Your mind is the scene of the crime.',
    poster_url: 'https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Ber.jpg',
    backdrop_url: 'https://image.tmdb.org/t/p/w1280/s3TBrRGB1iav7gFOCNx3H31MoES.jpg',
    director: 'Christopher Nolan',
    directors: ['Christopher Nolan'],
    cast: [
      { name: 'Leonardo DiCaprio', character: 'Cobb' },
      { name: 'Joseph Gordon-Levitt', character: 'Arthur' },
    ],
    collection: { name: null, position: null, total_films: null },
    ratings: {
      tmdb: { score: 8.4, count: 35000 },
      imdb: { score: null, id: 'tt1375666' },
    },
    watch_providers: {
      US: {
        stream: ['Netflix'],
        rent: ['Amazon Video'],
        buy: ['Apple TV'],
      },
    },
    identifiers: {
      tmdb: 27205,
      imdb: 'tt1375666',
    },
    _meta: {
      source: 'tmdb',
      cached: false,
      timestamp: '2024-12-07T00:00:00.000Z',
    },
  };

  const mockTVResult: TVResult = {
    title: 'Breaking Bad',
    original_title: 'Breaking Bad',
    first_air_date: '2008-01-20',
    last_air_date: '2013-09-29',
    status: 'Ended',
    genres: ['Drama', 'Crime'],
    description: 'A high school chemistry teacher...',
    tagline: 'Change the equation.',
    poster_url: 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
    backdrop_url: 'https://image.tmdb.org/t/p/w1280/tsRy63Mu5cu8etL1X7ZLyf7iwsc.jpg',
    created_by: ['Vince Gilligan'],
    networks: ['AMC'],
    episode_runtime: 45,
    total_seasons: 5,
    total_episodes: 62,
    seasons: [
      { season_number: 1, name: 'Season 1', episode_count: 7, air_date: '2008-01-20' },
    ],
    ratings: {
      tmdb: { score: 8.9, count: 12000 },
      imdb: { score: null, id: 'tt0903747' },
    },
    identifiers: {
      tmdb: 1396,
      imdb: 'tt0903747',
      tvdb: 81189,
    },
    _meta: {
      source: 'tmdb',
      cached: false,
      timestamp: '2024-12-07T00:00:00.000Z',
    },
  };

  describe('book frontmatter', () => {
    it('should generate minimal book frontmatter', async () => {
      const result = await tool.execute({
        lookup_result: mockBookResult,
        template: 'minimal',
      });

      expect(result).toContain('---');
      expect(result).toContain('title: The Name of the Wind');
      expect(result).toContain('author: Patrick Rothfuss');
      expect(result).toContain('type: book');
      expect(result).not.toContain('page_count');
    });

    it('should generate default book frontmatter', async () => {
      const result = await tool.execute({
        lookup_result: mockBookResult,
        template: 'default',
      });

      expect(result).toContain('title: The Name of the Wind');
      expect(result).toContain('author: Patrick Rothfuss');
      expect(result).toContain('series: The Kingkiller Chronicle');
      expect(result).toContain('series_position: 1');
      expect(result).toContain('page_count: 662');
      expect(result).toContain('rating: 4.52');
      expect(result).toContain('status: unread');
    });

    it('should generate full book frontmatter', async () => {
      const result = await tool.execute({
        lookup_result: mockBookResult,
        template: 'full',
      });

      expect(result).toContain('publisher: DAW Books');
      expect(result).toContain('publish_date: 2007');
      expect(result).toContain('description:');
    });
  });

  describe('movie frontmatter', () => {
    it('should generate minimal movie frontmatter', async () => {
      const result = await tool.execute({
        lookup_result: mockMovieResult,
        template: 'minimal',
      });

      expect(result).toContain('title: Inception');
      expect(result).toContain('year: 2010');
      expect(result).toContain('type: movie');
    });

    it('should generate default movie frontmatter', async () => {
      const result = await tool.execute({
        lookup_result: mockMovieResult,
        template: 'default',
      });

      expect(result).toContain('director: Christopher Nolan');
      expect(result).toContain('runtime: 148');
      expect(result).toContain('rating: 8.4');
      expect(result).toContain('status: unwatched');
      // URLs with colons get quoted in YAML
      expect(result).toContain('imdb:');
      expect(result).toContain('https://www.imdb.com/title/tt1375666');
    });

    it('should generate full movie frontmatter with cast', async () => {
      const result = await tool.execute({
        lookup_result: mockMovieResult,
        template: 'full',
      });

      expect(result).toContain('Leonardo DiCaprio (Cobb)');
      expect(result).toContain('streaming:');
      expect(result).toContain('Netflix');
    });
  });

  describe('TV frontmatter', () => {
    it('should generate minimal TV frontmatter', async () => {
      const result = await tool.execute({
        lookup_result: mockTVResult,
        template: 'minimal',
      });

      expect(result).toContain('title: Breaking Bad');
      expect(result).toContain('year: 2008');
      expect(result).toContain('type: tv');
    });

    it('should generate default TV frontmatter', async () => {
      const result = await tool.execute({
        lookup_result: mockTVResult,
        template: 'default',
      });

      expect(result).toContain('status: Ended');
      expect(result).toContain('seasons: 5');
      expect(result).toContain('episodes: 62');
      expect(result).toContain('networks:');
      expect(result).toContain('AMC');
    });
  });

  describe('custom fields', () => {
    it('should add custom fields from JSONPath', async () => {
      const result = await tool.execute({
        lookup_result: mockBookResult,
        template: 'minimal',
        custom_fields: {
          my_rating: '_meta.confidence',
          series_name: 'series.name',
        },
      });

      expect(result).toContain('my_rating: high');
      expect(result).toContain('series_name: The Kingkiller Chronicle');
    });
  });

  describe('error handling', () => {
    it('should throw for unrecognized media type', async () => {
      await expect(
        tool.execute({
          lookup_result: { unknown: 'data' },
          template: 'default',
        })
      ).rejects.toThrow('Unable to determine media type');
    });
  });
});
