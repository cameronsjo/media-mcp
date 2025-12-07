import { z } from 'zod';
import { MetaSchema, RatingSchema } from './common.js';

// Book sources
export const BookSourceSchema = z.enum([
  'open_library',
  'google_books',
  'goodreads',
  'hardcover',
]);
export type BookSource = z.infer<typeof BookSourceSchema>;

// Series information
export const BookSeriesSchema = z.object({
  name: z.string().nullable(),
  position: z.number().nullable(),
  total_books: z.number().nullable(),
});
export type BookSeries = z.infer<typeof BookSeriesSchema>;

// Book identifiers
export const BookIdentifiersSchema = z.object({
  open_library: z.string().nullable(),
  goodreads: z.string().nullable(),
  google_books: z.string().nullable(),
  hardcover: z.string().nullable(),
});
export type BookIdentifiers = z.infer<typeof BookIdentifiersSchema>;

// Book ratings from multiple sources
export const BookRatingsSchema = z.object({
  goodreads: RatingSchema.optional(),
  open_library: RatingSchema.optional(),
  google_books: RatingSchema.optional(),
});
export type BookRatings = z.infer<typeof BookRatingsSchema>;

// Book source URLs
export const BookSourceUrlsSchema = z.object({
  goodreads: z.string().url().nullable(),
  open_library: z.string().url().nullable(),
  google_books: z.string().url().nullable(),
});
export type BookSourceUrls = z.infer<typeof BookSourceUrlsSchema>;

// Input schema for lookup_book
export const LookupBookInputSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  author: z.string().optional(),
  isbn: z.string().optional(),
  sources: z.array(BookSourceSchema).optional(),
});
export type LookupBookInput = z.infer<typeof LookupBookInputSchema>;

// Output schema for lookup_book
export const BookResultSchema = z.object({
  title: z.string(),
  author: z.string(),
  authors: z.array(z.string()),
  isbn_10: z.string().nullable(),
  isbn_13: z.string().nullable(),
  genres: z.array(z.string()),
  subjects: z.array(z.string()),
  page_count: z.number().int().positive().nullable(),
  publish_date: z.string().nullable(),
  publisher: z.string().nullable(),
  description: z.string().nullable(),
  cover_url: z.string().url().nullable(),
  series: BookSeriesSchema,
  ratings: BookRatingsSchema,
  identifiers: BookIdentifiersSchema,
  source_urls: BookSourceUrlsSchema,
  _meta: MetaSchema,
});
export type BookResult = z.infer<typeof BookResultSchema>;

// Partial book data from a single source (before merging)
export interface PartialBookData {
  title?: string;
  author?: string;
  authors?: string[];
  isbn_10?: string | null;
  isbn_13?: string | null;
  genres?: string[];
  subjects?: string[];
  page_count?: number | null;
  publish_date?: string | null;
  publisher?: string | null;
  description?: string | null;
  cover_url?: string | null;
  series?: Partial<BookSeries>;
  rating?: { score: number; count: number };
  identifier?: string;
  source_url?: string;
  source: BookSource;
}
