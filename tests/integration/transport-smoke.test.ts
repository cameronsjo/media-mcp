import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const serverEntrypoint = resolve(repoRoot, 'dist/index.js');
const smokeTimeoutMs = 20_000;

const expectedToolNames = [
  'batch_lookup',
  'generate_frontmatter',
  'lookup_book',
  'lookup_movie',
  'lookup_tv',
];

type SpawnedServer = {
  child: ChildProcess;
  stderr: string;
  spawnError?: Error;
};

type RecordedExchange = {
  request: Request;
  response: Response;
};

function remaining(deadline: number): number {
  return Math.max(1, deadline - Date.now());
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function acquirePort(): Promise<number> {
  const listener = createServer();
  try {
    await new Promise<void>((resolveListen, reject) => {
      listener.once('error', reject);
      listener.listen(0, '127.0.0.1', () => resolveListen());
    });

    const address = listener.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine the ephemeral HTTP port');
    }
    return address.port;
  } finally {
    if (listener.listening) {
      await new Promise<void>((resolveClose, reject) => {
        listener.close((error) => (error ? reject(error) : resolveClose()));
      });
    }
  }
}

function childEnvironment(overrides: Record<string, string>): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '',
    MCP_CACHE_PATH: ':memory:',
    MCP_ENABLE_GOODREADS_SCRAPING: 'false',
    MCP_LOG_LEVEL: 'error',
    OTEL_ENABLED: 'false',
    TMDB_API_KEY: 'transport-smoke-test',
    ...overrides,
  };
}

function spawnHttpServer(port: number): SpawnedServer {
  const spawned: SpawnedServer = {
    child: spawn(process.execPath, [serverEntrypoint, '--transport', 'http'], {
      cwd: repoRoot,
      env: childEnvironment({
        MCP_HTTP_HOST: '127.0.0.1',
        MCP_HTTP_PORT: String(port),
        MCP_HTTP_PATH: '/mcp',
      }),
      stdio: ['ignore', 'ignore', 'pipe'],
    }),
    stderr: '',
  };

  spawned.child.once('error', (error) => {
    spawned.spawnError = error;
  });
  spawned.child.stderr?.on('data', (chunk: Buffer) => {
    spawned.stderr += chunk.toString();
  });
  return spawned;
}

function isRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

async function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (!isRunning(child)) return true;

  return new Promise((resolveExit) => {
    const onExit = () => {
      clearTimeout(timer);
      resolveExit(true);
    };
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolveExit(!isRunning(child));
    }, timeoutMs);
    child.once('exit', onExit);
  });
}

async function terminateChild(child: ChildProcess): Promise<void> {
  if (!isRunning(child)) return;

  child.kill('SIGTERM');
  if (await waitForChildExit(child, 3000)) return;

  child.kill('SIGKILL');
  await waitForChildExit(child, 2000);
}

