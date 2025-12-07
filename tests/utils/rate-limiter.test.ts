import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter, delay } from '../../src/utils/rate-limiter.js';
import { Logger } from '../../src/utils/logger.js';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('test');
    rateLimiter = new RateLimiter(logger);
  });

  describe('configure', () => {
    it('should configure rate limit for a source', () => {
      rateLimiter.configure('test-source', {
        requestsPerWindow: 10,
        windowMs: 1000,
      });

      expect(rateLimiter.canRequest('test-source')).toBe(true);
    });
  });

  describe('canRequest', () => {
    it('should return true when no limit configured', () => {
      expect(rateLimiter.canRequest('unknown-source')).toBe(true);
    });

    it('should return true when under limit', () => {
      rateLimiter.configure('test', { requestsPerWindow: 5, windowMs: 1000 });

      rateLimiter.recordRequest('test');
      rateLimiter.recordRequest('test');

      expect(rateLimiter.canRequest('test')).toBe(true);
    });

    it('should return false when at limit', () => {
      rateLimiter.configure('test', { requestsPerWindow: 2, windowMs: 10000 });

      rateLimiter.recordRequest('test');
      rateLimiter.recordRequest('test');

      expect(rateLimiter.canRequest('test')).toBe(false);
    });

    it('should return false during backoff', () => {
      rateLimiter.configure('test', { requestsPerWindow: 10, windowMs: 1000 });

      rateLimiter.triggerBackoff('test', 1);

      expect(rateLimiter.canRequest('test')).toBe(false);
    });
  });

  describe('recordRequest', () => {
    it('should increment request count', () => {
      rateLimiter.configure('test', { requestsPerWindow: 3, windowMs: 10000 });

      expect(rateLimiter.canRequest('test')).toBe(true);

      rateLimiter.recordRequest('test');
      rateLimiter.recordRequest('test');
      rateLimiter.recordRequest('test');

      expect(rateLimiter.canRequest('test')).toBe(false);
    });
  });

  describe('triggerBackoff', () => {
    it('should return exponential backoff duration', () => {
      rateLimiter.configure('test', { requestsPerWindow: 10, windowMs: 1000 });

      const backoff1 = rateLimiter.triggerBackoff('test', 1);
      expect(backoff1).toBe(2000); // 2^1 * 1000

      const backoff2 = rateLimiter.triggerBackoff('test', 2);
      expect(backoff2).toBe(4000); // 2^2 * 1000

      const backoff3 = rateLimiter.triggerBackoff('test', 3);
      expect(backoff3).toBe(8000); // 2^3 * 1000
    });

    it('should cap backoff at 60 seconds', () => {
      rateLimiter.configure('test', { requestsPerWindow: 10, windowMs: 1000 });

      const backoff = rateLimiter.triggerBackoff('test', 10);
      expect(backoff).toBe(60000);
    });
  });

  describe('getWaitTime', () => {
    it('should return 0 when no limit', () => {
      expect(rateLimiter.getWaitTime('unknown')).toBe(0);
    });

    it('should return 0 when under limit', () => {
      rateLimiter.configure('test', { requestsPerWindow: 10, windowMs: 1000 });
      expect(rateLimiter.getWaitTime('test')).toBe(0);
    });

    it('should return wait time during backoff', () => {
      rateLimiter.configure('test', { requestsPerWindow: 10, windowMs: 1000 });

      rateLimiter.triggerBackoff('test', 1);

      const waitTime = rateLimiter.getWaitTime('test');
      expect(waitTime).toBeGreaterThan(0);
      expect(waitTime).toBeLessThanOrEqual(2000);
    });
  });

  describe('waitForSlot', () => {
    it('should resolve immediately when under limit', async () => {
      rateLimiter.configure('test', { requestsPerWindow: 10, windowMs: 1000 });

      const start = Date.now();
      await rateLimiter.waitForSlot('test');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });
});

describe('delay', () => {
  it('should delay for specified milliseconds', async () => {
    const start = Date.now();
    await delay(100);
    const duration = Date.now() - start;

    expect(duration).toBeGreaterThanOrEqual(95);
    expect(duration).toBeLessThan(150);
  });

  it('should delay for random duration in range', async () => {
    const start = Date.now();
    await delay(50, 100);
    const duration = Date.now() - start;

    expect(duration).toBeGreaterThanOrEqual(45);
    expect(duration).toBeLessThan(150);
  });
});
