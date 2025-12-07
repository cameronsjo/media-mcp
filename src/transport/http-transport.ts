import express, { type Express, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger.js';

export interface StreamableHTTPTransportOptions {
  port: number;
  host: string;
  basePath: string;
  logger: Logger;
}

export interface MCPRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: unknown;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type RequestHandler = (request: MCPRequest, sessionId: string) => Promise<MCPResponse>;

interface Session {
  id: string;
  createdAt: number;
  lastActive: number;
}

/**
 * Streamable HTTP Transport for MCP (2025-11-25 spec)
 * Implements single-endpoint architecture with POST/GET/DELETE support
 */
export class StreamableHTTPTransport {
  private app: Express;
  private sessions: Map<string, Session> = new Map();
  private requestHandler: RequestHandler | null = null;
  private logger: Logger;
  private options: StreamableHTTPTransportOptions;

  constructor(options: StreamableHTTPTransportOptions) {
    this.options = options;
    this.logger = options.logger;
    this.app = express();

    this.setupMiddleware();
    this.setupRoutes();
    this.startSessionCleanup();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());

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

    // CORS for browser clients
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
      res.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');

      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });
  }

  private setupRoutes(): void {
    const basePath = this.options.basePath;

    // OAuth Protected Resource metadata (for clients that support OAuth)
    this.app.get('/.well-known/oauth-protected-resource', (_req, res) => {
      res.json({
        resource: `http://${this.options.host}:${this.options.port}${basePath}`,
        resource_documentation_uri: 'https://github.com/your-repo/media-metadata-mcp',
        mcp_version: '2025-11-25',
      });
    });

    // MCP endpoint - POST for requests
    this.app.post(basePath, async (req: Request, res: Response): Promise<void> => {
      try {
        // Get or create session
        let sessionId = req.headers['mcp-session-id'] as string;

        if (!sessionId) {
          sessionId = uuidv4();
          this.sessions.set(sessionId, {
            id: sessionId,
            createdAt: Date.now(),
            lastActive: Date.now(),
          });
        } else {
          const session = this.sessions.get(sessionId);
          if (session) {
            session.lastActive = Date.now();
          }
        }

        res.setHeader('Mcp-Session-Id', sessionId);

        if (!this.requestHandler) {
          res.status(503).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Server not ready',
            },
          });
          return;
        }

        const mcpRequest = req.body as MCPRequest;

        // Validate JSON-RPC request
        if (mcpRequest.jsonrpc !== '2.0' || !mcpRequest.method) {
          res.status(400).json({
            jsonrpc: '2.0',
            id: mcpRequest.id,
            error: {
              code: -32600,
              message: 'Invalid Request',
            },
          });
          return;
        }

        const response = await this.requestHandler(mcpRequest, sessionId);
        res.json(response);
      } catch (error) {
        this.logger.error('http-transport', {
          action: 'request_error',
          error: error instanceof Error ? error.message : String(error),
        });

        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
          },
        });
      }
    });

    // MCP endpoint - GET for SSE notifications (server-to-client)
    this.app.get(basePath, (req: Request, res: Response): void => {
      const sessionId = req.headers['mcp-session-id'] as string;

      if (!sessionId || !this.sessions.has(sessionId)) {
        res.status(400).json({
          error: 'Valid Mcp-Session-Id header required',
        });
        return;
      }

      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Mcp-Session-Id', sessionId);

      // Send initial ping
      res.write('event: ping\ndata: {}\n\n');

      // Keep connection alive with periodic pings
      const pingInterval = setInterval(() => {
        res.write('event: ping\ndata: {}\n\n');
      }, 30000);

      req.on('close', () => {
        clearInterval(pingInterval);
      });
    });

    // MCP endpoint - DELETE for session termination
    this.app.delete(basePath, (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string;

      if (sessionId && this.sessions.has(sessionId)) {
        this.sessions.delete(sessionId);
        this.logger.info('http-transport', {
          action: 'session_terminated',
          session_id: sessionId,
        });
      }

      res.json({ success: true });
    });

    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        sessions: this.sessions.size,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private startSessionCleanup(): void {
    // Clean up inactive sessions every 5 minutes
    setInterval(() => {
      const now = Date.now();
      const timeout = 30 * 60 * 1000; // 30 minutes

      for (const [id, session] of this.sessions) {
        if (now - session.lastActive > timeout) {
          this.sessions.delete(id);
          this.logger.debug('http-transport', {
            action: 'session_expired',
            session_id: id,
          });
        }
      }
    }, 5 * 60 * 1000);
  }

  setRequestHandler(handler: RequestHandler): void {
    this.requestHandler = handler;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.options.port, this.options.host, () => {
        this.logger.info('http-transport', {
          action: 'started',
          host: this.options.host,
          port: this.options.port,
          endpoint: this.options.basePath,
        });
        resolve();
      });
    });
  }
}
