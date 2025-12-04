/**
 * Performance benchmarks for PEAC receipt verification
 * CRITICAL CI GATE: verify p95 MUST be ≤ 10ms
 *
 * Target SLOs:
 * - p50: ≤5ms
 * - p95: ≤10ms
 * - p99: ≤20ms
 * - Edge (future): p95 ≤5ms
 */

import { describe, it, expect } from 'vitest';
import { issue } from '../../packages/protocol/src/issue';
import { verify as jwsVerify, generateKeypair } from '../../packages/crypto/src/jws';
import * as fs from 'fs';
import * as path from 'path';

interface PerfMetrics {
  min_ms: number;
  max_ms: number;
  mean_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  iterations: number;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((sorted.length * p) / 100) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calculate performance metrics from timings
 */
function calculateMetrics(timings: number[]): PerfMetrics {
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

describe('Performance Benchmarks', () => {
  it('verify p95 MUST be ≤ 10ms (CI GATE)', async () => {
    console.log('\nStarting verification performance benchmark...\n');

    // Generate test keypair
    const { privateKey, publicKey } = await generateKeypair();
    const kid = '2025-01-26T12:00:00Z';

    // Generate test receipt
    const testJWS = await issue({
      iss: 'https://api.example.com',
      aud: 'https://app.example.com',
      amt: 9999,
      cur: 'USD',
      rail: 'stripe',
      reference: 'cs_test_benchmark',
      subject: 'https://app.example.com/api/resource/123',
      privateKey,
      kid,
    });

    // Warmup (10 iterations)
    console.log('⏱️  Warmup: 10 iterations...');
    for (let i = 0; i < 10; i++) {
      await jwsVerify(testJWS, publicKey);
    }

    // Benchmark (1000 iterations)
    console.log('📊 Benchmark: 1000 iterations...\n');
    const timings: number[] = [];

    for (let i = 0; i < 1000; i++) {
      const start = performance.now();
      const result = await jwsVerify(testJWS, publicKey);
      const elapsed = performance.now() - start;

      expect(result.valid).toBe(true); // Sanity check
      timings.push(elapsed);
    }

    // Calculate metrics
    const metrics = calculateMetrics(timings);

    // Display results
    console.log('📈 Performance Metrics:');
    console.log(`   Min:  ${metrics.min_ms.toFixed(2)}ms`);
    console.log(`   Max:  ${metrics.max_ms.toFixed(2)}ms`);
    console.log(`   Mean: ${metrics.mean_ms.toFixed(2)}ms`);
    console.log(`   p50:  ${metrics.p50_ms.toFixed(2)}ms`);
    console.log(`   p95:  ${metrics.p95_ms.toFixed(2)}ms (GATE: ≤10ms)`);
    console.log(`   p99:  ${metrics.p99_ms.toFixed(2)}ms`);
    console.log(`   Iterations: ${metrics.iterations}\n`);

    // Write metrics to JSON for CI
    const metricsPath = path.join(process.cwd(), 'perf-metrics.json');
    fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
    console.log(`Metrics saved to: ${metricsPath}\n`);

    // CRITICAL CI GATE: p95 MUST be ≤ 10ms
    if (metrics.p95_ms > 10) {
      console.error(`[FAIL] PERFORMANCE GATE FAILED: p95 (${metrics.p95_ms.toFixed(2)}ms) > 10ms`);
      expect(metrics.p95_ms).toBeLessThanOrEqual(10);
    } else {
      console.log(`[OK] PERFORMANCE GATE PASSED: p95 (${metrics.p95_ms.toFixed(2)}ms) ≤ 10ms`);
    }

    // Aspirational targets (warnings, not failures)
    if (metrics.p50_ms > 5) {
      console.warn(`[WARN]  p50 (${metrics.p50_ms.toFixed(2)}ms) > 5ms (aspirational target)`);
    }

    if (metrics.p99_ms > 20) {
      console.warn(`[WARN]  p99 (${metrics.p99_ms.toFixed(2)}ms) > 20ms (aspirational target)`);
    }
  });

  it('issue p95 SHOULD be ≤ 50ms', async () => {
    console.log('\nStarting issuance performance benchmark...\n');

    const { privateKey } = await generateKeypair();
    const kid = '2025-01-26T12:00:00Z';

    // Warmup
    console.log('⏱️  Warmup: 10 iterations...');
    for (let i = 0; i < 10; i++) {
      await issue({
        iss: 'https://api.example.com',
        aud: 'https://app.example.com',
        amt: 9999,
        cur: 'USD',
        rail: 'stripe',
        reference: `cs_warmup_${i}`,
        privateKey,
        kid,
      });
    }

    // Benchmark
    console.log('📊 Benchmark: 1000 iterations...\n');
    const timings: number[] = [];

    for (let i = 0; i < 1000; i++) {
      const start = performance.now();
      await issue({
        iss: 'https://api.example.com',
        aud: 'https://app.example.com',
        amt: 9999,
        cur: 'USD',
        rail: 'stripe',
        reference: `cs_test_${i}`,
        privateKey,
        kid,
      });
      const elapsed = performance.now() - start;
      timings.push(elapsed);
    }

    const metrics = calculateMetrics(timings);

    console.log('📈 Issuance Performance:');
    console.log(`   Min:  ${metrics.min_ms.toFixed(2)}ms`);
    console.log(`   Mean: ${metrics.mean_ms.toFixed(2)}ms`);
    console.log(`   p50:  ${metrics.p50_ms.toFixed(2)}ms`);
    console.log(`   p95:  ${metrics.p95_ms.toFixed(2)}ms (target: ≤50ms)`);
    console.log(`   p99:  ${metrics.p99_ms.toFixed(2)}ms\n`);

    // Soft target (warning, not failure)
    if (metrics.p95_ms > 50) {
      console.warn(`[WARN]  Issue p95 (${metrics.p95_ms.toFixed(2)}ms) > 50ms (target)`);
    } else {
      console.log(`[OK] Issue p95 (${metrics.p95_ms.toFixed(2)}ms) ≤ 50ms`);
    }
  });

  it('JCS canonicalization p95 SHOULD be ≤ 1ms', async () => {
    console.log('\nStarting JCS canonicalization benchmark...\n');

    const { canonicalize } = await import('../../packages/crypto/src/jcs');

    const testObject = {
      iss: 'https://api.example.com',
      aud: 'https://app.example.com',
      iat: 1737892800,
      rid: '0193c4d0-0000-7000-8000-000000000000',
      amt: 9999,
      cur: 'USD',
      payment: {
        rail: 'stripe',
        reference: 'cs_test',
        amount: 9999,
        currency: 'USD',
      },
    };

    // Warmup
    for (let i = 0; i < 100; i++) {
      canonicalize(testObject);
    }

    // Benchmark
    const timings: number[] = [];
    for (let i = 0; i < 10000; i++) {
      const start = performance.now();
      canonicalize(testObject);
      const elapsed = performance.now() - start;
      timings.push(elapsed);
    }

    const metrics = calculateMetrics(timings);

    console.log('📈 JCS Canonicalization Performance:');
    console.log(`   Min:  ${metrics.min_ms.toFixed(3)}ms`);
    console.log(`   Mean: ${metrics.mean_ms.toFixed(3)}ms`);
    console.log(`   p50:  ${metrics.p50_ms.toFixed(3)}ms`);
    console.log(`   p95:  ${metrics.p95_ms.toFixed(3)}ms (target: ≤1ms)`);
    console.log(`   p99:  ${metrics.p99_ms.toFixed(3)}ms\n`);

    if (metrics.p95_ms > 1) {
      console.warn(`[WARN]  JCS p95 (${metrics.p95_ms.toFixed(3)}ms) > 1ms (target)`);
    } else {
      console.log(`[OK] JCS p95 (${metrics.p95_ms.toFixed(3)}ms) ≤ 1ms`);
    }
  });
});
