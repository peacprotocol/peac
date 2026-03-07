/**
 * Wire 0.2 Performance SLO Gate (DD-159)
 *
 * CI gate: verifyLocal p95 MUST be <= 10ms for Wire 0.2 receipts.
 * Soft target: issueWire02 p95 SHOULD be <= 50ms.
 *
 * This test uses the same percentile approach as verify.bench.ts
 * but targets Wire 0.2 via issueWire02() and verifyLocal().
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { issueWire02 } from '@peac/protocol';
import { verifyLocal } from '@peac/protocol';

function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((sorted.length * p) / 100) - 1;
  return sorted[Math.max(0, index)];
}

function calculateMetrics(timings: number[]) {
  const sorted = [...timings].sort((a, b) => a - b);
  return {
    min_ms: sorted[0],
    max_ms: sorted[sorted.length - 1],
    mean_ms: timings.reduce((a, b) => a + b, 0) / timings.length,
    p50_ms: percentile(sorted, 50),
    p95_ms: percentile(sorted, 95),
    p99_ms: percentile(sorted, 99),
    iterations: timings.length,
  };
}

describe('Wire 0.2 performance SLO (DD-159)', () => {
  it('verifyLocal p95 MUST be <= 10ms', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/commerce',
      privateKey,
      kid: '2026-03-07T00:00:00Z',
      pillars: ['commerce'],
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '5000',
          currency: 'USD',
        },
      },
    });

    // Warmup
    for (let i = 0; i < 10; i++) {
      await verifyLocal(jws, publicKey);
    }

    // Benchmark
    const timings: number[] = [];
    for (let i = 0; i < 500; i++) {
      const start = performance.now();
      const result = await verifyLocal(jws, publicKey);
      const elapsed = performance.now() - start;
      expect(result.valid).toBe(true);
      timings.push(elapsed);
    }

    const metrics = calculateMetrics(timings);

    // CI gate: p95 <= 10ms
    expect(metrics.p95_ms).toBeLessThanOrEqual(10);
  });

  it('issueWire02 p95 SHOULD be <= 50ms', async () => {
    const { privateKey } = await generateKeypair();

    // Warmup
    for (let i = 0; i < 10; i++) {
      await issueWire02({
        iss: 'https://api.example.com',
        kind: 'evidence',
        type: 'org.peacprotocol/commerce',
        privateKey,
        kid: '2026-03-07T00:00:00Z',
      });
    }

    // Benchmark
    const timings: number[] = [];
    for (let i = 0; i < 500; i++) {
      const start = performance.now();
      await issueWire02({
        iss: 'https://api.example.com',
        kind: 'evidence',
        type: 'org.peacprotocol/commerce',
        privateKey,
        kid: '2026-03-07T00:00:00Z',
      });
      const elapsed = performance.now() - start;
      timings.push(elapsed);
    }

    const metrics = calculateMetrics(timings);

    // Soft target: p95 <= 50ms
    expect(metrics.p95_ms).toBeLessThanOrEqual(50);
  });
});
