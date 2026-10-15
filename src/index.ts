#!/usr/bin/env node

import { createRequire } from 'module';
import { createMcpHandler, Server } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createToolHandlers, type ToolDefinition } from './handlers/tool-handlers.js';

// Read version from package.json
const require = createRequire(import.meta.url);
const { version: packageVersion } = require('../package.json') as { version: string };

import { Logger } from './utils/logger.js';
import { RateLimiter } from './utils/rate-limiter.js';
import { SQLiteCache, type CacheOptions } from './cache/sqlite-cache.js';
import { OpenLibrarySource } from './sources/open-library.js';
import { GoogleBooksSource } from './sources/google-books.js';
import { GoodreadsSource } from './sources/goodreads.js';
import { HardcoverSource } from './sources/hardcover.js';
import { TMDBSource } from './sources/tmdb.js';
import {
  LookupBookTool,
  LookupBookInputSchema,
  LookupMovieTool,
  LookupMovieInputSchema,
  LookupTVTool,
  LookupTVInputSchema,
  GenerateFrontmatterTool,
  GenerateFrontmatterInputSchema,
  BatchLookupTool,
  BatchLookupInputSchema,
} from './tools/index.js';
import { StreamableHTTPTransport } from './transport/http-transport.js';
import { loadConfig, getSourceStatusMessage } from './utils/config.js';
import { RATE_LIMITS, TIMING } from './utils/constants.js';
import { initTelemetry, shutdownTelemetry, recordToolCall } from './utils/telemetry.js';
import type { LogLevel } from './types/common.js';

// Load and validate configuration
const { config: appConfig, sources: sourceStatus } = loadConfig();

// Server configuration (consolidated from appConfig)
const config = {
  server: {
    name: 'media-metadata-mcp',
    version: packageVersion,
  },
  transport: appConfig.transport,
  http: {
    port: appConfig.httpPort,
    host: appConfig.httpHost,
    basePath: appConfig.httpPath,
    allowedHosts: appConfig.httpAllowedHosts,
    allowedOrigins: appConfig.httpAllowedOrigins,
  },
  apis: {
    tmdb: {
      apiKey: appConfig.tmdbApiKey || '',
    },
    googleBooks: {
      apiKey: appConfig.googleBooksApiKey || null,
    },
    hardcover: {
      apiKey: appConfig.hardcoverApiKey || null,
    },
  },
  cache: {
    enabled: appConfig.cacheEnabled,
    path: appConfig.cachePath,
    defaultTTLHours: Math.floor(appConfig.cacheTtlBooks / TIMING.SECONDS_PER_HOUR),
    cleanupIntervalMs: appConfig.cacheCleanupIntervalMs,
  } as CacheOptions,
  logging: {
    level: appConfig.logLevel as LogLevel,
  },
  goodreads: {
    enabled: appConfig.enableGoodreadsScraping,
    delayMs: RATE_LIMITS.GOODREADS.BASE_DELAY_MS,
  },
};

// Parse command line arguments
const args = process.argv.slice(2);
if (args.includes('--transport') && args.includes('http')) {
  config.transport = 'http';
}
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`
Media Metadata MCP Server

Usage: media-metadata-mcp [options]

Options:
  --transport <type>   Transport type: stdio (default) or http
  --help, -h           Show this help message

Environment Variables:
  API Keys:
    TMDB_API_KEY                  TMDB API key (required for movie/TV lookups)
    GOOGLE_BOOKS_API_KEY          Google Books API key (optional, for enhanced book data)
    HARDCOVER_API_KEY             Hardcover API key (optional, for tropes/tags/ratings)

  Transport:
    MCP_TRANSPORT                 Transport type: stdio or http (default: stdio)
    MCP_HTTP_PORT                 HTTP server port (default: 3000)
    MCP_HTTP_HOST                 HTTP server host (default: 127.0.0.1)
    MCP_HTTP_PATH                 HTTP endpoint path (default: /mcp)
    MCP_ALLOWED_HOSTS             Additional allowed Host hostnames (comma-separated)
    MCP_ALLOWED_ORIGINS           Additional allowed Origin hostnames (comma-separated)

  Cache:
    MCP_CACHE_ENABLED             Enable caching (default: true)
    MCP_CACHE_PATH                SQLite cache database path (default: ./cache.db)
    MCP_CACHE_TTL_BOOKS           Book cache TTL in seconds (default: 604800)
    MCP_CACHE_TTL_MOVIES          Movie cache TTL in seconds (default: 86400)
    MCP_CACHE_TTL_TV              TV cache TTL in seconds (default: 86400)
    MCP_CACHE_CLEANUP_INTERVAL_MS Expired-entry cleanup interval in milliseconds (default: 3600000)

  Rate Limiting:
    MCP_RATE_LIMIT_RPM            Requests per minute (default: 30)
    MCP_RATE_LIMIT_RETRIES        Retry attempts (default: 3)

  Features:
    MCP_ENABLE_GOODREADS_SCRAPING Enable Goodreads scraping (default: true)
  Logging:
    MCP_LOG_LEVEL                 Log level: debug, info, warn, error (default: info)

  OpenTelemetry:
    OTEL_ENABLED                  Enable OpenTelemetry (default: false)
    OTEL_EXPORTER_OTLP_ENDPOINT   OpenTelemetry endpoint URL
    OTEL_SERVICE_NAME             Service name (default: media-metadata-mcp)
`);
  process.exit(0);
}

