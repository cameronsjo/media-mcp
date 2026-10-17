import type http from 'node:http';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import {
  toNodeHandler,
  hostHeaderValidation,
  localhostHostValidation,
  originValidation,
} from '@modelcontextprotocol/node';
import {
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  type McpHttpHandler,
} from '@modelcontextprotocol/server';
import { assertHttpAuthPolicy, isLoopbackHost, requireBearerToken } from './http-auth.js';
import { Logger } from '../utils/logger.js';

export interface StreamableHTTPTransportOptions {
  port: number;
  host: string;
  basePath: string;
  logger: Logger;
  handler: McpHttpHandler;
  allowedHosts?: string[];
  allowedOrigins?: string[];
  /** Bearer token required on every route except /health and CORS preflight. */
  authToken?: string | undefined;
  /** Explicit opt-out allowing a non-loopback listener without a token. */
  allowUnauthenticated?: boolean | undefined;
  configureApp?: (app: Express) => void;
}

/**
 * Node host for the SDK's stateless HTTP handler.
 *
 * The MCP SDK owns protocol framing and per-request server instances. This
 * class retains the application's operational routes and host configuration,
 * but deliberately has no session or SSE bookkeeping of its own.
 */
export class StreamableHTTPTransport {
  private readonly app: Express;
  private server: http.Server | null = null;
  private readonly logger: Logger;
  private readonly options: StreamableHTTPTransportOptions;

  constructor(options: StreamableHTTPTransportOptions) {
    // Fail before building the app: a misconfigured exposure must not start.
    assertHttpAuthPolicy(options);
    this.options = options;
    this.logger = options.logger;
    if (!options.authToken && !isLoopbackHost(options.host)) {
      this.logger.warning('http-transport', {
        action: 'unauthenticated_exposure_allowed',
        host: options.host,
        reason: 'MCP_ALLOW_UNAUTHENTICATED is set and MCP_AUTH_TOKEN is not',
      });
    }
    this.app = express();

    this.setupMiddleware();
    this.setupRoutes();
    this.options.configureApp?.(this.app);
    // Must follow every route, including operational extensions, so Express
    // cannot replace application errors with an HTML stack-trace response.
    this.app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
      this.logger.error('http-transport', {
        action: 'handler_error',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      if (res.headersSent) {
        next(error);
        return;
      }
      const details = typeof error === 'object' && error !== null ? error : {};
      const parseFailed = 'type' in details && details.type === 'entity.parse.failed';
      const tooLarge = 'type' in details && details.type === 'entity.too.large';
      const status =
        'status' in details &&
        typeof details.status === 'number' &&
        Number.isInteger(details.status) &&
        details.status >= 400 &&
        details.status < 500
          ? details.status
          : 500;
      res.status(status).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: parseFailed ? -32700 : status < 500 ? -32000 : -32603,
          message: parseFailed
            ? 'Invalid JSON body'
            : tooLarge
              ? 'Request body too large'
              : status < 500
                ? 'Invalid request body'
                : 'Internal server error',
        },
      });
    });
  }

  private setupMiddleware(): void {
    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        this.logger.debug('http-transport', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration_ms: Date.now() - start,
        });
      });
      next();
    });

    // Validate before body parsing or CORS/preflight handling: rejecting only
    // POSTs would leave browser preflight and operational routes unprotected.
    const validateHost = this.options.allowedHosts
      ? hostHeaderValidation([
          ...new Set([...localhostAllowedHostnames(), ...this.options.allowedHosts]),
        ])
      : localhostHostValidation();
    const validateOrigin = originValidation([
      ...new Set([...localhostAllowedOrigins(), ...(this.options.allowedOrigins ?? [])]),
    ]);
    this.app.use((req, res, next) => {
      if (!validateHost(req, res) || !validateOrigin(req, res)) return;
      next();
    });

    // Only reflect an Origin that passed the SDK allowlist above. Requests
    // without Origin remain available to non-browser MCP clients.
    this.app.use((req, res, next) => {
      res.vary('Origin');
      if (typeof req.headers.origin === 'string' && req.headers.origin) {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
      }
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Mcp-Method, Mcp-Name'
      );
      res.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');

      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });

    // Default-deny: routes added later, including configureApp extensions, need
    // the token too. /health stays open because it reports only liveness; HEAD
    // is included because the Docker health check (`wget --spider`) sends it.
    // Runs before body parsing, so unauthenticated bodies are never parsed.
    const authToken = this.options.authToken;
    if (authToken) {
      const requireToken = requireBearerToken(authToken);
      this.app.use((req, res, next) => {
        if ((req.method === 'GET' || req.method === 'HEAD') && req.path === '/health') {
          next();
          return;
        }
        requireToken(req, res, next);
      });
    }

    this.app.use(express.json());
  }

  private setupRoutes(): void {
    const basePath = this.options.basePath;

    // The SDK adapter handles JSON-RPC validation, era negotiation, response
    // envelopes and stateless per-request Server construction.
    const nodeHandler = toNodeHandler(this.options.handler, {
      onerror: (error) => {
        this.logger.error('http-transport', {
          action: 'request_error',
          error: error.message,
        });
      },
    });
    this.app.all(basePath, (req, res, next) => {
      void nodeHandler(req, res, req.body).catch(next);
    });

    // Health remains an operational endpoint and is intentionally outside the
    // MCP handler. Stateless serving means there are no local sessions to
    // report, so retain the field for response compatibility with its value 0.
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        sessions: 0,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /** Expose the configured app; register operational routes via configureApp. */
  getApp(): Express {
    return this.app;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.options.port, this.options.host, () => {
        this.logger.info('http-transport', {
          action: 'started',
          host: this.options.host,
          port: this.options.port,
          endpoint: this.options.basePath,
          auth: this.options.authToken ? 'bearer' : 'none',
        });
        resolve();
      });
      this.server.once('error', reject);
    });
  }

  async stop(): Promise<void> {
    await this.options.handler.close();

    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        this.logger.info('http-transport', { action: 'stopped' });
        resolve();
      });
    });
  }
}
