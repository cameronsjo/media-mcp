import { HttpClient, Logger, RateLimiter } from '../utils/index.js';
import { SQLiteCache, CacheTTL } from '../cache/sqlite-cache.js';
import type { MovieResult, CastMember, MovieCollection } from '../types/movie.js';
import type { TVResult, Season, Episode, TVStatus } from '../types/tv.js';

const SOURCE = 'tmdb';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

// TMDB API response types
interface TMDBGenre {
  id: number;
  name: string;
}

interface TMDBProductionCompany {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

interface TMDBCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
}

interface TMDBCastMember {
  id: number;
  name: string;
  character: string;
  order: number;
}

interface TMDBMovieDetails {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  runtime: number;
  genres: TMDBGenre[];
  overview: string;
  tagline: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  imdb_id: string | null;
  belongs_to_collection: {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
  } | null;
  production_companies: TMDBProductionCompany[];
}

interface TMDBMovieCredits {
  cast: TMDBCastMember[];
  crew: TMDBCrewMember[];
}

interface TMDBWatchProvider {
  logo_path: string;
  provider_id: number;
  provider_name: string;
  display_priority: number;
}

interface TMDBWatchProviders {
  results: Record<string, {
    link: string;
    flatrate?: TMDBWatchProvider[];
    rent?: TMDBWatchProvider[];
    buy?: TMDBWatchProvider[];
  }>;
}

interface TMDBCollectionDetails {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: {
    id: number;
    title: string;
    release_date: string;
  }[];
}

interface TMDBSearchResult {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  popularity: number;
}

interface TMDBSearchResponse {
  page: number;
  total_results: number;
  total_pages: number;
  results: TMDBSearchResult[];
}

interface TMDBTVDetails {
  id: number;
  name: string;
  original_name: string;
  first_air_date: string;
  last_air_date: string | null;
  status: string;
  genres: TMDBGenre[];
  overview: string;
  tagline: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  created_by: { id: number; name: string }[];
  networks: { id: number; name: string }[];
  episode_run_time: number[];
  number_of_seasons: number;
  number_of_episodes: number;
  seasons: {
    id: number;
    season_number: number;
    name: string;
    episode_count: number;
    air_date: string | null;
  }[];
  external_ids?: {
    imdb_id: string | null;
    tvdb_id: number | null;
  };
}

interface TMDBSeasonDetails {
  id: number;
  season_number: number;
  name: string;
  air_date: string | null;
  episodes: {
    id: number;
    episode_number: number;
    name: string;
    air_date: string | null;
    runtime: number | null;
    overview: string;
  }[];
}

export class TMDBSource {
  private client: HttpClient;
  private cache: SQLiteCache;
  private logger: Logger;

  constructor(
    apiKey: string,
    cache: SQLiteCache,
    logger: Logger,
    rateLimiter: RateLimiter
  ) {
    this.cache = cache;
    this.logger = logger;

    // Configure rate limiting - TMDB allows 40 requests per 10 seconds
    rateLimiter.configure(SOURCE, {
      requestsPerWindow: 40,
      windowMs: 10000,
    });

    this.client = new HttpClient(
      SOURCE,
      {
        baseUrl: BASE_URL,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      },
      logger,
      rateLimiter
    );
  }

