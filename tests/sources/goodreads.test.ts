import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GoodreadsSource, parseSeriesLinkText } from '../../src/sources/goodreads.js';
import { SQLiteCache } from '../../src/cache/sqlite-cache.js';
import { Logger } from '../../src/utils/logger.js';
import { RateLimiter } from '../../src/utils/rate-limiter.js';

vi.mock('undici', () => ({
  request: vi.fn(),
}));

import { request } from 'undici';

const mockRequest = vi.mocked(request);

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/goodreads/${name}`, import.meta.url), 'utf8');
}

function mockHtml(html: string): void {
  mockRequest.mockResolvedValueOnce({
    statusCode: 200,
    headers: {},
    body: {
      text: vi.fn().mockResolvedValue(html),
    },
  } as any);
}

describe('GoodreadsSource', () => {
  let source: GoodreadsSource;
  let cache: SQLiteCache;
  let logger: Logger;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    logger = new Logger('test');
    rateLimiter = new RateLimiter(logger);
    cache = new SQLiteCache({ path: ':memory:', defaultTTLHours: 24, enabled: true }, logger);
    source = new GoodreadsSource({ enabled: true, delayMs: 0 }, cache, logger, rateLimiter);
    vi.clearAllMocks();
  });

  afterEach(() => {
    cache.close();
  });

  it('parses modern search and detail HTML fixtures', async () => {
    mockHtml(fixture('modern-search.html'));
    mockHtml(fixture('modern-detail.html'));

    const result = await source.searchBook('The Modern Book');

    expect(result).toMatchObject({
      rating: { score: 4.5, count: 12345 },
      genres: ['Fantasy'],
      shelves: ['Fantasy'],
      page_count: 400,
      description: 'A modern description.',
      identifier: '123456',
      source: 'goodreads',
    });
    expect(result?.cover_url).toContain('compressed.photo.goodreads.com');
    expect(result?.series).toMatchObject({ name: 'The Modern Series', position: 1 });
  });

  it('parses legacy search and detail HTML fixtures', async () => {
    mockHtml(fixture('legacy-search.html'));
    mockHtml(fixture('legacy-detail.html'));

    const result = await source.searchBook('The Legacy Book');

    expect(result).toMatchObject({
      rating: { score: 4.2, count: 5432 },
      genres: ['Romance'],
      shelves: ['Romance'],
      page_count: 300,
      description: 'A legacy description.',
      cover_url: 'https://images.example.test/legacy-cover.jpg',
      identifier: '654321',
      source: 'goodreads',
    });
    expect(result?.series).toMatchObject({ name: 'The Legacy Series', position: 2 });
  });

  it('warns when search selectors find no book link and preserves null semantics', async () => {
    const emitter = vi.fn();
    logger.setEmitter(emitter);
    logger.setLevel('warning');
    mockHtml(fixture('empty-search.html'));

    const result = await source.searchBook('Missing Book');

    expect(result).toBeNull();
    expect(
      emitter.mock.calls
        .map((call) => call[0])
        .filter((entry) => {
          return entry.level === 'warning' && entry.data.action === 'search_selectors_empty';
        })
    ).toHaveLength(1);
  });

  it('keeps a recognized zero-result search silent at warning level', async () => {
    const emitter = vi.fn();
    logger.setEmitter(emitter);
    logger.setLevel('debug');
    mockHtml(fixture('empty-search-results.html'));

    const result = await source.searchBook('Unavailable title');

    expect(result).toBeNull();
    expect(
      emitter.mock.calls.map((call) => call[0]).filter((entry) => entry.level === 'warning')
    ).toHaveLength(0);
    expect(
      emitter.mock.calls
        .map((call) => call[0])
        .filter((entry) => entry.level === 'debug' && entry.data.action === 'search_no_results')
    ).toHaveLength(1);
  });

  it('warns when empty-result copy appears without validated search context', async () => {
    const emitter = vi.fn();
    logger.setEmitter(emitter);
    logger.setLevel('warning');
    mockHtml(fixture('unrelated-empty-state.html'));

    const result = await source.searchBook('Unexpected response');

    expect(result).toBeNull();
    expect(
      emitter.mock.calls
        .map((call) => call[0])
        .filter(
          (entry) => entry.level === 'warning' && entry.data.action === 'search_selectors_empty'
        )
    ).toHaveLength(1);
  });

  it('warns when detail selectors find no usable fields and preserves partial result semantics', async () => {
    const emitter = vi.fn();
    logger.setEmitter(emitter);
    logger.setLevel('warning');
    mockHtml(fixture('empty-detail.html'));

    const result = await source.getBookDetails('999999');

    expect(result).toMatchObject({
      identifier: '999999',
      source: 'goodreads',
      page_count: null,
      description: null,
      cover_url: null,
    });
    expect(
      emitter.mock.calls
        .map((call) => call[0])
        .filter((entry) => {
          return entry.level === 'warning' && entry.data.action === 'detail_selectors_empty';
        })
    ).toHaveLength(1);
  });

  it('does not warn when optional detail fields are absent but rating is usable', async () => {
    const emitter = vi.fn();
    logger.setEmitter(emitter);
    logger.setLevel('warning');
    mockHtml(fixture('rating-only-detail.html'));

    const result = await source.getBookDetails('111111');

    expect(result?.rating).toEqual({ score: 4, count: 100 });
    expect(
      emitter.mock.calls
        .map((call) => call[0])
        .filter((entry) => {
          return entry.level === 'warning' && entry.data.action === 'detail_selectors_empty';
        })
    ).toHaveLength(0);
  });

  it('warns when detail selectors match only malformed values', async () => {
    const emitter = vi.fn();
    logger.setEmitter(emitter);
    logger.setLevel('warning');
    mockHtml(fixture('malformed-detail.html'));

    const result = await source.getBookDetails('222222');

    expect(result).toMatchObject({
      identifier: '222222',
      page_count: null,
      description: null,
      cover_url: null,
    });
    expect(
      emitter.mock.calls
        .map((call) => call[0])
        .filter((entry) => {
          return entry.level === 'warning' && entry.data.action === 'detail_selectors_empty';
        })
    ).toHaveLength(1);
  });

  it('warns when a series page has no usable series name', async () => {
    const emitter = vi.fn();
    logger.setEmitter(emitter);
    logger.setLevel('warning');
    mockHtml(fixture('empty-series.html'));

    const result = await source.getSeriesInfo('333333');

    expect(result).toMatchObject({ seriesId: '333333', name: '', totalBooks: 1 });
    expect(
      emitter.mock.calls
        .map((call) => call[0])
        .filter((entry) => {
          return entry.level === 'warning' && entry.data.action === 'series_selectors_empty';
        })
    ).toHaveLength(1);
  });

  it('reads rating and page counts from page text when the attributes are absent', async () => {
    mockHtml(fixture('modern-search.html'));
    mockHtml(
      '<html><body><div class="RatingStatistics__rating">4.2</div>' +
        '<p>Published 2001, 9,876 ratings and 512 reviews</p><p>First edition, 352 pages</p>' +
        '</body></html>'
    );

    const result = await source.searchBook('The Modern Book');

    expect(result).toMatchObject({ rating: { score: 4.2, count: 9876 }, page_count: 352 });
  });

  it('scans a long digit run in page text without backtracking', async () => {
    // Before the lookbehind, each count pattern retried from every digit of the
    // run: about 9 s per pattern at 50,000 digits.
    mockHtml(fixture('modern-search.html'));
    mockHtml(
      '<html><body><div class="RatingStatistics__rating">4.0</div><p>' +
        '1'.repeat(50_000) +
        '</p></body></html>'
    );

    const started = Date.now();
    const result = await source.searchBook('The Modern Book');

    expect(Date.now() - started).toBeLessThan(1000);
    expect(result).not.toBeNull();
    expect(result?.rating).toBeUndefined();
    expect(result?.page_count ?? null).toBeNull();
  });
});

describe('parseSeriesLinkText', () => {
  it.each([
    ['The Kingkiller Chronicle #1', { name: 'The Kingkiller Chronicle', position: 1 }],
    ['The Legacy Series Book 2', { name: 'The Legacy Series', position: 2 }],
    ['Discworld #0.5', { name: 'Discworld', position: 0.5 }],
    ['The Expanse #', { name: 'The Expanse', position: null }],
    ['Standalone Series', { name: 'Standalone Series', position: null }],
    ['  The Modern Series\n      #1  ', { name: 'The Modern Series', position: 1 }],
    ['The\tWheel  of\u00a0Time #3', { name: 'The Wheel of Time', position: 3 }],
  ])('parses %j', (text, expected) => {
    expect(parseSeriesLinkText(text)).toEqual(expected);
  });

  it('parses text at the length cap and returns null past it', () => {
    const suffix = ' Series #2';
    const atCap = 'a'.repeat(500 - suffix.length) + suffix;
    expect(parseSeriesLinkText(atCap)).toEqual({
      name: 'a'.repeat(500 - suffix.length) + ' Series',
      position: 2,
    });
    expect(parseSeriesLinkText('a' + atCap)).toBeNull();
  });

  it('keeps whitespace-run text at the cap fast', () => {
    // Collapsed, one call takes a few microseconds; without the collapse it takes
    // about 0.3 ms, so 1,000 calls push a regression past the budget.
    const text = 'a' + ' '.repeat(498) + '!';
    const started = Date.now();
    let result = parseSeriesLinkText(text);
    for (let run = 1; run < 1000; run += 1) result = parseSeriesLinkText(text);
    expect(Date.now() - started).toBeLessThan(100);
    expect(result).toEqual({ name: 'a !', position: null });
  });

  it('returns null for a long whitespace run without backtracking', () => {
    const text = 'a' + ' '.repeat(50_000) + '!';
    const started = Date.now();
    expect(parseSeriesLinkText(text)).toBeNull();
    expect(Date.now() - started).toBeLessThan(50);
  });

  it('uses an input that the pre-fix pattern backtracks on (control)', () => {
    // The pattern as it stood before the fix, run uncapped and uncollapsed. If this
    // stops being slow, the timing tests above no longer prove anything.
    const oldPattern = /^(.+?)\s*(?:#|Book\s*)(\d+(?:\.\d+)?)?$/i;
    const text = 'a' + ' '.repeat(20_000) + '!';
    const started = performance.now();
    text.match(oldPattern);
    const slow = performance.now() - started;
    const fixedStarted = performance.now();
    parseSeriesLinkText(text.slice(0, 500));
    const fast = performance.now() - fixedStarted;
    expect(slow).toBeGreaterThan(25);
    expect(slow).toBeGreaterThan(fast * 20);
  });
});
