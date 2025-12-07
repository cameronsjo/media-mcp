import type { LogLevel, LogEntry } from '../types/common.js';

export type LogEmitter = (entry: LogEntry) => void;

/**
 * Structured logger for MCP server
 * Emits logs via the MCP notifications/message mechanism
 */
export class Logger {
  private minLevel: LogLevel = 'info';
  private emitter: LogEmitter | null = null;
  private serverName: string;

  private static readonly LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    notice: 2,
    warning: 3,
    error: 4,
    critical: 5,
    alert: 6,
    emergency: 7,
  };

  constructor(serverName: string) {
    this.serverName = serverName;
  }

  /**
   * Set the log emitter function (called by MCP server setup)
   */
  setEmitter(emitter: LogEmitter): void {
    this.emitter = emitter;
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Check if a level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return Logger.LEVEL_ORDER[level] >= Logger.LEVEL_ORDER[this.minLevel];
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, logger: string, data: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      logger: `${this.serverName}/${logger}`,
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
    };

    if (this.emitter) {
      this.emitter(entry);
    } else {
      // Fallback to stderr when no emitter is set (during startup)
      // Format: [LEVEL] logger: data
      const levelStr = level.toUpperCase().padEnd(8);
      console.error(`[${levelStr}] ${entry.logger}: ${JSON.stringify(data)}`);
    }
  }

  debug(logger: string, data: Record<string, unknown>): void {
    this.log('debug', logger, data);
  }

  info(logger: string, data: Record<string, unknown>): void {
    this.log('info', logger, data);
  }

  notice(logger: string, data: Record<string, unknown>): void {
    this.log('notice', logger, data);
  }

  warning(logger: string, data: Record<string, unknown>): void {
    this.log('warning', logger, data);
  }

  error(logger: string, data: Record<string, unknown>): void {
    this.log('error', logger, data);
  }

  critical(logger: string, data: Record<string, unknown>): void {
    this.log('critical', logger, data);
  }

  alert(logger: string, data: Record<string, unknown>): void {
    this.log('alert', logger, data);
  }

  emergency(logger: string, data: Record<string, unknown>): void {
    this.log('emergency', logger, data);
  }
}
