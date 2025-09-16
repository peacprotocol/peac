/**
 * /metrics endpoint - Prometheus-compatible metrics
 * Enabled via PEAC_ENABLE_METRICS=1
 */

import { Context } from 'hono';

// Simple in-memory metrics (production would use proper Prometheus client)
let enforceCount = 0;
let verifyCount = 0;
let enforceLatencySum = 0;
let verifyLatencySum = 0;
const enforceLatencies: number[] = [];
const verifyLatencies: number[] = [];

export function recordEnforce(decision: string, latencyMs: number) {
  enforceCount++;
  const latencySeconds = latencyMs / 1000;
  enforceLatencySum += latencySeconds;
  enforceLatencies.push(latencySeconds);

  // Keep only last 1000 measurements for percentiles
  if (enforceLatencies.length > 1000) {
    enforceLatencies.shift();
  }
}

export function recordVerify(latencyMs: number) {
  verifyCount++;
  const latencySeconds = latencyMs / 1000;
  verifyLatencySum += latencySeconds;
  verifyLatencies.push(latencySeconds);

  if (verifyLatencies.length > 1000) {
    verifyLatencies.shift();
  }
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((percentile / 100) * sorted.length);
  return sorted[Math.min(index, sorted.length - 1)];
}

export async function metricsRoute(c: Context) {
  const cpuUsage = process.cpuUsage();
  const memUsage = process.memoryUsage();

  // Calculate percentiles
  const enforceP95 = calculatePercentile(enforceLatencies, 95);
  const enforceP99 = calculatePercentile(enforceLatencies, 99);
  const verifyP95 = calculatePercentile(verifyLatencies, 95);
  const verifyP99 = calculatePercentile(verifyLatencies, 99);

  const metrics = `# HELP peac_enforce_requests_total Total number of enforce requests
# TYPE peac_enforce_requests_total counter
peac_enforce_requests_total ${enforceCount}

# HELP peac_verify_requests_total Total number of verify requests
# TYPE peac_verify_requests_total counter
peac_verify_requests_total ${verifyCount}

# HELP peac_enforce_latency_seconds Enforce request latency in seconds
# TYPE peac_enforce_latency_seconds histogram
peac_enforce_latency_seconds_sum ${enforceLatencySum}
peac_enforce_latency_seconds_count ${enforceCount}
peac_enforce_latency_seconds{quantile="0.95"} ${enforceP95}
peac_enforce_latency_seconds{quantile="0.99"} ${enforceP99}

# HELP peac_verify_latency_seconds Verify request latency in seconds
# TYPE peac_verify_latency_seconds histogram
peac_verify_latency_seconds_sum ${verifyLatencySum}
peac_verify_latency_seconds_count ${verifyCount}
peac_verify_latency_seconds{quantile="0.95"} ${verifyP95}
peac_verify_latency_seconds{quantile="0.99"} ${verifyP99}

# HELP peac_bridge_memory_bytes Memory usage in bytes
# TYPE peac_bridge_memory_bytes gauge
peac_bridge_memory_bytes{type="heap_used"} ${memUsage.heapUsed}
peac_bridge_memory_bytes{type="heap_total"} ${memUsage.heapTotal}
peac_bridge_memory_bytes{type="rss"} ${memUsage.rss}

# HELP peac_bridge_cpu_seconds_total CPU usage in seconds
# TYPE peac_bridge_cpu_seconds_total counter
peac_bridge_cpu_seconds_total{mode="user"} ${cpuUsage.user / 1000000}
peac_bridge_cpu_seconds_total{mode="system"} ${cpuUsage.system / 1000000}

# HELP peac_bridge_uptime_seconds Bridge uptime in seconds
# TYPE peac_bridge_uptime_seconds gauge
peac_bridge_uptime_seconds ${process.uptime()}
`;

  c.header('Content-Type', 'text/plain; version=0.0.4');
  return c.text(metrics);
}
