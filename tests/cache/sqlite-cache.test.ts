import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteCache, CacheTTL } from '../../src/cache/sqlite-cache.js';
import { Logger } from '../../src/utils/logger.js';
import * as fs from 'fs';

describe('SQLiteCache', () => {
  let cache: SQLiteCache;
  let logger: Logger;
  const testDbPath = './test-cache.db';

  beforeEach(() => {
    logger = new Logger('test');
    cache = new SQLiteCache(
      {
        path: testDbPath,
        defaultTTLHours: 24,
        enabled: true,
      },
      logger
    );
  });

  afterEach(() => {
    cache.close();
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('makeKey', () => {
    it('should create a cache key from components', () => {
      const key = SQLiteCache.makeKey('source', 'type', 'value');
      expect(key).toBe('source:type:value');
    });

    it('should normalize key components to lowercase', () => {
      const key = SQLiteCache.makeKey('SOURCE', 'TYPE', 'VALUE');
      expect(key).toBe('source:type:value');
    });

    it('should handle undefined components', () => {
      const key = SQLiteCache.makeKey('source', undefined, 'value');
      expect(key).toBe('source:value');
    });

    it('should handle numeric components', () => {
      const key = SQLiteCache.makeKey('tmdb', 'movie', 12345);
      expect(key).toBe('tmdb:movie:12345');
    });
  });

  describe('set and get', () => {
    it('should store and retrieve a value', () => {
      const key = 'test:key';
      const value = { title: 'Test Book', author: 'Test Author' };

      cache.set(key, value, 'test');
      const result = cache.get<typeof value>(key);

      expect(result).not.toBeNull();
      expect(result?.value).toEqual(value);
      expect(result?.source).toBe('test');
    });

    it('should return null for non-existent key', () => {
      const result = cache.get('nonexistent:key');
      expect(result).toBeNull();
    });

    it('should return null for expired entries', async () => {
      const key = 'test:expired';
      const value = { data: 'test' };

      // Set with very short TTL (in hours, so we need a workaround)
      cache.set(key, value, 'test', 0.00001); // ~36ms

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 50));

      const result = cache.get(key);
      expect(result).toBeNull();
    });

    it('should increment hit count on get', () => {
      const key = 'test:hits';
      const value = { data: 'test' };

      cache.set(key, value, 'test');

      cache.get(key);
      cache.get(key);
      const result = cache.get(key);

      expect(result?.hit_count).toBe(3);
    });
  });

  describe('getStale', () => {
    it('should return stale data with stale flag', async () => {
      const key = 'test:stale';
      const value = { data: 'test' };

      cache.set(key, value, 'test', 0.00001); // Very short TTL

      await new Promise((resolve) => setTimeout(resolve, 50));

      const result = cache.getStale<typeof value>(key);

      expect(result).not.toBeNull();
      expect(result?.stale).toBe(true);
      expect(result?.entry.value).toEqual(value);
    });

    it('should return non-stale data with stale=false', () => {
      const key = 'test:fresh';
      const value = { data: 'test' };

      cache.set(key, value, 'test', 24);

      const result = cache.getStale<typeof value>(key);

      expect(result).not.toBeNull();
      expect(result?.stale).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete a cache entry', () => {
      const key = 'test:delete';
      const value = { data: 'test' };

      cache.set(key, value, 'test');
      expect(cache.get(key)).not.toBeNull();

      cache.delete(key);
      expect(cache.get(key)).toBeNull();
    });
  });

  describe('deleteBySource', () => {
    it('should delete all entries from a source', () => {
      cache.set('source1:key1', { data: 1 }, 'source1');
      cache.set('source1:key2', { data: 2 }, 'source1');
      cache.set('source2:key1', { data: 3 }, 'source2');

      cache.deleteBySource('source1');

      expect(cache.get('source1:key1')).toBeNull();
      expect(cache.get('source1:key2')).toBeNull();
      expect(cache.get('source2:key1')).not.toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      cache.set('test:expired', { data: 'old' }, 'test', 0.00001);
      cache.set('test:fresh', { data: 'new' }, 'test', 24);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const deleted = cache.cleanup();

      expect(deleted).toBe(1);
      expect(cache.get('test:expired')).toBeNull();
      expect(cache.get('test:fresh')).not.toBeNull();
    });
  });

  describe('stats', () => {
    it('should return cache statistics', () => {
      cache.set('test:1', { data: 1 }, 'source1');
      cache.set('test:2', { data: 2 }, 'source1');
      cache.set('test:3', { data: 3 }, 'source2');

      const stats = cache.stats();

      expect(stats.total).toBe(3);
      expect(stats.bySource['source1']).toBe(2);
      expect(stats.bySource['source2']).toBe(1);
    });
  });

  describe('disabled cache', () => {
    it('should not store values when disabled', () => {
      const disabledCache = new SQLiteCache(
        {
          path: ':memory:',
          defaultTTLHours: 24,
          enabled: false,
        },
        logger
      );

      disabledCache.set('test:key', { data: 'test' }, 'test');
      const result = disabledCache.get('test:key');

      expect(result).toBeNull();
      disabledCache.close();
    });
  });
});

describe('CacheTTL', () => {
  it('should have expected TTL values', () => {
    expect(CacheTTL.BOOK_METADATA).toBe(30 * 24); // 30 days
    expect(CacheTTL.SERIES_INFO).toBe(7 * 24); // 7 days
    expect(CacheTTL.RATINGS).toBe(24); // 24 hours
    expect(CacheTTL.MOVIE_TV_METADATA).toBe(7 * 24); // 7 days
    expect(CacheTTL.TV_EPISODES).toBe(24); // 1 day
    expect(CacheTTL.SEARCH_RESULTS).toBe(1); // 1 hour
  });
});
