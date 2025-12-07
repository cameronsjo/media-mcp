#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  SetLevelRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { Logger } from './utils/logger.js';
import { RateLimiter } from './utils/rate-limiter.js';
import { SQLiteCache, type CacheOptions } from './cache/sqlite-cache.js';
import { OpenLibrarySource } from './sources/open-library.js';
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
import type { LogLevel } from './types/common.js';

// Configuration from environment variables
const config = {
  server: {
    name: 'media-metadata-mcp',
    version: '1.0.0',
  },
  transport: (process.env.MCP_TRANSPORT || 'stdio') as 'stdio' | 'http',
  http: {
    port: parseInt(process.env.MCP_HTTP_PORT || '3000', 10),
    host: process.env.MCP_HTTP_HOST || '127.0.0.1',
    basePath: process.env.MCP_HTTP_PATH || '/mcp',
  },
  apis: {
    tmdb: {
      apiKey: process.env.TMDB_API_KEY || '',
    },
  },
  cache: {
    enabled: process.env.MCP_CACHE_ENABLED !== 'false',
    path: process.env.MCP_CACHE_PATH || './cache.db',
    defaultTTLHours: parseInt(process.env.MCP_CACHE_TTL_HOURS || '168', 10),
  } as CacheOptions,
  logging: {
    level: (process.env.MCP_LOG_LEVEL || 'info') as LogLevel,
  },
};

// Parse command line arguments
const args = process.argv.slice(2);
if (args.includes('--transport') && args.includes('http')) {
  config.transport = 'http';
}
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Media Metadata MCP Server

Usage: media-metadata-mcp [options]

Options:
  --transport <type>   Transport type: stdio (default) or http
  --help, -h           Show this help message

Environment Variables:
  MCP_TRANSPORT        Transport type (stdio or http)
  MCP_HTTP_PORT        HTTP server port (default: 3000)
  MCP_HTTP_HOST        HTTP server host (default: 127.0.0.1)
  MCP_HTTP_PATH        HTTP endpoint path (default: /mcp)
  TMDB_API_KEY         TMDB API key (required for movie/TV lookups)
  MCP_CACHE_ENABLED    Enable caching (default: true)
  MCP_CACHE_PATH       SQLite cache database path (default: ./cache.db)
  MCP_CACHE_TTL_HOURS  Default cache TTL in hours (default: 168)
  MCP_LOG_LEVEL        Log level: debug, info, warning, error (default: info)