async function waitForHttpReady(
  server: SpawnedServer,
  port: number,
  deadline: number
): Promise<void> {
  let lastError = 'server did not become ready';
  while (Date.now() < deadline) {
    if (server.spawnError) throw server.spawnError;
    if (!isRunning(server.child)) {
      throw new Error(`HTTP server exited before readiness: ${server.stderr}`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(Math.min(2000, remaining(deadline))),
      });
      if (response.ok) {
        expect(await response.json()).toMatchObject({ status: 'healthy', sessions: 0 });
        return;
      }
      lastError = `health returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(Math.min(100, remaining(deadline)));
  }
  throw new Error(`${lastError}: ${server.stderr}`);
}

function recordingFetch(exchanges: RecordedExchange[]) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const recordedRequest = request.clone();
    const response = await fetch(request);
    exchanges.push({ request: recordedRequest, response: response.clone() });
    return response;
  };
}

async function assertNoSessionHeaders(exchanges: RecordedExchange[]): Promise<void> {
  expect(exchanges.length).toBeGreaterThan(0);
  for (const exchange of exchanges) {
    expect(exchange.request.headers.has('mcp-session-id')).toBe(false);
    expect(exchange.response.headers.has('mcp-session-id')).toBe(false);
  }
}

async function listWithClient(client: Client, deadline: number, label: string): Promise<unknown[]> {
  return (
    await withTimeout(
      client.listTools(undefined, { cacheMode: 'bypass' }),
      remaining(deadline),
      label
    )
  ).tools;
}

async function connectStdio(
  deadline: number,
  negotiation: { mode: { pin: string } } | undefined,
  label: string,
  options: { logLevel?: string; callTool?: boolean } = {}
): Promise<{ tools: unknown[]; stderr: string }> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntrypoint],
    cwd: repoRoot,
    env: childEnvironment({
      MCP_TRANSPORT: 'stdio',
      ...(options.logLevel ? { MCP_LOG_LEVEL: options.logLevel } : {}),
    }),
    stderr: 'pipe',
  });
  const client = new Client(
    { name: `transport-smoke-${label}`, version: '1.0.0' },
    negotiation ? { versionNegotiation: negotiation } : undefined
  );
  let stderr = '';
  transport.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  try {
    await withTimeout(
      client.connect(transport),
      remaining(deadline),
      `${label} stdio connect${stderr}`
    );
    const tools = await listWithClient(client, deadline, `${label} stdio tools/list`);
    if (options.callTool) {
      const result = await withTimeout(
        client.callTool({
          name: 'generate_frontmatter',
          arguments: {
            lookup_result: { title: 'Stdio Smoke', author: 'Transport Test', page_count: 1 },
            template: 'minimal',
          },
        }),
        remaining(deadline),
        `${label} stdio tools/call`
      );
      expect(result.isError).not.toBe(true);
    }
    return { tools, stderr };
  } finally {
    await withTimeout(client.close(), remaining(deadline), `${label} stdio close`);
  }
}

describe('built transport smoke test', () => {
  it('serves modern and legacy clients over stateless stdio and HTTP', async () => {
    expect(existsSync(serverEntrypoint)).toBe(true);
    const deadline = Date.now() + smokeTimeoutMs;

    const modernStdio = await connectStdio(deadline, { mode: { pin: '2026-07-28' } }, 'modern', {
      logLevel: 'info',
      callTool: true,
    });
    expect(modernStdio.stderr).not.toContain('MethodNotSupportedByProtocolVersion');
    expect(modernStdio.stderr).not.toContain('unhandledRejection');
    expect(modernStdio.stderr).not.toContain('unhandled_rejection');
    const legacyStdio = await connectStdio(deadline, undefined, 'legacy');
    expect(legacyStdio.tools).toEqual(modernStdio.tools);

    const port = await acquirePort();
    const httpServer = spawnHttpServer(port);
    try {
      const url = new URL(`http://127.0.0.1:${port}/mcp`);
      await waitForHttpReady(httpServer, port, deadline);

      const modernExchanges: RecordedExchange[] = [];
      const modernTransport = new StreamableHTTPClientTransport(url, {
        fetch: recordingFetch(modernExchanges),
      });
      const modernClient = new Client(
        { name: 'transport-smoke-modern-http', version: '1.0.0' },
        { versionNegotiation: { mode: { pin: '2026-07-28' } } }
      );
      let modernHttpTools: unknown[];
      try {
        await withTimeout(
          modernClient.connect(modernTransport),
          remaining(deadline),
          'modern HTTP connect'
        );
        modernHttpTools = await listWithClient(modernClient, deadline, 'modern HTTP tools/list');
        const concurrent = await Promise.all([
          listWithClient(modernClient, deadline, 'modern HTTP concurrent tools/list 1'),
          listWithClient(modernClient, deadline, 'modern HTTP concurrent tools/list 2'),
        ]);
        expect(concurrent[0]).toEqual(modernHttpTools);
        expect(concurrent[1]).toEqual(modernHttpTools);

        const frontmatter = await withTimeout(
          modernClient.callTool({
            name: 'generate_frontmatter',
            arguments: {
              lookup_result: { title: 'Smoke Test', author: 'Transport Test', page_count: 1 },
              template: 'minimal',
            },
          }),
          remaining(deadline),
          'modern HTTP tools/call'
        );
        expect(frontmatter.isError).not.toBe(true);
        expect(frontmatter.content[0]).toMatchObject({
          type: 'text',
          text: expect.stringContaining('title: Smoke Test'),
        });
      } finally {
        await withTimeout(modernClient.close(), remaining(deadline), 'modern HTTP close');
      }

      expect(modernHttpTools).toEqual(modernStdio.tools);
      expect(modernHttpTools.map((tool) => (tool as { name: string }).name).sort()).toEqual(
        expectedToolNames
      );
      for (const tool of modernHttpTools) {
        expect(tool).toMatchObject({ inputSchema: { type: 'object' } });
        expect(tool).not.toHaveProperty('inputSchema.$schema');
      }
      await assertNoSessionHeaders(modernExchanges);
      expect(
        modernExchanges.every(
          (exchange) => exchange.request.headers.get('mcp-method') !== 'initialize'
        )
      ).toBe(true);
      expect(modernExchanges.some((exchange) => exchange.request.headers.has('mcp-method'))).toBe(
        true
      );
      const modernToolCall = modernExchanges.find(
        (exchange) => exchange.request.headers.get('mcp-method') === 'tools/call'
      );
      expect(modernToolCall).toBeDefined();
      expect(modernToolCall?.request.headers.has('mcp-name')).toBe(true);

      const cors = await fetch(url, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://example.test',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,mcp-protocol-version,mcp-method,mcp-name',
        },
      });
      expect(cors.status).toBe(204);
      expect(cors.headers.get('access-control-allow-headers')).toContain('Mcp-Protocol-Version');

      const modernListRequest = modernExchanges.find(
        (exchange) => exchange.request.headers.get('mcp-method') === 'tools/list'
      );
      expect(modernListRequest).toBeDefined();
      const mismatchedHeaders = new Headers(modernListRequest?.request.headers);
      mismatchedHeaders.set('Mcp-Protocol-Version', '2025-11-25');
      const mismatch = await fetch(url, {
        method: 'POST',
        headers: mismatchedHeaders,
        body: JSON.stringify(await modernListRequest?.request.clone().json()),
      });
      expect(mismatch.status).toBe(400);
      const modernListResponse = await Promise.all(
        modernExchanges.map(async (exchange) => {
          const payload = (await exchange.response.json()) as {
            result?: { tools?: unknown[]; ttlMs?: unknown; cacheScope?: unknown };
          };
          return payload.result?.tools ? payload : undefined;
        })
      );
      expect(modernListResponse.filter(Boolean)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            result: expect.objectContaining({ ttlMs: 0, cacheScope: 'private' }),
          }),
        ])
      );

      const legacyExchanges: RecordedExchange[] = [];
      const legacyTransport = new StreamableHTTPClientTransport(url, {
        fetch: recordingFetch(legacyExchanges),
      });
      const legacyClient = new Client({ name: 'transport-smoke-legacy-http', version: '1.0.0' });
      try {
        await withTimeout(
          legacyClient.connect(legacyTransport),
          remaining(deadline),
          'legacy HTTP connect'
        );
        const legacyHttpTools = await listWithClient(
          legacyClient,
          deadline,
          'legacy HTTP tools/list'
        );
        expect(legacyHttpTools).toEqual(legacyStdio.tools);
      } finally {
        await withTimeout(legacyClient.close(), remaining(deadline), 'legacy HTTP close');
      }
      await assertNoSessionHeaders(legacyExchanges);
    } finally {
      await terminateChild(httpServer.child);
    }
  }, 60_000);
});
