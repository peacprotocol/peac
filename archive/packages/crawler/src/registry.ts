/**
 * @peac/crawler v0.9.12.1 - Crawler control registry with aggregation
 * Vendor-neutral provider orchestration with parallel/failover modes
 */

import {
  CrawlerControlProvider,
  VerifyRequest,
  VerificationResult,
  VerificationResponse,
  VerificationLevel,
  RegistryOptions,
  RegistryStats,
  AggregationResult,
  ProviderQuota,
  Aggregation,
  Mode,
} from './types.js';
import { CircuitBreaker, BreakerState } from './circuitBreaker.js';
import { VerificationCache } from './cache.js';

interface ProviderEntry {
  provider: CrawlerControlProvider;
  breaker: CircuitBreaker;
  cache: VerificationCache;
  healthy: boolean;
  weight: number;
  quota?: ProviderQuota;
}

class QuotaManager {
  private perMin = new Map<string, { window: number; count: number }>();
  private perHour = new Map<string, { window: number; count: number }>();
  private monthlyCost = new Map<string, number>();

  private getWindow(windowSizeMs: number): number {
    return Math.floor(Date.now() / windowSizeMs);
  }

  canSpend(provider: string, quota: ProviderQuota): boolean {
    const now = Date.now();

    // Check per-minute quota
    if (quota.requestsPerMinute !== undefined) {
      const window = this.getWindow(60_000);
      const entry = this.perMin.get(provider);

      if (entry && entry.window === window && entry.count >= quota.requestsPerMinute) {
        return false;
      }
    }

    // Check per-hour quota
    if (quota.requestsPerHour !== undefined) {
      const window = this.getWindow(3600_000);
      const entry = this.perHour.get(provider);

      if (entry && entry.window === window && entry.count >= quota.requestsPerHour) {
        return false;
      }
    }

    // Check monthly cost quota
    if (quota.maxMonthlyCostUSD !== undefined) {
      const cost = this.monthlyCost.get(provider) ?? 0;
      if (cost >= quota.maxMonthlyCostUSD) {
        return false;
      }
    }

    return true;
  }

  spend(provider: string, quota: ProviderQuota, costUSD = 0): void {
    // Update per-minute counter
    if (quota.requestsPerMinute !== undefined) {
      const window = this.getWindow(60_000);
      const entry = this.perMin.get(provider);

      if (entry && entry.window === window) {
        entry.count++;
      } else {
        this.perMin.set(provider, { window, count: 1 });
      }
    }

    // Update per-hour counter
    if (quota.requestsPerHour !== undefined) {
      const window = this.getWindow(3600_000);
      const entry = this.perHour.get(provider);

      if (entry && entry.window === window) {
        entry.count++;
      } else {
        this.perHour.set(provider, { window, count: 1 });
      }
    }

    // Update monthly cost
    if (quota.maxMonthlyCostUSD !== undefined) {
      const current = this.monthlyCost.get(provider) ?? 0;
      this.monthlyCost.set(provider, current + costUSD);
    }
  }

  getMonthlyCost(provider: string): number {
    return this.monthlyCost.get(provider) ?? 0;
  }

  // Reset quotas (for testing)
  reset(): void {
    this.perMin.clear();
    this.perHour.clear();
    this.monthlyCost.clear();
  }
}

export class CrawlerControlRegistry {
  readonly providers = new Map<string, ProviderEntry>();
  private quotaManager = new QuotaManager();
  private totalRequests = 0;

  constructor(private readonly opts: RegistryOptions) {}

  register(provider: CrawlerControlProvider, weight = 1, quota?: ProviderQuota): void {
    const breaker = new CircuitBreaker({
      timeout: this.opts.perProviderTimeoutMs,
      errorThreshold: 5,
      resetMs: 30_000,
      successThreshold: 2,
    });

    const cache = new VerificationCache(provider.name);

    this.providers.set(provider.name, {
      provider,
      breaker,
      cache,
      healthy: true,
      weight,
      quota,
    });
  }

