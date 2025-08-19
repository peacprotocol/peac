import { describe, beforeEach, it, expect } from '@jest/globals';
import {
  tracer,
  PeacTracer,
  tracingMiddleware,
  createChildSpan,
} from '../../src/telemetry/tracing';
import { Request, Response } from 'express';

describe('Distributed Tracing', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let setHeaderSpy: jest.Mock;

  beforeEach(() => {
    tracer.clear();
    setHeaderSpy = jest.fn();

    mockReq = {
      method: 'GET',
      path: '/test',
      originalUrl: '/test',
      ip: '127.0.0.1',
      get: jest.fn((header: string) => {
        if (header === 'User-Agent') return 'test-agent';
        if (header === 'traceparent')
          return '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
        return undefined;
      }),
    };

    mockRes = {
      set: setHeaderSpy,
      send: jest.fn().mockReturnThis(),
      on: jest.fn(),
    };
  });

  describe('PeacTracer', () => {
    it('should parse W3C traceparent headers correctly', () => {
      const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      const context = tracer.parseTraceParent(traceparent);

      expect(context).toMatchObject({
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
        parentSpanId: '00f067aa0ba902b7',
      });
    });

    it('should handle invalid traceparent headers', () => {
      expect(tracer.parseTraceParent('invalid')).toBeNull();
      expect(tracer.parseTraceParent('00-short-span-01')).toBeNull();
      expect(tracer.parseTraceParent('')).toBeNull();
    });

    it('should create spans with proper structure', () => {
      const span = tracer.startSpan('test.operation');

      expect(span).toMatchObject({
        operationName: 'test.operation',
        tags: expect.objectContaining({
          'service.name': 'peac-protocol-server',
          'service.version': '0.9.6',
          'span.kind': 'server',
        }),
        status: 'ok',
        logs: [],
      });

      expect(span.traceId).toBeTruthy();
      expect(span.spanId).toBeTruthy();
      expect(span.startTime).toBeGreaterThan(0);
    });

    it('should support child spans', () => {
      const parentSpan = tracer.startSpan('parent.operation');
      const childContext = {
        traceId: parentSpan.traceId,
        spanId: tracer.generateSpanId(),
        parentSpanId: parentSpan.spanId,
      };

      const childSpan = tracer.startSpan('child.operation', childContext);

      expect(childSpan.traceId).toBe(parentSpan.traceId);
      expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
      expect(childSpan.spanId).not.toBe(parentSpan.spanId);
    });

    it('should add tags and logs to spans', () => {
      const span = tracer.startSpan('test.operation');

      tracer.setTags(span, { 'custom.tag': 'value', 'request.id': '123' });
      tracer.log(span, { event: 'processing', data: { count: 5 } });

      expect(span.tags).toMatchObject({
        'custom.tag': 'value',
        'request.id': '123',
      });

      expect(span.logs).toHaveLength(1);
      expect(span.logs[0].fields).toMatchObject({
        event: 'processing',
        data: { count: 5 },
      });
    });

    it('should track span completion with duration', () => {
      const span = tracer.startSpan('test.operation');
      const startTime = span.startTime;

      // Simulate some processing time
      setTimeout(() => {
        tracer.finishSpan(span);

        expect(span.endTime).toBeGreaterThan(startTime);
        expect(span.duration).toBeGreaterThan(0);
        expect(tracer.getCompletedSpans()).toContain(span);
      }, 10);
    });

    it('should handle error status correctly', () => {
      const span = tracer.startSpan('error.operation');

      tracer.setStatus(span, 'error');
      tracer.log(span, { level: 'error', message: 'Something went wrong' });

      expect(span.status).toBe('error');
      expect(span.logs).toContainEqual(
        expect.objectContaining({
          fields: expect.objectContaining({
            level: 'error',
            message: 'Something went wrong',
          }),
        }),
      );
    });
  });

  describe('Tracing Middleware', () => {
    it('should create HTTP spans automatically', () => {
      const middleware = tracingMiddleware();
      const next = jest.fn();

      middleware(mockReq as Request, mockRes as Response, next);

      expect(next).toHaveBeenCalled();
      expect(setHeaderSpy).toHaveBeenCalledWith(
        'traceparent',
        expect.stringMatching(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/),
      );

      // Check that span was created and attached to request
      expect((mockReq as any).span).toBeDefined();
      expect((mockReq as any).traceId).toBeTruthy();
    });

    it('should propagate trace context from incoming requests', () => {
      const middleware = tracingMiddleware();
      const next = jest.fn();

      // Mock incoming traceparent header
      (mockReq.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'traceparent')
          return '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
        return undefined;
      });

      middleware(mockReq as Request, mockRes as Response, next);

      const span = (mockReq as any).span;
      expect(span.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(span.parentSpanId).toBe('00f067aa0ba902b7');
    });

    it('should set HTTP-specific tags on spans', () => {
      const middleware = tracingMiddleware();
      const next = jest.fn();

      middleware(mockReq as Request, mockRes as Response, next);

      const span = (mockReq as any).span;
      expect(span.tags).toMatchObject({
        'http.method': 'GET',
        'http.url': '/test',
        'http.route': '/test',
        'http.user_agent': 'test-agent',
        'http.remote_addr': '127.0.0.1',
        component: 'express',
      });
    });
  });

  describe('Child Span Creation', () => {
    it('should create child spans from request context', () => {
      // First create parent span through middleware
      const middleware = tracingMiddleware();
      const next = jest.fn();
      middleware(mockReq as Request, mockRes as Response, next);

      // Then create child span
      const childSpan = createChildSpan(mockReq as Request, 'child.operation');
      const parentSpan = (mockReq as any).span;

      expect(childSpan.traceId).toBe(parentSpan.traceId);
      expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
      expect(childSpan.operationName).toBe('child.operation');
    });

    it('should handle requests without parent spans', () => {
      const childSpan = createChildSpan(mockReq as Request, 'orphan.operation');

      expect(childSpan.operationName).toBe('orphan.operation');
      expect(childSpan.traceId).toBeTruthy();
      expect(childSpan.spanId).toBeTruthy();
    });
  });

  describe('Span Management', () => {
    it('should track active and completed spans', () => {
      expect(tracer.getActiveSpans()).toHaveLength(0);
      expect(tracer.getCompletedSpans()).toHaveLength(0);

      const span1 = tracer.startSpan('active.span');
      const span2 = tracer.startSpan('another.span');

      expect(tracer.getActiveSpans()).toHaveLength(2);
      expect(tracer.getCompletedSpans()).toHaveLength(0);

      tracer.finishSpan(span1);

      expect(tracer.getActiveSpans()).toHaveLength(1);
      expect(tracer.getCompletedSpans()).toHaveLength(1);

      tracer.finishSpan(span2);

      expect(tracer.getActiveSpans()).toHaveLength(0);
      expect(tracer.getCompletedSpans()).toHaveLength(2);
    });

    it('should limit completed spans to prevent memory leaks', () => {
      // Create more than 1000 spans to test the limit
      for (let i = 0; i < 1100; i++) {
        const span = tracer.startSpan(`span.${i}`);
        tracer.finishSpan(span);
      }

      const completedSpans = tracer.getCompletedSpans();
      expect(completedSpans).toHaveLength(1000);

      // Should keep the most recent spans
      expect(completedSpans[completedSpans.length - 1].operationName).toBe('span.1099');
    });
  });

  describe('Performance', () => {
    it('should handle high-frequency span creation efficiently', () => {
      const startTime = Date.now();
      const spanCount = 1000;

      for (let i = 0; i < spanCount; i++) {
        const span = tracer.startSpan(`perf.test.${i}`);
        tracer.setTags(span, { iteration: i, batch: 'performance' });
        tracer.log(span, { event: 'created', index: i });
        tracer.finishSpan(span);
      }

      const duration = Date.now() - startTime;

      // Should be able to create and finish 1000 spans in under 100ms
      expect(duration).toBeLessThan(100);
      expect(tracer.getCompletedSpans()).toHaveLength(1000);
    });
  });
});
