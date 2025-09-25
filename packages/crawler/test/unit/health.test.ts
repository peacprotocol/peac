/**
 * @peac/crawler v0.9.12.1 - Health monitor unit tests
 * Tests for RegistryHealthMonitor utility functions
 */

import { RegistryHealthMonitor } from '../../src/health.js';
import { CircuitBreaker } from '../../src/circuitBreaker.js';
import { CrawlerControlProvider } from '../../src/types.js';

// Mock provider for testing
class MockProvider implements CrawlerControlProvider {
  name = 'test-provider';
  priority = 0;
  capabilities = new Set(['verify']);

  constructor(private healthResult?: { healthy: boolean; latency_ms: number }) {}

  async verify() {
    return { provider: 'test', result: 'trusted', confidence: 0.8 };
  }

  async healthCheck() {
    return this.healthResult || { healthy: true, latency_ms: 10 };
  }
}

describe('RegistryHealthMonitor', () => {
  let healthMonitor: RegistryHealthMonitor;
  let providers: Map<string, { provider: CrawlerControlProvider; breaker: CircuitBreaker }>;
  let updateCallback: jest.Mock;

  beforeEach(() => {
    providers = new Map();
    updateCallback = jest.fn();
  });

  afterEach(() => {
    if (healthMonitor) {
      healthMonitor.stop();
    }
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('utility functions', () => {
    it('should return correct stats for healthy providers', () => {
      const provider = new MockProvider({ healthy: true, latency_ms: 20 });
      providers.set('test', { provider, breaker: new CircuitBreaker() });

      healthMonitor = new RegistryHealthMonitor(providers, updateCallback);

      const stats = healthMonitor.getStats();
      expect(stats.healthyProviders).toBe(1);
      expect(stats.unhealthyProviders).toBe(0);
      expect(stats.totalChecks).toBe(0);
    });

    it('should detect all providers unhealthy', () => {
      const provider1 = new MockProvider({ healthy: false, latency_ms: 100 });
      const provider2 = new MockProvider({ healthy: false, latency_ms: 200 });

      providers.set('provider1', { provider: provider1, breaker: new CircuitBreaker() });
      providers.set('provider2', { provider: provider2, breaker: new CircuitBreaker() });

      healthMonitor = new RegistryHealthMonitor(providers, updateCallback);

      // Manually mark as unhealthy for test
      const status1 = healthMonitor.getStatus('provider1') as any;
      const status2 = healthMonitor.getStatus('provider2') as any;
      status1.healthy = false;
      status2.healthy = false;

      expect(healthMonitor.isHealthy()).toBe(false);
      expect(healthMonitor.getUnhealthyProviders()).toEqual(['provider1', 'provider2']);
    });

    it('should return high average latency for slow providers', () => {
      const slowProvider = new MockProvider({ healthy: true, latency_ms: 10000 });
      providers.set('slow', { provider: slowProvider, breaker: new CircuitBreaker() });

      healthMonitor = new RegistryHealthMonitor(providers, updateCallback);

      // Simulate a health check result
      const status = healthMonitor.getStatus('slow') as any;
      status.lastLatency = 10000;

      const stats = healthMonitor.getStats();
      expect(stats.avgLatency).toBeGreaterThan(1000);
    });

    it('should handle zero latency providers', () => {
      const zeroLatencyProvider = new MockProvider({ healthy: true, latency_ms: 0 });
      providers.set('zero', { provider: zeroLatencyProvider, breaker: new CircuitBreaker() });

      healthMonitor = new RegistryHealthMonitor(providers, updateCallback);

      const stats = healthMonitor.getStats();
      expect(stats.avgLatency).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle missing provider gracefully', () => {
      healthMonitor = new RegistryHealthMonitor(providers, updateCallback);

      const status = healthMonitor.getStatus('nonexistent');
      expect(status).toBeDefined();
      expect((status as any).name).toBe('nonexistent');
      expect((status as any).healthy).toBe(true);
    });

    it('should reset all counters correctly', () => {
      const provider = new MockProvider();
      providers.set('test', { provider, breaker: new CircuitBreaker() });

      healthMonitor = new RegistryHealthMonitor(providers, updateCallback);

      // Simulate some activity
      const status = healthMonitor.getStatus('test') as any;
      status.consecutiveFailures = 5;
      status.checkCount = 10;

      healthMonitor.reset();

      const resetStats = healthMonitor.getStats();
      const resetStatus = healthMonitor.getStatus('test') as any;

      expect(resetStats.totalChecks).toBe(0);
      expect(resetStatus.consecutiveFailures).toBe(0);
      expect(resetStatus.checkCount).toBe(0);
      expect(resetStatus.healthy).toBe(true);
    });
  });
});