  updateHealth(name: string, healthy: boolean): void {
    const entry = this.providers.get(name);
    if (entry) {
      entry.healthy = healthy;

      // Pre-open circuit breaker if unhealthy
      if (!healthy && entry.breaker.getState() === 'closed') {
        entry.breaker.preOpen();
      }
    }
  }

  private getEffectiveWeight(name: string): number {
    const entry = this.providers.get(name);
    if (!entry) return 0;

    const baseWeight = this.opts.weights?.[name] ?? entry.weight;
    const healthyWeight = entry.healthy ? baseWeight : (this.opts.dynamicWeightOnUnhealthy ?? 0);

    return healthyWeight;
  }

  private async executeProvider(
    entry: ProviderEntry,
    req: VerifyRequest
  ): Promise<VerificationResult> {
    const { provider, breaker, cache, quota } = entry;

    // Check quota if configured
    if (quota && this.opts.quotas?.[provider.name]) {
      if (!this.quotaManager.canSpend(provider.name, quota)) {
        return {
          provider: provider.name,
          result: 'error',
          confidence: 0,
          indicators: ['quota_exhausted'],
        };
      }
    }

    return cache.getOrCompute(req, async () => {
      try {
        const result = await breaker.fire(() => provider.verify!(req));

        // Spend quota on successful execution
        if (quota && this.opts.quotas?.[provider.name]) {
          this.quotaManager.spend(provider.name, quota, 0.001); // Minimal cost estimate
        }

        return result;
      } catch (error) {
        return {
          provider: provider.name,
          result: 'error',
          confidence: 0,
          indicators: [error.message === 'circuit_open' ? 'circuit_open' : 'provider_error'],
        };
      }
    });
  }

  async verify(
    req: VerifyRequest,
    level: VerificationLevel = VerificationLevel.FULL
  ): Promise<VerificationResponse> {
    this.totalRequests++;

    // Fast exits
    if (level === VerificationLevel.NONE) {
      return {
        aggregated: {
          provider: 'aggregator',
          result: 'unverified',
          confidence: 0,
        },
        providers: [],
        level,
        cached_results: 0,
      };
    }

    // Select providers based on level
    const candidates = Array.from(this.providers.values())
      .filter((entry) => {
        if (!entry.provider.verify) return false;
        if (level === VerificationLevel.LOCAL && entry.provider.name !== 'local') return false;
        if (level === VerificationLevel.CACHED) {
          return entry.cache.has(req);
        }
        return true;
      })
      .sort((a, b) => (b.provider.priority ?? 0) - (a.provider.priority ?? 0));

    if (candidates.length === 0) {
      return {
        aggregated: {
          provider: 'aggregator',
          result: this.opts.fallbackPolicy === 'allow' ? 'unverified' : 'error',
          confidence: 0,
        },
        providers: [],
        level,
        cached_results: 0,
      };
    }

    // Execute providers based on mode
    const results: VerificationResult[] = [];
    let cachedResults = 0;

    if (this.opts.mode === 'parallel') {
      const promises = candidates.map((entry) => this.executeProvider(entry, req));
      const providerResults = await Promise.all(promises);
      results.push(...providerResults);
      cachedResults = providerResults.filter((r) => r.fromCache).length;
    } else {
      // Failover mode - stop on decisive result
      for (const entry of candidates) {
        const result = await this.executeProvider(entry, req);
        results.push(result);

        if (result.fromCache) cachedResults++;

        // Short-circuit on strong decision
        if (result.result === 'trusted' || result.result === 'error') {
          const tempAgg = this.aggregate(results);
          if (tempAgg.decision === 'allow' || tempAgg.decision === 'block') {
            break;
          }
        }
      }
    }

    // Aggregate results
    const aggregation = this.aggregate(results);
    const aggregated: VerificationResult = {
      provider: 'aggregator',
      result:
        aggregation.decision === 'allow'
          ? 'trusted'
          : aggregation.decision === 'block'
            ? 'unverified'
            : 'suspicious',
      confidence: aggregation.trust_score,
      aggregation,
    };

    return {
      aggregated,
      providers: results,
      level,
      cached_results: cachedResults,
    };
  }

