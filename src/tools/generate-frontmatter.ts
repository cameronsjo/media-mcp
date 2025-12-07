import { z } from 'zod';
import type { BookResult } from '../types/book.js';
import type { MovieResult } from '../types/movie.js';
import type { TVResult } from '../types/tv.js';
import { Logger } from '../utils/logger.js';

export const GenerateFrontmatterInputSchema = z.object({
  lookup_result: z.unknown().describe('Result from any lookup_* tool'),
  template: z.enum(['default', 'minimal', 'full']).default('default')
    .describe('Frontmatter template style'),
  custom_fields: z.record(z.string(), z.string()).optional()
    .describe('Custom field mappings using JSONPath expressions'),
});

export type GenerateFrontmatterInput = z.infer<typeof GenerateFrontmatterInputSchema>;

type LookupResult = BookResult | MovieResult | TVResult;

export class GenerateFrontmatterTool {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async execute(input: GenerateFrontmatterInput): Promise<string> {
    this.logger.info('generate-frontmatter', {
      action: 'start',
      template: input.template,
    });

    const result = input.lookup_result as LookupResult;
    const mediaType = this.detectMediaType(result);

    let frontmatter: Record<string, unknown>;

    switch (mediaType) {
      case 'book':
        frontmatter = this.generateBookFrontmatter(
          result as BookResult,
          input.template
        );
        break;
      case 'movie':
        frontmatter = this.generateMovieFrontmatter(
          result as MovieResult,
          input.template
        );
        break;
      case 'tv':
        frontmatter = this.generateTVFrontmatter(
          result as TVResult,
          input.template
        );
        break;
      default:
        throw {
          code: 'VALIDATION_ERROR',
          message: 'Unable to determine media type from lookup result',
          retryable: false,
        };
    }

    // Add custom fields if provided
    if (input.custom_fields) {
      for (const [key, path] of Object.entries(input.custom_fields)) {
        const value = this.getValueByPath(result, path);
        if (value !== undefined) {
          frontmatter[key] = value;
        }
      }
    }

    const yaml = this.toYAML(frontmatter);

    this.logger.info('generate-frontmatter', {
      action: 'complete',
      media_type: mediaType,
      template: input.template,
      field_count: Object.keys(frontmatter).length,
    });

    return `---\n${yaml}---`;
  }

  private detectMediaType(result: LookupResult): 'book' | 'movie' | 'tv' {
    // Check for book-specific fields
    if ('isbn_10' in result || 'isbn_13' in result || 'page_count' in result) {
      return 'book';
    }

    // Check for TV-specific fields
    if ('total_seasons' in result || 'first_air_date' in result || 'networks' in result) {
      return 'tv';
    }

    // Check for movie-specific fields
    if ('runtime_minutes' in result || 'release_date' in result || 'director' in result) {
      return 'movie';
    }

    throw new Error('Unable to determine media type');
  }

  private generateBookFrontmatter(
    book: BookResult,
    template: string
  ): Record<string, unknown> {
    const minimal: Record<string, unknown> = {
      title: book.title,
      author: book.author,
      type: 'book',
    };

    if (template === 'minimal') {
      return minimal;
    }

    const defaultFields: Record<string, unknown> = {
      ...minimal,
      authors: book.authors.length > 1 ? book.authors : undefined,
      series: book.series.name || undefined,
      series_position: book.series.position || undefined,
      genres: book.genres.length > 0 ? book.genres : undefined,
      page_count: book.page_count || undefined,
      rating: this.getBestRating(book.ratings),
      cover: book.cover_url || undefined,
      goodreads: book.source_urls.goodreads || undefined,
      isbn: book.isbn_13 || book.isbn_10 || undefined,
      status: 'unread',
      date_added: new Date().toISOString().split('T')[0],
    };

    if (template === 'default') {
      return this.removeUndefined(defaultFields);
    }

    // Full template
    const fullFields: Record<string, unknown> = {
      ...defaultFields,
      publisher: book.publisher || undefined,
      publish_date: book.publish_date || undefined,
      description: book.description || undefined,
      subjects: book.subjects.length > 0 ? book.subjects : undefined,
      open_library: book.source_urls.open_library || undefined,
      identifiers: {
        isbn_10: book.isbn_10 || undefined,
        isbn_13: book.isbn_13 || undefined,
        open_library: book.identifiers.open_library || undefined,
        goodreads: book.identifiers.goodreads || undefined,
      },
    };

    return this.removeUndefined(fullFields);
  }

