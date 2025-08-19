/**
 * OpenTelemetry Distributed Tracing for PEAC Protocol v0.9.6
 *
 * Provides comprehensive observability with:
 * - W3C Trace Context propagation
 * - Performance monitoring
 * - Business metric correlation
 * - Error tracking and alerting
 * - Multi-vendor exporter support
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../logging';

// Simple span interface for lightweight tracing without external dependencies
export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  tags: Record<string, string | number | boolean>;
  logs: Array<{
    timestamp: number;
    fields: Record<string, unknown>;
  }>;
  status: 'ok' | 'error' | 'timeout';
  duration?: number;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  baggage?: Record<string, string>;
}

/**
 * Lightweight tracer implementation with OpenTelemetry-compatible patterns
 * Can be upgraded to full OpenTelemetry when dependencies are added
 */
export class PeacTracer {
  private activeSpans: Map<string, Span> = new Map();
  private completedSpans: Span[] = [];
  private readonly serviceName: string;
  private readonly serviceVersion: string;
  private readonly enabled: boolean;

  constructor() {
    this.serviceName = 'peac-protocol-server';
    this.serviceVersion = '0.9.6';
    this.enabled = process.env.PEAC_TRACING_ENABLED !== 'false';
  }

  /**
   * Parse W3C traceparent header
   */
  parseTraceParent(traceparent: string): TraceContext | null {
    if (!traceparent) return null;

    // Format: version-traceId-spanId-flags
    const parts = traceparent.split('-');
    if (parts.length !== 4) return null;

    const [version, traceId, spanId] = parts; // flags not used currently

    // Basic validation
    if (version.length !== 2 || traceId.length !== 32 || spanId.length !== 16) {
      return null;
    }

    return {
      traceId,
      spanId,
      parentSpanId: spanId,
    };
  }

  /**
   * Generate new trace context
   */
  generateTraceContext(parentContext?: TraceContext): TraceContext {
    return {
      traceId: parentContext?.traceId || this.generateTraceId(),
      spanId: this.generateSpanId(),
      parentSpanId: parentContext?.spanId,
    };
  }

  /**
   * Start a new span
   */
  startSpan(operationName: string, context?: TraceContext): Span {
    if (!this.enabled) {
      return this.createNoOpSpan(operationName);
    }

    const traceContext = context || this.generateTraceContext();

    const span: Span = {
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      parentSpanId: traceContext.parentSpanId,
      operationName,
      startTime: Date.now(),
      tags: {
        'service.name': this.serviceName,
        'service.version': this.serviceVersion,
        'span.kind': 'server',
      },
      logs: [],
      status: 'ok',
    };

    this.activeSpans.set(span.spanId, span);
    return span;
  }

  /**
   * Finish a span
   */
  finishSpan(span: Span): void {
    if (!this.enabled || !span.spanId) return;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;

    this.activeSpans.delete(span.spanId);
    this.completedSpans.push(span);

    // Log span completion
    logger.debug(
      {
        traceId: span.traceId,
        spanId: span.spanId,
        operationName: span.operationName,
        duration: span.duration,
        status: span.status,
        tags: span.tags,
      },
      'Span completed',
    );

    // Keep only last 1000 spans to prevent memory leaks
    if (this.completedSpans.length > 1000) {
      this.completedSpans = this.completedSpans.slice(-1000);
    }
  }

  /**
   * Add tags to a span
   */
  setTags(span: Span, tags: Record<string, string | number | boolean>): void {
    if (!this.enabled) return;
    Object.assign(span.tags, tags);
  }

  /**
   * Add a log entry to a span
   */
  log(span: Span, fields: Record<string, unknown>): void {
    if (!this.enabled) return;

    span.logs.push({
      timestamp: Date.now(),
      fields,
    });
  }

  /**
   * Set span status
   */
  setStatus(span: Span, status: 'ok' | 'error' | 'timeout'): void {
    if (!this.enabled) return;
    span.status = status;
  }

  /**
   * Get active spans (for debugging)
   */
  getActiveSpans(): Span[] {
    return Array.from(this.activeSpans.values());
  }

  /**
   * Get completed spans
   */
  getCompletedSpans(): Span[] {
    return this.completedSpans.slice();
  }

  /**
   * Clear all spans (for testing)
   */
  clear(): void {
    this.activeSpans.clear();
    this.completedSpans = [];
  }

  private generateTraceId(): string {
    return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').substring(0, 16);
  }

  // Public method for child span creation
  generateSpanId(): string {
    return randomUUID().replace(/-/g, '').substring(0, 16);
  }

  private createNoOpSpan(operationName: string): Span {
    return {
      traceId: '',
      spanId: '',
      operationName,
      startTime: Date.now(),
      tags: {},
      logs: [],
      status: 'ok',
    };
  }
}

// Singleton tracer instance
export const tracer = new PeacTracer();

/**
 * Express middleware for automatic HTTP tracing
 */
