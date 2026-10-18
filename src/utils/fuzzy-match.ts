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
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}_\s]/gu, '') // Remove punctuation while preserving Unicode letters, marks, and numbers
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
 * A series name that is only a grammatical tail: "the Series", "a Series",
 * or a phrase ending "in a Series" / "Series of". It names no series.
 */
const UNNAMED_SERIES = /^(?:(?:a|an|the)\s+)?series$|\b(?:a|an|the|of|in)\s+series$/i;

/**
 * Titles come from remote sources. The patterns below backtrack
 * quadratically or worse on long runs of spaces, dashes, or parentheses
 * (tens of seconds at 50k characters), and no real title is near this long.
 */
const MAX_PARSED_TITLE_LENGTH = 1000;

/**
 * Extract series information from a title string.
 *
 * Patterns run in order and the first match wins. The dash and "Part N of"
 * formats are deliberately narrow: they require the literal word "Series"
 * closing the series name, because a bare "Name - Subtitle Book 1" or
 * "Part 1 of 2" is as likely a subtitle or format count as a series. Each
 * is pinned against real catalog titles in tests/fixtures/series-title-corpus.ts.
 */
export function extractSeriesFromTitle(title: string): {
  cleanTitle: string;
  seriesName: string | null;
  seriesPosition: number | null;
} {
  // Common series patterns. A parenthesized series name never contains
  // parentheses, so "Title (Part 1 of 2) [Edition] (Series, #1)" binds to the
  // last group.
  const patterns = [
    // "(Series Name #1)" or "(Series Name, #1)"
    /^(?<title>.+?)\s*\(\s*(?<series>[^()]+?)\s*[,#]\s*(?<position>\d+(?:\.\d+)?)\s*\)$/,
    // "Title (Series Name Book 1)"
    /^(?<title>.+?)\s*\(\s*(?<series>[^()]+?)\s+Book\s+(?<position>\d+(?:\.\d+)?)\s*\)$/i,
    // "Title: Series Name #1"
    /^(?<title>.+?):\s*(?<series>.+?)\s*#(?<position>\d+(?:\.\d+)?)$/,
    // "Title (Book 1)"
    /^(?<title>.+?)\s*\(\s*Book\s+(?<position>\d+(?:\.\d+)?)\s*\)$/i,
    // "Title #1"
    /^(?<title>.+?)\s*#(?<position>\d+(?:\.\d+)?)$/,
    // "Title - Name Series Book 1" or "..., Book 1"; before "Title, Book 1" so the comma form keeps its series
    /^(?<title>.+?)\s+-\s+(?<series>[^:()]+?\s+Series),?\s+Book\s+(?<position>\d+(?:\.\d+)?)$/i,
    // "Title, Book 1"
    /^(?<title>.+?),\s*Book\s+(?<position>\d+(?:\.\d+)?)$/i,
    // "Title: Part 1 of the Name Series" (or after a comma)
    /^(?<title>.+?)\s*[:,]\s+Part\s+(?<position>\d+)\s+of\s+(?:the\s+)?(?<series>.+?\s+Series)$/i,
  ];

  if (title.length > MAX_PARSED_TITLE_LENGTH) {
    return { cleanTitle: title, seriesName: null, seriesPosition: null };
  }

  for (const pattern of patterns) {
    const groups = title.match(pattern)?.groups;
    if (!groups) continue;
    const seriesName = groups.series?.replace(/[\s,]+$/, '') ?? null;
    if (seriesName !== null && UNNAMED_SERIES.test(seriesName)) continue;
    return {
      cleanTitle: groups.title.trim(),
      seriesName,
      seriesPosition: parseFloat(groups.position),
    };
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