// Initialize OpenTelemetry if enabled
initTelemetry(appConfig);

// Initialize components
const logger = new Logger(config.server.name);
logger.setLevel(config.logging.level);

// Log source availability
logger.info('main', {
  action: 'source_status',
  message: getSourceStatusMessage(sourceStatus),
});

const rateLimiter = new RateLimiter(logger);
const cache = new SQLiteCache(config.cache, logger);

// Initialize all book sources
const openLibrary = new OpenLibrarySource(cache, logger, rateLimiter);
const googleBooks = new GoogleBooksSource(
  config.apis.googleBooks.apiKey,
  cache,
  logger,
  rateLimiter
);
const goodreads = new GoodreadsSource(config.goodreads, cache, logger, rateLimiter);
const hardcover = new HardcoverSource(config.apis.hardcover, cache, logger, rateLimiter);

// Initialize TMDB for movies/TV
let tmdb: TMDBSource | null = null;
if (config.apis.tmdb.apiKey) {
  tmdb = new TMDBSource(config.apis.tmdb.apiKey, cache, logger, rateLimiter);
} else {
  logger.warning('main', {
    message: 'TMDB_API_KEY not set. Movie and TV lookups will not be available.',
  });
}

// Initialize tools with multiple book sources
const bookSources = { openLibrary, googleBooks, goodreads, hardcover };
const lookupBookTool = new LookupBookTool(openLibrary, logger, bookSources);
const lookupMovieTool = tmdb ? new LookupMovieTool(tmdb, logger) : null;
const lookupTVTool = tmdb ? new LookupTVTool(tmdb, logger) : null;
const generateFrontmatterTool = new GenerateFrontmatterTool(logger);
const batchLookupTool =
  lookupMovieTool && lookupTVTool
    ? new BatchLookupTool(lookupBookTool, lookupMovieTool, lookupTVTool, logger)
    : null;

// Tool definitions
const tools: ToolDefinition[] = [
  {
    name: 'lookup_book',
    description:
      'Look up book metadata by title, author, or ISBN. Searches Open Library, Google Books, Goodreads, and Hardcover for comprehensive information including series data, ratings, tropes, and cover images.',
    inputSchema: LookupBookInputSchema,
  },
];

if (lookupMovieTool) {
  tools.push({
    name: 'lookup_movie',
    description:
      'Look up movie metadata by title and optional year. Returns comprehensive movie information including cast, director, ratings, and watch providers.',
    inputSchema: LookupMovieInputSchema,
  });
}

if (lookupTVTool) {
  tools.push({
    name: 'lookup_tv',
    description:
      'Look up TV show metadata by title. Returns comprehensive show information including seasons, episodes, networks, and ratings.',
    inputSchema: LookupTVInputSchema,
  });
}

tools.push({
  name: 'generate_frontmatter',
  description:
    'Convert a lookup result to Obsidian YAML frontmatter. Supports minimal, default, and full templates.',
  inputSchema: GenerateFrontmatterInputSchema,
});

if (batchLookupTool) {
  tools.push({
    name: 'batch_lookup',
    description:
      'Batch look up multiple books, movies, or TV shows in a single request. Supports concurrent lookups for better performance.',
    inputSchema: BatchLookupInputSchema,
  });
}

/**
 * Build one low-level server for a serving unit. The SDK calls this factory
 * once per HTTP request and once per stdio connection, which keeps HTTP
 * stateless while retaining the existing Zod 3 tool schemas and execution
 * path.
 */
