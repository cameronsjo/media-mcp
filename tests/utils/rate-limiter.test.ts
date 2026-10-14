import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

    it('resets an expired window before recording without a prior canRequest check', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));

      try {
        rateLimiter.configure('test', { requestsPerWindow: 2, windowMs: 1000 });
        rateLimiter.recordRequest('test');
        rateLimiter.recordRequest('test');

        vi.advanceTimersByTime(1000);
        rateLimiter.recordRequest('test');

        expect(rateLimiter.canRequest('test')).toBe(true);
      } finally {
        vi.useRealTimers();
      }
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
      vi.useFakeTimers();
      rateLimiter.configure('test', { requestsPerWindow: 10, windowMs: 1000 });

      try {
        await expect(rateLimiter.waitForSlot('test')).resolves.toBeUndefined();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('acquireSlot', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not shorten an existing backoff when a concurrent lower attempt signals', async () => {
      rateLimiter.configure('test', { requestsPerWindow: 10, windowMs: 10000 });
      expect(rateLimiter.triggerBackoff('test', 3)).toBe(8000);
      await vi.advanceTimersByTimeAsync(1000);
      expect(rateLimiter.triggerBackoff('test', 1)).toBe(2000);
      expect(rateLimiter.getWaitTime('test')).toBe(7000);

      let acquired = false;
      const slot = rateLimiter.acquireSlot('test').then(() => {
        acquired = true;
      });
      await vi.advanceTimersByTimeAsync(6999);
      expect(acquired).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await slot;
      expect(acquired).toBe(true);
    });

    it('reserves slots before concurrent callers continue', async () => {
      rateLimiter.configure('test', { requestsPerWindow: 2, windowMs: 1000 });

      const first = rateLimiter.acquireSlot('test');
      const second = rateLimiter.acquireSlot('test');
      const third = rateLimiter.acquireSlot('test');

      await Promise.all([first, second]);
      expect(rateLimiter.canRequest('test')).toBe(false);

      let thirdResolved = false;
      void third.then(() => {
        thirdResolved = true;
      });
      await vi.advanceTimersByTimeAsync(999);
      expect(thirdResolved).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await third;
      expect(thirdResolved).toBe(true);
      expect(rateLimiter.canRequest('test')).toBe(true);
    });

    it('allows successive fixed windows without double counting', async () => {
      rateLimiter.configure('test', { requestsPerWindow: 2, windowMs: 1000 });

      const requests = [1, 2, 3, 4, 5].map(() => rateLimiter.acquireSlot('test'));
      await Promise.all(requests.slice(0, 2));
      expect(rateLimiter.canRequest('test')).toBe(false);

      await vi.advanceTimersByTimeAsync(1000);
      await Promise.all(requests.slice(2, 4));
      expect(rateLimiter.canRequest('test')).toBe(false);

      await vi.advanceTimersByTimeAsync(1000);
      await requests[4];
      expect(rateLimiter.canRequest('test')).toBe(true);
    });

    it('rechecks the window after a backoff sleep', async () => {
      rateLimiter.configure('test', { requestsPerWindow: 1, windowMs: 1000 });

      await rateLimiter.acquireSlot('test');
      rateLimiter.triggerBackoff('test', 1);
      const nextRequest = rateLimiter.acquireSlot('test');

      await vi.advanceTimersByTimeAsync(1000);
      expect(rateLimiter.canRequest('test')).toBe(false);
      let nextResolved = false;
      void nextRequest.then(() => {
        nextResolved = true;
      });

      await vi.advanceTimersByTimeAsync(999);
      expect(nextResolved).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await nextRequest;
      expect(nextResolved).toBe(true);
      expect(rateLimiter.canRequest('test')).toBe(false);
    });
  });
});

describe('delay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should delay for specified milliseconds', async () => {
    const delayed = delay(100);
    await vi.advanceTimersByTimeAsync(99);
    let resolved = false;
    void delayed.then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await delayed;
    expect(resolved).toBe(true);
  });

  it('should delay for random duration in range', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const delayed = delay(50, 100);
    await vi.advanceTimersByTimeAsync(74);
    let resolved = false;
    void delayed.then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await delayed;
    expect(resolved).toBe(true);
  });
});
