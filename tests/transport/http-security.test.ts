import { createServer, request, type Server as HttpServer } from 'node:http';
import { createMcpHandler, Server } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { StreamableHTTPTransport } from '../../src/transport/http-transport.js';
import { Logger } from '../../src/utils/logger.js';

async function startHost(
  allowlists: { allowedHosts?: string[]; allowedOrigins?: string[] } = {},
  failWidget = false
) {
  const handler = createMcpHandler(() => {
    const server = new Server(
      { name: 'security-test', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    server.setRequestHandler('tools/list', async () => ({ tools: [] }));
    return server;
  });
  const logger = new Logger('security-test');
  logger.setLevel('error');
  const transport = new StreamableHTTPTransport({
    port: 0,
    host: '127.0.0.1',
    basePath: '/mcp',
    logger,
    handler,
    ...allowlists,
    configureApp: (app) => {
      app.get('/api/widget', (_req, res) => {
        if (failWidget) throw new Error('private widget failure detail');
        res.json({ lookups_total: 0 });
      });
    },
  });
  // Host the actual middleware on an ephemeral listener, without adding a
  // public production API solely to expose the transport's assigned test port.
  const listener: HttpServer = createServer(transport.getApp());
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('No ephemeral listener address');
  const url = `http://127.0.0.1:${address.port}/mcp`;
  return {
    url,
    async close() {
      await transport.stop();
      await new Promise<void>((resolve, reject) =>
        listener.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
}

function listTools(url: string, headers: Record<string, string> = {}, method = 'POST') {
  // Fetch rewrites Host; node:http preserves the hostile header under test.
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      {
        method,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(res.headers)) {
            if (value !== undefined)
              responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value);
          }
          let body = Buffer.concat(chunks).toString('utf8');
          if (res.headers['content-type']?.includes('text/event-stream')) {
            body =
              body
                .split('\n')
                .find((line) => line.startsWith('data: '))
                ?.slice(6) ?? body;
          }
          resolve(new Response(body, { status: res.statusCode, headers: responseHeaders }));
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('HTTP guard test timed out')));
    req.end(
      method === 'POST'
        ? JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
        : undefined
    );
  });
}

describe('HTTP Host/Origin guards', () => {
  it('guards health and widget routes too, without treating Host as authentication', async () => {
    const host = await startHost();
    try {
      for (const path of ['/health', '/api/widget']) {
        const url = new URL(path, host.url).href;
        expect((await listTools(url, { Host: 'evil.example' }, 'GET')).status).toBe(403);
        expect((await listTools(url, { Origin: 'http://evil.example' }, 'GET')).status).toBe(403);
        // Native clients can supply an allowed Host; header validation is not auth.
        expect((await listTools(url, { Host: 'localhost' }, 'GET')).status).toBe(200);
      }
    } finally {
      await host.close();
    }
  });

  it('returns sanitized JSON for route exceptions and oversized request bodies', async () => {
    const host = await startHost({}, true);
    try {
      const failed = await fetch(new URL('/api/widget', host.url));
      expect(failed.status).toBe(500);
      expect(failed.headers.get('content-type')).toContain('application/json');
      expect(await failed.json()).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: 'Internal server error' },
      });
      const oversized = await fetch(host.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: 'x'.repeat(110_000) }),
      });
      expect(oversized.status).toBe(413);
      expect(oversized.headers.get('content-type')).toContain('application/json');
      expect(await oversized.json()).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: 'Request body too large' },
      });
    } finally {
      await host.close();
    }
  });

  it('serves native clients and reflects only allowed localhost origins', async () => {
    const host = await startHost();
    try {
      const native = await listTools(host.url);
      expect(native.status).toBe(200);
      expect(native.headers.get('access-control-allow-origin')).toBeNull();
      expect(await native.json()).toMatchObject({ result: { tools: [] } });

      const browser = await listTools(host.url, { Origin: 'http://localhost:4173' });
      expect(browser.status).toBe(200);
      expect(browser.headers.get('access-control-allow-origin')).toBe('http://localhost:4173');
      expect(browser.headers.get('vary')).toContain('Origin');
    } finally {
      await host.close();
    }
  });

  it.each([
    [{ Host: 'evil.example', Origin: 'http://localhost:4173' }, 'Invalid Host'],
    [{ Origin: 'http://evil.example' }, 'Invalid Origin'],
    [{ Origin: 'null' }, 'Invalid Origin header'],
    [{ Origin: 'not-an-origin' }, 'Invalid Origin header'],
  ] as const)('rejects an untrusted header before dispatch: %j', async (headers, reason) => {
    const host = await startHost();
    try {
      const response = await listTools(host.url, headers);
      expect(response.status).toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      expect(await response.json()).toMatchObject({
        error: { code: -32000, message: expect.stringContaining(reason) },
      });
    } finally {
      await host.close();
    }
  });

  it('requires explicit LAN Host and Origin allowlists, independently', async () => {
    const host = await startHost({
      allowedHosts: ['media.internal'],
      allowedOrigins: ['ui.internal'],
    });
    try {
      const allowed = await listTools(host.url, {
        Host: 'media.internal:3000',
        Origin: 'http://ui.internal:4173',
      });
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get('access-control-allow-origin')).toBe('http://ui.internal:4173');
      expect(
        (await listTools(host.url, { Host: 'other.internal', Origin: 'http://ui.internal:4173' }))
          .status
      ).toBe(403);
      expect(
        (await listTools(host.url, { Host: 'media.internal', Origin: 'http://other.internal' }))
          .status
      ).toBe(403);
      // Custom allowances extend, rather than remove, the safe localhost path.
      expect((await listTools(host.url)).status).toBe(200);
    } finally {
      await host.close();
    }
  });

  it('rejects foreign preflights and returns a JSON parse error without a stack trace', async () => {
    const host = await startHost();
    try {
      const preflight = await fetch(host.url, {
        method: 'OPTIONS',
        headers: { Origin: 'http://foreign.example', 'Access-Control-Request-Method': 'POST' },
      });
      expect(preflight.status).toBe(403);
      expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
      const malformed = await fetch(host.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"secret":',
      });
      expect(malformed.status).toBe(400);
      expect(malformed.headers.get('content-type')).toContain('application/json');
      expect(await malformed.json()).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Invalid JSON body' },
      });
    } finally {
      await host.close();
    }
  });
});
