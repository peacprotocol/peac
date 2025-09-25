/**
 * @peac/crawler v0.9.12.1 - Observability integration
 * Thin shim to integrate with existing PEAC core metrics system
 */

// Import the existing observability system
import {
  metricsCollector as coreMetrics,
  HealthChecker as CoreHealthChecker,
} from '../../core/src/observability.js';

import {
  RegistryStats,
  VerificationResult,
  VerificationResponse,
  ProviderHealthStatus,
} from './types.js';
import { BreakerState } from './circuitBreaker.js';

export interface CrawlerMetrics {
  verifyRequests(provider: string): void;
  verifyLatency(provider: string, latencyMs: number): void;
  cacheHit(provider: string): void;
  cacheMiss(provider: string): void;
  breakerStateChange(provider: string, state: BreakerState): void;
  providerHealthy(provider: string, healthy: boolean): void;
  providerInitFailed(provider: string): void;
  quotaExhausted(provider: string): void;
  aggregationResult(trustScore: number, decision: string): void;
}

class CrawlerMetricsCollector implements CrawlerMetrics {
  verifyRequests(provider: string): void {
    coreMetrics.incrementCounter(`crawler_verify_requests_${provider}`);
    coreMetrics.incrementCounter('crawler_verify_requests_total');
  }

  verifyLatency(provider: string, latencyMs: number): void {
    coreMetrics.recordTiming(`crawler_verify_latency_${provider}`, latencyMs);
    coreMetrics.recordTiming('crawler_verify_latency_total', latencyMs);
  }

  cacheHit(provider: string): void {
    coreMetrics.incrementCounter(`crawler_cache_hit_${provider}`);
    coreMetrics.incrementCounter('crawler_cache_hit_total');
  }

  cacheMiss(provider: string): void {
    coreMetrics.incrementCounter(`crawler_cache_miss_${provider}`);
    coreMetrics.incrementCounter('crawler_cache_miss_total');
  }

  breakerStateChange(provider: string, state: BreakerState): void {
    coreMetrics.incrementCounter(`crawler_breaker_state_change_${provider}_${state}`);

    // Emit current state as gauge-like metric
    const stateValue = state === 'closed' ? 0 : state === 'half-open' ? 1 : 2;
    coreMetrics.recordTiming(`crawler_breaker_state_${provider}`, stateValue);
  }

  providerHealthy(provider: string, healthy: boolean): void {
    const status = healthy ? 'healthy' : 'unhealthy';
    coreMetrics.incrementCounter(`crawler_provider_${status}_${provider}`);

    if (!healthy) {
      coreMetrics.incrementCounter(`crawler_provider_unhealthy_total`);
    }
  }

  providerInitFailed(provider: string): void {
    coreMetrics.incrementCounter(`crawler_provider_init_failed_${provider}`);
    coreMetrics.incrementCounter('crawler_provider_init_failed_total');
  }

  quotaExhausted(provider: string): void {
    coreMetrics.incrementCounter(`crawler_quota_exhausted_${provider}`);
    coreMetrics.incrementCounter('crawler_quota_exhausted_total');
  }

  aggregationResult(trustScore: number, decision: string): void {
    coreMetrics.recordTiming('crawler_trust_score', trustScore);
    coreMetrics.incrementCounter(`crawler_decision_${decision}`);
  }

  // Additional helper methods
  recordVerificationResponse(response: VerificationResponse): void {
    this.aggregationResult(
      response.aggregated.confidence,
      response.aggregated.aggregation?.decision ?? 'unknown'
    );

    // Record per-provider metrics
    for (const result of response.providers) {
      this.verifyRequests(result.provider);

      if (result.latency_ms !== undefined) {
        this.verifyLatency(result.provider, result.latency_ms);
      }

      if (result.fromCache) {
        this.cacheHit(result.provider);
      } else {
        this.cacheMiss(result.provider);
      }
    }
  }

