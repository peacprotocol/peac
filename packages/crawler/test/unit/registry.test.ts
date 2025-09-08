/**
 * @peac/crawler v0.9.12.1 - Registry unit tests
 * Tests for provider aggregation, modes, and strategies
 */

import { CrawlerControlRegistry } from '../../src/registry';
import {
  CrawlerControlProvider,
  VerifyRequest,
  VerificationResult,
  VerificationLevel,
} from '../../src/types';

// Mock provider for testing
class MockProvider implements CrawlerControlProvider {
  constructor(
    public name: string,
    public capabilities: Set<string> = new Set(['verify']),
    public priority: number = 0,
    private responses: VerificationResult[] = []
  ) {}

  private callCount = 0;

  async verify(req: VerifyRequest): Promise<VerificationResult> {
    const response = this.responses[this.callCount] || {
      provider: this.name,
      result: 'trusted',
      confidence: 0.8,
    };

    this.callCount++;
    return { ...response, latency_ms: 10 };
  }

  async healthCheck() {
    return { healthy: true, latency_ms: 5 };
  }

  getCallCount() {
    return this.callCount;
  }

  reset() {
    this.callCount = 0;
  }
}

describe('CrawlerControlRegistry', () => {
  let registry: CrawlerControlRegistry;
  let mockRequest: VerifyRequest;

  beforeEach(() => {
    registry = new CrawlerControlRegistry({
      strategy: 'weighted',
      mode: 'parallel',
      weights: { provider1: 0.6, provider2: 0.4 },
      fallbackPolicy: 'allow',
      perProviderTimeoutMs: 1000,
    });

    mockRequest = {
      requestId: 'test-123',
      ip: '1.2.3.4',
      userAgent: 'TestBot/1.0',
    };
  });

  afterEach(async () => {
    await registry.close();
  });

  describe('provider registration', () => {
    it('should register providers', () => {
      const provider = new MockProvider('test-provider');
      registry.register(provider);

      expect(registry.providers.has('test-provider')).toBe(true);
    });

    it('should register providers with custom weights and quotas', () => {
      const provider = new MockProvider('test-provider');
      const quota = { requestsPerMinute: 100 };

      registry.register(provider, 2.0, quota);

      const entry = registry.providers.get('test-provider');
      expect(entry?.weight).toBe(2.0);
      expect(entry?.quota).toBe(quota);
    });

    it('should allow health updates', () => {
      const provider = new MockProvider('test-provider');
      registry.register(provider);

      // Should start healthy
      expect(registry.providers.get('test-provider')?.healthy).toBe(true);

      // Update health
      registry.updateHealth('test-provider', false);
      expect(registry.providers.get('test-provider')?.healthy).toBe(false);
    });
  });

  describe('verification levels', () => {
    beforeEach(() => {
      const localProvider = new MockProvider('local', new Set(['verify']));
      const cloudflareProvider = new MockProvider('cloudflare', new Set(['verify']));

      registry.register(localProvider);
      registry.register(cloudflareProvider);
    });

    it('should return empty result for NONE level', async () => {
      const result = await registry.verify(mockRequest, VerificationLevel.NONE);

      expect(result.aggregated.result).toBe('unverified');
      expect(result.providers).toHaveLength(0);
      expect(result.level).toBe(VerificationLevel.NONE);
    });

    it('should only use local provider for LOCAL level', async () => {
      const result = await registry.verify(mockRequest, VerificationLevel.LOCAL);

      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].provider).toBe('local');
      expect(result.level).toBe(VerificationLevel.LOCAL);
    });

    it('should use all providers for FULL level', async () => {
      const result = await registry.verify(mockRequest, VerificationLevel.FULL);

      expect(result.providers).toHaveLength(2);
      expect(result.providers.map((p) => p.provider)).toContain('local');
      expect(result.providers.map((p) => p.provider)).toContain('cloudflare');
      expect(result.level).toBe(VerificationLevel.FULL);
    });
  });

  describe('aggregation strategies', () => {
    let provider1: MockProvider;
    let provider2: MockProvider;

    beforeEach(() => {
      provider1 = new MockProvider('provider1', new Set(['verify']), 0, [
        { provider: 'provider1', result: 'trusted', confidence: 0.9 },
      ]);
      provider2 = new MockProvider('provider2', new Set(['verify']), 0, [
        { provider: 'provider2', result: 'suspicious', confidence: 0.3 },
      ]);

      registry.register(provider1);
      registry.register(provider2);
    });

    it('should implement ANY strategy', async () => {
      const anyRegistry = new CrawlerControlRegistry({
        strategy: 'any',
        mode: 'parallel',
        fallbackPolicy: 'allow',
        perProviderTimeoutMs: 1000,
      });

      anyRegistry.register(provider1);
      anyRegistry.register(provider2);

      const result = await anyRegistry.verify(mockRequest);

      // Should be trusted because at least one provider returned trusted
      expect(result.aggregated.result).toBe('trusted');

      await anyRegistry.close();
    });

    it.skip('should implement ALL strategy', async () => {
      // TODO(peacprotocol/peac#150): revisit aggregation thresholds; un-skip in 0.9.13
      const allRegistry = new CrawlerControlRegistry({
        strategy: 'all',
        mode: 'parallel',
        fallbackPolicy: 'allow',
        perProviderTimeoutMs: 1000,
      });

      allRegistry.register(provider1);
      allRegistry.register(provider2);

      const result = await allRegistry.verify(mockRequest);

      // Should be suspicious because not all providers returned trusted
      expect(result.aggregated.result).toBe('suspicious');

      await allRegistry.close();
    });

    it('should implement MAJORITY strategy', async () => {
      const majorityRegistry = new CrawlerControlRegistry({
        strategy: 'majority',
        mode: 'parallel',
        fallbackPolicy: 'allow',
        perProviderTimeoutMs: 1000,
      });

      // Add third provider for clear majority
      const provider3 = new MockProvider('provider3', new Set(['verify']), 0, [
        { provider: 'provider3', result: 'trusted', confidence: 0.8 },
      ]);

      majorityRegistry.register(provider1);
      majorityRegistry.register(provider2);
      majorityRegistry.register(provider3);

      const result = await majorityRegistry.verify(mockRequest);

      // Should be trusted because majority (2/3) returned trusted
      expect(result.aggregated.result).toBe('trusted');

      await majorityRegistry.close();
    });

    it.skip('should implement WEIGHTED strategy', async () => {
      // TODO(peacprotocol/peac#151): revisit weighted calculation precision; un-skip in 0.9.13
      const result = await registry.verify(mockRequest);

      // Weighted average: (0.6 * 0.9) + (0.4 * 0.3) = 0.54 + 0.12 = 0.66
      expect(result.aggregated.confidence).toBeCloseTo(0.66, 2);
      expect(result.aggregated.result).toBe('trusted'); // Above 0.66 threshold
    });
  });

  describe('execution modes', () => {
    let provider1: MockProvider;
    let provider2: MockProvider;

    beforeEach(() => {
      provider1 = new MockProvider('provider1', new Set(['verify']), 100);
      provider2 = new MockProvider('provider2', new Set(['verify']), 50);

      registry.register(provider1);
      registry.register(provider2);
    });

    it('should execute all providers in parallel mode', async () => {
      const result = await registry.verify(mockRequest);

      expect(result.providers).toHaveLength(2);
      expect(provider1.getCallCount()).toBe(1);
      expect(provider2.getCallCount()).toBe(1);
    });

    it('should execute providers by priority in failover mode', async () => {
      const failoverRegistry = new CrawlerControlRegistry({
        strategy: 'weighted',
        mode: 'failover',
        fallbackPolicy: 'allow',
        perProviderTimeoutMs: 1000,
      });

      failoverRegistry.register(provider1);
      failoverRegistry.register(provider2);

      const result = await failoverRegistry.verify(mockRequest);

      // Should call higher priority provider first
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].provider).toBe('provider1'); // Higher priority
      expect(provider1.getCallCount()).toBe(1);
      expect(provider2.getCallCount()).toBe(0);

      await failoverRegistry.close();
    });

    it.skip('should continue to next provider in failover if first fails', async () => {
      // TODO(peacprotocol/peac#152): revisit failover provider count expectations; un-skip in 0.9.13
      const failoverRegistry = new CrawlerControlRegistry({
        strategy: 'weighted',
        mode: 'failover',
        fallbackPolicy: 'allow',
        perProviderTimeoutMs: 1000,
      });

      // Make first provider return error
      const failingProvider = new MockProvider('failing', new Set(['verify']), 100, [
        { provider: 'failing', result: 'error', confidence: 0 },
      ]);

      failoverRegistry.register(failingProvider);
      failoverRegistry.register(provider2);

      const result = await failoverRegistry.verify(mockRequest);

      expect(result.providers).toHaveLength(2);
      expect(result.providers[0].result).toBe('error');
      expect(result.providers[1].result).toBe('trusted');

      await failoverRegistry.close();
    });
  });

  describe('health impact on weights', () => {
    it('should reduce weight for unhealthy providers', async () => {
      const unhealthyRegistry = new CrawlerControlRegistry({
        strategy: 'weighted',
        mode: 'parallel',
        weights: { provider1: 1.0, provider2: 1.0 },
        fallbackPolicy: 'allow',
        perProviderTimeoutMs: 1000,
        dynamicWeightOnUnhealthy: 0, // Disable unhealthy providers
      });

      const provider1 = new MockProvider('provider1', new Set(['verify']), 0, [
        { provider: 'provider1', result: 'trusted', confidence: 0.9 },
      ]);
      const provider2 = new MockProvider('provider2', new Set(['verify']), 0, [
        { provider: 'provider2', result: 'suspicious', confidence: 0.3 },
      ]);

      unhealthyRegistry.register(provider1);
      unhealthyRegistry.register(provider2);

      // Mark provider2 as unhealthy
      unhealthyRegistry.updateHealth('provider2', false);

      const result = await unhealthyRegistry.verify(mockRequest);

      // Should only use healthy provider
      expect(result.aggregated.confidence).toBe(0.9);
      expect(provider1.getCallCount()).toBe(1);
      expect(provider2.getCallCount()).toBe(1); // Still called, but weight is 0

      await unhealthyRegistry.close();
    });
  });

  describe('fallback behavior', () => {
    it('should use fallback policy when no providers available', async () => {
      const emptyRegistry = new CrawlerControlRegistry({
        strategy: 'weighted',
        mode: 'parallel',
        fallbackPolicy: 'block',
        perProviderTimeoutMs: 1000,
      });

      const result = await emptyRegistry.verify(mockRequest);

      expect(result.aggregated.result).toBe('error'); // Maps from 'block' fallback
      expect(result.providers).toHaveLength(0);

      await emptyRegistry.close();
    });

    it('should use fallback policy when all providers error', async () => {
      const errorProvider = new MockProvider('error-provider', new Set(['verify']), 0, [
        { provider: 'error-provider', result: 'error', confidence: 0 },
      ]);

      registry.register(errorProvider);

      const result = await registry.verify(mockRequest);

      expect(result.aggregated.aggregation?.decision).toBe('allow'); // Fallback policy
    });
  });

  describe('statistics and monitoring', () => {
    it('should provide registry statistics', async () => {
      const provider1 = new MockProvider('provider1');
      const provider2 = new MockProvider('provider2');

      registry.register(provider1);
      registry.register(provider2);

      // Make some requests
      await registry.verify(mockRequest);
      await registry.verify({ ...mockRequest, ip: '2.2.2.2' });

      const stats = registry.getStats();

      expect(stats.providers).toHaveLength(2);
      expect(stats.total_requests).toBe(2);
      expect(stats.providers[0].name).toBe('provider1');
      expect(stats.providers[1].name).toBe('provider2');
    });

    it('should track cache hit rates', async () => {
      const provider = new MockProvider('test-provider');
      registry.register(provider);

      // First request (miss)
      await registry.verify(mockRequest);

      // Second request (hit)
      await registry.verify(mockRequest);

      const stats = registry.getStats();
      expect(stats.cache_hit_rate).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    it('should close all providers and clear state', async () => {
      const provider1 = new MockProvider('provider1');
      const provider2 = new MockProvider('provider2');

      provider1.close = jest.fn();
      provider2.close = jest.fn();

      registry.register(provider1);
      registry.register(provider2);

      await registry.close();

      expect(provider1.close).toHaveBeenCalled();
      expect(provider2.close).toHaveBeenCalled();
    });
  });
});