`);
  process.exit(0);
}

// Initialize components
const logger = new Logger(config.server.name);
logger.setLevel(config.logging.level);

const rateLimiter = new RateLimiter(logger);
const cache = new SQLiteCache(config.cache, logger);

// Initialize sources
const openLibrary = new OpenLibrarySource(cache, logger, rateLimiter);

let tmdb: TMDBSource | null = null;
if (config.apis.tmdb.apiKey) {
  tmdb = new TMDBSource(config.apis.tmdb.apiKey, cache, logger, rateLimiter);
} else {
  logger.warning('main', {
    message: 'TMDB_API_KEY not set. Movie and TV lookups will not be available.',
  });
}

// Initialize tools
const lookupBookTool = new LookupBookTool(openLibrary, logger);
const lookupMovieTool = tmdb ? new LookupMovieTool(tmdb, logger) : null;
const lookupTVTool = tmdb ? new LookupTVTool(tmdb, logger) : null;
const generateFrontmatterTool = new GenerateFrontmatterTool(logger);
const batchLookupTool = lookupMovieTool && lookupTVTool
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
    description: 'Look up book metadata by title, author, or ISBN. Returns comprehensive book information including series data, ratings, and cover images.',
    inputSchema: LookupBookInputSchema,
  },
];

if (lookupMovieTool) {
  tools.push({
    name: 'lookup_movie',
    description: 'Look up movie metadata by title and optional year. Returns comprehensive movie information including cast, director, ratings, and watch providers.',
    inputSchema: LookupMovieInputSchema,
  });
}

if (lookupTVTool) {
  tools.push({
    name: 'lookup_tv',
    description: 'Look up TV show metadata by title. Returns comprehensive show information including seasons, episodes, networks, and ratings.',
    inputSchema: LookupTVInputSchema,
  });
}

tools.push({
  name: 'generate_frontmatter',
  description: 'Convert a lookup result to Obsidian YAML frontmatter. Supports minimal, default, and full templates.',
  inputSchema: GenerateFrontmatterInputSchema,
});

if (batchLookupTool) {
  tools.push({
    name: 'batch_lookup',
    description: 'Batch look up multiple books, movies, or TV shows in a single request. Supports concurrent lookups for better performance.',
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

// Set up log emitter
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

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema),
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

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

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
    const errorObj = error as { code?: string; message?: string };

    logger.error('main', {
      action: 'tool_error',
      tool: name,
      error: errorObj.message || String(error),
    });

    // Return error in MCP format
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
  }
});

// Convert Zod schema to JSON Schema for MCP
function zodToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  // Use zod's built-in JSON schema generation if available
  // Otherwise, create a basic schema representation
  if ('_def' in schema) {
    const def = schema._def as { typeName?: string; shape?: () => Record<string, z.ZodType<unknown>> };

    if (def.typeName === 'ZodObject' && def.shape) {
      const shape = def.shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const propDef = (value as { _def: { typeName?: string; description?: string; innerType?: { _def: { typeName?: string } }; defaultValue?: () => unknown } })._def;
        let propSchema: Record<string, unknown> = {};

        if (propDef.typeName === 'ZodString') {
          propSchema = { type: 'string' };
        } else if (propDef.typeName === 'ZodNumber') {
          propSchema = { type: 'number' };
        } else if (propDef.typeName === 'ZodBoolean') {
          propSchema = { type: 'boolean' };
        } else if (propDef.typeName === 'ZodArray') {
          propSchema = { type: 'array' };
        } else if (propDef.typeName === 'ZodOptional') {
          const innerType = propDef.innerType?._def.typeName;
          if (innerType === 'ZodString') propSchema = { type: 'string' };
          else if (innerType === 'ZodNumber') propSchema = { type: 'number' };
          else if (innerType === 'ZodBoolean') propSchema = { type: 'boolean' };
          else propSchema = {};
        } else if (propDef.typeName === 'ZodDefault') {
          const innerType = propDef.innerType?._def.typeName;
          if (innerType === 'ZodBoolean') propSchema = { type: 'boolean', default: propDef.defaultValue?.() };
          else if (innerType === 'ZodNumber') propSchema = { type: 'number', default: propDef.defaultValue?.() };
          else propSchema = { default: propDef.defaultValue?.() };
        } else {
          propSchema = {};
        }

        if (propDef.description) {
          propSchema.description = propDef.description;
        }

        properties[key] = propSchema;

        // Check if required
        if (propDef.typeName !== 'ZodOptional' && propDef.typeName !== 'ZodDefault') {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }
  }

  return { type: 'object' };
}

// Start the server
async function main() {
  logger.info('main', {
    action: 'starting',
    transport: config.transport,
    cache_enabled: config.cache.enabled,
    tmdb_available: !!tmdb,
  });

  if (config.transport === 'http') {
    // Start HTTP transport
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

      // Handle JSON-RPC requests manually for HTTP transport
      // This is a simplified implementation - in production, use full MCP SDK HTTP support
      try {
        if (request.method === 'tools/list') {
          return {
            jsonrpc: '2.0' as const,
            id: request.id,
            result: {
              tools: tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: zodToJsonSchema(tool.inputSchema),
              })),
            },
          };
        }

        if (request.method === 'tools/call') {
          // Note: Full tool call support requires stdio transport
          // HTTP transport is primarily for health checks and basic queries
          return {
            jsonrpc: '2.0' as const,
            id: request.id,
            result: { content: [{ type: 'text', text: 'Use stdio transport for full functionality' }] },
          };
        }

        return {
          jsonrpc: '2.0' as const,
          id: request.id,
          error: { code: -32601, message: 'Method not found' },
        };
      } catch (error) {
        return {
          jsonrpc: '2.0' as const,
          id: request.id,
          error: { code: -32603, message: error instanceof Error ? error.message : 'Internal error' },
        };
      }
    });

    await httpTransport.start();

    console.error(`Media Metadata MCP Server running on http://${config.http.host}:${config.http.port}${config.http.basePath}`);
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
process.on('SIGINT', () => {
  logger.info('main', { action: 'shutting_down' });
  cache.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('main', { action: 'shutting_down' });
  cache.close();
  process.exit(0);
});

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