function createMcpServer(emitStdioLogs: boolean): Server {
  const server = new Server(
    {
      name: config.server.name,
      version: config.server.version,
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    }
  );
  const handlers = createToolHandlers(tools, executeToolCall, logger);

  if (emitStdioLogs) {
    logger.setEmitter((entry) => {
      void server
        .notification({
          method: 'notifications/message',
          params: {
            level: entry.level,
            logger: entry.logger,
            data: entry.data,
          },
        })
        .catch(() => undefined);
    });
  }

  // Method-string registration is the v2 low-level API. It leaves tool input
  // validation in executeToolCall, where the existing Zod 3 schemas remain
  // authoritative, while the SDK owns wire validation and era adaptation.
  server.setRequestHandler('tools/list', async () => handlers.listTools());
  server.setRequestHandler('logging/setLevel', async (request) => {
    const level = request.params.level as LogLevel;
    return handlers.setLevel(level, true);
  });
  server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args } = request.params;
    return handlers.callTool(name, args);
  });

  return server;
}

/**
 * Execute a tool call and record telemetry
 */
async function executeToolCall(
  name: string,
  args: unknown
): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  const startTime = Date.now();
  let success = true;

  try {
    switch (name) {
      case 'lookup_book': {
        const input = LookupBookInputSchema.parse(args);
        const result = await lookupBookTool.execute(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'lookup_movie': {
        if (!lookupMovieTool) {
          throw new Error('TMDB_API_KEY not configured. Movie lookups are unavailable.');
        }
        const input = LookupMovieInputSchema.parse(args);
        const result = await lookupMovieTool.execute(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'lookup_tv': {
        if (!lookupTVTool) {
          throw new Error('TMDB_API_KEY not configured. TV lookups are unavailable.');
        }
        const input = LookupTVInputSchema.parse(args);
        const result = await lookupTVTool.execute(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'generate_frontmatter': {
        const input = GenerateFrontmatterInputSchema.parse(args);
        const result = await generateFrontmatterTool.execute(input);
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'batch_lookup': {
        if (!batchLookupTool) {
          throw new Error('TMDB_API_KEY not configured. Batch lookups require movie/TV support.');
        }
        const input = BatchLookupInputSchema.parse(args);
        const result = await batchLookupTool.execute(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    success = false;
    const errorObj = error as { code?: string; message?: string };

    logger.error('main', {
      action: 'tool_error',
      tool: name,
      error: errorObj.message || String(error),
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: {
              code: errorObj.code || 'UNKNOWN_ERROR',
              message: errorObj.message || 'An unknown error occurred',
            },
          }),
        },
      ],
      isError: true,
    };
  } finally {
    const duration = Date.now() - startTime;
    recordToolCall(name, duration, success);
  }
}

// Start the server
async function main() {
  logger.info('main', {
    action: 'starting',
    transport: config.transport,
    cache_enabled: config.cache.enabled,
    sources: sourceStatus.filter((s) => s.available).map((s) => s.name),
  });

  if (config.transport === 'http') {
    const handler = createMcpHandler(() => createMcpServer(false), {
      onerror: (error) => {
        logger.error('main', {
          action: 'http_error',
          error: error.message,
        });
      },
    });
    const httpTransport = new StreamableHTTPTransport({
      port: config.http.port,
      host: config.http.host,
      basePath: config.http.basePath,
      allowedHosts: config.http.allowedHosts,
      allowedOrigins: config.http.allowedOrigins,
      logger,
      handler,
      configureApp: (app) => {
        // Register before the transport's final JSON error handler.
        app.get('/api/widget', (_req, res) => {
          const stats = cache.widgetStats();
          res.json({
            lookups_total: stats.lookups_total,
            cache_hit_pct: stats.cache_hit_pct,
            cache_size_bytes: stats.cache_size_bytes,
            uptime_seconds: Math.floor(process.uptime()),
          });
        });
      },
    });

    await httpTransport.start();
    stopTransport = () => httpTransport.stop();

    console.error(
      `Media Metadata MCP Server running on http://${config.http.host}:${config.http.port}${config.http.basePath}`
    );
  } else {
    stdioHandle = serveStdio(() => createMcpServer(true), {
      onerror: (error) => {
        logger.error('main', {
          action: 'stdio_error',
          error: error.message,
        });
      },
    });

    logger.info('main', {
      action: 'started',
      transport: 'stdio',
    });
  }
}

let stopTransport: (() => Promise<void>) | undefined;
let stdioHandle: { close(): Promise<void> } | undefined;

// Handle shutdown
async function shutdown() {
  logger.info('main', { action: 'shutting_down' });
  try {
    await stopTransport?.();
    await stdioHandle?.close();
  } catch (error) {
    logger.error('main', {
      action: 'transport_stop_failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
  cache.close();
  await shutdownTelemetry();
  process.exit(0);
}

// Graceful shutdown on signals
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logger.error('main', {
    action: 'unhandled_rejection',
    message,
    stack,
  });
});

// Handle uncaught exceptions - log and exit
process.on('uncaughtException', (error: Error) => {
  logger.error('main', {
    action: 'uncaught_exception',
    message: error.message,
    stack: error.stack,
  });
  void shutdown();
});

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
