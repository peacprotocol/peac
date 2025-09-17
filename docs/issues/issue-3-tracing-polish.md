# Issue: Tracing Polish - Optional Traceparent Passthrough and Dev Exposure

**Label:** v0.9.13.3-next
**Type:** Enhancement/Observability

## Description

Implement optional W3C trace context propagation (traceparent header) with development-mode exposure and comprehensive documentation.

## Current State

- Basic X-Request-ID correlation
- No W3C trace context support
- No distributed tracing integration
- Limited observability for debugging

## Requirements

1. **W3C Trace Context Support**
   - Parse incoming traceparent header
   - Propagate trace context through bridge
   - Generate new trace IDs when missing
   - Support tracestate for vendor-specific data

2. **Development Mode Exposure**
   - Include trace information in dev mode responses
   - Add debug endpoint for trace inspection
   - Optional trace logging to console
   - Configurable verbosity levels

3. **Documentation**
   - Complete guide for trace integration
   - Examples with popular APM tools
   - Performance impact analysis
   - Security considerations for production

## Acceptance Criteria

- [ ] W3C traceparent header properly parsed and propagated
- [ ] New traces generated when header missing
- [ ] Dev mode exposes trace information safely
- [ ] Zero performance impact when disabled
- [ ] < 0.5ms overhead when enabled
- [ ] Documentation covers all integration scenarios

## Technical Approach

```typescript
// Trace context middleware
interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
}

function parseTraceparent(header: string): TraceContext | null {
  // Parse: version-traceId-spanId-traceFlags
  const match = header.match(/^(\d{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/);
  if (!match) return null;

  return {
    traceId: match[2],
    spanId: match[3],
    traceFlags: parseInt(match[4], 16),
  };
}

// Middleware
app.use((c, next) => {
  const traceparent = c.req.header('traceparent');
  const trace = traceparent ? parseTraceparent(traceparent) : generateTrace();

  c.set('trace', trace);

  // Dev mode exposure
  if (process.env.PEAC_MODE === 'dev') {
    c.header('X-Trace-Id', trace.traceId);
    c.header('X-Span-Id', trace.spanId);
  }

  return next();
});
```

## Configuration

```bash
# Enable tracing
PEAC_ENABLE_TRACING=true

# Development mode with trace exposure
PEAC_MODE=dev
PEAC_TRACE_VERBOSE=true

# Production (no exposure)
PEAC_MODE=production
```

## Security Considerations

- Never expose trace IDs in production responses
- Sanitize trace state to prevent injection
- Rate limit debug endpoints
- Document security implications

## References

- W3C Trace Context: https://www.w3.org/TR/trace-context/
- OpenTelemetry integration patterns
- Current implementation: apps/bridge/src/server.ts
