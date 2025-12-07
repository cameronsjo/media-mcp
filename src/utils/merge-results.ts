import type { PartialBookData, BookResult, BookSource } from '../types/book.js';
import type { ConfidenceLevel } from '../types/common.js';

/**
 * Source priority for field selection (higher = more trusted)
 */
const SOURCE_PRIORITY: Record<BookSource, number> = {
  goodreads: 4,
  open_library: 3,
  google_books: 2,
  hardcover: 1,
};

/**
 * Field-specific source preferences
 */
const FIELD_SOURCE_PREFERENCE: Partial<Record<keyof PartialBookData, BookSource[]>> = {
  rating: ['goodreads', 'open_library', 'google_books'],
  genres: ['goodreads', 'google_books', 'open_library'],
  series: ['goodreads', 'hardcover', 'open_library'],
  description: ['google_books', 'open_library', 'goodreads'],
  cover_url: ['open_library', 'google_books', 'goodreads'],
  page_count: ['open_library', 'google_books', 'goodreads'],
  isbn_10: ['open_library', 'google_books'],
  isbn_13: ['open_library', 'google_books'],
};

/**
 * Merge results from multiple book sources
 */
export function mergeBookResults(
  results: PartialBookData[],
  sourcesQueried: BookSource[],
  sourcesFailed: BookSource[]
): BookResult {
  if (results.length === 0) {
    throw new Error('No results to merge');
  }

  // Sort results by source priority
  const sortedResults = [...results].sort(
    (a, b) => (SOURCE_PRIORITY[b.source] || 0) - (SOURCE_PRIORITY[a.source] || 0)
  );

  // Primary result for base data
  const primary = sortedResults[0];

  // Merge each field
  const merged: BookResult = {
    title: selectBestValue(results, 'title', primary.title || ''),
    author: selectBestValue(results, 'author', primary.author || 'Unknown'),
    authors: mergeArrays(results.map((r) => r.authors).filter(Boolean) as string[][]),
    isbn_10: selectBestValue(results, 'isbn_10', null),
    isbn_13: selectBestValue(results, 'isbn_13', null),
    genres: mergeArrays(results.map((r) => r.genres).filter(Boolean) as string[][]),
    subjects: mergeArrays(results.map((r) => r.subjects).filter(Boolean) as string[][]),
    page_count: selectBestValue(results, 'page_count', null),
    publish_date: selectBestValue(results, 'publish_date', null),
    publisher: selectBestValue(results, 'publisher', null),
    description: selectLongestDescription(results),
    cover_url: selectBestCover(results),
    series: mergeSeries(results),
    ratings: mergeRatings(results),
    identifiers: {
      open_library: findIdentifier(results, 'open_library'),
      goodreads: findIdentifier(results, 'goodreads'),
      google_books: findIdentifier(results, 'google_books'),
      hardcover: findIdentifier(results, 'hardcover'),
    },
    source_urls: {
      open_library: findSourceUrl(results, 'open_library'),
      goodreads: findSourceUrl(results, 'goodreads'),
      google_books: findSourceUrl(results, 'google_books'),
    },
    _meta: {
      sources_queried: sourcesQueried,
      sources_failed: sourcesFailed.length > 0 ? sourcesFailed : undefined,
      primary_source: primary.source,
      confidence: 'low', // Placeholder, will be set below
      cached: false,
      timestamp: new Date().toISOString(),
    },
  };

  // Calculate confidence after object is constructed
  merged._meta.confidence = calculateConfidence(merged, results.length, sourcesFailed.length);

  return merged;
}

/**
 * Select the best value for a field based on source preferences
 */
function selectBestValue<T>(
  results: PartialBookData[],
  field: keyof PartialBookData,
  defaultValue: T
): T {
  const preferences = FIELD_SOURCE_PREFERENCE[field] || [];

  // Try sources in preference order
  for (const source of preferences) {
    const result = results.find((r) => r.source === source);
    if (result && result[field] !== undefined && result[field] !== null) {
      return result[field] as T;
    }
  }

  // Fall back to first available value
  for (const result of results) {
    if (result[field] !== undefined && result[field] !== null) {
      return result[field] as T;
    }
  }

  return defaultValue;
}

