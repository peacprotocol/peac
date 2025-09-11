/**
 * @peac/crawler v0.9.12.1 - Health monitor transition tests
 * Tests for health state transitions to increase branch coverage
 */

import { RegistryHealthMonitor } from '../../src/health';
import { CircuitBreaker } from '../../src/circuitBreaker';
import type { CrawlerControlProvider } from '../../src/types';

class FailingProvider implements CrawlerControlProvider {
  name = 'failing';
  priority = 0;
  capabilities = new Set(['verify']);

  async verify() {
    return { provider: 'failing', result: 'suspicious' as const, confidence: 0.1 };
  }

  async healthCheck() {
    return { healthy: false, latency_ms: 5 };
  }
}

describe('Health Monitor Transitions', () => {
  test('marks provider unhealthy when failures reach threshold', async () => {
    const providers = new Map([
      ['f', { provider: new FailingProvider(), breaker: new CircuitBreaker() }],
    ]);

    const updateCallback = jest.fn();
    const mon = new RegistryHealthMonitor(providers, updateCallback, {
      intervalMs: 1000,
      timeoutMs: 50,
      unhealthyThreshold: 1,
      healthyThreshold: 1,
    });

    await mon.checkAll(); // single failure is enough with threshold=1

    const status = mon.getStatus('f') as any;
    expect(status.healthy).toBe(false);
    expect(status.consecutiveFailures).toBe(1);

    mon.stop();
  });
});
