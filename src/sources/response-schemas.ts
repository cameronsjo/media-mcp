import { z } from 'zod';

const TMDBGenreSchema = z
  .object({
    id: z.number(),
    name: z.string(),
  })
  .passthrough();

const TMDBCrewMemberSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    job: z.string(),
    department: z.string(),
  })
  .passthrough();

const TMDBCastMemberSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    character: z.string(),
    order: z.number(),
  })
  .passthrough();

const TMDBCollectionReferenceSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    poster_path: z.string().nullable().optional().default(null),
    backdrop_path: z.string().nullable().optional().default(null),
  })
  .passthrough();

export const TMDBMovieDetailsSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    original_title: z.string().optional().default(''),
    release_date: z.string().optional().default(''),
    runtime: z.number().nullable().optional().default(null),
    genres: z.array(TMDBGenreSchema),
    overview: z.string().optional().default(''),
    tagline: z.string().optional().default(''),
    poster_path: z.string().nullable().optional().default(null),
    backdrop_path: z.string().nullable().optional().default(null),
    vote_average: z.number().optional().default(0),
    vote_count: z.number().optional().default(0),
    imdb_id: z.string().nullable().optional().default(null),
    belongs_to_collection: TMDBCollectionReferenceSchema.nullable().optional().default(null),
    production_companies: z.array(
      z
        .object({
          id: z.number(),
          name: z.string(),
          logo_path: z.string().nullable().optional().default(null),
          origin_country: z.string().optional().default(''),
        })
        .passthrough()
    ),
  })
  .passthrough();

export const TMDBMovieCreditsSchema = z
  .object({
    cast: z.array(TMDBCastMemberSchema),
    crew: z.array(TMDBCrewMemberSchema),
  })
  .passthrough();

export const TMDBWatchProvidersSchema = z
  .object({
    results: z.record(
      z
        .object({
          link: z.string().optional().default(''),
          flatrate: z
            .array(
              z
                .object({
                  logo_path: z.string().optional().default(''),
                  provider_id: z.number(),
                  provider_name: z.string(),
                  display_priority: z.number().optional().default(0),
                })
                .passthrough()
            )
            .optional(),
          rent: z
            .array(
              z
                .object({
                  logo_path: z.string().optional().default(''),
                  provider_id: z.number(),
                  provider_name: z.string(),
                  display_priority: z.number().optional().default(0),
                })
                .passthrough()
            )
            .optional(),
          buy: z
            .array(
              z
                .object({
                  logo_path: z.string().optional().default(''),
                  provider_id: z.number(),
                  provider_name: z.string(),
                  display_priority: z.number().optional().default(0),
                })
                .passthrough()
            )
            .optional(),
        })
        .passthrough()
    ),
  })
  .passthrough();

export const TMDBSearchResponseSchema = z
  .object({
    page: z.number(),
    total_results: z.number(),
    total_pages: z.number(),
    results: z.array(
      z
        .object({
          id: z.number(),
          title: z.string().optional(),
          name: z.string().optional(),
          release_date: z.string().optional(),
          first_air_date: z.string().optional(),
          vote_average: z.number().optional().default(0),
          popularity: z.number().optional().default(0),
        })
        .passthrough()
    ),
  })
  .passthrough();

export const TMDBTVDetailsSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    original_name: z.string().optional().default(''),
    first_air_date: z.string().optional().default(''),
    last_air_date: z.string().nullable().optional().default(null),
    status: z.string().optional().default(''),
    genres: z.array(TMDBGenreSchema),
    overview: z.string().optional().default(''),
    tagline: z.string().optional().default(''),
    poster_path: z.string().nullable().optional().default(null),
    backdrop_path: z.string().nullable().optional().default(null),
    vote_average: z.number().optional().default(0),
    vote_count: z.number().optional().default(0),
    created_by: z.array(
      z
        .object({
          id: z.number(),
          name: z.string(),
        })
        .passthrough()
    ),
    networks: z.array(
      z
        .object({
          id: z.number(),
          name: z.string(),
        })
        .passthrough()
    ),
    episode_run_time: z.array(z.number()),
    number_of_seasons: z.number(),
    number_of_episodes: z.number(),
    seasons: z.array(
      z
        .object({
          id: z.number(),
          season_number: z.number(),
          name: z.string(),
          episode_count: z.number(),
          air_date: z.string().nullable().optional().default(null),
        })
        .passthrough()
    ),
    external_ids: z
      .object({
        imdb_id: z.string().nullable().optional().default(null),
        tvdb_id: z.number().nullable().optional().default(null),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const TMDBSeasonDetailsSchema = z
  .object({
    id: z.number(),
    season_number: z.number(),
    name: z.string().optional().default(''),
    air_date: z.string().nullable().optional().default(null),
    episodes: z.array(
      z
        .object({
          id: z.number(),
          episode_number: z.number(),
          name: z.string(),
          air_date: z.string().nullable().optional().default(null),
          runtime: z.number().nullable().optional().default(null),
          overview: z.string().optional().default(''),
        })
        .passthrough()
    ),
  })
  .passthrough();

export const TMDBCollectionDetailsSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    overview: z.string().optional().default(''),
    poster_path: z.string().nullable().optional().default(null),
    backdrop_path: z.string().nullable().optional().default(null),
    parts: z.array(
      z
        .object({
          id: z.number(),
          title: z.string(),
          release_date: z.string().optional().default(''),
        })
        .passthrough()
    ),
  })
  .passthrough();

