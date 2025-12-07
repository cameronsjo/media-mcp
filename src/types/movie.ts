import { z } from 'zod';
import { RatingSchema } from './common.js';

// Cast member
export const CastMemberSchema = z.object({
  name: z.string(),
  character: z.string(),
});
export type CastMember = z.infer<typeof CastMemberSchema>;

// Movie collection (e.g., "The Lord of the Rings Collection")
export const MovieCollectionSchema = z.object({
  name: z.string().nullable(),
  position: z.number().nullable(),
  total_films: z.number().nullable(),
});
export type MovieCollection = z.infer<typeof MovieCollectionSchema>;

// Watch providers by type
export const WatchProvidersSchema = z.object({
  stream: z.array(z.string()).optional(),
  rent: z.array(z.string()).optional(),
  buy: z.array(z.string()).optional(),
});
export type WatchProviders = z.infer<typeof WatchProvidersSchema>;

// Watch providers by region
export const RegionalWatchProvidersSchema = z.record(z.string(), WatchProvidersSchema);
export type RegionalWatchProviders = z.infer<typeof RegionalWatchProvidersSchema>;

// Movie ratings from multiple sources
export const MovieRatingsSchema = z.object({
  tmdb: RatingSchema.optional(),
  imdb: z.object({
    score: z.number().nullable(),
    id: z.string().nullable(),
  }).optional(),
});
export type MovieRatings = z.infer<typeof MovieRatingsSchema>;

// Movie identifiers
export const MovieIdentifiersSchema = z.object({
  tmdb: z.number().int(),
  imdb: z.string().nullable(),
});
export type MovieIdentifiers = z.infer<typeof MovieIdentifiersSchema>;

// Input schema for lookup_movie
export const LookupMovieInputSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  year: z.number().int().min(1800).max(2100).optional(),
  tmdb_id: z.number().int().positive().optional(),
});
export type LookupMovieInput = z.infer<typeof LookupMovieInputSchema>;

// Output schema for lookup_movie
export const MovieResultSchema = z.object({
  title: z.string(),
  original_title: z.string(),
  year: z.number().int(),
  release_date: z.string(),
  runtime_minutes: z.number().int().nonnegative(),
  genres: z.array(z.string()),
  description: z.string(),
  tagline: z.string().nullable(),
  poster_url: z.string().url().nullable(),
  backdrop_url: z.string().url().nullable(),
  director: z.string().nullable(),
  directors: z.array(z.string()),
  cast: z.array(CastMemberSchema),
  collection: MovieCollectionSchema,
  ratings: MovieRatingsSchema,
  watch_providers: RegionalWatchProvidersSchema,
  identifiers: MovieIdentifiersSchema,
  _meta: z.object({
    source: z.literal('tmdb'),
    cached: z.boolean(),
    timestamp: z.string().datetime(),
  }),
});
export type MovieResult = z.infer<typeof MovieResultSchema>;
