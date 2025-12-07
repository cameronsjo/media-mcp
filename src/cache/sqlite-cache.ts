import Database from 'better-sqlite3';
import { Logger } from '../utils/logger.js';

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  source: string;
  created_at: number;
  expires_at: number;
  hit_count: number;
}

export interface CacheOptions {
  path: string;
  defaultTTLHours: number;
  enabled: boolean;
}

// TTL presets in hours
export const CacheTTL = {
  BOOK_METADATA: 30 * 24,      // 30 days
  SERIES_INFO: 7 * 24,         // 7 days
  RATINGS: 24,                  // 24 hours
  MOVIE_TV_METADATA: 7 * 24,   // 7 days
  TV_EPISODES: 24,             // 1 day (active shows)
  SEARCH_RESULTS: 1,           // 1 hour
} as const;

export class SQLiteCache {
  private db: Database.Database;
  private enabled: boolean;
  private defaultTTLHours: number;
  private logger: Logger;

  constructor(options: CacheOptions, logger: Logger) {
    this.enabled = options.enabled;
    this.defaultTTLHours = options.defaultTTLHours;
    this.logger = logger;

    if (!this.enabled) {
      // Create in-memory database even when disabled for type safety
      this.db = new Database(':memory:');
      return;
    }

    this.db = new Database(options.path);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        hit_count INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_expires ON cache(expires_at);
      CREATE INDEX IF NOT EXISTS idx_source ON cache(source);
    `);

    // Clean up expired entries on startup
    this.cleanup();

    this.logger.info('cache', { action: 'initialized', path: this.db.name });
  }

  /**
   * Generate a cache key from components
   */
  static makeKey(source: string, ...parts: (string | number | undefined)[]): string {
    const validParts = parts.filter((p): p is string | number => p !== undefined);
    return `${source.toLowerCase()}:${validParts.map(p => String(p).toLowerCase().trim()).join(':')}`;
  }

  /**
   * Get a cached value
   */
  get<T>(key: string): CacheEntry<T> | null {
    if (!this.enabled) return null;

    const now = Date.now();
    const stmt = this.db.prepare(`
      SELECT * FROM cache WHERE key = ? AND expires_at > ?
    `);

    const row = stmt.get(key, now) as {
      key: string;
      value: string;
      source: string;
      created_at: number;
      expires_at: number;
      hit_count: number;
    } | undefined;

    if (!row) return null;

    // Update hit count
    this.db.prepare(`
      UPDATE cache SET hit_count = hit_count + 1 WHERE key = ?
    `).run(key);

    try {
      const value = JSON.parse(row.value) as T;
      this.logger.debug('cache', { action: 'hit', key, source: row.source });

      return {
        key: row.key,
        value,
        source: row.source,
        created_at: row.created_at,
        expires_at: row.expires_at,
        hit_count: row.hit_count + 1,
      };
    } catch {
      this.logger.warning('cache', { action: 'parse_error', key });
      this.delete(key);
      return null;
    }
  }

  /**
   * Get a cached value, returning stale data if available
   */
  getStale<T>(key: string): { entry: CacheEntry<T>; stale: boolean } | null {
    if (!this.enabled) return null;

    const stmt = this.db.prepare(`SELECT * FROM cache WHERE key = ?`);
    const row = stmt.get(key) as {
      key: string;
      value: string;
      source: string;
      created_at: number;
      expires_at: number;
      hit_count: number;
    } | undefined;

    if (!row) return null;

    try {
      const value = JSON.parse(row.value) as T;
      const stale = row.expires_at <= Date.now();

      return {
        entry: {
          key: row.key,
          value,
          source: row.source,
          created_at: row.created_at,
          expires_at: row.expires_at,
          hit_count: row.hit_count,
        },
        stale,
      };
    } catch {
      return null;
    }
  }

  /**
   * Store a value in the cache
   */
  set<T>(key: string, value: T, source: string, ttlHours?: number): void {
    if (!this.enabled) return;

    const now = Date.now();
    const ttl = (ttlHours ?? this.defaultTTLHours) * 60 * 60 * 1000;
    const expires_at = now + ttl;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cache (key, value, source, created_at, expires_at, hit_count)
      VALUES (?, ?, ?, ?, ?, 0)
    `);

    stmt.run(key, JSON.stringify(value), source, now, expires_at);
    this.logger.debug('cache', { action: 'set', key, source, ttl_hours: ttlHours ?? this.defaultTTLHours });
  }

  /**
   * Delete a cache entry
   */
  delete(key: string): void {
    if (!this.enabled) return;
    this.db.prepare(`DELETE FROM cache WHERE key = ?`).run(key);
  }

  /**
   * Delete all entries from a source
   */
  deleteBySource(source: string): void {
    if (!this.enabled) return;
    const result = this.db.prepare(`DELETE FROM cache WHERE source = ?`).run(source);
    this.logger.info('cache', { action: 'delete_by_source', source, deleted: result.changes });
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    if (!this.enabled) return 0;
    const result = this.db.prepare(`DELETE FROM cache WHERE expires_at < ?`).run(Date.now());
    if (result.changes > 0) {
      this.logger.info('cache', { action: 'cleanup', deleted: result.changes });
    }
    return result.changes;
  }

  /**
   * Get cache statistics
   */
  stats(): { total: number; bySource: Record<string, number>; hitRate: number } {
    if (!this.enabled) {
      return { total: 0, bySource: {}, hitRate: 0 };
    }

    const total = this.db.prepare(`SELECT COUNT(*) as count FROM cache WHERE expires_at > ?`)
      .get(Date.now()) as { count: number };

    const bySourceRows = this.db.prepare(`
      SELECT source, COUNT(*) as count FROM cache WHERE expires_at > ? GROUP BY source
    `).all(Date.now()) as { source: string; count: number }[];

    const bySource: Record<string, number> = {};
    for (const row of bySourceRows) {
      bySource[row.source] = row.count;
    }

    const hits = this.db.prepare(`SELECT SUM(hit_count) as total FROM cache`)
      .get() as { total: number | null };

    return {
      total: total.count,
      bySource,
      hitRate: hits.total ? hits.total / (hits.total + total.count) : 0,
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
    this.logger.info('cache', { action: 'closed' });
  }
}