const OpenLibraryDescriptionSchema = z.union([
  z.string(),
  z.object({ value: z.string() }).passthrough(),
]);

const OpenLibraryOptionalMetadata = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullish().transform((value) => value ?? undefined);

export const OpenLibraryISBNResponseSchema = z
  .object({
    title: z.string(),
    publishers: OpenLibraryOptionalMetadata(z.array(z.string())),
    publish_date: OpenLibraryOptionalMetadata(z.string()),
    number_of_pages: OpenLibraryOptionalMetadata(z.number()),
    isbn_10: OpenLibraryOptionalMetadata(z.array(z.string())),
    isbn_13: OpenLibraryOptionalMetadata(z.array(z.string())),
    covers: OpenLibraryOptionalMetadata(z.array(z.number())),
    description: OpenLibraryOptionalMetadata(OpenLibraryDescriptionSchema),
    works: OpenLibraryOptionalMetadata(z.array(z.object({ key: z.string() }).passthrough())),
    authors: OpenLibraryOptionalMetadata(z.array(z.object({ key: z.string() }).passthrough())),
  })
  .passthrough();

export const OpenLibrarySearchResponseSchema = z
  .object({
    numFound: z.number(),
    start: z.number(),
    docs: z.array(
      z
        .object({
          key: z.string(),
          title: z.string(),
          author_name: OpenLibraryOptionalMetadata(z.array(z.string())),
          author_key: OpenLibraryOptionalMetadata(z.array(z.string())),
          first_publish_year: OpenLibraryOptionalMetadata(z.number()),
          isbn: OpenLibraryOptionalMetadata(z.array(z.string())),
          publisher: OpenLibraryOptionalMetadata(z.array(z.string())),
          subject: OpenLibraryOptionalMetadata(z.array(z.string())),
          number_of_pages_median: OpenLibraryOptionalMetadata(z.number()),
          cover_i: OpenLibraryOptionalMetadata(z.number()),
          ratings_average: OpenLibraryOptionalMetadata(z.number()),
          ratings_count: OpenLibraryOptionalMetadata(z.number()),
        })
        .passthrough()
    ),
  })
  .passthrough();

export const OpenLibraryWorkResponseSchema = z
  .object({
    title: z.string(),
    description: OpenLibraryOptionalMetadata(OpenLibraryDescriptionSchema),
    subjects: OpenLibraryOptionalMetadata(z.array(z.string())),
    subject_places: OpenLibraryOptionalMetadata(z.array(z.string())),
    subject_people: OpenLibraryOptionalMetadata(z.array(z.string())),
    subject_times: OpenLibraryOptionalMetadata(z.array(z.string())),
    covers: OpenLibraryOptionalMetadata(z.array(z.number())),
  })
  .passthrough();

const GoogleBooksVolumeInfoSchema = z
  .object({
    title: z.string(),
    subtitle: z.string().optional(),
    authors: z.array(z.string()).optional(),
    publisher: z.string().optional(),
    publishedDate: z.string().optional(),
    description: z.string().optional(),
    industryIdentifiers: z
      .array(
        z
          .object({
            type: z.string(),
            identifier: z.string(),
          })
          .passthrough()
      )
      .optional(),
    pageCount: z.number().optional(),
    categories: z.array(z.string()).optional(),
    averageRating: z.number().optional(),
    ratingsCount: z.number().optional(),
    imageLinks: z
      .object({
        smallThumbnail: z.string().optional(),
        thumbnail: z.string().optional(),
        small: z.string().optional(),
        medium: z.string().optional(),
        large: z.string().optional(),
      })
      .passthrough()
      .optional(),
    language: z.string().optional(),
    previewLink: z.string().optional(),
    infoLink: z.string().optional(),
  })
  .passthrough();

