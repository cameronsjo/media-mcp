import { createServer, type Server } from 'node:http';

import { describe, expect, it } from 'vitest';

import type { Config } from '../../src/utils/config.js';
import {
  initTelemetry,
  recordToolCall,
  shutdownTelemetry,
  withSpan,
} from '../../src/utils/telemetry.js';

interface CollectedRequest {
  contentType: string | string[] | undefined;
  method: string | undefined;
  path: string;
  payload: unknown;
}

interface Collector {
  endpoint: string;
  requests: CollectedRequest[];
  server: Server;
}

function makeConfig(otelEnabled: boolean, otelEndpoint?: string): Config {
  return {
    tmdbApiKey: undefined,
    googleBooksApiKey: undefined,
    hardcoverApiKey: undefined,
    transport: 'stdio',
    httpPort: 3000,
    httpHost: '127.0.0.1',
    httpPath: '/mcp',
    cacheEnabled: true,
    cachePath: ':memory:',
    cacheTtlBooks: 604800,
    cacheTtlMovies: 86400,
    cacheTtlTv: 86400,
    rateLimitRequestsPerMinute: 30,
    rateLimitRetryAttempts: 3,
    enableGoodreadsScraping: false,
    logLevel: 'error',
    otelEnabled,
    otelEndpoint,
    otelServiceName: 'telemetry-test',
  };
}

async function startCollector(): Promise<Collector> {
  const requests: CollectedRequest[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.from(chunk));
    });
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      let payload: unknown = body;
      try {
        payload = JSON.parse(body);
      } catch {
        // Preserve the raw body so a malformed exporter payload fails assertions below.
      }

      requests.push({
        contentType: request.headers['content-type'],
        method: request.method,
        path: request.url ?? '',
        payload,
      });
      response.statusCode = 200;
      response.end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    await closeCollector(server);
    throw new Error('Collector did not expose an ephemeral TCP address');
  }

  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    requests,
    server,
  };
}

async function closeCollector(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function waitForExports(requests: CollectedRequest[]): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const paths = new Set(requests.map((request) => request.path));
    if (paths.has('/v1/traces') && paths.has('/v1/metrics')) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('telemetry', () => {
  it('keeps disabled telemetry inert and exports real traces and metrics when enabled', async () => {
    const collector = await startCollector();

    try {
      // Keep the disabled path in the same test as the enabled path so the global
      // OpenTelemetry providers are initialized at most once in this Vitest worker.
      initTelemetry(makeConfig(false));
      await expect(withSpan('telemetry.disabled', {}, async () => 'disabled-result')).resolves.toBe(
        'disabled-result'
      );
      recordToolCall('disabled-tool', 1, true);
      await shutdownTelemetry();
      expect(collector.requests).toHaveLength(0);

      initTelemetry(makeConfig(true, collector.endpoint));
      await expect(
        withSpan(
          'telemetry.test.span',
          { 'test.attribute': 'present', 'test.number': 7 },
          async (span) => {
            expect(span.isRecording()).toBe(true);
            return 'enabled-result';
          }
        )
      ).resolves.toBe('enabled-result');
      recordToolCall('telemetry-tool', 42, true);

      await shutdownTelemetry();
      await waitForExports(collector.requests);

      const traceRequest = collector.requests.find((request) => request.path === '/v1/traces');
      const metricRequest = collector.requests.find((request) => request.path === '/v1/metrics');
      expect(traceRequest).toMatchObject({ method: 'POST', contentType: 'application/json' });
      expect(metricRequest).toMatchObject({ method: 'POST', contentType: 'application/json' });

      const tracePayload = traceRequest?.payload as {
        resourceSpans?: Array<{
          resource?: { attributes?: unknown };
          scopeSpans?: Array<{
            spans?: Array<{ name?: string; attributes?: unknown }>;
          }>;
        }>;
      };
      const spans = (tracePayload.resourceSpans ?? []).flatMap((resourceSpan) =>
        (resourceSpan.scopeSpans ?? []).flatMap((scopeSpan) => scopeSpan.spans ?? [])
      );
      expect(spans.some((span) => span.name === 'telemetry.test.span')).toBe(true);
      expect(JSON.stringify(spans)).toContain('test.attribute');
      expect(tracePayload.resourceSpans?.[0].resource?.attributes).toEqual(
        expect.arrayContaining([
          { key: 'service.name', value: { stringValue: 'telemetry-test' } },
          { key: 'service.version', value: { stringValue: '1.0.0' } },
        ])
      );

      const metricPayload = metricRequest?.payload as {
        resourceMetrics?: Array<{
          scopeMetrics?: Array<{ metrics?: Array<{ name?: string }> }>;
        }>;
      };
      const metricNames = (metricPayload.resourceMetrics ?? []).flatMap((resourceMetric) =>
        (resourceMetric.scopeMetrics ?? []).flatMap((scopeMetric) =>
          (scopeMetric.metrics ?? []).map((metric) => metric.name)
        )
      );
      expect(metricNames).toEqual(expect.arrayContaining(['mcp.tool.calls', 'mcp.tool.duration']));
    } finally {
      await shutdownTelemetry();
      await closeCollector(collector.server);
    }
  }, 10000);
});