  private generateMovieFrontmatter(
    movie: MovieResult,
    template: string
  ): Record<string, unknown> {
    const minimal: Record<string, unknown> = {
      title: movie.title,
      year: movie.year,
      type: 'movie',
    };

    if (template === 'minimal') {
      return minimal;
    }

    const defaultFields: Record<string, unknown> = {
      ...minimal,
      director: movie.director || undefined,
      genres: movie.genres.length > 0 ? movie.genres : undefined,
      runtime: movie.runtime_minutes || undefined,
      rating: movie.ratings.tmdb?.score || undefined,
      poster: movie.poster_url || undefined,
      imdb: movie.identifiers.imdb
        ? `https://www.imdb.com/title/${movie.identifiers.imdb}`
        : undefined,
      collection: movie.collection.name || undefined,
      collection_position: movie.collection.position || undefined,
      status: 'unwatched',
      date_added: new Date().toISOString().split('T')[0],
    };

    if (template === 'default') {
      return this.removeUndefined(defaultFields);
    }

    // Full template
    const usProviders = movie.watch_providers['US'];
    const fullFields: Record<string, unknown> = {
      ...defaultFields,
      original_title: movie.original_title !== movie.title
        ? movie.original_title
        : undefined,
      release_date: movie.release_date || undefined,
      tagline: movie.tagline || undefined,
      description: movie.description || undefined,
      backdrop: movie.backdrop_url || undefined,
      directors: movie.directors.length > 1 ? movie.directors : undefined,
      cast: movie.cast.slice(0, 5).map(c => `${c.name} (${c.character})`),
      streaming: usProviders?.stream || undefined,
      rent: usProviders?.rent || undefined,
      buy: usProviders?.buy || undefined,
      identifiers: {
        tmdb: movie.identifiers.tmdb,
        imdb: movie.identifiers.imdb || undefined,
      },
    };

    return this.removeUndefined(fullFields);
  }

  private generateTVFrontmatter(
    tv: TVResult,
    template: string
  ): Record<string, unknown> {
    const year = new Date(tv.first_air_date).getFullYear();

    const minimal: Record<string, unknown> = {
      title: tv.title,
      year,
      type: 'tv',
    };

    if (template === 'minimal') {
      return minimal;
    }

    const defaultFields: Record<string, unknown> = {
      ...minimal,
      status: tv.status,
      genres: tv.genres.length > 0 ? tv.genres : undefined,
      seasons: tv.total_seasons,
      episodes: tv.total_episodes,
      rating: tv.ratings.tmdb?.score || undefined,
      poster: tv.poster_url || undefined,
      networks: tv.networks.length > 0 ? tv.networks : undefined,
      imdb: tv.identifiers.imdb
        ? `https://www.imdb.com/title/${tv.identifiers.imdb}`
        : undefined,
      watch_status: 'unwatched',
      date_added: new Date().toISOString().split('T')[0],
    };

    if (template === 'default') {
      return this.removeUndefined(defaultFields);
    }

    // Full template
    const fullFields: Record<string, unknown> = {
      ...defaultFields,
      original_title: tv.original_title !== tv.title
        ? tv.original_title
        : undefined,
      first_air_date: tv.first_air_date || undefined,
      last_air_date: tv.last_air_date || undefined,
      tagline: tv.tagline || undefined,
      description: tv.description || undefined,
      backdrop: tv.backdrop_url || undefined,
      created_by: tv.created_by.length > 0 ? tv.created_by : undefined,
      episode_runtime: tv.episode_runtime || undefined,
      identifiers: {
        tmdb: tv.identifiers.tmdb,
        imdb: tv.identifiers.imdb || undefined,
        tvdb: tv.identifiers.tvdb || undefined,
      },
    };

    return this.removeUndefined(fullFields);
  }

  private getBestRating(ratings: BookResult['ratings']): number | undefined {
    // Prefer Goodreads, then Open Library, then Google Books
    return ratings.goodreads?.score
      || ratings.open_library?.score
      || ratings.google_books?.score
      || undefined;
  }

  private getValueByPath(obj: unknown, path: string): unknown {
    const parts = path.replace(/^\$\.?/, '').split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private removeUndefined(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const nested = this.removeUndefined(value as Record<string, unknown>);
          if (Object.keys(nested).length > 0) {
            result[key] = nested;
          }
        } else {
          result[key] = value;
        }
      }
    }

    return result;
  }

  private toYAML(obj: Record<string, unknown>, indent: number = 0): string {
    const lines: string[] = [];
    const prefix = '  '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;

      if (Array.isArray(value)) {
        if (value.length === 0) continue;
        lines.push(`${prefix}${key}:`);
        for (const item of value) {
          if (typeof item === 'object' && item !== null) {
            lines.push(`${prefix}  - ${this.toYAML(item as Record<string, unknown>, indent + 2).trim()}`);
          } else {
            lines.push(`${prefix}  - ${this.formatValue(item)}`);
          }
        }
      } else if (typeof value === 'object') {
        lines.push(`${prefix}${key}:`);
        lines.push(this.toYAML(value as Record<string, unknown>, indent + 1));
      } else {
        lines.push(`${prefix}${key}: ${this.formatValue(value)}`);
      }
    }

    return lines.join('\n');
  }

  private formatValue(value: unknown): string {
    if (typeof value === 'string') {
      // Quote strings that need it
      if (
        value.includes(':') ||
        value.includes('#') ||
        value.includes("'") ||
        value.includes('"') ||
        value.includes('\n') ||
        value.startsWith(' ') ||
        value.endsWith(' ')
      ) {
        return `"${value.replace(/"/g, '\\"')}"`;
      }
      return value;
    }
    return String(value);
  }
}