export const GoogleBooksVolumeSchema = z
  .object({
    id: z.string(),
    volumeInfo: GoogleBooksVolumeInfoSchema,
  })
  .passthrough();

export const GoogleBooksSearchResponseSchema = z
  .object({
    kind: z.string(),
    totalItems: z.number(),
    items: z.array(GoogleBooksVolumeSchema).optional(),
  })
  .passthrough();

export const GoodreadsHTMLSchema = z.string();

const HardcoverAuthorSchema = z.object({ name: z.string() }).passthrough();
const HardcoverContributionSchema = z
  .object({
    author: HardcoverAuthorSchema.nullable(),
  })
  .passthrough();

export const HardcoverBookSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    slug: z.string(),
    description: z.string().nullable().optional().default(null),
    pages: z.number().nullable().optional().default(null),
    release_date: z.string().nullable().optional().default(null),
    rating: z.number().nullable().optional().default(null),
    ratings_count: z.number().nullable().optional().default(null),
    cached_tags: z
      .record(
        z.array(
          z
            .object({
              tag: z.string(),
              count: z.number(),
            })
            .passthrough()
        )
      )
      .nullable()
      .optional()
      .default(null),
    cached_contributors: z.array(HardcoverContributionSchema).nullable().optional().default(null),
    contributions: z.array(HardcoverContributionSchema).optional().default([]),
    image: z
      .object({ url: z.string().nullable() })
      .passthrough()
      .nullable()
      .optional()
      .default(null),
    book_series: z
      .array(
        z
          .object({
            series: z
              .object({
                name: z.string(),
                id: z.number(),
              })
              .passthrough()
              .nullable(),
            position: z.number().nullable(),
          })
          .passthrough()
      )
      .optional()
      .default([]),
    default_physical_edition: z
      .object({
        isbn_10: z.string().nullable(),
        isbn_13: z.string().nullable(),
      })
      .passthrough()
      .nullable()
      .optional()
      .default(null),
  })
  .passthrough();

const HardcoverSearchDocumentSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    slug: z.string(),
    author_names: z.array(z.string()).optional().default([]),
    image_url: z.string().nullable().optional().default(null),
  })
  .passthrough();

export const HardcoverSearchPayloadSchema = z
  .object({
    search: z
      .object({
        results: z
          .object({
            hits: z.array(
              z
                .object({
                  document: HardcoverSearchDocumentSchema,
                })
                .passthrough()
            ),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

export const HardcoverBooksPayloadSchema = z
  .object({
    books: z.array(HardcoverBookSchema),
  })
  .passthrough();

export const HardcoverEditionsPayloadSchema = z
  .object({
    editions: z.array(z.object({ book: HardcoverBookSchema }).passthrough()),
  })
  .passthrough();

export const HardcoverGraphQLErrorSchema = z.object({ message: z.string() }).passthrough();

export type TMDBMovieDetails = z.infer<typeof TMDBMovieDetailsSchema>;
export type TMDBMovieCredits = z.infer<typeof TMDBMovieCreditsSchema>;
export type TMDBWatchProviders = z.infer<typeof TMDBWatchProvidersSchema>;
export type TMDBSearchResponse = z.infer<typeof TMDBSearchResponseSchema>;
export type TMDBSearchResult = TMDBSearchResponse['results'][number];
export type TMDBTVDetails = z.infer<typeof TMDBTVDetailsSchema>;
export type TMDBSeasonDetails = z.infer<typeof TMDBSeasonDetailsSchema>;
export type TMDBCollectionDetails = z.infer<typeof TMDBCollectionDetailsSchema>;

export type OpenLibraryISBNResponse = z.infer<typeof OpenLibraryISBNResponseSchema>;
export type OpenLibrarySearchResponse = z.infer<typeof OpenLibrarySearchResponseSchema>;
export type OpenLibrarySearchDoc = OpenLibrarySearchResponse['docs'][number];
export type OpenLibraryWorkResponse = z.infer<typeof OpenLibraryWorkResponseSchema>;

export type GoogleBooksVolume = z.infer<typeof GoogleBooksVolumeSchema>;
export type GoogleBooksVolumeInfo = GoogleBooksVolume['volumeInfo'];
export type GoogleBooksSearchResponse = z.infer<typeof GoogleBooksSearchResponseSchema>;

export type HardcoverBookResult = z.infer<typeof HardcoverBookSchema>;
export type HardcoverSearchResult = z.infer<typeof HardcoverSearchPayloadSchema>['search'];
