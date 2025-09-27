/**
 * @peac/crawler v0.9.12.1 - Health monitor timeout tests
 * Tests for timeout handling to increase branch coverage
 */

import { RegistryHealthMonitor } from '../../src/health';
import { CircuitBreaker } from '../../src/circuitBreaker';
import type { CrawlerControlProvider } from '../../src/types';

class HangingProvider implements CrawlerControlProvider {
  name = 'hanging';
  priority = 0;
  capabilities = new Set(['verify']);

  async verify() {
    return { provider: 'hanging', result: 'trusted' as const, confidence: 0.9 };
  }

  async healthCheck() {
    // Never resolves - simulates hanging health check
    return new Promise(() => {});
  }
}

describe('Health Monitor Timeouts', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('health check timeout marks failure and updates status', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });

    const providers = new Map([
      ['h', { provider: new HangingProvider(), breaker: new CircuitBreaker() }],
    ]);

    const updateCallback = jest.fn();
    const mon = new RegistryHealthMonitor(providers, updateCallback, {
      intervalMs: 1000,
      timeoutMs: 5,
      unhealthyThreshold: 1,
      healthyThreshold: 1,
    });

    const checkPromise = mon.checkAll();
    await jest.advanceTimersByTimeAsync(10); // trigger timeout
    await checkPromise.catch(() => {}); // Promise.allSettled in impl, but be safe

    const status = mon.getStatus('h') as any;
    expect(status.healthy).toBe(false);
    expect(status.lastError).toContain('timeout');

    mon.stop();
  });
});
