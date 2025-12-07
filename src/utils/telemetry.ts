import { trace, metrics, Span, SpanStatusCode, Counter, Histogram } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import type { Config } from './config.js';

let tracerProvider: BasicTracerProvider | null = null;
let meterProvider: MeterProvider | null = null;
let initialized = false;

// Metrics
let toolCallCounter: Counter | null = null;
let toolCallDurationHistogram: Histogram | null = null;
let cacheHitCounter: Counter | null = null;
let cacheMissCounter: Counter | null = null;
let sourceRequestCounter: Counter | null = null;
let sourceErrorCounter: Counter | null = null;

/**
 * Initialize OpenTelemetry tracing and metrics
 */
export function initTelemetry(config: Config): void {
  if (!config.otelEnabled || initialized) {
    return;
  }

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: config.otelServiceName,
    [ATTR_SERVICE_VERSION]: '1.0.0',
  });

  // Set up tracing
  if (config.otelEndpoint) {
    const traceExporter = new OTLPTraceExporter({
      url: `${config.otelEndpoint}/v1/traces`,
    });

    tracerProvider = new BasicTracerProvider({ resource });
    tracerProvider.addSpanProcessor(new SimpleSpanProcessor(traceExporter));
    tracerProvider.register();

    // Set up metrics
    const metricExporter = new OTLPMetricExporter({
      url: `${config.otelEndpoint}/v1/metrics`,
    });

    meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: 60000, // Export every minute
        }),
      ],
    });

    metrics.setGlobalMeterProvider(meterProvider);
  }

  // Create metrics instruments
  const meter = metrics.getMeter(config.otelServiceName);

  toolCallCounter = meter.createCounter('mcp.tool.calls', {
    description: 'Number of MCP tool calls',
  });

  toolCallDurationHistogram = meter.createHistogram('mcp.tool.duration', {
    description: 'Duration of MCP tool calls in milliseconds',
    unit: 'ms',
  });

  cacheHitCounter = meter.createCounter('cache.hits', {
    description: 'Number of cache hits',
  });

  cacheMissCounter = meter.createCounter('cache.misses', {
    description: 'Number of cache misses',
  });

  sourceRequestCounter = meter.createCounter('source.requests', {
    description: 'Number of requests to external sources',
  });

  sourceErrorCounter = meter.createCounter('source.errors', {
    description: 'Number of errors from external sources',
  });

  initialized = true;
}

/**
 * Shutdown telemetry providers
 */
export async function shutdownTelemetry(): Promise<void> {
  if (tracerProvider) {
    await tracerProvider.shutdown();
    tracerProvider = null;
  }
  if (meterProvider) {
    await meterProvider.shutdown();
    meterProvider = null;
  }
  initialized = false;
}

/**
 * Get a tracer for creating spans
 */
export function getTracer(name: string = 'media-metadata-mcp') {
  return trace.getTracer(name);
}

/**
 * Create a span for an operation
 */
export function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, async (span) => {
    try {
      Object.entries(attributes).forEach(([key, value]) => {
        span.setAttribute(key, value);
      });
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Record a tool call metric
 */
export function recordToolCall(toolName: string, durationMs: number, success: boolean): void {
  if (toolCallCounter) {
    toolCallCounter.add(1, {
      tool: toolName,
      success: success.toString(),
    });
  }
  if (toolCallDurationHistogram) {
    toolCallDurationHistogram.record(durationMs, {
      tool: toolName,
      success: success.toString(),
    });
  }
}

/**
 * Record a cache hit
 */
export function recordCacheHit(cacheType: string): void {
  if (cacheHitCounter) {
    cacheHitCounter.add(1, { cache_type: cacheType });
  }
}

/**
 * Record a cache miss
 */
export function recordCacheMiss(cacheType: string): void {
  if (cacheMissCounter) {
    cacheMissCounter.add(1, { cache_type: cacheType });
  }
}

/**
 * Record a source request
 */
export function recordSourceRequest(sourceName: string, success: boolean): void {
  if (sourceRequestCounter) {
    sourceRequestCounter.add(1, {
      source: sourceName,
      success: success.toString(),
    });
  }
  if (!success && sourceErrorCounter) {
    sourceErrorCounter.add(1, { source: sourceName });
  }
}

/**
 * Create a child span for source operations
 */
export function createSourceSpan(sourceName: string, operation: string) {
  const tracer = getTracer();
  return tracer.startSpan(`source.${sourceName}.${operation}`, {
    attributes: {
      'source.name': sourceName,
      'source.operation': operation,
    },
  });
}
