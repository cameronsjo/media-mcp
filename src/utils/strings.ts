/**
 * Shared string utilities for normalization and comparison
 */

/**
 * Normalize a string for fuzzy matching/comparison.
 * Removes punctuation, normalizes whitespace, and lowercases.
 */
export function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a shelf/tag name by removing separators and spaces.
 * Used for matching Goodreads shelves to canonical genres/tropes.
 */
export function normalizeShelf(str: string): string {
  return str.toLowerCase().replace(/[-_\s]/g, '');
}
