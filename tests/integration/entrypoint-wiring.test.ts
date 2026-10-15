import { createServer } from 'node:net';
import { describe, expect, it, vi } from 'vitest';

const stdioState = vi.hoisted(() => ({
  factory: undefined as (() => unknown) | undefined,
  onerror: undefined as ((error: Error) => void) | undefined,
  close: vi.fn(async () => undefined),
}));

// The entrypoint owns stdio setup at module evaluation time. Keep the actual
// SDK server factory while replacing only the process stdin/stdout boundary.
vi.mock('@modelcontextprotocol/server/stdio', () => ({
  serveStdio: (factory: () => unknown, options: { onerror?: (error: Error) => void }) => {
    stdioState.factory = factory;
    stdioState.onerror = options.onerror;
    return { close: stdioState.close };
  },
}));

const controlledEnvKeys = [
  'TMDB_API_KEY',
  'GOOGLE_BOOKS_API_KEY',
  'HARDCOVER_API_KEY',
  'MCP_TRANSPORT',
  'MCP_HTTP_PORT',
  'MCP_HTTP_HOST',
  'MCP_HTTP_PATH',
  'MCP_ALLOWED_HOSTS',
  'MCP_ALLOWED_ORIGINS',
  'MCP_CACHE_ENABLED',
  'MCP_CACHE_PATH',
  'MCP_CACHE_TTL_BOOKS',
  'MCP_CACHE_TTL_MOVIES',
  'MCP_CACHE_TTL_TV',
  'MCP_CACHE_CLEANUP_INTERVAL_MS',
  'MCP_RATE_LIMIT_RPM',
  'MCP_RATE_LIMIT_RETRIES',
  'MCP_ENABLE_GOODREADS_SCRAPING',
  'MCP_LOG_LEVEL',
  'OTEL_ENABLED',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_SERVICE_NAME',
] as const;

const entrypointEvents = ['SIGINT', 'SIGTERM', 'unhandledRejection', 'uncaughtException'] as const;

type JsonObject = Record<string, unknown>;
type RpcPayload = { result?: JsonObject; error?: JsonObject };
type RequestHandler = (request: unknown) => unknown | Promise<unknown>;
type EventListener = (...args: never[]) => unknown;

function setEnvironment(values: Record<string, string>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const key of controlledEnvKeys) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  Object.assign(process.env, values);

  return () => {
    for (const key of controlledEnvKeys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function snapshotEntrypointListeners(): Map<string, EventListener[]> {
  return new Map(
    entrypointEvents.map((event) => [
      event,
      process.listeners(event).map((listener) => listener as EventListener),
    ])
  );
}

function restoreEntrypointListeners(snapshot: Map<string, EventListener[]>): void {
  for (const event of entrypointEvents) {
    process.removeAllListeners(event);
    for (const listener of snapshot.get(event) ?? []) {
      process.on(event, listener as never);
    }
  }
}

async function shutdownEntrypoint(
  snapshot: Map<string, EventListener[]>,
  exited: () => boolean,
  label: string
): Promise<void> {
  if (exited()) return;
  // Invoke only this import's cleanup callback, not other process listeners.
  const shutdown = process
    .listeners('SIGTERM')
    .find((listener) => !(snapshot.get('SIGTERM') ?? []).includes(listener as EventListener));
  if (!shutdown) return;
  shutdown();
  await waitUntil(exited, `${label} shutdown`);
}

async function waitUntil(predicate: () => boolean, label: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (!predicate()) throw new Error(`${label} timed out`);
}

async function acquirePort(): Promise<number> {
  const listener = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      listener.once('error', reject);
      listener.listen(0, '127.0.0.1', resolve);
    });
    const address = listener.address();
    if (!address || typeof address === 'string') throw new Error('No ephemeral port assigned');
    return address.port;
  } finally {
    if (listener.listening) {
      await new Promise<void>((resolve, reject) =>
        listener.close((error) => (error ? reject(error) : resolve()))
      );
    }
  }
}

async function postRpc(
  baseUrl: string,
  method: string,
  params?: JsonObject,
  id = 1
): Promise<{ response: Response; payload: RpcPayload }> {
  const response = await fetch(`${baseUrl}/mcp`, {
    signal: AbortSignal.timeout(5000),
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }),
  });
  const body = await response.text();
  const data = body
    .split('\n')
    .find((line) => line.startsWith('data: '))
    ?.slice('data: '.length);
  return { response, payload: JSON.parse(data ?? body) as RpcPayload };
}

