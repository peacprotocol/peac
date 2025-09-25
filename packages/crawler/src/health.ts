/**
 * @peac/crawler v0.9.12.1 - Registry health monitor with scheduled checks
 * Proactive health monitoring to complement reactive circuit breakers
 */

import { CrawlerControlProvider, HealthCheckResult } from './types';
import { CircuitBreaker } from './circuitBreaker';

export interface HealthMonitorOptions {
  intervalMs: number;
  timeoutMs: number;
  unhealthyThreshold: number; // consecutive failures to mark unhealthy
  healthyThreshold: number; // consecutive successes to mark healthy
}

export interface ProviderHealthStatus {
  name: string;
  healthy: boolean;
  lastCheck: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastLatency: number;
  lastError?: string;
  checkCount: number;
}

export interface HealthMonitorStats {
  totalChecks: number;
  healthyProviders: number;
  unhealthyProviders: number;
  avgLatency: number;
  lastCheckTime: number;
}

export class RegistryHealthMonitor {
  private intervalId?: ReturnType<typeof setInterval>;
  private status = new Map<string, ProviderHealthStatus>();
  private totalChecks = 0;
  private isRunning = false;

  constructor(
    private providers: Map<
      string,
      {
        provider: CrawlerControlProvider;
        breaker: CircuitBreaker;
      }
    >,
    private onUpdate: (name: string, healthy: boolean, latency: number) => void,
    private options: HealthMonitorOptions = {
      intervalMs: 30_000,
      timeoutMs: 5_000,
      unhealthyThreshold: 3,
      healthyThreshold: 2,
    }
  ) {
    // Initialize status for all providers
    for (const [name, { provider }] of this.providers) {
      this.status.set(name, {
        name,
        healthy: true,
        lastCheck: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastLatency: 0,
        checkCount: 0,
      });
    }
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;

    // Run initial check
    this.checkAll().catch((error) => {
      console.error('Initial health check failed:', error);
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.checkAll().catch((error) => {
        console.error('Health check failed:', error);
      });
    }, this.options.intervalMs);
    (this.intervalId as any)?.unref?.();
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  async checkAll(): Promise<void> {
    const checkPromises = Array.from(this.providers.entries()).map(
      ([name, { provider, breaker }]) => this.checkProvider(name, provider, breaker)
    );

    await Promise.allSettled(checkPromises);
    this.totalChecks++;
  }

  private async checkProvider(
    name: string,
    provider: CrawlerControlProvider,
    breaker: CircuitBreaker
  ): Promise<void> {
    const status = this.status.get(name);
    if (!status) return;

    status.checkCount++;
    status.lastCheck = Date.now();

    // Skip check if provider doesn't support health checks
    if (!provider.healthCheck) {
      return;
    }

    try {
      const result = await this.timeoutPromise(provider.healthCheck(), this.options.timeoutMs);

      status.lastLatency = result.latency_ms;
      status.lastError = undefined;

      if (result.healthy) {
        status.consecutiveSuccesses++;
        status.consecutiveFailures = 0;

        // Mark as healthy if we've met the threshold
        if (!status.healthy && status.consecutiveSuccesses >= this.options.healthyThreshold) {
          status.healthy = true;
          this.onUpdate(name, true, result.latency_ms);

          // Force close circuit breaker if it's open
          if (breaker.getState() === 'open') {
            breaker.forceClose();
          }
        }
      } else {
        this.handleUnhealthyResult(status, breaker, 'Health check returned unhealthy');
      }
    } catch (error) {
      this.handleUnhealthyResult(status, breaker, error.message);
    }
  }

  private handleUnhealthyResult(
    status: ProviderHealthStatus,
    breaker: CircuitBreaker,
    errorMessage: string
  ): void {
    status.consecutiveFailures++;
    status.consecutiveSuccesses = 0;
    status.lastError = errorMessage;

    // Mark as unhealthy if we've met the threshold
    if (status.healthy && status.consecutiveFailures >= this.options.unhealthyThreshold) {
      status.healthy = false;
      this.onUpdate(status.name, false, -1);

      // Pre-open circuit breaker
      breaker.preOpen();
    }
  }

  private async timeoutPromise<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Health check timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeout));
    });
  }

  getStatus(providerName?: string): ProviderHealthStatus | ProviderHealthStatus[] {
    if (providerName) {
      return this.status.get(providerName) || this.createDefaultStatus(providerName);
    }

    return Array.from(this.status.values());
  }

  getStats(): HealthMonitorStats {
    const statuses = Array.from(this.status.values());
    const healthy = statuses.filter((s) => s.healthy).length;
    const unhealthy = statuses.length - healthy;

    const totalLatency = statuses
      .filter((s) => s.lastLatency > 0)
      .reduce((sum, s) => sum + s.lastLatency, 0);

    const latencyCount = statuses.filter((s) => s.lastLatency > 0).length;
    const avgLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;

    return {
      totalChecks: this.totalChecks,
      healthyProviders: healthy,
      unhealthyProviders: unhealthy,
      avgLatency: Math.round(avgLatency * 100) / 100,
      lastCheckTime: Math.max(...statuses.map((s) => s.lastCheck)),
    };
  }

  forceCheck(providerName: string): Promise<void> {
    const entry = this.providers.get(providerName);
    if (!entry) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    return this.checkProvider(providerName, entry.provider, entry.breaker);
  }

  reset(): void {
    // Reset all status counters
    for (const status of this.status.values()) {
      status.healthy = true;
      status.consecutiveFailures = 0;
      status.consecutiveSuccesses = 0;
      status.lastError = undefined;
      status.checkCount = 0;
    }

    this.totalChecks = 0;
  }

  private createDefaultStatus(name: string): ProviderHealthStatus {
    return {
      name,
      healthy: true,
      lastCheck: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastLatency: 0,
      checkCount: 0,
    };
  }

  isHealthy(): boolean {
    const statuses = Array.from(this.status.values());
    return statuses.length > 0 && statuses.every((s) => s.healthy);
  }

  getUnhealthyProviders(): string[] {
    return Array.from(this.status.values())
      .filter((s) => !s.healthy)
      .map((s) => s.name);
  }
}
