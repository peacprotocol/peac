/**
 * @peac/core v0.9.12.1 - Observability and admin endpoints
 * Metrics collection, health checks, and administrative operations
 */

import { FEATURES, SLO_TARGETS, SECURITY_CONFIG } from './config.js';
import { securityAuditor, SecurityEvent } from './security.js';
import { rateLimiter } from './rate-limit.js';

export interface PerfMetrics {
  sign_p95_ms: number;
  verify_p95_ms: number;
  throughput_rps: number;
  memory_usage_mb: number;
  error_rate: number;
  timestamp: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime_seconds: number;
  features: Record<string, boolean>;
  performance: {
    meets_slo: boolean;
    current_metrics: Partial<PerfMetrics>;
    slo_targets: typeof SLO_TARGETS;
  };
  dependencies: {
    redis: 'connected' | 'disconnected' | 'unknown';
    external_apis: Record<string, 'up' | 'down' | 'degraded'>;
  };
  security: {
    active_keys: number;
    recent_violations: number;
    replay_protection: boolean;
  };
}

export interface AdminStats {
  receipts: {
    total_issued: number;
    total_verified: number;
    verification_success_rate: number;
    recent_errors: string[];
  };
  rate_limiting: {
    total_requests: number;
    blocked_requests: number;
    active_buckets: number;
  };
  security: {
    security_events: SecurityEvent[];
    key_rotations: number;
    replay_attempts: number;
  };
  performance: {
    avg_sign_time_ms: number;
    avg_verify_time_ms: number;
    p95_sign_time_ms: number;
    p95_verify_time_ms: number;
  };
}

class MetricsCollector {
  private metrics = new Map<string, number[]>();
  private counters = new Map<string, number>();
  private start_time = Date.now();

  recordTiming(operation: string, duration_ms: number): void {
    const timings = this.metrics.get(operation) || [];
    timings.push(duration_ms);

    // Keep rolling window of last 1000 measurements
    if (timings.length > 1000) {
      timings.shift();
    }

    this.metrics.set(operation, timings);
  }

  incrementCounter(name: string, delta = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + delta);
  }

  getPercentile(operation: string, percentile: number): number {
    const timings = this.metrics.get(operation) || [];
    if (timings.length === 0) return 0;

    const sorted = [...timings].sort((a, b) => a - b);
    const index = Math.floor((percentile / 100) * sorted.length);
    return sorted[Math.min(index, sorted.length - 1)];
  }

  getAverage(operation: string): number {
    const timings = this.metrics.get(operation) || [];
    if (timings.length === 0) return 0;

    return timings.reduce((sum, val) => sum + val, 0) / timings.length;
  }

  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.start_time) / 1000);
  }

  getCurrentMetrics(): Partial<PerfMetrics> {
    return {
      sign_p95_ms: this.getPercentile('sign', 95),
      verify_p95_ms: this.getPercentile('verify', 95),
      memory_usage_mb: process.memoryUsage
        ? Math.round(process.memoryUsage().rss / 1024 / 1024)
        : 0,
      error_rate: this.calculateErrorRate(),
      timestamp: new Date().toISOString(),
    };
  }

  private calculateErrorRate(): number {
    const total_ops = this.getCounter('sign_attempts') + this.getCounter('verify_attempts');
    const total_errors = this.getCounter('sign_errors') + this.getCounter('verify_errors');

    if (total_ops === 0) return 0;
    return Math.round((total_errors / total_ops) * 100 * 100) / 100; // 2 decimal places
  }

  reset(): void {
    this.metrics.clear();
    this.counters.clear();
  }
}

export class HealthChecker {
  constructor(private metrics: MetricsCollector) {}

  async checkHealth(): Promise<HealthStatus> {
    const current_metrics = this.metrics.getCurrentMetrics();
    const meets_slo = this.checkSLOCompliance(current_metrics);

    // Check dependencies
    const redis_status = await this.checkRedis();
    const external_apis = await this.checkExternalApis();

    // Security status
    const security_status = await this.getSecurityStatus();

    // Overall status
    const status = this.determineOverallStatus(
      meets_slo,
      redis_status,
      external_apis,
      security_status
    );

    return {
      status,
      version: '0.9.12.1',
      uptime_seconds: this.metrics.getUptimeSeconds(),
      features: FEATURES,
      performance: {
        meets_slo,
        current_metrics,
        slo_targets: SLO_TARGETS,
      },
      dependencies: {
        redis: redis_status,
        external_apis,
      },
      security: security_status,
    };
  }

