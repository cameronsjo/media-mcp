/**
 * Fuzzy string matching utilities for title/author matching
 */

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity ratio between two strings (0-1)
 */
export function stringSimilarity(a: string, b: string): number {
  const aNorm = normalize(a);
  const bNorm = normalize(b);

  if (aNorm === bNorm) return 1;
  if (aNorm.length === 0 || bNorm.length === 0) return 0;

  const distance = levenshteinDistance(aNorm, bNorm);
  const maxLength = Math.max(aNorm.length, bNorm.length);

  return 1 - distance / maxLength;
}

/**
 * Normalize a string for comparison
 */
export function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Check if two strings are a fuzzy match
 */
export function isFuzzyMatch(a: string, b: string, threshold: number = 0.8): boolean {
  return stringSimilarity(a, b) >= threshold;
}

/**
 * Calculate n-gram similarity (useful for longer strings)
 */
export function ngramSimilarity(a: string, b: string, n: number = 2): number {
  const aNorm = normalize(a);
  const bNorm = normalize(b);

  if (aNorm === bNorm) return 1;
  if (aNorm.length < n || bNorm.length < n) {
    return stringSimilarity(a, b);
  }

  const aNgrams = new Set(getNgrams(aNorm, n));
  const bNgrams = new Set(getNgrams(bNorm, n));

  const intersection = new Set([...aNgrams].filter((x) => bNgrams.has(x)));
  const union = new Set([...aNgrams, ...bNgrams]);

  return intersection.size / union.size;
}

/**
 * Get n-grams from a string
 */
function getNgrams(str: string, n: number): string[] {
  const ngrams: string[] = [];
  for (let i = 0; i <= str.length - n; i++) {
    ngrams.push(str.slice(i, i + n));
  }
  return ngrams;
}

/**
 * Calculate combined similarity score for book matching
 */
export function bookMatchScore(
  queryTitle: string,
  queryAuthor: string | undefined,
  resultTitle: string,
  resultAuthor: string | undefined
): number {
  // Title similarity (weighted heavily)
  const titleSimilarity = stringSimilarity(queryTitle, resultTitle);

  // Also check if query is contained in result or vice versa
  const queryNorm = normalize(queryTitle);
  const resultNorm = normalize(resultTitle);
  const containsBonus = resultNorm.includes(queryNorm) || queryNorm.includes(resultNorm) ? 0.15 : 0;

  let score = titleSimilarity * 0.6 + containsBonus;

  // Author similarity (if both provided)
  if (queryAuthor && resultAuthor) {
    const authorSimilarity = stringSimilarity(queryAuthor, resultAuthor);

    // Check for partial author match (first name, last name)
    const queryAuthorParts = normalize(queryAuthor).split(' ');
    const resultAuthorParts = normalize(resultAuthor).split(' ');

    const partialAuthorMatch = queryAuthorParts.some((part) =>
      resultAuthorParts.some(
        (rPart) =>
          part.length > 2 && rPart.length > 2 && (part.includes(rPart) || rPart.includes(part))
      )
    );

    const authorBonus = partialAuthorMatch ? 0.1 : 0;
    score += authorSimilarity * 0.3 + authorBonus;
  } else if (queryAuthor || resultAuthor) {
    // Penalize if one has author and other doesn't
    score *= 0.9;
  }

  return Math.min(score, 1);
}

/**
 * Extract series information from a title string
 */
export function extractSeriesFromTitle(title: string): {
  cleanTitle: string;
  seriesName: string | null;
  seriesPosition: number | null;
} {
  // Common series patterns
  const patterns = [
    // "(Series Name #1)" or "(Series Name, #1)"
    /^(.+?)\s*\(\s*(.+?)\s*[,#]\s*(\d+(?:\.\d+)?)\s*\)$/,
    // "Title (Series Name Book 1)"
    /^(.+?)\s*\(\s*(.+?)\s+Book\s+(\d+(?:\.\d+)?)\s*\)$/i,
    // "Title: Series Name #1"
    /^(.+?):\s*(.+?)\s*#(\d+(?:\.\d+)?)$/,
    // "Title (Book 1)"
    /^(.+?)\s*\(\s*Book\s+(\d+(?:\.\d+)?)\s*\)$/i,
    // "Title #1"
    /^(.+?)\s*#(\d+(?:\.\d+)?)$/,
    // "Title, Book 1"
    /^(.+?),\s*Book\s+(\d+(?:\.\d+)?)$/i,
    // "Series Name: Title (Book 1)"
    /^(.+?):\s*(.+?)\s*\(\s*Book\s+(\d+(?:\.\d+)?)\s*\)$/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) {
      if (match.length === 4) {
        // Pattern with series name and position
        return {
          cleanTitle: match[1].trim(),
          seriesName: match[2].trim(),
          seriesPosition: parseFloat(match[3]),
        };
      } else if (match.length === 3) {
        // Pattern with position only
        return {
          cleanTitle: match[1].trim(),
          seriesName: null,
          seriesPosition: parseFloat(match[2]),
        };
      }
    }
  }

  return {
    cleanTitle: title,
    seriesName: null,
    seriesPosition: null,
  };
}

/**
 * Clean a title for better matching
 */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*\([^)]*\)\s*$/, '') // Remove trailing parenthetical
    .replace(/\s*:\s*A Novel\s*$/i, '') // Remove ": A Novel"
    .replace(/\s*:\s*Book\s+\d+\s*$/i, '') // Remove ": Book N"
    .trim();
}