  recordHealthStatus(statuses: ProviderHealthStatus[]): void {
    for (const status of statuses) {
      this.providerHealthy(status.name, status.healthy);

      if (status.lastLatency > 0) {
        this.verifyLatency(status.name, status.lastLatency);
      }
    }
  }
}

// Export singleton instance
export const crawlerMetrics = new CrawlerMetricsCollector();

// Enhanced health checker that includes crawler metrics
export class CrawlerHealthChecker extends CoreHealthChecker {
  constructor(private registryStats: () => RegistryStats) {
    super(coreMetrics);
  }

  async checkCrawlerHealth(): Promise<{
    crawler_registry: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      total_providers: number;
      healthy_providers: number;
      cache_hit_rate: number;
      avg_latency_ms: number;
    };
  }> {
    const stats = this.registryStats();
    const healthyCount = stats.providers.filter((p) => p.healthy).length;
    const totalCount = stats.providers.length;

    let status: 'healthy' | 'degraded' | 'unhealthy';

    if (totalCount === 0) {
      status = 'unhealthy';
    } else if (healthyCount === totalCount) {
      status = 'healthy';
    } else if (healthyCount > 0) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      crawler_registry: {
        status,
        total_providers: totalCount,
        healthy_providers: healthyCount,
        cache_hit_rate: Math.round(stats.cache_hit_rate * 100) / 100,
        avg_latency_ms: Math.round(stats.avg_latency_ms * 100) / 100,
      },
    };
  }
}

// Utility functions for metric reporting
export function formatMetricsForPrometheus(stats: RegistryStats): string {
  const lines: string[] = [];

  // Provider health metrics
  lines.push('# HELP crawler_provider_healthy Provider health status');
  lines.push('# TYPE crawler_provider_healthy gauge');
  for (const provider of stats.providers) {
    lines.push(`crawler_provider_healthy{provider="${provider.name}"} ${provider.healthy ? 1 : 0}`);
  }

  lines.push('');

  // Cache hit rate
  lines.push('# HELP crawler_cache_hit_rate Cache hit rate across all providers');
  lines.push('# TYPE crawler_cache_hit_rate gauge');
  lines.push(`crawler_cache_hit_rate ${stats.cache_hit_rate}`);

  lines.push('');

  // Total requests
  lines.push('# HELP crawler_total_requests Total verification requests');
  lines.push('# TYPE crawler_total_requests counter');
  lines.push(`crawler_total_requests ${stats.total_requests}`);

  lines.push('');

  // Circuit breaker states
  lines.push('# HELP crawler_breaker_state Circuit breaker state (0=closed, 1=half-open, 2=open)');
  lines.push('# TYPE crawler_breaker_state gauge');
  for (const provider of stats.providers) {
    const stateValue =
      provider.breaker_state === 'closed' ? 0 : provider.breaker_state === 'half-open' ? 1 : 2;
    lines.push(`crawler_breaker_state{provider="${provider.name}"} ${stateValue}`);
  }

  return lines.join('\n') + '\n';
}

// Integration with core observability handlers
export const crawlerObservabilityHandlers = {
  // GET /crawler/health
  health: async (registryStats: () => RegistryStats) => {
    const checker = new CrawlerHealthChecker(registryStats);
    const health = await checker.checkCrawlerHealth();

    return {
      status:
        health.crawler_registry.status === 'healthy'
          ? 200
          : health.crawler_registry.status === 'degraded'
            ? 206
            : 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(health, null, 2),
    };
  },

  // GET /crawler/metrics
  metrics: async (registryStats: () => RegistryStats) => {
    const stats = registryStats();
    const prometheusMetrics = formatMetricsForPrometheus(stats);

    return {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      },
      body: prometheusMetrics,
    };
  },

  // GET /crawler/stats
  stats: async (registryStats: () => RegistryStats) => {
    const stats = registryStats();

    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stats, null, 2),
    };
  },
};