  private checkSLOCompliance(metrics: Partial<PerfMetrics>): boolean {
    if (!metrics.sign_p95_ms || !metrics.verify_p95_ms) return true; // No data yet

    return (
      metrics.sign_p95_ms <= SLO_TARGETS.sign_p95_ms &&
      metrics.verify_p95_ms <= SLO_TARGETS.verify_p95_ms &&
      (metrics.error_rate || 0) < 5 // 5% error rate threshold
    );
  }

  private async checkRedis(): Promise<'connected' | 'disconnected' | 'unknown'> {
    if (!FEATURES.REDIS_RATELIMIT) return 'unknown';

    try {
      // In production, actually ping Redis
      return process.env.REDIS_URL ? 'connected' : 'unknown';
    } catch {
      return 'disconnected';
    }
  }

  private async checkExternalApis(): Promise<Record<string, 'up' | 'down' | 'degraded'>> {
    const apis: Record<string, 'up' | 'down' | 'degraded'> = {};

    if (FEATURES.CLOUDFLARE) {
      apis.cloudflare = 'up'; // Simplified for now
    }

    return apis;
  }

  private async getSecurityStatus(): Promise<{
    active_keys: number;
    recent_violations: number;
    replay_protection: boolean;
  }> {
    const recent_events = securityAuditor.getRecentEvents(100);
    const violations = recent_events.filter(
      (e) => e.type === 'replay_detected' || e.type === 'nonce_reused'
    ).length;

    return {
      active_keys: 1, // Simplified for now
      recent_violations: violations,
      replay_protection: FEATURES.REPLAY_PROTECTION,
    };
  }

  private determineOverallStatus(
    meets_slo: boolean,
    redis_status: string,
    external_apis: Record<string, string>,
    security_status: { recent_violations: number }
  ): 'healthy' | 'degraded' | 'unhealthy' {
    // Critical issues
    if (security_status.recent_violations > 10) return 'unhealthy';
    if (redis_status === 'disconnected' && FEATURES.REDIS_RATELIMIT) return 'unhealthy';

    // Performance degradation
    if (!meets_slo) return 'degraded';

    // External API issues
    const api_issues = Object.values(external_apis).filter((status) => status === 'down').length;
    if (api_issues > 0) return 'degraded';

    return 'healthy';
  }
}

export class AdminEndpoints {
  constructor(
    private metrics: MetricsCollector,
    private health_checker: HealthChecker
  ) {}

  async getStats(): Promise<AdminStats> {
    const security_report = securityAuditor.getSecurityReport();

    return {
      receipts: {
        total_issued: this.metrics.getCounter('receipts_issued'),
        total_verified: this.metrics.getCounter('receipts_verified'),
        verification_success_rate: this.calculateSuccessRate(),
        recent_errors: this.getRecentErrors(),
      },
      rate_limiting: {
        total_requests: this.metrics.getCounter('rate_limit_checks'),
        blocked_requests: this.metrics.getCounter('rate_limit_blocked'),
        active_buckets: 0, // Would get from rateLimiter if accessible
      },
      security: {
        security_events: securityAuditor.getRecentEvents(50),
        key_rotations: this.metrics.getCounter('key_rotations'),
        replay_attempts: security_report.by_type['replay_detected'] || 0,
      },
      performance: {
        avg_sign_time_ms: Math.round(this.metrics.getAverage('sign') * 100) / 100,
        avg_verify_time_ms: Math.round(this.metrics.getAverage('verify') * 100) / 100,
        p95_sign_time_ms: this.metrics.getPercentile('sign', 95),
        p95_verify_time_ms: this.metrics.getPercentile('verify', 95),
      },
    };
  }

  async resetMetrics(): Promise<{ success: boolean; message: string }> {
    this.metrics.reset();
    return { success: true, message: 'Metrics reset successfully' };
  }

