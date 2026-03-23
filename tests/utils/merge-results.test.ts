import { describe, it, expect } from 'vitest';
import { mergeBookResults } from '../../src/utils/merge-results.js';
import type { PartialBookData, BookSource } from '../../src/types/book.js';

function createPartialBookData(
  source: BookSource,
  overrides: Partial<PartialBookData> = {}
): PartialBookData {
  return {
    source,
    title: 'Test Book',
    author: 'Test Author',
    ...overrides,
  };
}

describe('mergeBookResults', () => {
  describe('empty input handling', () => {
    it('throws error when no results provided', () => {
      expect(() => mergeBookResults([], ['open_library'], [])).toThrow(
        'No results to merge'
      );
    });
  });

  describe('single source passthrough', () => {
    it('passes through single Open Library result', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {
            title: 'Single Source Book',
            author: 'Single Author',
            isbn_13: '9781234567890',
          }),
        ],
        ['open_library'],
        []
      );

      expect(result.title).toBe('Single Source Book');
      expect(result.author).toBe('Single Author');
      expect(result.isbn_13).toBe('9781234567890');
      expect(result._meta.primary_source).toBe('open_library');
    });
  });

  describe('multi-source field selection', () => {
    it('prefers Goodreads for ratings', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {
            rating: { score: 3.5, count: 100 },
          }),
          createPartialBookData('goodreads', {
            rating: { score: 4.2, count: 5000 },
          }),
        ],
        ['open_library', 'goodreads'],
        []
      );

      expect(result.ratings.goodreads).toEqual({ score: 4.2, count: 5000 });
      expect(result.ratings.open_library).toEqual({ score: 3.5, count: 100 });
    });

    it('prefers Open Library for ISBN', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('goodreads', {
            isbn_13: '9780000000000',
          }),
          createPartialBookData('open_library', {
            isbn_13: '9781234567890',
          }),
        ],
        ['goodreads', 'open_library'],
        []
      );

      expect(result.isbn_13).toBe('9781234567890');
    });

    it('prefers Open Library for cover_url', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('google_books', {
            cover_url: 'https://google.com/cover.jpg',
          }),
          createPartialBookData('open_library', {
            cover_url: 'https://openlibrary.org/cover.jpg',
          }),
        ],
        ['google_books', 'open_library'],
        []
      );

      expect(result.cover_url).toBe('https://openlibrary.org/cover.jpg');
    });

    it('falls back to Google Books cover when Open Library unavailable', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('google_books', {
            cover_url: 'https://google.com/cover.jpg',
          }),
          createPartialBookData('goodreads', {}),
        ],
        ['google_books', 'goodreads'],
        []
      );

      expect(result.cover_url).toBe('https://google.com/cover.jpg');
    });
  });

  describe('array merging', () => {
    it('combines genres from all sources without duplicates', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {
            genres: ['Fantasy', 'Fiction'],
          }),
          createPartialBookData('goodreads', {
            genres: ['fantasy', 'Epic Fantasy'], // 'fantasy' is duplicate
          }),
        ],
        ['open_library', 'goodreads'],
        []
      );

      expect(result.genres).toHaveLength(3);
      expect(result.genres).toContain('Fantasy');
      expect(result.genres).toContain('Fiction');
      expect(result.genres).toContain('Epic Fantasy');
    });

    it('combines subjects from multiple sources', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {
            subjects: ['Magic', 'Dragons'],
          }),
          createPartialBookData('google_books', {
            subjects: ['Wizards', 'magic'], // duplicate 'magic'
          }),
        ],
        ['open_library', 'google_books'],
        []
      );

      expect(result.subjects).toHaveLength(3);
    });

    it('handles tropes only from Goodreads', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('goodreads', {
            tropes: ['Enemies to Lovers', 'Found Family'],
          }),
          createPartialBookData('open_library', {}),
        ],
        ['goodreads', 'open_library'],
        []
      );

      expect(result.tropes).toEqual(['Enemies to Lovers', 'Found Family']);
    });
  });

  describe('series handling', () => {
    it('prefers Goodreads for series info', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {
            series: { name: 'OL Series', position: 1, total_books: 3 },
          }),
          createPartialBookData('goodreads', {
            series: { name: 'GR Series', position: 2, total_books: 5 },
          }),
        ],
        ['open_library', 'goodreads'],
        []
      );

      expect(result.series.name).toBe('GR Series');
      expect(result.series.position).toBe(2);
      expect(result.series.total_books).toBe(5);
    });

    it('falls back to other sources when Goodreads has no series', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {
            series: { name: 'OL Series', position: 1, total_books: null },
          }),
          createPartialBookData('goodreads', {}),
        ],
        ['open_library', 'goodreads'],
        []
      );

      expect(result.series.name).toBe('OL Series');
    });

    it('returns empty series when none available', () => {
      const result = mergeBookResults(
        [createPartialBookData('open_library', {})],
        ['open_library'],
        []
      );

      expect(result.series.name).toBeNull();
      expect(result.series.position).toBeNull();
    });
  });

  describe('description selection', () => {
    it('prefers Google Books description when available and long enough', () => {
      const longDesc = 'A'.repeat(150); // > 100 chars

      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {
            description: 'Open Library description',
          }),
          createPartialBookData('google_books', {
            description: longDesc,
          }),
        ],
        ['open_library', 'google_books'],
        []
      );

      expect(result.description).toBe(longDesc);
    });

    it('falls back to longest description when Google Books is short', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {
            description: 'This is a longer Open Library description',
          }),
          createPartialBookData('google_books', {
            description: 'Short',
          }),
        ],
        ['open_library', 'google_books'],
        []
      );

      expect(result.description).toBe('This is a longer Open Library description');
    });
  });

  describe('identifiers and source URLs', () => {
    it('collects identifiers from all sources', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {
            identifier: 'OL12345W',
          }),
          createPartialBookData('goodreads', {
            identifier: '12345678',
          }),
        ],
        ['open_library', 'goodreads'],
        []
      );

      expect(result.identifiers.open_library).toBe('OL12345W');
      expect(result.identifiers.goodreads).toBe('12345678');
    });

    it('collects source URLs from all sources', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {
            source_url: 'https://openlibrary.org/works/OL12345W',
          }),
          createPartialBookData('goodreads', {
            source_url: 'https://www.goodreads.com/book/show/12345678',
          }),
        ],
        ['open_library', 'goodreads'],
        []
      );

      expect(result.source_urls.open_library).toBe(
        'https://openlibrary.org/works/OL12345W'
      );
      expect(result.source_urls.goodreads).toBe(
        'https://www.goodreads.com/book/show/12345678'
      );
    });
  });

  describe('source priority ordering', () => {
    it('uses highest priority source as primary', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {}),
          createPartialBookData('goodreads', {}), // Priority 4 (highest)
          createPartialBookData('google_books', {}),
        ],
        ['open_library', 'goodreads', 'google_books'],
        []
      );

      expect(result._meta.primary_source).toBe('goodreads');
    });
  });

  describe('confidence calculation', () => {
    it('returns high confidence for complete data from multiple sources', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {
            title: 'Complete Book',
            author: 'Known Author',
            isbn_13: '9781234567890',
            cover_url: 'https://example.com/cover.jpg',
            description: 'A book description',
            page_count: 350,
            genres: ['Fantasy'],
            series: { name: 'Series', position: 1, total_books: 3 },
          }),
          createPartialBookData('goodreads', {
            rating: { score: 4.5, count: 1000 },
            tropes: ['Magic'],
          }),
        ],
        ['open_library', 'goodreads'],
        []
      );

      expect(result._meta.confidence).toBe('high');
    });

    it('returns low confidence for minimal data', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {
            title: 'Minimal Book',
          }),
        ],
        ['open_library'],
        []
      );

      expect(result._meta.confidence).toBe('low');
    });

    it('penalizes failed sources', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {
            title: 'Book',
            author: 'Author',
          }),
        ],
        ['open_library', 'goodreads', 'google_books'],
        ['goodreads', 'google_books']
      );

      // With 2 failed sources, confidence is lower
      expect(result._meta.sources_failed).toEqual(['goodreads', 'google_books']);
    });
  });

  describe('missing field handling', () => {
    it('handles null/undefined fields gracefully', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {
            title: 'Book',
            isbn_10: undefined,
            isbn_13: null as unknown as string,
            page_count: undefined,
          }),
        ],
        ['open_library'],
        []
      );

      expect(result.isbn_10).toBeNull();
      expect(result.isbn_13).toBeNull();
      expect(result.page_count).toBeNull();
    });

    it('uses default author when not provided', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {
            title: 'Book',
            author: undefined,
          }),
        ],
        ['open_library'],
        []
      );

      expect(result.author).toBe('Unknown');
    });

    it('handles empty arrays', () => {
      const result = mergeBookResults(
        [
          createPartialBookData('open_library', {
            genres: [],
            subjects: [],
          }),
        ],
        ['open_library'],
        []
      );

      expect(result.genres).toEqual([]);
      expect(result.subjects).toEqual([]);
    });
  });

  describe('metadata tracking', () => {
    it('tracks queried sources', () => {
      const result = mergeBookResults(
        [createPartialBookData('open_library', {})],
        ['open_library', 'goodreads', 'google_books'],
        []
      );

      expect(result._meta.sources_queried).toEqual([
        'open_library',
        'goodreads',
        'google_books',
      ]);
    });

    it('tracks failed sources when present', () => {
      const result = mergeBookResults(
        [createPartialBookData('open_library', {})],
        ['open_library', 'goodreads'],
        ['goodreads']
      );

      expect(result._meta.sources_failed).toEqual(['goodreads']);
    });

    it('omits sources_failed when none failed', () => {
      const result = mergeBookResults(
        [createPartialBookData('open_library', {})],
        ['open_library'],
        []
      );

      expect(result._meta.sources_failed).toBeUndefined();
    });

    it('includes timestamp in ISO format', () => {
      const result = mergeBookResults(
        [createPartialBookData('open_library', {})],
        ['open_library'],
        []
      );

      expect(result._meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