  private aggregate(results: VerificationResult[]): AggregationResult {
    if (results.length === 0) {
      return {
        trust_score: 0,
        decision: this.opts.fallbackPolicy,
        provider_count: 0,
        error_count: 0,
      };
    }

    const errorCount = results.filter((r) => r.result === 'error').length;
    const validResults = results.filter((r) => r.result !== 'error');

    if (validResults.length === 0) {
      return {
        trust_score: 0,
        decision: this.opts.fallbackPolicy,
        provider_count: results.length,
        error_count: errorCount,
      };
    }

    const strategy = this.opts.strategy;
    let trust_score: number;

    switch (strategy) {
      case 'any': {
        const trusted = validResults.find((r) => r.result === 'trusted');
        trust_score = trusted ? trusted.confidence : validResults[0].confidence;
        break;
      }

      case 'all': {
        const allTrusted = validResults.every((r) => r.result === 'trusted');
        trust_score = allTrusted
          ? validResults.reduce((sum, r) => sum + r.confidence, 0) / validResults.length
          : 0.3;
        break;
      }

      case 'majority': {
        const trustedCount = validResults.filter((r) => r.result === 'trusted').length;
        trust_score = trustedCount > validResults.length / 2 ? 0.8 : 0.3;
        break;
      }

      case 'weighted':
      default: {
        const totalWeight = validResults.reduce(
          (sum, r) => sum + this.getEffectiveWeight(r.provider),
          0
        );
        if (totalWeight === 0) {
          trust_score = 0.3;
        } else {
          trust_score =
            validResults.reduce((sum, r) => {
              const weight = this.getEffectiveWeight(r.provider);
              const score =
                r.result === 'trusted'
                  ? r.confidence
                  : r.result === 'suspicious'
                    ? r.confidence * 0.5
                    : 0.1;
              return sum + weight * score;
            }, 0) / totalWeight;
        }
        break;
      }
    }

    // Determine decision based on trust score
    let decision: AggregationResult['decision'];
    if (trust_score >= 0.66) {
      decision = 'allow';
    } else if (trust_score >= 0.33) {
      decision = 'challenge';
    } else {
      decision = 'block';
    }

    return {
      trust_score: Math.max(0, Math.min(1, trust_score)),
      decision,
      provider_count: results.length,
      error_count: errorCount,
    };
  }

  getStats(): RegistryStats {
    const providers = Array.from(this.providers.entries()).map(([name, entry]) => ({
      name,
      healthy: entry.healthy,
      capabilities: Array.from(entry.provider.capabilities),
      priority: entry.provider.priority ?? 0,
      weight: this.getEffectiveWeight(name),
      breaker_state: entry.breaker.getState(),
      cache_stats: entry.cache.getStats(),
    }));

    const totalCacheStats = Array.from(this.providers.values())
      .map((e) => e.cache.getStats())
      .reduce(
        (acc, stats) => ({
          hits: acc.hits + stats.hits,
          total: acc.total + stats.hits + stats.misses,
        }),
        { hits: 0, total: 0 }
      );

    return {
      providers,
      total_requests: this.totalRequests,
      cache_hit_rate: totalCacheStats.total > 0 ? totalCacheStats.hits / totalCacheStats.total : 0,
      avg_latency_ms: 0,
    };
  }

  async close(): Promise<void> {
    const closePromises = Array.from(this.providers.values())
      .map((entry) => entry.provider.close?.())
      .filter(Boolean);

    await Promise.all(closePromises);

    // Clear all caches
    for (const entry of this.providers.values()) {
      entry.cache.clear();
    }

    this.quotaManager.reset();
  }
}
