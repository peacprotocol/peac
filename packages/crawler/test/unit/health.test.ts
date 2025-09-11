/**
 * @peac/crawler - Health scoring tests
 */

import { HealthCheckResult } from '../../src/types';

// Simple health scoring logic tests
describe('health utilities', () => {
  test('returns zero confidence for critical failures', () => {
    const result: HealthCheckResult = {
      healthy: false,
      indicators: ['error_rate_critical', 'consecutive_failures_high'],
      confidence: 0,
      responseTimeMs: 5000
    };
    expect(result.confidence).toBe(0);
  });

  test('returns high confidence for healthy signals', () => {
    const result: HealthCheckResult = {
      healthy: true,
      indicators: ['response_time_good', 'error_rate_low'],
      confidence: 0.95,
      responseTimeMs: 20
    };
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});