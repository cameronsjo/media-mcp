import { afterEach, describe, expect, it } from 'vitest';
import { ConfigSchema, loadConfig } from '../../src/utils/config.js';

const cleanupIntervalEnv = 'MCP_CACHE_CLEANUP_INTERVAL_MS';
const originalCleanupInterval = process.env[cleanupIntervalEnv];

afterEach(() => {
  if (originalCleanupInterval === undefined) {
    delete process.env[cleanupIntervalEnv];
  } else {
    process.env[cleanupIntervalEnv] = originalCleanupInterval;
  }
});

describe('cache cleanup interval configuration', () => {
  it('defaults to one hour', () => {
    delete process.env[cleanupIntervalEnv];

    expect(loadConfig().config.cacheCleanupIntervalMs).toBe(3_600_000);
  });

  it('accepts a positive millisecond override', () => {
    process.env[cleanupIntervalEnv] = '60000';

    expect(loadConfig().config.cacheCleanupIntervalMs).toBe(60_000);
  });

  it.each(['0', '-1', '1.5', 'abc', '5junk', '2147483648'])(
    'rejects invalid interval %s through loadConfig',
    (value) => {
      process.env[cleanupIntervalEnv] = value;

      expect(() => loadConfig()).toThrow();
    }
  );

  it('enforces the same integer and maximum constraints in the schema', () => {
    expect(ConfigSchema.safeParse({ cacheCleanupIntervalMs: 1.5 }).success).toBe(false);
    expect(ConfigSchema.safeParse({ cacheCleanupIntervalMs: 2_147_483_648 }).success).toBe(false);
  });
});
