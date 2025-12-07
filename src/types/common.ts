import { z } from 'zod';

// Confidence levels for metadata
export const ConfidenceLevel = z.enum(['high', 'medium', 'low']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevel>;

// Common metadata about the lookup result
export const MetaSchema = z.object({
  sources_queried: z.array(z.string()),
  primary_source: z.string(),
  sources_failed: z.array(z.string()).optional(),
  confidence: ConfidenceLevel,
  cached: z.boolean(),
  timestamp: z.string().datetime(),
});
export type Meta = z.infer<typeof MetaSchema>;

// Rating from a single source
export const RatingSchema = z.object({
  score: z.number().min(0).max(10),
  count: z.number().int().nonnegative(),
});
export type Rating = z.infer<typeof RatingSchema>;

// Error response schema
export const ErrorCodeSchema = z.enum([
  'NOT_FOUND',
  'RATE_LIMITED',
  'SOURCE_ERROR',
  'VALIDATION_ERROR',
  'AUTH_ERROR',
  'TIMEOUT',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    source: z.string().optional(),
    retryable: z.boolean(),
    retry_after_seconds: z.number().optional(),
  }),
  partial_result: z.unknown().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// Batch lookup item types
export const BatchItemTypeSchema = z.enum(['book', 'movie', 'tv']);
export type BatchItemType = z.infer<typeof BatchItemTypeSchema>;

// Log levels (RFC 5424)
export const LogLevel = z.enum([
  'debug',
  'info',
  'notice',
  'warning',
  'error',
  'critical',
  'alert',
  'emergency',
]);
export type LogLevel = z.infer<typeof LogLevel>;

// Structured log entry
export interface LogEntry {
  level: LogLevel;
  logger: string;
  data: Record<string, unknown>;
  timestamp?: string;
  trace_id?: string;
  span_id?: string;
}
