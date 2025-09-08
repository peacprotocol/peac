/**
 * @peac/crawler v0.9.12.1 - Registry integration tests
 * End-to-end tests with real components
 */

import { buildRegistryFromOptions, RegistryHandle } from '../../src/index';
import { VerificationLevel } from '../../src/types';

describe('Registry Integration Tests', () => {
  let registryHandle: RegistryHandle;

  afterEach(async () => {
    if (registryHandle) {
      await registryHandle.shutdown();
    }
  });

  describe('zero-config setup', () => {
    it('should create registry with only local provider', async () => {
      registryHandle = await buildRegistryFromOptions({
        strategy: 'weighted',
        mode: 'parallel',
        fallbackPolicy: 'allow',
      });

      const stats = registryHandle.registry.getStats();

      expect(stats.providers).toHaveLength(1);
      expect(stats.providers[0].name).toBe('local');
      expect(stats.providers[0].healthy).toBe(true);
    });

    it('should perform local verification', async () => {
      registryHandle = await buildRegistryFromOptions({
        strategy: 'weighted',
        mode: 'parallel',
        fallbackPolicy: 'allow',
      });

      const result = await registryHandle.registry.verify({
        requestId: 'test-123',
        ip: '1.2.3.4',
        userAgent: 'GoogleBot/2.1',
      });

      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].provider).toBe('local');
      expect(result.providers[0].result).toBe('trusted');
      expect(result.aggregated.result).toBe('trusted');
    });
  });

  describe('caching behavior', () => {
    it('should cache verification results', async () => {
      registryHandle = await buildRegistryFromOptions({
        strategy: 'weighted',
        mode: 'parallel',
        fallbackPolicy: 'allow',
      });

      const request = {
        requestId: 'test-cache',
        ip: '1.2.3.4',
        userAgent: 'TestBot/1.0',
      };

      // First call
      const result1 = await registryHandle.registry.verify(request);
      expect(result1.cached_results).toBe(0);

      // Second call should use cache
      const result2 = await registryHandle.registry.verify(request);
      expect(result2.cached_results).toBe(1);
      expect(result2.providers[0].fromCache).toBe(true);
    });

    it('should handle cache misses for different IPs', async () => {
      registryHandle = await buildRegistryFromOptions({
        strategy: 'weighted',
        mode: 'parallel',
        fallbackPolicy: 'allow',
      });

      const request1 = {
        requestId: 'test-1',
        ip: '1.1.1.1',
        userAgent: 'TestBot/1.0',
      };

      const request2 = {
        requestId: 'test-2',
        ip: '2.2.2.2',
        userAgent: 'TestBot/1.0',
      };

      // Different IPs should not share cache
      const result1 = await registryHandle.registry.verify(request1);
      const result2 = await registryHandle.registry.verify(request2);

      expect(result1.cached_results).toBe(0);
      expect(result2.cached_results).toBe(0);
    });
  });

  describe('verification levels', () => {
    beforeEach(async () => {
      registryHandle = await buildRegistryFromOptions({
        strategy: 'weighted',
        mode: 'parallel',
        fallbackPolicy: 'allow',
      });
    });

    it('should respect NONE level', async () => {
      const result = await registryHandle.registry.verify(
        {
          requestId: 'test-none',
          ip: '1.2.3.4',
          userAgent: 'TestBot/1.0',
        },
        VerificationLevel.NONE
      );

      expect(result.level).toBe(VerificationLevel.NONE);
      expect(result.providers).toHaveLength(0);
      expect(result.aggregated.result).toBe('unverified');
    });

    it('should respect LOCAL level', async () => {
      const result = await registryHandle.registry.verify(
        {
          requestId: 'test-local',
          ip: '1.2.3.4',
          userAgent: 'TestBot/1.0',
        },
        VerificationLevel.LOCAL
      );

      expect(result.level).toBe(VerificationLevel.LOCAL);
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].provider).toBe('local');
    });

    it('should use FULL level by default', async () => {
      const result = await registryHandle.registry.verify({
        requestId: 'test-full',
        ip: '1.2.3.4',
        userAgent: 'TestBot/1.0',
      });

      expect(result.level).toBe(VerificationLevel.FULL);
      expect(result.providers).toHaveLength(1); // Only local in zero-config
    });
  });

  describe('health monitoring', () => {
    it('should create health monitor when enabled', async () => {
      registryHandle = await buildRegistryFromOptions({
        strategy: 'weighted',
        mode: 'parallel',
        fallbackPolicy: 'allow',
        enableHealthMonitor: true,
        healthCheckInterval: 1000,
      });

      expect(registryHandle.healthMonitor).toBeDefined();

      // Wait for initial health check
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = registryHandle.registry.getStats();
      expect(stats.providers[0].healthy).toBe(true);
    });

    it('should not create health monitor when disabled', async () => {
      registryHandle = await buildRegistryFromOptions({
        strategy: 'weighted',
        mode: 'parallel',
        fallbackPolicy: 'allow',
        enableHealthMonitor: false,
      });

      expect(registryHandle.healthMonitor).toBeUndefined();
    });
  });

  describe('aggregation strategies end-to-end', () => {
    it('should handle weighted aggregation with single provider', async () => {
      registryHandle = await buildRegistryFromOptions({
        strategy: 'weighted',
        mode: 'parallel',
        fallbackPolicy: 'allow',
        weights: { local: 1.0 },
      });

      const result = await registryHandle.registry.verify({
        requestId: 'test-weighted',
        ip: '1.2.3.4',
        userAgent: 'BingBot/2.0',
      });

      expect(result.aggregated.result).toBe('trusted');
      expect(result.aggregated.confidence).toBeGreaterThan(0.5);
    });

    it('should handle suspicious user agents', async () => {
      registryHandle = await buildRegistryFromOptions({
        strategy: 'weighted',
        mode: 'parallel',
        fallbackPolicy: 'allow',
      });

      const result = await registryHandle.registry.verify({
        requestId: 'test-suspicious',
        ip: '1.2.3.4',
        userAgent: 'curl/7.68.0', // Should be flagged as suspicious
      });

      expect(result.providers[0].indicators).toContain('ua_suspicious');
      expect(result.aggregated.confidence).toBeLessThan(0.8);
    });
  });

  describe('performance characteristics', () => {
    it('should complete verification within performance targets', async () => {
      registryHandle = await buildRegistryFromOptions({
        strategy: 'weighted',
        mode: 'parallel',
        fallbackPolicy: 'allow',
      });

      const start = Date.now();

      const result = await registryHandle.registry.verify({
        requestId: 'test-perf',
        ip: '1.2.3.4',
        userAgent: 'TestBot/1.0',
      });

      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50); // Should complete in <50ms for local
      expect(result.providers[0].latency_ms).toBeLessThan(20);
    });

    it('should handle concurrent requests efficiently', async () => {
      registryHandle = await buildRegistryFromOptions({
        strategy: 'weighted',
        mode: 'parallel',
        fallbackPolicy: 'allow',
      });

      const request = {
        requestId: 'concurrent-test',
        ip: '1.2.3.4',
        userAgent: 'TestBot/1.0',
      };

      const start = Date.now();

      // Make 10 concurrent requests
      const promises = Array(10)
        .fill(0)
        .map((_, i) =>
          registryHandle.registry.verify({
            ...request,
            requestId: `concurrent-test-${i}`,
          })
        );

      const results = await Promise.all(promises);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should complete efficiently
      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result.providers).toHaveLength(1);
        expect(result.aggregated.result).toBe('trusted');
      });
    });
  });

  describe('graceful shutdown', () => {
    it('should shutdown cleanly', async () => {
      registryHandle = await buildRegistryFromOptions({
        strategy: 'weighted',
        mode: 'parallel',
        fallbackPolicy: 'allow',
        enableHealthMonitor: true,
      });

      // Verify it's working
      const result = await registryHandle.registry.verify({
        requestId: 'test-shutdown',
        ip: '1.2.3.4',
        userAgent: 'TestBot/1.0',
      });

      expect(result.providers).toHaveLength(1);

      // Shutdown should complete without error
      await expect(registryHandle.shutdown()).resolves.not.toThrow();

      // Clear reference to avoid double shutdown in afterEach
      registryHandle = null as any;
    });

    it('should handle shutdown when already closed', async () => {
      registryHandle = await buildRegistryFromOptions({
        strategy: 'weighted',
        mode: 'parallel',
        fallbackPolicy: 'allow',
      });

      await registryHandle.shutdown();

      // Second shutdown should not throw
      await expect(registryHandle.shutdown()).resolves.not.toThrow();

      registryHandle = null as any;
    });
  });
});
