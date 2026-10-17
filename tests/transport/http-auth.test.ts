import { createMcpHandler, Server } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Wrap the real comparison so tests can assert it runs on every attempt.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const { timingSafeEqual } = await import('node:crypto');
const { assertHttpAuthPolicy, bearerTokenMatches, isLoopbackHost } =
  await import('../../src/transport/http-auth.js');
const { StreamableHTTPTransport } = await import('../../src/transport/http-transport.js');
const { Logger } = await import('../../src/utils/logger.js');

const TOKEN = 'correct-horse-battery-staple-0123456789';

function createHandler() {
  return createMcpHandler(() => {
    const server = new Server(
      { name: 'auth-test', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    server.setRequestHandler('tools/list', async () => ({ tools: [] }));
    return server;
  });
}

function createTransport(options: {
  host?: string;
  authToken?: string;
  allowUnauthenticated?: boolean;
}) {
  const logger = new Logger('auth-test');
  logger.setLevel('error');
  return new StreamableHTTPTransport({
    port: 0,
    host: options.host ?? '127.0.0.1',
    basePath: '/mcp',
    logger,
    handler: createHandler(),
    authToken: options.authToken,
    allowUnauthenticated: options.allowUnauthenticated,
    configureApp: (app) => {
      app.get('/api/widget', (_req, res) => {
        res.json({ lookups_total: 0 });
      });
    },
  });
}

async function startHost(authToken: string | null = TOKEN) {
  const transport = createTransport({ authToken: authToken ?? undefined });
  const { createServer } = await import('node:http');
  const listener = createServer(transport.getApp());
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('No ephemeral listener address');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    base,
    async close() {
      await transport.stop();
      await new Promise<void>((resolve, reject) =>
        listener.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
}

function listTools(base: string, headers: Record<string, string> = {}, path = '/mcp') {
  return fetch(new URL(path, base), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
}

afterEach(() => {
  vi.mocked(timingSafeEqual).mockClear();
});

describe('bearer-token authentication', () => {
  it('rejects a missing token on /mcp and /api/* with 401 and a Bearer challenge', async () => {
    const host = await startHost();
    try {
      const mcp = await listTools(host.base);
      expect(mcp.status).toBe(401);
      expect(mcp.headers.get('www-authenticate')).toBe('Bearer');
      expect(await mcp.json()).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32001, message: 'Unauthorized' },
      });
      expect((await fetch(new URL('/api/widget', host.base))).status).toBe(401);
    } finally {
      await host.close();
    }
  });

  it.each([
    ['wrong token', `Bearer ${TOKEN.slice(0, -1)}x`],
    ['token prefix', `Bearer ${TOKEN.slice(0, 8)}`],
    ['token with suffix', `Bearer ${TOKEN}x`],
    ['wrong scheme', `Basic ${TOKEN}`],
    ['bare token', TOKEN],
    ['empty bearer', 'Bearer '],
  ])('rejects a %s with 401', async (_label, authorization) => {
    const host = await startHost();
    try {
      expect((await listTools(host.base, { authorization })).status).toBe(401);
      const widget = await fetch(new URL('/api/widget', host.base), {
        headers: { authorization },
      });
      expect(widget.status).toBe(401);
    } finally {
      await host.close();
    }
  });

  it('accepts the right token on /mcp and /api/*, with a case-insensitive scheme', async () => {
    const host = await startHost();
    try {
      const ok = await listTools(host.base, { authorization: `Bearer ${TOKEN}` });
      expect(ok.status).toBe(200);
      const body = await ok.text();
      const data = body.split('\n').find((line) => line.startsWith('data: '));
      expect(JSON.parse(data?.slice(6) ?? body)).toMatchObject({ result: { tools: [] } });
      expect((await listTools(host.base, { authorization: `bearer ${TOKEN}` })).status).toBe(200);
      const widget = await fetch(new URL('/api/widget', host.base), {
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      expect(widget.status).toBe(200);
    } finally {
      await host.close();
    }
  });

  it('protects path variants Express routes to the same handler', async () => {
    const host = await startHost();
    try {
      for (const path of ['/MCP', '/mcp/', '/Api/widget', '/api/widget/']) {
        const response = await listTools(host.base, {}, path);
        expect(response.status, path).toBe(401);
      }
    } finally {
      await host.close();
    }
  });

  it('denies unknown routes by default and no longer serves OAuth metadata', async () => {
    const host = await startHost();
    try {
      const metadata = await fetch(new URL('/.well-known/oauth-protected-resource', host.base));
      expect(metadata.status).toBe(401);
      const authed = await fetch(new URL('/.well-known/oauth-protected-resource', host.base), {
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      expect(authed.status).toBe(404);
    } finally {
      await host.close();
    }
  });

  it('leaves /health and CORS preflight open without the token', async () => {
    const host = await startHost();
    try {
      const health = await fetch(new URL('/health', host.base));
      expect(health.status).toBe(200);
      expect(Object.keys(await health.json()).sort()).toEqual(['sessions', 'status', 'timestamp']);
      const preflight = await fetch(new URL('/mcp', host.base), {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:4173', 'Access-Control-Request-Method': 'POST' },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization');
    } finally {
      await host.close();
    }
  });

  it('serves every route without a token when none is configured on loopback', async () => {
    const host = await startHost(null);
    try {
      expect((await listTools(host.base)).status).toBe(200);
      expect((await fetch(new URL('/api/widget', host.base))).status).toBe(200);
    } finally {
      await host.close();
    }
  });
});

describe('bearerTokenMatches', () => {
  it('runs one fixed-length constant-time comparison for every candidate', () => {
    const candidates = [
      undefined,
      '',
      'Bearer',
      'Bearer ',
      `Basic ${TOKEN}`,
      'Bearer x',
      `Bearer x${TOKEN.slice(1)}`, // differs at the first byte
      `Bearer ${TOKEN.slice(0, -1)}x`, // differs at the last byte
      `Bearer ${TOKEN}${'x'.repeat(4096)}`, // much longer than the secret
      `Bearer ${TOKEN}`,
    ];
    const results = candidates.map((candidate) => bearerTokenMatches(candidate, TOKEN));
    expect(results).toEqual([...Array<boolean>(candidates.length - 1).fill(false), true]);

    // No early return on malformed input or a length mismatch: every call
    // compares two equal-length digests, so timing does not reveal how much
    // of the token matched or how long it is.
    const calls = vi.mocked(timingSafeEqual).mock.calls;
    expect(calls).toHaveLength(candidates.length);
    for (const [a, b] of calls) {
      expect(a.byteLength).toBe(32);
      expect(b.byteLength).toBe(32);
    }
  });
});

describe('startup auth policy', () => {
  it.each(['127.0.0.1', '127.1.2.3', 'localhost', '::1', '[::1]'])(
    'treats %s as loopback',
    (host) => {
      expect(isLoopbackHost(host)).toBe(true);
    }
  );

  it.each(['0.0.0.0', '::', '[::]', '192.168.1.10', 'media.internal', '', '::ffff:10.0.0.1'])(
    'treats %j as reachable beyond loopback',
    (host) => {
      expect(isLoopbackHost(host)).toBe(false);
    }
  );

  it('refuses to listen beyond loopback without a token', () => {
    expect(() => assertHttpAuthPolicy({ host: '0.0.0.0' })).toThrow(/MCP_AUTH_TOKEN/);
    expect(() => createTransport({ host: '0.0.0.0' })).toThrow(/MCP_ALLOW_UNAUTHENTICATED/);
  });

  it('allows a non-loopback listener with a token or the explicit opt-out', () => {
    expect(() => assertHttpAuthPolicy({ host: '0.0.0.0', authToken: TOKEN })).not.toThrow();
    expect(() =>
      assertHttpAuthPolicy({ host: '0.0.0.0', allowUnauthenticated: true })
    ).not.toThrow();
    expect(() => assertHttpAuthPolicy({ host: '127.0.0.1' })).not.toThrow();
  });
});
