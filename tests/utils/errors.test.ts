import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ErrorResponseSchema } from '../../src/types/common.js';
import {
  normalizeError,
  SourceError,
  NotFoundError,
  RateLimitError,
  errorFromHttpStatus,
} from '../../src/utils/errors.js';

describe('application error normalization', () => {
  it('preserves typed source errors and retry metadata in the public schema', () => {
    const error = normalizeError(new RateLimitError('google_books', 12));
    expect(error).toEqual({
      code: 'RATE_LIMITED',
      message: 'Rate limit exceeded',
      source: 'google_books',
      retryable: true,
      retry_after_seconds: 12,
    });
    expect(ErrorResponseSchema.parse({ error })).toEqual({ error });
    expect(new NotFoundError('No book', 'open_library')).toBeInstanceOf(Error);
    expect(normalizeError(new NotFoundError('No book', 'open_library'))).toEqual({
      code: 'NOT_FOUND',
      message: 'No book',
      source: 'open_library',
      retryable: false,
    });
  });

  it('retains recognized legacy object errors without an Error prototype', () => {
    expect(
      normalizeError({
        code: 'AUTH_ERROR',
        message: 'Invalid key',
        source: 'tmdb',
        retryable: false,
      })
    ).toEqual({ code: 'AUTH_ERROR', message: 'Invalid key', source: 'tmdb', retryable: false });
    expect(normalizeError(new SourceError('Unavailable', 'SOURCE_ERROR', 'tmdb', true))).toEqual({
      code: 'SOURCE_ERROR',
      message: 'Unavailable',
      source: 'tmdb',
      retryable: true,
    });
  });

  it('classifies validation and network timeout errors', () => {
    const parsed = z.string().safeParse(42);
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error('Expected invalid input');
    expect(normalizeError(parsed.error)).toMatchObject({
      code: 'VALIDATION_ERROR',
      retryable: false,
    });
    expect(
      normalizeError(
        Object.assign(new Error('Request timed out'), { code: 'UND_ERR_HEADERS_TIMEOUT' }),
        'open_library'
      )
    ).toEqual({
      code: 'TIMEOUT',
      message: 'Request timed out',
      source: 'open_library',
      retryable: true,
    });
  });

  it.each([null, undefined, 42, {}, { code: 'UNREGISTERED', retry_after_seconds: -1 }])(
    'handles arbitrary thrown values without throwing: %s',
    (value) => {
      const error = normalizeError(value);
      expect(error).toEqual({
        code: 'SOURCE_ERROR',
        message: 'An unknown error occurred',
        retryable: true,
      });
      expect(ErrorResponseSchema.safeParse({ error }).success).toBe(true);
    }
  );

  it('does not throw when diagnostic properties or proxy traps are broken', () => {
    const accessor = Object.defineProperty({}, 'code', {
      get() {
        throw new Error('broken accessor');
      },
    });
    const proxy = new Proxy(
      {},
      {
        has() {
          throw new Error('broken proxy');
        },
      }
    );
    for (const value of [accessor, proxy]) {
      expect(normalizeError(value, 'tmdb')).toEqual({
        code: 'SOURCE_ERROR',
        message: 'An unknown error occurred',
        source: 'tmdb',
        retryable: true,
      });
    }
  });

  it('maps provider statuses and only includes usable Retry-After values', () => {
    expect(normalizeError(errorFromHttpStatus('tmdb', 401))).toMatchObject({
      code: 'AUTH_ERROR',
      retryable: false,
    });
    expect(normalizeError(errorFromHttpStatus('tmdb', 404))).toMatchObject({
      code: 'NOT_FOUND',
      retryable: false,
    });
    expect(normalizeError(errorFromHttpStatus('tmdb', 503))).toMatchObject({
      code: 'SOURCE_ERROR',
      retryable: true,
    });
    expect(normalizeError(errorFromHttpStatus('tmdb', 408))).toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
    });
    expect(normalizeError(errorFromHttpStatus('tmdb', 429, '3'))).toMatchObject({
      code: 'RATE_LIMITED',
      retry_after_seconds: 3,
    });
    expect(normalizeError(errorFromHttpStatus('tmdb', 429, '-3'))).not.toHaveProperty(
      'retry_after_seconds'
    );
    const future = new Date(Date.now() + 60_000).toUTCString();
    expect(
      normalizeError(errorFromHttpStatus('tmdb', 429, future)).retry_after_seconds
    ).toBeGreaterThan(0);
  });

  it('retains Error and string messages and rejects invalid retry delays', () => {
    expect(normalizeError(new Error('Network down'), 'tmdb')).toEqual({
      code: 'SOURCE_ERROR',
      message: 'Network down',
      source: 'tmdb',
      retryable: true,
    });
    expect(normalizeError('Network down').message).toBe('Network down');
    expect(
      normalizeError({ code: 'RATE_LIMITED', message: 'Busy', retry_after_seconds: Infinity })
    ).not.toHaveProperty('retry_after_seconds');
  });
});
