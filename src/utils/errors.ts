import { ZodError } from 'zod';
import { ErrorCodeSchema, type ErrorCode, type ErrorResponse } from '../types/common.js';

type ErrorDetails = ErrorResponse['error'];

/** Application errors use this schema; protocol-level JSON-RPC errors remain SDK-owned. */
export class SourceError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly source?: string,
    public readonly retryable: boolean = false,
    public readonly retry_after_seconds?: number
  ) {
    super(message);
    this.name = 'SourceError';
  }
}

export class NotFoundError extends SourceError {
  constructor(message: string, source?: string) {
    super(message, 'NOT_FOUND', source, false);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends SourceError {
  constructor(source: string, retryAfterSeconds?: number) {
    super('Rate limit exceeded', 'RATE_LIMITED', source, true, retryAfterSeconds);
    this.name = 'RateLimitError';
  }
}

/** Normalize caught values, including legacy thrown objects, without trusting arbitrary codes. */
export function normalizeError(error: unknown, source?: string): ErrorDetails {
  try {
    const value = typeof error === 'object' && error !== null ? error : {};
    const code = 'code' in value ? ErrorCodeSchema.safeParse(value.code) : undefined;
    const timeout =
      error instanceof Error &&
      (error.name === 'TimeoutError' ||
        ('code' in error &&
          [
            'ETIMEDOUT',
            'UND_ERR_HEADERS_TIMEOUT',
            'UND_ERR_BODY_TIMEOUT',
            'UND_ERR_CONNECT_TIMEOUT',
          ].includes(String(error.code))));
    const normalizedCode = code?.success
      ? code.data
      : error instanceof ZodError
        ? 'VALIDATION_ERROR'
        : timeout
          ? 'TIMEOUT'
          : 'SOURCE_ERROR';
    const message =
      'message' in value && typeof value.message === 'string' && value.message
        ? value.message
        : typeof error === 'string' && error
          ? error
          : 'An unknown error occurred';
    const normalizedSource =
      'source' in value && typeof value.source === 'string' ? value.source : source;
    const retryable =
      'retryable' in value && typeof value.retryable === 'boolean'
        ? value.retryable
        : ['RATE_LIMITED', 'TIMEOUT'].includes(normalizedCode);
    const retryAfter =
      'retry_after_seconds' in value &&
      typeof value.retry_after_seconds === 'number' &&
      Number.isFinite(value.retry_after_seconds) &&
      value.retry_after_seconds >= 0
        ? value.retry_after_seconds
        : undefined;
    return {
      code: normalizedCode,
      message,
      ...(normalizedSource !== undefined ? { source: normalizedSource } : {}),
      retryable,
      ...(retryAfter !== undefined ? { retry_after_seconds: retryAfter } : {}),
    };
  } catch {
    return {
      code: 'SOURCE_ERROR',
      message: 'An unknown error occurred',
      ...(source ? { source } : {}),
      retryable: false,
    };
  }
}

/** Classify unsuccessful provider responses without changing the HTTP client's response API. */
export function errorFromHttpStatus(
  source: string,
  status: number,
  retryAfter?: string
): SourceError {
  if (status === 404) return new NotFoundError(`Provider returned HTTP ${status}`, source);
  if (status === 401 || status === 403)
    return new SourceError(`Provider returned HTTP ${status}`, 'AUTH_ERROR', source);
  if (status === 429) {
    let seconds: number | undefined;
    if (retryAfter !== undefined) {
      const value = retryAfter.trim();
      if (/^\d+(?:\.\d+)?$/.test(value)) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) seconds = parsed;
      } else if (/^[A-Za-z]{3}, /.test(value)) {
        const date = Date.parse(value);
        if (Number.isFinite(date)) seconds = Math.max(0, Math.ceil((date - Date.now()) / 1000));
      }
    }
    return new RateLimitError(source, seconds);
  }
  return new SourceError(
    `Provider returned HTTP ${status}`,
    status === 408 ? 'TIMEOUT' : 'SOURCE_ERROR',
    source,
    status >= 500 || status === 408
  );
}
