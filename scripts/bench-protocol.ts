#!/usr/bin/env tsx
/**
 * PEAC Protocol Performance Benchmark
 * Measures p95 latency for issue() and verify() operations
 *
 * Usage:
 *   pnpm bench:verify    # Run verify benchmark
 *   pnpm bench:issue     # Run issue benchmark
 *   pnpm bench           # Run both
 *
 * Environment:
 *   P95_VERIFY_MAX=7.0   # Override verify target (default: 7ms)
 *   P95_ISSUE_MAX=15.0   # Override issue target (default: 15ms)
 *   BENCH_RETRY=1        # Retry once on near-threshold failure (default: 1)
 */

import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';

// Dynamic imports for ESM compatibility
async function loadModules() {
  const protocol = await import('../packages/protocol/dist/index.mjs');
  const cryptoPkg = await import('../packages/crypto/dist/index.mjs');
  return { protocol, crypto: cryptoPkg };
}

const ITERATIONS = 300;
const WARMUP_ITERATIONS = 50;

// Targets with headroom for CI noise (actual targets ~4ms verify, ~1ms issue)
const DEFAULT_VERIFY_TARGET = 7.0; // ms
const DEFAULT_ISSUE_TARGET = 15.0; // ms

// Near-threshold: within 20% of target triggers retry
const NEAR_THRESHOLD_RATIO = 0.8;

interface BenchmarkResult {
  operation: string;
  timestamp: string;
  version: string;
  iterations: number;
  timings_ms: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  target_p95_ms: number;
  passes_target: boolean;
  attempt: number;
}

function calculateStats(timings: number[]): BenchmarkResult['timings_ms'] {
  const sorted = [...timings].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = sorted.reduce((sum, t) => sum + t, 0) / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  return {
    min: Number(min.toFixed(3)),
    max: Number(max.toFixed(3)),
    avg: Number(avg.toFixed(3)),
    p50: Number(p50.toFixed(3)),
    p95: Number(p95.toFixed(3)),
    p99: Number(p99.toFixed(3)),
  };
}

/** Attempt GC if available (run with --expose-gc) */
function tryGC(): void {
  if (typeof global.gc === 'function') {
    global.gc();
  }
}

async function benchmarkVerify(attempt: number = 1): Promise<BenchmarkResult> {
  console.log(`Loading modules... (attempt ${attempt})`);
  const { protocol, crypto } = await loadModules();
  const { issue, verifyReceipt } = protocol;
  const { generateKeypair } = crypto;

  // GC before setup
  tryGC();

  console.log('Generating key pair...');
  const { privateKey, publicKey } = await generateKeypair();

  console.log('Creating test receipt...');
  // Deterministic reference for reproducibility
  const result = await issue({
    iss: 'https://publisher.example',
    aud: 'https://agent.example',
    amt: 100,
    cur: 'USD',
    rail: 'stripe',
    reference: 'pi_bench_deterministic_001',
    privateKey,
    kid: 'bench-key-1',
  });

  const receipt = result.jws;
  const keys = { 'bench-key-1': publicKey };

  // Warmup phase
  console.log(`Warming up (${WARMUP_ITERATIONS} iterations)...`);
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    await verifyReceipt(receipt, keys);
  }

  // GC between warmup and measurement
  tryGC();

  // Measurement phase
  console.log(`Running ${ITERATIONS} verify operations...`);
  const timings: number[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await verifyReceipt(receipt, keys);
    const end = performance.now();
    timings.push(end - start);
  }

  const stats = calculateStats(timings);
  const targetP95 = parseFloat(process.env.P95_VERIFY_MAX || String(DEFAULT_VERIFY_TARGET));

  return {
    operation: 'verify',
    timestamp: new Date().toISOString(),
    version: '0.9.26',
    iterations: ITERATIONS,
    timings_ms: stats,
    target_p95_ms: targetP95,
    passes_target: stats.p95 < targetP95,
    attempt,
  };
}