function findRegisteredHandler(calls: unknown[][], method: string): RequestHandler {
  for (const call of [...calls].reverse()) {
    if (call[0] !== method) continue;
    const candidate = call.at(-1);
    if (typeof candidate === 'function') return candidate as RequestHandler;
  }
  throw new Error(`No registered handler found for ${method}`);
}

async function waitForHttp(baseUrl: string): Promise<void> {
  let lastError = 'HTTP server did not become ready';
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1000) });
      await response.arrayBuffer();
      if (response.ok) return;
      lastError = `health returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`${lastError} at ${baseUrl}`);
}

describe('entrypoint production wiring', () => {
  it('wires actual stdio callbacks and HTTP widget/tools without external providers', async () => {
    const baselineListeners = snapshotEntrypointListeners();
    let exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    stdioState.factory = undefined;
    stdioState.onerror = undefined;
    stdioState.close.mockClear();

    const restoreStdioEnv = setEnvironment({
      MCP_TRANSPORT: 'stdio',
      MCP_CACHE_PATH: ':memory:',
      MCP_ENABLE_GOODREADS_SCRAPING: 'false',
      MCP_LOG_LEVEL: 'info',
      OTEL_ENABLED: 'false',
      TMDB_API_KEY: 'wiring-test-key',
    });

    try {
      const sdk = await import('@modelcontextprotocol/server');
      const { Logger } = await import('../../src/utils/logger.js');
      const { SQLiteCache } = await import('../../src/cache/sqlite-cache.js');
      const setRequestHandler = vi.spyOn(sdk.Server.prototype, 'setRequestHandler');
      const setLevel = vi.spyOn(Logger.prototype, 'setLevel');
      const cacheClose = vi.spyOn(SQLiteCache.prototype, 'close');

      await import('../../src/index.ts');
      await waitUntil(() => typeof stdioState.factory === 'function', 'stdio factory');

      const callsBeforeFactory = setRequestHandler.mock.calls.length;
      const server = stdioState.factory!() as InstanceType<typeof sdk.Server>;
      const registrations = setRequestHandler.mock.calls
        .slice(callsBeforeFactory)
        .map((call) => call as unknown as unknown[]);
      const listTools = findRegisteredHandler(registrations, 'tools/list');
      const callTool = findRegisteredHandler(registrations, 'tools/call');
      const setLoggingLevel = findRegisteredHandler(registrations, 'logging/setLevel');
      const notification = vi.spyOn(server, 'notification').mockResolvedValue(undefined);

      const listed = (await listTools({})) as { tools: Array<{ name: string }> };
      expect(listed.tools.map(({ name }) => name).sort()).toEqual([
        'batch_lookup',
        'generate_frontmatter',
        'lookup_book',
        'lookup_movie',
        'lookup_tv',
      ]);

      const frontmatter = (await callTool({
        params: {
          name: 'generate_frontmatter',
          arguments: {
            lookup_result: { title: 'Wiring Test', author: 'Test Author', page_count: 1 },
            template: 'minimal',
          },
        },
      })) as { content: Array<{ text: string }>; isError?: boolean };
      expect(frontmatter.isError).not.toBe(true);
      expect(frontmatter.content[0].text).toContain('title: Wiring Test');

      const invalid = (await callTool({ params: { name: 'lookup_book', arguments: {} } })) as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      expect(invalid.isError).toBe(true);
      expect(JSON.parse(invalid.content[0].text)).toMatchObject({
        error: { code: 'VALIDATION_ERROR', retryable: false, message: expect.any(String) },
      });
      const unknown = (await callTool({ params: { name: 'unknown_tool', arguments: {} } })) as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      expect(unknown.isError).toBe(true);
      expect(JSON.parse(unknown.content[0].text)).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Unknown tool: unknown_tool',
          retryable: false,
        },
      });

      expect(await setLoggingLevel({ params: { level: 'debug' } })).toEqual({});
      expect(setLevel.mock.calls.at(-1)).toEqual(['debug']);
      expect(notification).toHaveBeenCalledWith({
        method: 'notifications/message',
        params: expect.objectContaining({
          data: expect.objectContaining({ action: 'log_level_changed', level: 'debug' }),
        }),
      });

      expect(stdioState.onerror).toBeTypeOf('function');
      stdioState.onerror!(new Error('stdio wiring fault'));
      expect(notification).toHaveBeenCalledWith({
        method: 'notifications/message',
        params: expect.objectContaining({
          data: expect.objectContaining({ action: 'stdio_error', error: 'stdio wiring fault' }),
        }),
      });

      await shutdownEntrypoint(
        baselineListeners,
        () => exit.mock.calls.some(([code]) => code === 0),
        'stdio'
      );
      expect(cacheClose).toHaveBeenCalledOnce();
      expect(stdioState.close).toHaveBeenCalledOnce();
      setRequestHandler.mockRestore();
      setLevel.mockRestore();
    } finally {
      try {
        await shutdownEntrypoint(
          baselineListeners,
          () => exit.mock.calls.some(([code]) => code === 0),
          'stdio'
        );
      } finally {
        restoreStdioEnv();
        restoreEntrypointListeners(baselineListeners);
        vi.restoreAllMocks();
      }
    }

    vi.resetModules();

    const port = await acquirePort();
    const httpBaselineListeners = snapshotEntrypointListeners();
    exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const restoreHttpEnv = setEnvironment({
      MCP_TRANSPORT: 'http',
      MCP_HTTP_PORT: String(port),
      MCP_HTTP_HOST: '127.0.0.1',
      MCP_HTTP_PATH: '/mcp',
      MCP_CACHE_PATH: ':memory:',
      MCP_ENABLE_GOODREADS_SCRAPING: 'false',
      MCP_LOG_LEVEL: 'error',
      OTEL_ENABLED: 'false',
      TMDB_API_KEY: 'wiring-test-key',
    });

    try {
      const { SQLiteCache } = await import('../../src/cache/sqlite-cache.js');
      const { Logger } = await import('../../src/utils/logger.js');
      const info = vi.spyOn(Logger.prototype, 'info');
      const setEmitter = vi.spyOn(Logger.prototype, 'setEmitter');
      const widgetStats = vi.spyOn(SQLiteCache.prototype, 'widgetStats');
      const cacheClose = vi.spyOn(SQLiteCache.prototype, 'close');
      await import('../../src/index.ts');

      const baseUrl = `http://127.0.0.1:${port}`;
      await waitForHttp(baseUrl);

      const initialWidget = await fetch(`${baseUrl}/api/widget`, {
        signal: AbortSignal.timeout(5000),
      });
      const initialWidgetBody = await initialWidget.text();
      expect(initialWidget.status).toBe(200);
      expect(JSON.parse(initialWidgetBody)).toMatchObject({ lookups_total: 0, cache_hit_pct: 0 });
      const cache = widgetStats.mock.instances.at(-1) as InstanceType<typeof SQLiteCache>;
      expect(cache).toBeDefined();
      cache.set('wiring-entry-one', { title: 'One' }, 'wiring-test');
      cache.set('wiring-entry-two', { title: 'Two' }, 'wiring-test');
      expect(cache.get('wiring-entry-one')?.value).toEqual({ title: 'One' });
      expect(cache.get('wiring-entry-two')?.value).toEqual({ title: 'Two' });

      const widget = await (
        await fetch(`${baseUrl}/api/widget`, { signal: AbortSignal.timeout(5000) })
      ).json();
      expect(widget).toMatchObject({
        lookups_total: 4,
        cache_hit_pct: 50,
        cache_size_bytes: 0,
      });
      expect(widget.uptime_seconds).toEqual(expect.any(Number));
      expect(Number.isInteger(widget.uptime_seconds)).toBe(true);

      const listed = await postRpc(baseUrl, 'tools/list');
      expect(listed.response.status).toBe(200);
      expect(listed.payload.result?.tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'generate_frontmatter' }),
          expect.objectContaining({ name: 'lookup_movie' }),
        ])
      );

      const called = await postRpc(
        baseUrl,
        'tools/call',
        {
          name: 'generate_frontmatter',
          arguments: {
            lookup_result: { title: 'HTTP Wiring', author: 'Test Author', page_count: 1 },
            template: 'minimal',
          },
        },
        2
      );
      expect(called.response.status).toBe(200);
      expect(called.payload.result?.content).toEqual([
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('title: HTTP Wiring'),
        }),
      ]);

      const level = await postRpc(baseUrl, 'logging/setLevel', { level: 'debug' }, 3);
      expect(level.response.status).toBe(200);
      expect(level.payload.result).toEqual({});
      expect(info).toHaveBeenCalledWith('main', { action: 'log_level_changed', level: 'debug' });
      expect(setEmitter).not.toHaveBeenCalled();

      await shutdownEntrypoint(
        httpBaselineListeners,
        () => exit.mock.calls.some(([code]) => code === 0),
        'HTTP'
      );
      expect(cacheClose).toHaveBeenCalledOnce();
    } finally {
      try {
        await shutdownEntrypoint(
          httpBaselineListeners,
          () => exit.mock.calls.some(([code]) => code === 0),
          'HTTP'
        );
      } finally {
        restoreHttpEnv();
        restoreEntrypointListeners(httpBaselineListeners);
        vi.restoreAllMocks();
      }
    }
  }, 30_000);
});
