import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger } from '../../src/utils/logger.js';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('test-server');
  });

  describe('setLevel', () => {
    it('should filter logs below minimum level', () => {
      const emitter = vi.fn();
      logger.setEmitter(emitter);
      logger.setLevel('warning');

      logger.debug('test', { message: 'debug' });
      logger.info('test', { message: 'info' });
      logger.warning('test', { message: 'warning' });
      logger.error('test', { message: 'error' });

      expect(emitter).toHaveBeenCalledTimes(2);
    });
  });

  describe('log methods', () => {
    it('should emit log entries with correct level', () => {
      const emitter = vi.fn();
      logger.setEmitter(emitter);
      logger.setLevel('debug');

      logger.debug('component', { action: 'test' });

      expect(emitter).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
          logger: 'test-server/component',
          data: expect.objectContaining({
            action: 'test',
            timestamp: expect.any(String),
          }),
        })
      );
    });

    it('should include timestamp in log data', () => {
      const emitter = vi.fn();
      logger.setEmitter(emitter);
      logger.setLevel('info');

      logger.info('test', { message: 'test' });

      const call = emitter.mock.calls[0][0];
      expect(call.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should support all log levels', () => {
      const emitter = vi.fn();
      logger.setEmitter(emitter);
      logger.setLevel('debug');

      logger.debug('test', {});
      logger.info('test', {});
      logger.notice('test', {});
      logger.warning('test', {});
      logger.error('test', {});
      logger.critical('test', {});
      logger.alert('test', {});
      logger.emergency('test', {});

      expect(emitter).toHaveBeenCalledTimes(8);

      const levels = emitter.mock.calls.map((c) => c[0].level);
      expect(levels).toEqual([
        'debug',
        'info',
        'notice',
        'warning',
        'error',
        'critical',
        'alert',
        'emergency',
      ]);
    });
  });

  describe('without emitter', () => {
    it('should fallback to console.error', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      logger.setLevel('info');

      logger.info('test', { message: 'fallback test' });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