async function benchmarkIssue(attempt: number = 1): Promise<BenchmarkResult> {
  console.log(`Loading modules... (attempt ${attempt})`);
  const { protocol, crypto } = await loadModules();
  const { issue } = protocol;
  const { generateKeypair } = crypto;

  // GC before setup
  tryGC();

  console.log('Generating key pair...');
  const { privateKey } = await generateKeypair();

  // Warmup phase
  console.log(`Warming up (${WARMUP_ITERATIONS} iterations)...`);
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    await issue({
      iss: 'https://publisher.example',
      aud: 'https://agent.example',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: `pi_bench_warmup_${i}`,
      privateKey,
      kid: 'bench-key-1',
    });
  }

  // GC between warmup and measurement
  tryGC();

  // Measurement phase - deterministic references
  console.log(`Running ${ITERATIONS} issue operations...`);
  const timings: number[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await issue({
      iss: 'https://publisher.example',
      aud: 'https://agent.example',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: `pi_bench_measure_${i}`,
      privateKey,
      kid: 'bench-key-1',
    });
    const end = performance.now();
    timings.push(end - start);
  }

  const stats = calculateStats(timings);
  const targetP95 = parseFloat(process.env.P95_ISSUE_MAX || String(DEFAULT_ISSUE_TARGET));

  return {
    operation: 'issue',
    timestamp: new Date().toISOString(),
    version: '0.9.26',
    iterations: ITERATIONS,
    timings_ms: stats,
    target_p95_ms: targetP95,
    passes_target: stats.p95 < targetP95,
    attempt,
  };
}

function printResults(result: BenchmarkResult): void {
  console.log(
    `\n${result.operation.toUpperCase()} Performance Results (attempt ${result.attempt}):`
  );
  console.log(`   Min: ${result.timings_ms.min}ms`);
  console.log(`   Max: ${result.timings_ms.max}ms`);
  console.log(`   Avg: ${result.timings_ms.avg}ms`);
  console.log(`   P50: ${result.timings_ms.p50}ms`);
  console.log(`   P95: ${result.timings_ms.p95}ms (target: <${result.target_p95_ms}ms)`);
  console.log(`   P99: ${result.timings_ms.p99}ms`);
  console.log(`\nTarget: ${result.passes_target ? 'PASS' : 'FAIL'}`);
  // Machine-readable line for CI parsing
  console.log(`P95_${result.operation.toUpperCase()}: ${result.timings_ms.p95}`);
}

/** Check if result is near threshold (within 20%) */
function isNearThreshold(result: BenchmarkResult): boolean {
  return result.timings_ms.p95 >= result.target_p95_ms * NEAR_THRESHOLD_RATIO;
}

async function runWithRetry(
  benchFn: (attempt: number) => Promise<BenchmarkResult>,
  maxRetries: number
): Promise<BenchmarkResult> {
  let result = await benchFn(1);
  printResults(result);

  // Retry if failed and near threshold (host noise suspected)
  if (!result.passes_target && isNearThreshold(result) && maxRetries > 0) {
    console.log('\nNear-threshold failure detected, retrying...');
    tryGC();
    // Small delay between retries
    await new Promise((r) => setTimeout(r, 1000));
    result = await benchFn(2);
    printResults(result);
  }

  return result;
}

async function main() {
  const mode = process.argv[2] || 'all';
  const maxRetries = parseInt(process.env.BENCH_RETRY || '1', 10);

  // 90s watchdog (increased for retries)
  const kill = setTimeout(() => {
    console.log('P95_VERIFY: 999');
    console.log('P95_ISSUE: 999');
    process.exit(1);
  }, 90_000);

  try {
    const results: BenchmarkResult[] = [];

    if (mode === 'verify' || mode === 'all') {
      const verifyResult = await runWithRetry(benchmarkVerify, maxRetries);
      results.push(verifyResult);
    }

    if (mode === 'issue' || mode === 'all') {
      const issueResult = await runWithRetry(benchmarkIssue, maxRetries);
      results.push(issueResult);
    }

    clearTimeout(kill);

    // Write results (machine-readable JSON)
    writeFileSync('perf-results.json', JSON.stringify(results, null, 2));
    console.log('\nResults saved to perf-results.json');

    // Exit with error if any target missed
    const allPass = results.every((r) => r.passes_target);
    process.exit(allPass ? 0 : 1);
  } catch (err) {
    clearTimeout(kill);
    console.error('Benchmark failed:', err);
    console.log('P95_VERIFY: 999');
    console.log('P95_ISSUE: 999');
    process.exit(1);
  }
}

main();
