import { createServer, type Server } from 'node:http';

import { describe, expect, it } from 'vitest';

import type { Config } from '../../src/utils/config.js';
import {
  createSourceSpan,
  initTelemetry,
  recordCacheHit,
  recordCacheMiss,
  recordSourceRequest,
  recordToolCall,
  shutdownTelemetry,
  withSpan,
} from '../../src/utils/telemetry.js';

interface OtlpAttributeValue {
  boolValue?: boolean;
  doubleValue?: number;
  intValue?: number | string;
  stringValue?: string;
}

interface OtlpAttribute {
  key?: string;
  value?: OtlpAttributeValue;
}

interface OtlpSpan {
  attributes?: OtlpAttribute[];
  name?: string;
  status?: { code?: number; message?: string };
}

interface OtlpMetricDataPoint {
  asDouble?: number;
  asInt?: number | string;
  attributes?: OtlpAttribute[];
  count?: number;
  max?: number;
  min?: number;
  sum?: number;
}

interface OtlpMetric {
  histogram?: { dataPoints?: OtlpMetricDataPoint[] };
  name?: string;
  sum?: { dataPoints?: OtlpMetricDataPoint[] };
}

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
    if (
      requests.filter((request) => request.path === '/v1/traces').length >= 4 &&
      paths.has('/v1/metrics')
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function getAttributes(
  attributes: OtlpAttribute[] | undefined
): Record<string, OtlpAttributeValue> {
  return Object.fromEntries(
    (attributes ?? [])
      .filter(
        (attribute): attribute is OtlpAttribute & { key: string; value: OtlpAttributeValue } =>
          typeof attribute.key === 'string' && attribute.value !== undefined
      )
      .map((attribute) => [attribute.key, attribute.value])
  );
}

function getMetrics(metricPayload: unknown): OtlpMetric[] {
  const payload = metricPayload as {
    resourceMetrics?: Array<{
      scopeMetrics?: Array<{ metrics?: OtlpMetric[] }>;
    }>;
  };

  return (payload.resourceMetrics ?? []).flatMap((resourceMetric) =>
    (resourceMetric.scopeMetrics ?? []).flatMap((scopeMetric) => scopeMetric.metrics ?? [])
  );
}

function getMetricDataPoints(metric: OtlpMetric): OtlpMetricDataPoint[] {
  return [...(metric.sum?.dataPoints ?? []), ...(metric.histogram?.dataPoints ?? [])];
}

describe('telemetry', () => {
  it('covers lifecycle, spans, cache/source metrics, and local OTLP exports', async () => {
    const collector = await startCollector();

    try {
      // Keep every lifecycle path in the same test so global OpenTelemetry providers
      // are initialized at most once in this Vitest worker.
      initTelemetry(makeConfig(false));
      await expect(withSpan('telemetry.disabled', {}, async () => 'disabled-result')).resolves.toBe(
        'disabled-result'
      );
      recordToolCall('disabled-tool', 1, true);
      recordCacheHit('disabled-cache');
      recordCacheMiss('disabled-cache');
      recordSourceRequest('disabled-source', true);
      recordSourceRequest('disabled-source', false);
      await shutdownTelemetry();
      expect(collector.requests).toHaveLength(0);

      // An enabled configuration without an endpoint still creates no network
      // exporter. A second initialization and a disabled configuration are no-ops.
      initTelemetry(makeConfig(true));
      initTelemetry(makeConfig(true));
      initTelemetry(makeConfig(false));
      await expect(
        withSpan('telemetry.no-endpoint', {}, async () => 'no-endpoint-result')
      ).resolves.toBe('no-endpoint-result');
      await shutdownTelemetry();
      await shutdownTelemetry();
      expect(collector.requests).toHaveLength(0);

      initTelemetry(makeConfig(true, collector.endpoint));
      // The idempotence guard prevents duplicate providers/exporters.
      initTelemetry(makeConfig(true, collector.endpoint));
      await expect(
        withSpan(
          'telemetry.success',
          { 'test.attribute': 'present', 'test.number': 7, 'test.success': true },
          async (span) => {
            expect(span.isRecording()).toBe(true);
            return 'success-result';
          }
        )
      ).resolves.toBe('success-result');

      const expectedError = new Error('expected span failure');
      await expect(
        withSpan('telemetry.failure', { 'test.success': false }, async () => {
          throw expectedError;
        })
      ).rejects.toBe(expectedError);

      const expectedUnknownError = 'expected non-Error failure';
      await expect(
        withSpan('telemetry.unknown-failure', {}, async () => {
          throw expectedUnknownError;
        })
      ).rejects.toBe(expectedUnknownError);

      const sourceSpan = createSourceSpan('google-books', 'lookup');
      expect(sourceSpan.isRecording()).toBe(true);
      sourceSpan.end();
      expect(sourceSpan.isRecording()).toBe(false);

      recordToolCall('telemetry-success-tool', 42.5, true);
      recordToolCall('telemetry-failure-tool', 17.25, false);
      recordCacheHit('books');
      recordCacheMiss('books');
      recordSourceRequest('google-books', true);
      recordSourceRequest('tmdb', false);

      await shutdownTelemetry();
      await waitForExports(collector.requests);

      const traceRequests = collector.requests.filter((request) => request.path === '/v1/traces');
      const tracePayloads = traceRequests.map(
        (request) =>
          request.payload as {
            resourceSpans?: Array<{
              resource?: { attributes?: OtlpAttribute[] };
              scopeSpans?: Array<{ spans?: OtlpSpan[] }>;
            }>;
          }
      );
      const metricRequest = collector.requests.find((request) => request.path === '/v1/metrics');
      expect(traceRequests).toHaveLength(4);
      expect(traceRequests.every((request) => request.method === 'POST')).toBe(true);
      expect(traceRequests.every((request) => request.contentType === 'application/json')).toBe(
        true
      );
      expect(metricRequest).toMatchObject({ method: 'POST', contentType: 'application/json' });

      const spans = tracePayloads.flatMap((tracePayload) =>
        (tracePayload.resourceSpans ?? []).flatMap((resourceSpan) =>
          (resourceSpan.scopeSpans ?? []).flatMap((scopeSpan) => scopeSpan.spans ?? [])
        )
      );
      const spansByName = new Map(spans.map((span) => [span.name, span]));
      expect(spansByName.get('telemetry.success')).toMatchObject({
        status: { code: 1 },
      });
      expect(getAttributes(spansByName.get('telemetry.success')?.attributes)).toEqual(
        expect.objectContaining({
          'test.attribute': { stringValue: 'present' },
          'test.number': { intValue: 7 },
          'test.success': { boolValue: true },
        })
      );
      expect(spansByName.get('telemetry.failure')).toMatchObject({
        status: { code: 2, message: 'expected span failure' },
      });
      expect(spansByName.get('telemetry.unknown-failure')).toMatchObject({
        status: { code: 2, message: 'Unknown error' },
      });
      expect(spansByName.get('source.google-books.lookup')).toMatchObject({
        status: { code: 0 },
      });
      expect(getAttributes(spansByName.get('source.google-books.lookup')?.attributes)).toEqual(
        expect.objectContaining({
          'source.name': { stringValue: 'google-books' },
          'source.operation': { stringValue: 'lookup' },
        })
      );
      expect(tracePayloads[0].resourceSpans?.[0].resource?.attributes).toEqual(
        expect.arrayContaining([
          { key: 'service.name', value: { stringValue: 'telemetry-test' } },
          { key: 'service.version', value: { stringValue: '1.0.0' } },
        ])
      );

      const metrics = getMetrics(metricRequest?.payload);
      const metricNames = metrics.map((metric) => metric.name);
      expect(metricNames).toEqual(
        expect.arrayContaining([
          'mcp.tool.calls',
          'mcp.tool.duration',
          'cache.hits',
          'cache.misses',
          'source.requests',
          'source.errors',
        ])
      );

      const toolCalls = metrics.find((metric) => metric.name === 'mcp.tool.calls');
      const toolCallPoints = getMetricDataPoints(toolCalls ?? {});
      expect(toolCallPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributes: expect.arrayContaining([
              { key: 'tool', value: { stringValue: 'telemetry-success-tool' } },
              { key: 'success', value: { stringValue: 'true' } },
            ]),
          }),
          expect.objectContaining({
            attributes: expect.arrayContaining([
              { key: 'tool', value: { stringValue: 'telemetry-failure-tool' } },
              { key: 'success', value: { stringValue: 'false' } },
            ]),
          }),
        ])
      );

      for (const name of [
        'mcp.tool.calls',
        'cache.hits',
        'cache.misses',
        'source.requests',
        'source.errors',
      ]) {
        const counter = metrics.find((metric) => metric.name === name);
        expect(counter).toBeDefined();
        const points = getMetricDataPoints(counter ?? {});
        expect(points).toHaveLength(
          name === 'mcp.tool.calls' || name === 'source.requests' ? 2 : 1
        );
        for (const point of points) {
          expect(Number(point.asInt ?? point.asDouble)).toBe(1);
        }
      }

      const toolDuration = metrics.find((metric) => metric.name === 'mcp.tool.duration');
      const toolDurationPoints = getMetricDataPoints(toolDuration ?? {});
      expect(toolDurationPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sum: 42.5,
            attributes: expect.arrayContaining([
              { key: 'tool', value: { stringValue: 'telemetry-success-tool' } },
              { key: 'success', value: { stringValue: 'true' } },
            ]),
          }),
          expect.objectContaining({
            sum: 17.25,
            attributes: expect.arrayContaining([
              { key: 'tool', value: { stringValue: 'telemetry-failure-tool' } },
              { key: 'success', value: { stringValue: 'false' } },
            ]),
          }),
        ])
      );

      const cacheHits = metrics.find((metric) => metric.name === 'cache.hits');
      expect(getMetricDataPoints(cacheHits ?? {})).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributes: [{ key: 'cache_type', value: { stringValue: 'books' } }],
          }),
        ])
      );
      const cacheMisses = metrics.find((metric) => metric.name === 'cache.misses');
      expect(getMetricDataPoints(cacheMisses ?? {})).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributes: [{ key: 'cache_type', value: { stringValue: 'books' } }],
          }),
        ])
      );

      const sourceRequests = metrics.find((metric) => metric.name === 'source.requests');
      expect(getMetricDataPoints(sourceRequests ?? {})).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributes: [
              { key: 'source', value: { stringValue: 'google-books' } },
              { key: 'success', value: { stringValue: 'true' } },
            ],
          }),
          expect.objectContaining({
            attributes: [
              { key: 'source', value: { stringValue: 'tmdb' } },
              { key: 'success', value: { stringValue: 'false' } },
            ],
          }),
        ])
      );
      const sourceErrors = metrics.find((metric) => metric.name === 'source.errors');
      expect(getMetricDataPoints(sourceErrors ?? {})).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributes: [{ key: 'source', value: { stringValue: 'tmdb' } }],
          }),
        ])
      );
    } finally {
      await shutdownTelemetry();
      await closeCollector(collector.server);
    }
  }, 10000);
});
