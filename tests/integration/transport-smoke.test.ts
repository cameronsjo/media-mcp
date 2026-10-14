import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
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

const initializeRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'transport-smoke-test', version: '1.0.0' },
  },
};

type HttpPayload = {
  result?: {
    capabilities?: unknown;
    protocolVersion?: unknown;
    serverInfo?: unknown;
    tools?: unknown[];
  };
  error?: { message?: string };
};

type SpawnedServer = {
  child: ChildProcess;
  stderr: string;
  spawnError?: Error;
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

async function postMcp(
  url: string,
  request: Record<string, unknown>,
  deadline: number,
  sessionId?: string
): Promise<{ response: Response; payload: HttpPayload }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(Math.min(2000, remaining(deadline))),
  });
  return { response, payload: (await response.json()) as HttpPayload };
}

async function waitForHttpInitialize(
  server: SpawnedServer,
  url: string,
  deadline: number
): Promise<{ response: Response; payload: HttpPayload; sessionId: string }> {
  let lastError = 'server did not become ready';
  while (Date.now() < deadline) {
    if (server.spawnError) throw server.spawnError;
    if (!isRunning(server.child)) {
      throw new Error(`HTTP server exited before readiness: ${server.stderr}`);
    }

    try {
      const result = await postMcp(url, initializeRequest, deadline);
      if (result.response.ok) {
        const sessionId = result.response.headers.get('mcp-session-id');
        if (!sessionId) throw new Error('HTTP initialize response omitted Mcp-Session-Id');
        return { ...result, sessionId };
      }
      lastError = `HTTP initialize returned ${result.response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(Math.min(100, remaining(deadline)));
  }
  throw new Error(`${lastError}: ${server.stderr}`);
}

describe('built transport smoke test', () => {
  it('exposes the same tools over SDK stdio and HTTP JSON-RPC', async () => {
    expect(existsSync(serverEntrypoint)).toBe(true);
    const deadline = Date.now() + smokeTimeoutMs;

    const stdioTransport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntrypoint],
      cwd: repoRoot,
      env: childEnvironment({ MCP_TRANSPORT: 'stdio' }),
      stderr: 'pipe',
    });
    const stdioClient = new Client({ name: 'transport-smoke-stdio', version: '1.0.0' });
    let stdioStderr = '';
    stdioTransport.stderr?.on('data', (chunk: Buffer) => {
      stdioStderr += chunk.toString();
    });

    let stdioTools: unknown[];
    try {
      await withTimeout(
        stdioClient.connect(stdioTransport),
        remaining(deadline),
        `stdio connect${stdioStderr ? ` (${stdioStderr})` : ''}`
      );
      stdioTools = (
        await withTimeout(stdioClient.listTools(), remaining(deadline), 'stdio tools/list')
      ).tools;
    } finally {
      await stdioClient.close();
    }

    const port = await acquirePort();
    const httpServer = spawnHttpServer(port);
    try {
      const url = `http://127.0.0.1:${port}/mcp`;
      const initialized = await waitForHttpInitialize(httpServer, url, deadline);
      expect(initialized.payload.error).toBeUndefined();
      expect(initialized.payload.result).toMatchObject({
        protocolVersion: '2025-11-25',
        capabilities: { tools: {}, logging: {} },
        serverInfo: { name: 'media-metadata-mcp', version: expect.any(String) },
      });

      const listed = await postMcp(
        url,
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        deadline,
        initialized.sessionId
      );
      expect(listed.response.status).toBe(200);
      expect(listed.payload.error).toBeUndefined();

      const httpTools = listed.payload.result?.tools;
      expect(httpTools).toEqual(stdioTools);
      expect(httpTools?.map((tool) => (tool as { name: string }).name).sort()).toEqual(
        expectedToolNames
      );
      for (const tool of httpTools ?? []) {
        expect(tool).toMatchObject({ inputSchema: { type: 'object' } });
        expect(tool).not.toHaveProperty('inputSchema.$schema');
      }
    } finally {
      await terminateChild(httpServer.child);
    }
  }, 30_000);
});
