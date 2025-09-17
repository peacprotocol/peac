# Issue: Metrics Memory Guard - Cap Rolling Windows and Bounded Histograms

**Label:** v0.9.13.3-next
**Type:** Performance/Security

## Description

Implement memory bounds for metrics collection to prevent unbounded growth under high load or attack scenarios.

## Current State

- Basic Prometheus metrics implementation
- No explicit memory bounds on histograms
- Rolling windows may grow unbounded
- No circuit breaker for metrics collection

## Requirements

1. **Bounded Histograms**
   - Cap histogram buckets at reasonable limits
   - Implement circular buffer for percentile calculations
   - Maximum 10,000 observations per window

2. **Rolling Window Limits**
   - 5-minute windows with automatic rotation
   - Maximum 12 windows retained (1 hour history)
   - Automatic cleanup of expired windows

3. **Memory Circuit Breaker**
   - Monitor metrics memory usage
   - Disable collection if > 50MB used
   - Alert and fallback to basic counters only

## Acceptance Criteria

- [ ] Metrics memory usage stays < 50MB under load
- [ ] Performance impact < 0.1ms on request path
- [ ] Graceful degradation when limits reached
- [ ] Load test with 10,000 rps sustained
- [ ] Documentation of memory bounds and behavior

## Technical Approach

1. Implement circular buffer for histogram observations
2. Add memory usage monitoring to metrics module
3. Create bounded data structures with automatic rotation
4. Add configuration for memory limits
5. Implement fallback to basic counters when limits exceeded

## Testing

```javascript
// Test memory bounds
async function testMetricsMemory() {
  // Generate 100,000 requests
  for (let i = 0; i < 100000; i++) {
    metrics.recordRequest({
      path: '/enforce',
      duration: Math.random() * 100,
      status: 200,
    });
  }

  // Assert memory usage < 50MB
  const usage = process.memoryUsage();
  assert(usage.heapUsed < 50 * 1024 * 1024);
}
```

## References

- Current implementation: apps/bridge/src/routes/metrics.ts
- Prometheus best practices for high-cardinality
- Node.js memory management patterns