  /**
   * Search for a movie by title and optional year
   */
  async searchMovie(title: string, year?: number): Promise<number | null> {
    const cacheKey = SQLiteCache.makeKey(SOURCE, 'search-movie', title, year);

    const cached = this.cache.get<number>(cacheKey);
    if (cached) {
      return cached.value;
    }

    try {
      const response = await this.client.get<TMDBSearchResponse>('/search/movie', {
        params: {
          query: title,
          year,
          include_adult: false,
        },
      });

      if (response.status !== 200 || response.data.total_results === 0) {
        return null;
      }

      // Find best match
      const match = this.findBestMovieMatch(response.data.results, title, year);
      if (!match) return null;

      this.cache.set(cacheKey, match.id, SOURCE, CacheTTL.SEARCH_RESULTS);
      return match.id;
    } catch (error) {
      this.logger.error('tmdb', {
        action: 'search_movie_failed',
        title,
        year,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get movie details by TMDB ID
   */
  async getMovieDetails(tmdbId: number): Promise<MovieResult | null> {
    const cacheKey = SQLiteCache.makeKey(SOURCE, 'movie', tmdbId);

    const cached = this.cache.get<MovieResult>(cacheKey);
    if (cached) {
      return { ...cached.value, _meta: { ...cached.value._meta, cached: true } };
    }

    try {
      // Fetch movie details, credits, and watch providers in parallel
      const [detailsRes, creditsRes, providersRes] = await Promise.all([
        this.client.get<TMDBMovieDetails>(`/movie/${tmdbId}`, {
          params: { append_to_response: 'external_ids' },
        }),
        this.client.get<TMDBMovieCredits>(`/movie/${tmdbId}/credits`),
        this.client.get<TMDBWatchProviders>(`/movie/${tmdbId}/watch/providers`),
      ]);

      if (detailsRes.status !== 200) {
        return null;
      }

      const details = detailsRes.data;
      const credits = creditsRes.status === 200 ? creditsRes.data : null;
      const providers = providersRes.status === 200 ? providersRes.data : null;

      // Get collection details if part of a collection
      let collection: MovieCollection = { name: null, position: null, total_films: null };
      if (details.belongs_to_collection) {
        collection = await this.getCollectionPosition(
          details.belongs_to_collection.id,
          tmdbId
        );
      }

      // Build result
      const directors = credits?.crew
        .filter(c => c.job === 'Director')
        .map(c => c.name) ?? [];

      const cast: CastMember[] = credits?.cast
        .slice(0, 10)
        .map(c => ({ name: c.name, character: c.character })) ?? [];

      const watchProviders = this.buildWatchProviders(providers);

      const result: MovieResult = {
        title: details.title,
        original_title: details.original_title,
        year: new Date(details.release_date).getFullYear(),
        release_date: details.release_date,
        runtime_minutes: details.runtime || 0,
        genres: details.genres.map(g => g.name),
        description: details.overview,
        tagline: details.tagline || null,
        poster_url: this.getImageUrl(details.poster_path, 'w500'),
        backdrop_url: this.getImageUrl(details.backdrop_path, 'w1280'),
        director: directors[0] ?? null,
        directors,
        cast,
        collection,
        ratings: {
          tmdb: {
            score: Math.round(details.vote_average * 10) / 10,
            count: details.vote_count,
          },
          imdb: {
            score: null, // Would need separate IMDB API call
            id: details.imdb_id,
          },
        },
        watch_providers: watchProviders,
        identifiers: {
          tmdb: details.id,
          imdb: details.imdb_id,
        },
        _meta: {
          source: 'tmdb',
          cached: false,
          timestamp: new Date().toISOString(),
        },
      };

      this.cache.set(cacheKey, result, SOURCE, CacheTTL.MOVIE_TV_METADATA);
      return result;
    } catch (error) {
      this.logger.error('tmdb', {
        action: 'get_movie_failed',
        tmdb_id: tmdbId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Search for a TV show by title and optional year
   */
  async searchTV(title: string, year?: number): Promise<number | null> {
    const cacheKey = SQLiteCache.makeKey(SOURCE, 'search-tv', title, year);

    const cached = this.cache.get<number>(cacheKey);
    if (cached) {
      return cached.value;
    }

    try {
      const response = await this.client.get<TMDBSearchResponse>('/search/tv', {
        params: {
          query: title,
          first_air_date_year: year,
        },
      });

      if (response.status !== 200 || response.data.total_results === 0) {
        return null;
      }

      // Find best match
      const match = this.findBestTVMatch(response.data.results, title, year);
      if (!match) return null;

      this.cache.set(cacheKey, match.id, SOURCE, CacheTTL.SEARCH_RESULTS);
      return match.id;
    } catch (error) {
      this.logger.error('tmdb', {
        action: 'search_tv_failed',
        title,
        year,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get TV show details by TMDB ID
   */
  async getTVDetails(
    tmdbId: number,
    includeSeasons: boolean = true,
    includeEpisodes: boolean = false
  ): Promise<TVResult | null> {
    const cacheKey = SQLiteCache.makeKey(
      SOURCE,
      'tv',
      tmdbId,
      includeSeasons ? 'seasons' : 'no-seasons',
      includeEpisodes ? 'episodes' : 'no-episodes'
    );

    const cached = this.cache.get<TVResult>(cacheKey);
    if (cached) {
      return { ...cached.value, _meta: { ...cached.value._meta, cached: true } };
    }

    try {
      const response = await this.client.get<TMDBTVDetails>(`/tv/${tmdbId}`, {
        params: { append_to_response: 'external_ids' },
      });

      if (response.status !== 200) {
        return null;
      }

      const details = response.data;

      // Build seasons array
      let seasons: Season[] = [];
      if (includeSeasons) {
        seasons = await this.buildSeasons(
          tmdbId,
          details.seasons,
          includeEpisodes
        );
      }

      // Map status
      const statusMap: Record<string, TVStatus> = {
        'Returning Series': 'Returning Series',
        'Ended': 'Ended',
        'Canceled': 'Canceled',
        'In Production': 'In Production',
        'Planned': 'Planned',
      };

      const result: TVResult = {
        title: details.name,
        original_title: details.original_name,
        first_air_date: details.first_air_date,
        last_air_date: details.last_air_date,
        status: statusMap[details.status] ?? 'Ended',
        genres: details.genres.map(g => g.name),
        description: details.overview,
        tagline: details.tagline || null,
        poster_url: this.getImageUrl(details.poster_path, 'w500'),
        backdrop_url: this.getImageUrl(details.backdrop_path, 'w1280'),
        created_by: details.created_by.map(c => c.name),
        networks: details.networks.map(n => n.name),
        episode_runtime: details.episode_run_time[0] ?? null,
        total_seasons: details.number_of_seasons,
        total_episodes: details.number_of_episodes,
        seasons,
        ratings: {
          tmdb: {
            score: Math.round(details.vote_average * 10) / 10,
            count: details.vote_count,
          },
          imdb: {
            score: null,
            id: details.external_ids?.imdb_id ?? null,
          },
        },
        identifiers: {
          tmdb: details.id,
          imdb: details.external_ids?.imdb_id ?? null,
          tvdb: details.external_ids?.tvdb_id ?? null,
        },
        _meta: {
          source: 'tmdb',
          cached: false,
          timestamp: new Date().toISOString(),
        },
      };

      // Use shorter TTL for active shows
      const ttl = details.status === 'Returning Series'
        ? CacheTTL.TV_EPISODES
        : CacheTTL.MOVIE_TV_METADATA;

      this.cache.set(cacheKey, result, SOURCE, ttl);
      return result;
    } catch (error) {
      this.logger.error('tmdb', {
        action: 'get_tv_failed',
        tmdb_id: tmdbId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Build seasons array with optional episode details
   */
  private async buildSeasons(
    tvId: number,
    basicSeasons: TMDBTVDetails['seasons'],
    includeEpisodes: boolean
  ): Promise<Season[]> {
    const seasons: Season[] = [];

    for (const s of basicSeasons) {
      // Skip specials (season 0) unless explicitly included
      if (s.season_number === 0) continue;

      let episodes: Episode[] | undefined;

      if (includeEpisodes) {
        const seasonDetails = await this.getSeasonDetails(tvId, s.season_number);
        if (seasonDetails) {
          episodes = seasonDetails.episodes.map(e => ({
            episode_number: e.episode_number,
            name: e.name,
            air_date: e.air_date,
            runtime: e.runtime,
            description: e.overview,
          }));
        }
      }

      seasons.push({
        season_number: s.season_number,
        name: s.name,
        episode_count: s.episode_count,
        air_date: s.air_date,
        episodes,
      });
    }

    return seasons;
  }

  /**
   * Get season details including episodes
   */
  private async getSeasonDetails(
    tvId: number,
    seasonNumber: number
  ): Promise<TMDBSeasonDetails | null> {
    const cacheKey = SQLiteCache.makeKey(SOURCE, 'season', tvId, seasonNumber);

    const cached = this.cache.get<TMDBSeasonDetails>(cacheKey);
    if (cached) {
      return cached.value;
    }

    try {
      const response = await this.client.get<TMDBSeasonDetails>(
        `/tv/${tvId}/season/${seasonNumber}`
      );

      if (response.status !== 200) {
        return null;
      }

      this.cache.set(cacheKey, response.data, SOURCE, CacheTTL.TV_EPISODES);
      return response.data;
    } catch {
      return null;
    }
  }

  /**
   * Get collection details and find movie position
   */
  private async getCollectionPosition(
    collectionId: number,
    movieId: number
  ): Promise<MovieCollection> {
    const cacheKey = SQLiteCache.makeKey(SOURCE, 'collection', collectionId);

    const cached = this.cache.get<TMDBCollectionDetails>(cacheKey);
    let collection: TMDBCollectionDetails | null = cached?.value ?? null;

    if (!collection) {
      try {
        const response = await this.client.get<TMDBCollectionDetails>(
          `/collection/${collectionId}`
        );

        if (response.status === 200) {
          collection = response.data;
          this.cache.set(cacheKey, collection, SOURCE, CacheTTL.MOVIE_TV_METADATA);
        }
      } catch {
        return { name: null, position: null, total_films: null };
      }
    }

    if (!collection) {
      return { name: null, position: null, total_films: null };
    }

    // Sort parts by release date to find position
    const sortedParts = collection.parts
      .filter(p => p.release_date)
      .sort((a, b) => a.release_date.localeCompare(b.release_date));

    const position = sortedParts.findIndex(p => p.id === movieId) + 1;

    return {
      name: collection.name,
      position: position > 0 ? position : null,
      total_films: sortedParts.length,
    };
  }

  /**
   * Build watch providers object from TMDB response
   */
  private buildWatchProviders(
    providers: TMDBWatchProviders | null
  ): MovieResult['watch_providers'] {
    if (!providers?.results) return {};

    const result: MovieResult['watch_providers'] = {};

    for (const [region, data] of Object.entries(providers.results)) {
      result[region] = {
        stream: data.flatrate?.map(p => p.provider_name),
        rent: data.rent?.map(p => p.provider_name),
        buy: data.buy?.map(p => p.provider_name),
      };
    }

    return result;
  }

  /**
   * Build image URL from path
   */
  private getImageUrl(
    path: string | null,
    size: string = 'original'
  ): string | null {
    if (!path) return null;
    return `${IMAGE_BASE_URL}/${size}${path}`;
  }

  /**
   * Find best matching movie from search results
   */
  private findBestMovieMatch(
    results: TMDBSearchResult[],
    title: string,
    year?: number
  ): TMDBSearchResult | null {
    if (results.length === 0) return null;

    const normalizedTitle = this.normalize(title);

    const scored = results.map(r => {
      let score = 0;

      // Title match
      const resultTitle = this.normalize(r.title || '');
      if (resultTitle === normalizedTitle) {
        score += 100;
      } else if (resultTitle.includes(normalizedTitle)) {
        score += 50;
      }

      // Year match
      if (year && r.release_date) {
        const resultYear = new Date(r.release_date).getFullYear();
        if (resultYear === year) {
          score += 50;
        } else if (Math.abs(resultYear - year) <= 1) {
          score += 25;
        }
      }

      // Popularity bonus
      score += Math.min(r.popularity / 10, 20);

      return { result: r, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored[0].score >= 50 ? scored[0].result : null;
  }

  /**
   * Find best matching TV show from search results
   */
  private findBestTVMatch(
    results: TMDBSearchResult[],
    title: string,
    year?: number
  ): TMDBSearchResult | null {
    if (results.length === 0) return null;

    const normalizedTitle = this.normalize(title);

    const scored = results.map(r => {
      let score = 0;

      // Title match
      const resultTitle = this.normalize(r.name || '');
      if (resultTitle === normalizedTitle) {
        score += 100;
      } else if (resultTitle.includes(normalizedTitle)) {
        score += 50;
      }

      // Year match
      if (year && r.first_air_date) {
        const resultYear = new Date(r.first_air_date).getFullYear();
        if (resultYear === year) {
          score += 50;
        } else if (Math.abs(resultYear - year) <= 1) {
          score += 25;
        }
      }

      // Popularity bonus
      score += Math.min(r.popularity / 10, 20);

      return { result: r, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored[0].score >= 50 ? scored[0].result : null;
  }

  /**
   * Normalize string for comparison
   */
  private normalize(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