/**
 * Merge arrays from multiple sources, removing duplicates
 */
function mergeArrays(arrays: string[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const arr of arrays) {
    for (const item of arr) {
      const normalized = item.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(item);
      }
    }
  }

  return result;
}

/**
 * Select the longest/best description
 */
function selectLongestDescription(results: PartialBookData[]): string | null {
  let best: string | null = null;
  let bestLength = 0;

  // Prefer Google Books for descriptions
  const googleResult = results.find((r) => r.source === 'google_books');
  if (googleResult?.description && googleResult.description.length > 100) {
    return googleResult.description;
  }

  for (const result of results) {
    if (result.description && result.description.length > bestLength) {
      best = result.description;
      bestLength = result.description.length;
    }
  }

  return best;
}

/**
 * Select the best cover URL
 */
function selectBestCover(results: PartialBookData[]): string | null {
  // Prefer Open Library covers (high quality)
  const olResult = results.find((r) => r.source === 'open_library');
  if (olResult?.cover_url) {
    return olResult.cover_url;
  }

  // Then Google Books
  const gbResult = results.find((r) => r.source === 'google_books');
  if (gbResult?.cover_url) {
    return gbResult.cover_url;
  }

  // Then any available
  for (const result of results) {
    if (result.cover_url) {
      return result.cover_url;
    }
  }

  return null;
}

/**
 * Merge series information
 */
function mergeSeries(results: PartialBookData[]): BookResult['series'] {
  // Prefer Goodreads for series info
  const grResult = results.find((r) => r.source === 'goodreads');
  if (grResult?.series?.name) {
    return {
      name: grResult.series.name,
      position: grResult.series.position ?? null,
      total_books: grResult.series.total_books ?? null,
    };
  }

  // Fall back to any available series info
  for (const result of results) {
    if (result.series?.name) {
      return {
        name: result.series.name,
        position: result.series.position ?? null,
        total_books: result.series.total_books ?? null,
      };
    }
  }

  return { name: null, position: null, total_books: null };
}

/**
 * Merge ratings from multiple sources
 */
function mergeRatings(results: PartialBookData[]): BookResult['ratings'] {
  const ratings: BookResult['ratings'] = {};

  for (const result of results) {
    if (result.rating) {
      switch (result.source) {
        case 'goodreads':
          ratings.goodreads = result.rating;
          break;
        case 'open_library':
          ratings.open_library = result.rating;
          break;
        case 'google_books':
          ratings.google_books = result.rating;
          break;
      }
    }
  }

  return ratings;
}

/**
 * Find identifier for a specific source
 */
function findIdentifier(results: PartialBookData[], source: BookSource): string | null {
  const result = results.find((r) => r.source === source);
  return result?.identifier ?? null;
}

/**
 * Find source URL for a specific source
 */
function findSourceUrl(results: PartialBookData[], source: BookSource): string | null {
  const result = results.find((r) => r.source === source);
  return result?.source_url ?? null;
}

/**
 * Calculate confidence level based on data completeness
 */
function calculateConfidence(
  result: BookResult,
  sourceCount: number,
  failedCount: number
): ConfidenceLevel {
  let score = 0;

  // Base score from sources
  score += sourceCount * 15;
  score -= failedCount * 10;

  // Field completeness
  if (result.title) score += 10;
  if (result.author && result.author !== 'Unknown') score += 10;
  if (result.isbn_10 || result.isbn_13) score += 15;
  if (result.cover_url) score += 5;
  if (result.description) score += 10;
  if (result.page_count) score += 5;
  if (result.genres.length > 0) score += 5;
  if (result.series.name) score += 10;
  if (Object.keys(result.ratings).length > 0) score += 10;

  // Multiple sources agreeing increases confidence
  if (sourceCount >= 2) score += 10;
  if (sourceCount >= 3) score += 10;

  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}
