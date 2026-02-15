#!/usr/bin/env node

import { createRequire } from 'module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  SetLevelRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Read version from package.json
const require = createRequire(import.meta.url);
const { version: packageVersion } = require('../package.json') as { version: string };

import { Logger } from './utils/logger.js';
import { RateLimiter } from './utils/rate-limiter.js';
import { SQLiteCache, type CacheOptions } from './cache/sqlite-cache.js';
import { OpenLibrarySource } from './sources/open-library.js';
import { GoogleBooksSource } from './sources/google-books.js';
import { GoodreadsSource } from './sources/goodreads.js';
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
  },
  apis: {
    tmdb: {
      apiKey: appConfig.tmdbApiKey || '',
    },
    googleBooks: {
      apiKey: appConfig.googleBooksApiKey || null,
    },
  },
  cache: {
    enabled: appConfig.cacheEnabled,
    path: appConfig.cachePath,
    defaultTTLHours: Math.floor(appConfig.cacheTtlBooks / 3600),
  } as CacheOptions,
  logging: {
    level: appConfig.logLevel as LogLevel,
  },
  goodreads: {
    enabled: appConfig.enableGoodreadsScraping,
    delayMs: 2000,
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

  Transport:
    MCP_TRANSPORT                 Transport type: stdio or http (default: stdio)
    MCP_HTTP_PORT                 HTTP server port (default: 3000)
    MCP_HTTP_HOST                 HTTP server host (default: 127.0.0.1)
    MCP_HTTP_PATH                 HTTP endpoint path (default: /mcp)

  Cache:
    MCP_CACHE_ENABLED             Enable caching (default: true)
    MCP_CACHE_PATH                SQLite cache database path (default: ./cache.db)
    MCP_CACHE_TTL_BOOKS           Book cache TTL in seconds (default: 604800)
    MCP_CACHE_TTL_MOVIES          Movie cache TTL in seconds (default: 86400)
    MCP_CACHE_TTL_TV              TV cache TTL in seconds (default: 86400)

  Rate Limiting:
    MCP_RATE_LIMIT_RPM            Requests per minute (default: 30)
    MCP_RATE_LIMIT_RETRIES        Retry attempts (default: 3)

  Features:
    MCP_ENABLE_GOODREADS_SCRAPING Enable Goodreads scraping (default: true)
    MCP_ENABLE_COVER_DOWNLOAD     Enable cover image download (default: false)
    MCP_COVER_DOWNLOAD_DIR        Cover download directory (default: ./covers)

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
const bookSources = { openLibrary, googleBooks, goodreads };
const lookupBookTool = new LookupBookTool(openLibrary, logger, bookSources);
const lookupMovieTool = tmdb ? new LookupMovieTool(tmdb, logger) : null;
const lookupTVTool = tmdb ? new LookupTVTool(tmdb, logger) : null;
const generateFrontmatterTool = new GenerateFrontmatterTool(logger);
const batchLookupTool =
  lookupMovieTool && lookupTVTool
    ? new BatchLookupTool(lookupBookTool, lookupMovieTool, lookupTVTool, logger)
    : null;

// Tool definitions
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
}

const tools: ToolDefinition[] = [
  {
    name: 'lookup_book',
    description:
      'Look up book metadata by title, author, or ISBN. Searches Open Library, Google Books, and Goodreads for comprehensive information including series data, ratings, and cover images.',
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

// Create MCP server
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

// Set up log emitter (only for stdio transport where server is connected)
// For HTTP transport, logs are written to stderr only
if (config.transport === 'stdio') {
  logger.setEmitter((entry) => {
    server.notification({
      method: 'notifications/message',
      params: {
        level: entry.level,
        logger: entry.logger,
        data: entry.data,
      },
    });
  });
}

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: toMcpInputSchema(tool.inputSchema),
    })),
  };
});

// Handle set logging level request
server.setRequestHandler(SetLevelRequestSchema, async (request) => {
  const level = request.params.level as LogLevel;
  logger.setLevel(level);
  logger.info('main', { action: 'log_level_changed', level });
  return {};
});

/**
 * Execute a tool call and record telemetry
 */
async function executeToolCall(
  name: string,
  args: unknown
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
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

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return executeToolCall(name, args);
});

/**
 * Convert Zod schema to JSON Schema for MCP tool registration.
 * Uses zod-to-json-schema library for robust conversion.
 */
function toMcpInputSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema, {
    $refStrategy: 'none', // Inline all definitions for MCP compatibility
  });
  // Remove $schema property as MCP doesn't need it
  const { $schema: _, ...schemaWithoutMeta } = jsonSchema as Record<string, unknown>;
  return schemaWithoutMeta;
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
    // Start HTTP transport with full tool call support
    const httpTransport = new StreamableHTTPTransport({
      port: config.http.port,
      host: config.http.host,
      basePath: config.http.basePath,
      logger,
    });

    httpTransport.setRequestHandler(async (request, sessionId) => {
      logger.debug('main', {
        action: 'http_request',
        method: request.method,
        session_id: sessionId,
      });

      try {
        // Handle initialize
        if (request.method === 'initialize') {
          return {
            jsonrpc: '2.0' as const,
            id: request.id,
            result: {
              protocolVersion: '2025-11-25',
              capabilities: {
                tools: {},
                logging: {},
              },
              serverInfo: {
                name: config.server.name,
                version: config.server.version,
              },
            },
          };
        }

        // Handle tools/list
        if (request.method === 'tools/list') {
          return {
            jsonrpc: '2.0' as const,
            id: request.id,
            result: {
              tools: tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: toMcpInputSchema(tool.inputSchema),
              })),
            },
          };
        }

        // Handle tools/call with full implementation
        if (request.method === 'tools/call') {
          const params = request.params as { name: string; arguments?: unknown };
          const result = await executeToolCall(params.name, params.arguments || {});

          return {
            jsonrpc: '2.0' as const,
            id: request.id,
            result,
          };
        }

        // Handle logging/setLevel
        if (request.method === 'logging/setLevel') {
          const params = request.params as { level: string };
          logger.setLevel(params.level as LogLevel);
          return {
            jsonrpc: '2.0' as const,
            id: request.id,
            result: {},
          };
        }

        // Handle ping
        if (request.method === 'ping') {
          return {
            jsonrpc: '2.0' as const,
            id: request.id,
            result: {},
          };
        }

        return {
          jsonrpc: '2.0' as const,
          id: request.id,
          error: { code: -32601, message: `Method not found: ${request.method}` },
        };
      } catch (error) {
        logger.error('main', {
          action: 'http_error',
          method: request.method,
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          jsonrpc: '2.0' as const,
          id: request.id,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal error',
          },
        };
      }
    });

    // Homepage dashboard widget endpoint (flat JSON for customapi widget)
    httpTransport.getApp().get('/api/widget', (_req, res) => {
      const stats = cache.widgetStats();
      res.json({
        lookups_total: stats.lookups_total,
        cache_hit_pct: stats.cache_hit_pct,
        cache_size_bytes: stats.cache_size_bytes,
        uptime_seconds: Math.floor(process.uptime()),
      });
    });

    await httpTransport.start();

    console.error(
      `Media Metadata MCP Server running on http://${config.http.host}:${config.http.port}${config.http.basePath}`
    );
  } else {
    // Start stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('main', {
      action: 'started',
      transport: 'stdio',
    });
  }
}

// Handle shutdown
async function shutdown() {
  logger.info('main', { action: 'shutting_down' });
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
