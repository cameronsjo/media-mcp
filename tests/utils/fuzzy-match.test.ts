import { describe, expect, it } from 'vitest';
import {
  bookMatchScore,
  cleanTitle,
  extractSeriesFromTitle,
  isFuzzyMatch,
  levenshteinDistance,
  ngramSimilarity,
  normalize,
  stringSimilarity,
} from '../../src/utils/fuzzy-match.js';

describe('levenshteinDistance', () => {
  it('returns zero for equal strings, including two empty strings', () => {
    expect(levenshteinDistance('same', 'same')).toBe(0);
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('calculates substitutions, insertions, and deletions', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('book', 'books')).toBe(1);
    expect(levenshteinDistance('books', 'book')).toBe(1);
  });

  it('handles an empty string against a non-empty string', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });
});

describe('normalize', () => {
  it('lowercases, removes punctuation, collapses whitespace, and trims', () => {
    expect(normalize("  The,  Quick! Brown's\nFox  ")).toBe('the quick browns fox');
  });

  it('preserves word characters while removing special characters', () => {
    expect(normalize('_ABC 123_ [test]')).toBe('_abc 123_ test');
    expect(normalize('!@#$%^&*()\t')).toBe('');
  });
});

describe('stringSimilarity', () => {
  it('treats case and punctuation differences as equal', () => {
    expect(stringSimilarity('The Hobbit!', 'the hobbit')).toBe(1);
  });

  it('returns zero when only one normalized input is empty', () => {
    expect(stringSimilarity('!!!', 'book')).toBe(0);
  });

  it('returns the normalized Levenshtein ratio for different strings', () => {
    expect(stringSimilarity('cat', 'car')).toBeCloseTo(2 / 3);
  });
});

describe('isFuzzyMatch', () => {
  it('uses the default threshold and accepts a normalized exact match', () => {
    expect(isFuzzyMatch('The, Hobbit', 'the hobbit')).toBe(true);
    expect(isFuzzyMatch('The Hobbit', 'The Hobit')).toBe(true);
  });

  it('accepts a score at the custom threshold and rejects a higher threshold', () => {
    expect(isFuzzyMatch('cat', 'car', 2 / 3)).toBe(true);
    expect(isFuzzyMatch('cat', 'car', 0.7)).toBe(false);
  });
});

describe('ngramSimilarity', () => {
  it('returns one for normalized exact matches', () => {
    expect(ngramSimilarity('The Hobbit!', 'the hobbit')).toBe(1);
  });

  it('calculates Jaccard similarity from unique n-grams', () => {
    expect(ngramSimilarity('night', 'nacht')).toBeCloseTo(1 / 7);
    expect(ngramSimilarity('abcd', 'abce', 3)).toBeCloseTo(1 / 3);
  });

  it('falls back to string similarity when either input is shorter than n', () => {
    expect(ngramSimilarity('cat', 'car', 5)).toBeCloseTo(2 / 3);
    expect(ngramSimilarity('a', 'alphabet', 2)).toBeCloseTo(1 / 8);
  });

  it('handles an empty normalized input through the fallback', () => {
    expect(ngramSimilarity('!!!', 'book', 2)).toBe(0);
  });
});

describe('bookMatchScore', () => {
  it('combines exact title similarity with the title containment bonus', () => {
    expect(bookMatchScore('Dune', undefined, 'Dune', undefined)).toBe(0.75);
    expect(bookMatchScore('Dune', undefined, 'Dune Messiah', undefined)).toBeCloseTo(0.35);
  });

  it('penalizes a result when only one side has an author', () => {
    expect(bookMatchScore('Dune', 'Frank Herbert', 'Dune', undefined)).toBeCloseTo(0.675);
    expect(bookMatchScore('Dune', undefined, 'Dune', 'Frank Herbert')).toBeCloseTo(0.675);
  });

  it('adds author similarity and the partial-author bonus', () => {
    expect(bookMatchScore('A', 'Ann', 'B', 'Anne')).toBeCloseTo(0.325);
  });

  it('does not add a partial-author bonus for unrelated short names', () => {
    expect(bookMatchScore('A', 'Ann', 'B', 'Bob')).toBe(0);
  });

  it('caps combined scores at one', () => {
    expect(bookMatchScore('Dune', 'Frank Herbert', 'Dune', 'Frank Herbert')).toBe(1);
  });
});

describe('extractSeriesFromTitle', () => {
  it('extracts a series name and integer position from a hash pattern', () => {
    expect(extractSeriesFromTitle('The Shadow (Shadows of London #2)')).toEqual({
      cleanTitle: 'The Shadow',
      seriesName: 'Shadows of London',
      seriesPosition: 2,
    });
  });

  it('extracts a series name and integer position from a comma pattern', () => {
    expect(extractSeriesFromTitle('The Shadow (Shadows of London, 2)')).toEqual({
      cleanTitle: 'The Shadow',
      seriesName: 'Shadows of London',
      seriesPosition: 2,
    });
  });

  it('extracts a decimal position from a series Book pattern', () => {
    expect(extractSeriesFromTitle('The Shadow (Shadows of London Book 2.5)')).toEqual({
      cleanTitle: 'The Shadow',
      seriesName: 'Shadows of London',
      seriesPosition: 2.5,
    });
  });

  it('extracts a series name from a colon and hash pattern', () => {
    expect(extractSeriesFromTitle('The Shadow: Shadows of London #2')).toEqual({
      cleanTitle: 'The Shadow',
      seriesName: 'Shadows of London',
      seriesPosition: 2,
    });
  });

  it('extracts a position from a parenthesized Book pattern', () => {
    expect(extractSeriesFromTitle('The Shadow (Book 2)')).toEqual({
      cleanTitle: 'The Shadow',
      seriesName: null,
      seriesPosition: 2,
    });
  });

  it('extracts a position from a trailing hash pattern', () => {
    expect(extractSeriesFromTitle('The Shadow #2')).toEqual({
      cleanTitle: 'The Shadow',
      seriesName: null,
      seriesPosition: 2,
    });
  });

  it('extracts a position from a comma Book pattern', () => {
    expect(extractSeriesFromTitle('The Shadow, Book 2')).toEqual({
      cleanTitle: 'The Shadow',
      seriesName: null,
      seriesPosition: 2,
    });
  });

  it('keeps the title and series order for a series-prefix pattern', () => {
    expect(extractSeriesFromTitle('Shadows of London: The Shadow (Book 2)')).toEqual({
      cleanTitle: 'The Shadow',
      seriesName: 'Shadows of London',
      seriesPosition: 2,
    });
  });

  it('returns null series metadata for an unrecognized title', () => {
    expect(extractSeriesFromTitle('Standalone Novel')).toEqual({
      cleanTitle: 'Standalone Novel',
      seriesName: null,
      seriesPosition: null,
    });
  });
});

describe('cleanTitle', () => {
  it('removes a trailing parenthetical qualifier', () => {
    expect(cleanTitle('Dune (A Novel)')).toBe('Dune');
  });

  it('removes the supported A Novel and Book suffixes case-insensitively', () => {
    expect(cleanTitle('Dune: A NOVEL')).toBe('Dune');
    expect(cleanTitle('Dune: Book 2')).toBe('Dune');
  });

  it('leaves non-matching text and non-trailing parentheses intact', () => {
    expect(cleanTitle('The (Long) Title')).toBe('The (Long) Title');
    expect(cleanTitle('Dune: A Story')).toBe('Dune: A Story');
  });
});