  async triggerKeyRotation(): Promise<{ success: boolean; message: string; details?: any }> {
    if (!FEATURES.AUTO_KEY_ROTATION) {
      return { success: false, message: 'Key rotation is disabled' };
    }

    try {
      // Would trigger actual key rotation in production
      this.metrics.incrementCounter('key_rotations');

      return {
        success: true,
        message: 'Key rotation triggered successfully',
        details: { timestamp: new Date().toISOString() },
      };
    } catch (error) {
      return {
        success: false,
        message: `Key rotation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async getSecurityReport(): Promise<ReturnType<typeof securityAuditor.getSecurityReport>> {
    return securityAuditor.getSecurityReport();
  }

  private calculateSuccessRate(): number {
    const total = this.metrics.getCounter('receipts_verified');
    const errors = this.metrics.getCounter('verify_errors');

    if (total === 0) return 100;
    return Math.round(((total - errors) / total) * 100 * 100) / 100;
  }

  private getRecentErrors(): string[] {
    // In production, would maintain error log
    return [];
  }
}

// Performance monitoring decorators
export function timed(operation: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const start = performance.now();

      try {
        metricsCollector.incrementCounter(`${operation}_attempts`);
        const result = await method.apply(this, args);
        const duration = performance.now() - start;

        metricsCollector.recordTiming(operation, duration);
        return result;
      } catch (error) {
        metricsCollector.incrementCounter(`${operation}_errors`);
        throw error;
      }
    };
  };
}

// Global instances
export const metricsCollector = new MetricsCollector();
export const healthChecker = new HealthChecker(metricsCollector);
export const adminEndpoints = new AdminEndpoints(metricsCollector, healthChecker);

// HTTP endpoint handlers
export const observabilityHandlers = {
  // GET /health
  health: async () => {
    const health = await healthChecker.checkHealth();
    const status_code =
      health.status === 'healthy' ? 200 : health.status === 'degraded' ? 206 : 503;

    return {
      status: status_code,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(health, null, 2),
    };
  },

  // GET /metrics (Prometheus format)
  metrics: async () => {
    const current = metricsCollector.getCurrentMetrics();

    const prometheus_metrics = [
      `# HELP peac_sign_p95_seconds 95th percentile sign operation duration`,
      `# TYPE peac_sign_p95_seconds gauge`,
      `peac_sign_p95_seconds ${(current.sign_p95_ms || 0) / 1000}`,
      ``,
      `# HELP peac_verify_p95_seconds 95th percentile verify operation duration`,
      `# TYPE peac_verify_p95_seconds gauge`,
      `peac_verify_p95_seconds ${(current.verify_p95_ms || 0) / 1000}`,
      ``,
      `# HELP peac_memory_usage_bytes Current memory usage`,
      `# TYPE peac_memory_usage_bytes gauge`,
      `peac_memory_usage_bytes ${(current.memory_usage_mb || 0) * 1024 * 1024}`,
      ``,
      `# HELP peac_error_rate Error rate percentage`,
      `# TYPE peac_error_rate gauge`,
      `peac_error_rate ${current.error_rate || 0}`,
      ``,
    ].join('\n');

    return {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      },
      body: prometheus_metrics,
    };
  },

  // GET /admin/stats (authentication required in production)
  adminStats: async () => {
    const stats = await adminEndpoints.getStats();

    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stats, null, 2),
    };
  },

  // POST /admin/reset-metrics (authentication required)
  resetMetrics: async () => {
    const result = await adminEndpoints.resetMetrics();

    return {
      status: result.success ? 200 : 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    };
  },

  // POST /admin/rotate-keys (authentication required)
  rotateKeys: async () => {
    const result = await adminEndpoints.triggerKeyRotation();

    return {
      status: result.success ? 200 : 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    };
  },

  // GET /admin/security
  securityReport: async () => {
    const report = await adminEndpoints.getSecurityReport();

    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(report, null, 2),
    };
  },
};

// Middleware for performance monitoring
export function performanceMiddleware(req: any, res: any, next: any) {
  const start = performance.now();

  res.on('finish', () => {
    const duration = performance.now() - start;
    metricsCollector.recordTiming('http_request', duration);
    metricsCollector.incrementCounter('http_requests');

    if (res.statusCode >= 400) {
      metricsCollector.incrementCounter('http_errors');
    }
  });

  next();
}
