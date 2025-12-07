import { z } from 'zod';
import { RatingSchema } from './common.js';

// TV show status
export const TVStatusSchema = z.enum([
  'Returning Series',
  'Ended',
  'Canceled',
  'In Production',
  'Planned',
]);
export type TVStatus = z.infer<typeof TVStatusSchema>;

// Episode information
export const EpisodeSchema = z.object({
  episode_number: z.number().int().nonnegative(),
  name: z.string(),
  air_date: z.string().nullable(),
  runtime: z.number().int().nonnegative().nullable(),
  description: z.string(),
});
export type Episode = z.infer<typeof EpisodeSchema>;

// Season information
export const SeasonSchema = z.object({
  season_number: z.number().int().nonnegative(),
  name: z.string(),
  episode_count: z.number().int().nonnegative(),
  air_date: z.string().nullable(),
  episodes: z.array(EpisodeSchema).optional(),
});
export type Season = z.infer<typeof SeasonSchema>;

// TV show ratings
export const TVRatingsSchema = z.object({
  tmdb: RatingSchema.optional(),
  imdb: z.object({
    score: z.number().nullable(),
    id: z.string().nullable(),
  }).optional(),
});
export type TVRatings = z.infer<typeof TVRatingsSchema>;

// TV show identifiers
export const TVIdentifiersSchema = z.object({
  tmdb: z.number().int(),
  imdb: z.string().nullable(),
  tvdb: z.number().int().nullable(),
});
export type TVIdentifiers = z.infer<typeof TVIdentifiersSchema>;

// Input schema for lookup_tv
export const LookupTVInputSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  year: z.number().int().min(1900).max(2100).optional(),
  tmdb_id: z.number().int().positive().optional(),
  include_seasons: z.boolean().default(true),
  include_episodes: z.boolean().default(false),
});
export type LookupTVInput = z.infer<typeof LookupTVInputSchema>;

// Output schema for lookup_tv
export const TVResultSchema = z.object({
  title: z.string(),
  original_title: z.string(),
  first_air_date: z.string(),
  last_air_date: z.string().nullable(),
  status: TVStatusSchema,
  genres: z.array(z.string()),
  description: z.string(),
  tagline: z.string().nullable(),
  poster_url: z.string().url().nullable(),
  backdrop_url: z.string().url().nullable(),
  created_by: z.array(z.string()),
  networks: z.array(z.string()),
  episode_runtime: z.number().int().nonnegative().nullable(),
  total_seasons: z.number().int().nonnegative(),
  total_episodes: z.number().int().nonnegative(),
  seasons: z.array(SeasonSchema),
  ratings: TVRatingsSchema,
  identifiers: TVIdentifiersSchema,
  _meta: z.object({
    source: z.literal('tmdb'),
    cached: z.boolean(),
    timestamp: z.string().datetime(),
  }),
});
export type TVResult = z.infer<typeof TVResultSchema>;