export function tracingMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!tracer) {
      return next();
    }

    // Parse incoming trace context
    const traceparent = req.get('traceparent');
    const tracestate = req.get('tracestate');

    let parentContext: TraceContext | undefined;
    if (traceparent) {
      parentContext = tracer.parseTraceParent(traceparent) || undefined;
    }

    // Start HTTP span
    const span = tracer.startSpan(
      `HTTP ${req.method} ${req.route?.path || req.path}`,
      parentContext,
    );

    // Add HTTP-specific tags
    tracer.setTags(span, {
      'http.method': req.method,
      'http.url': req.originalUrl || req.url,
      'http.route': req.route?.path || req.path,
      'http.user_agent': req.get('User-Agent') || '',
      'http.remote_addr': req.ip || req.connection.remoteAddress || '',
      component: 'express',
    });

    // Add baggage if present
    if (tracestate) {
      tracer.log(span, { tracestate });
    }

    // Store span in request context
    (req as Request & { span: Span; traceId: string }).span = span;
    (req as Request & { span: Span; traceId: string }).traceId = span.traceId;

    // Set response headers for trace context propagation
    res.set('traceparent', `00-${span.traceId}-${span.spanId}-01`);
    if (tracestate) {
      res.set('tracestate', tracestate);
    }

    // Capture response details
    const originalSend = res.send;
    res.send = function (data: unknown) {
      tracer.setTags(span, {
        'http.status_code': res.statusCode,
        'http.response_size': Buffer.byteLength(
          typeof data === 'string' ? data : JSON.stringify(data || ''),
          'utf8',
        ),
      });

      // Set span status based on HTTP status
      if (res.statusCode >= 400) {
        tracer.setStatus(span, 'error');
        tracer.log(span, {
          level: 'error',
          message: 'HTTP error response',
          status_code: res.statusCode,
        });
      }

      tracer.finishSpan(span);
      return originalSend.call(this, data);
    };

    // Handle response errors
    res.on('error', (error) => {
      tracer.setStatus(span, 'error');
      tracer.log(span, {
        level: 'error',
        message: error.message,
        stack: error.stack,
      });
      tracer.finishSpan(span);
    });

    next();
  };
}

/**
 * Utility to create child spans for business operations
 */
export function createChildSpan(req: Request, operationName: string): Span {
  const parentSpan = (req as Request & { span: Span }).span;

  if (!parentSpan) {
    return tracer.startSpan(operationName);
  }

  const context: TraceContext = {
    traceId: parentSpan.traceId,
    spanId: tracer.generateSpanId(),
    parentSpanId: parentSpan.spanId,
  };

  return tracer.startSpan(operationName, context);
}

/**
 * Database operation tracing wrapper
 */
export function traceDbOperation<T>(
  req: Request,
  operation: string,
  dbName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const span = createChildSpan(req, `db.${operation}`);

  tracer.setTags(span, {
    'db.type': dbName,
    'db.operation': operation,
    component: 'database',
  });

  const start = Date.now();

  return fn()
    .then((result) => {
      tracer.setTags(span, {
        'db.duration_ms': Date.now() - start,
        'db.success': true,
      });
      tracer.finishSpan(span);
      return result;
    })
    .catch((error) => {
      tracer.setStatus(span, 'error');
      tracer.setTags(span, {
        'db.duration_ms': Date.now() - start,
        'db.success': false,
      });
      tracer.log(span, {
        level: 'error',
        message: error.message,
        operation,
      });
      tracer.finishSpan(span);
      throw error;
    });
}

/**
 * External service call tracing wrapper
 */
export function traceExternalCall<T>(
  req: Request,
  serviceName: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const span = createChildSpan(req, `external.${serviceName}.${operation}`);

  tracer.setTags(span, {
    'service.name': serviceName,
    'service.operation': operation,
    component: 'http-client',
  });

  const start = Date.now();

  return fn()
    .then((result) => {
      tracer.setTags(span, {
        'external.duration_ms': Date.now() - start,
        'external.success': true,
      });
      tracer.finishSpan(span);
      return result;
    })
    .catch((error) => {
      tracer.setStatus(span, 'error');
      tracer.setTags(span, {
        'external.duration_ms': Date.now() - start,
        'external.success': false,
      });
      tracer.log(span, {
        level: 'error',
        message: error.message,
        service: serviceName,
        operation,
      });
      tracer.finishSpan(span);
      throw error;
    });
}

/**
 * Business logic tracing decorator
 */
export function traceBusinessOperation<T>(
  req: Request,
  operationName: string,
  metadata: Record<string, string | number | boolean>,
  fn: () => Promise<T>,
): Promise<T> {
  const span = createChildSpan(req, operationName);

  tracer.setTags(span, {
    ...metadata,
    component: 'business-logic',
  });

  const start = Date.now();

  return fn()
    .then((result) => {
      tracer.setTags(span, {
        'operation.duration_ms': Date.now() - start,
        'operation.success': true,
      });
      tracer.finishSpan(span);
      return result;
    })
    .catch((error) => {
      tracer.setStatus(span, 'error');
      tracer.setTags(span, {
        'operation.duration_ms': Date.now() - start,
        'operation.success': false,
      });
      tracer.log(span, {
        level: 'error',
        message: error.message,
        operation: operationName,
      });
      tracer.finishSpan(span);
      throw error;
    });
}

/**
 * Get tracing stats for health checks
 */
export function getTracingStats() {
  return {
    enabled: tracer ? true : false,
    activeSpans: tracer?.getActiveSpans().length || 0,
    completedSpans: tracer?.getCompletedSpans().length || 0,
    serviceName: 'peac-protocol-server',
    serviceVersion: '0.9.6',
  };
}
