#!/usr/bin/env tsx
/**
 * PEAC Protocol Performance Benchmark
 * Measures p95 latency for issue() and verify() operations
 *
 * Usage:
 *   pnpm bench:verify    # Run verify benchmark
 *   pnpm bench:issue     # Run issue benchmark
 *   pnpm bench           # Run both
 */

import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import * as nodeCrypto from 'node:crypto';

// Dynamic imports for ESM compatibility
async function loadModules() {
  const protocol = await import('../packages/protocol/dist/index.js');
  const cryptoPkg = await import('../packages/crypto/dist/index.js');
  return { protocol, crypto: cryptoPkg };
}

const ITERATIONS = 300;
const WARMUP_ITERATIONS = 30;

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
}

function calculateStats(timings: number[]): BenchmarkResult['timings_ms'] {
  timings.sort((a, b) => a - b);
  const min = timings[0];
  const max = timings[timings.length - 1];
  const avg = timings.reduce((sum, t) => sum + t, 0) / timings.length;
  const p50 = timings[Math.floor(timings.length * 0.5)];
  const p95 = timings[Math.floor(timings.length * 0.95)];
  const p99 = timings[Math.floor(timings.length * 0.99)];

  return {
    min: Number(min.toFixed(3)),
    max: Number(max.toFixed(3)),
    avg: Number(avg.toFixed(3)),
    p50: Number(p50.toFixed(3)),
    p95: Number(p95.toFixed(3)),
    p99: Number(p99.toFixed(3)),
  };
}

async function benchmarkVerify(): Promise<BenchmarkResult> {
  console.log('Loading modules...');
  const { protocol, crypto } = await loadModules();
  const { issue, verifyReceipt } = protocol;
  const { generateKeypair } = crypto;

  console.log('Generating key pair...');
  const { privateKey, publicKey } = await generateKeypair();

  console.log('Creating test receipt...');
  const result = await issue({
    iss: 'https://publisher.example',
    aud: 'https://agent.example',
    amt: 100,
    cur: 'USD',
    rail: 'stripe',
    reference: 'pi_test_' + nodeCrypto.randomUUID(),
    privateKey,
    kid: 'bench-key-1',
  });

  const receipt = result.jws;
  const keys = { 'bench-key-1': publicKey };

  console.log('Warming up verify...');
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    await verifyReceipt(receipt, keys);
  }

  console.log(`Running ${ITERATIONS} verify operations...`);
  const timings: number[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await verifyReceipt(receipt, keys);
    const end = performance.now();
    timings.push(end - start);
  }

  const stats = calculateStats(timings);
  const targetP95 = parseFloat(process.env.P95_VERIFY_MAX || '5.0');

  return {
    operation: 'verify',
    timestamp: new Date().toISOString(),
    version: '0.9.26',
    iterations: ITERATIONS,
    timings_ms: stats,
    target_p95_ms: targetP95,
    passes_target: stats.p95 < targetP95,
  };
}

async function benchmarkIssue(): Promise<BenchmarkResult> {
  console.log('Loading modules...');
  const { protocol, crypto } = await loadModules();
  const { issue } = protocol;
  const { generateKeypair } = crypto;

  console.log('Generating key pair...');
  const { privateKey } = await generateKeypair();

  console.log('Warming up issue...');
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    await issue({
      iss: 'https://publisher.example',
      aud: 'https://agent.example',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'pi_test_' + nodeCrypto.randomUUID(),
      privateKey,
      kid: 'bench-key-1',
    });
  }

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
      reference: 'pi_test_' + nodeCrypto.randomUUID(),
      privateKey,
      kid: 'bench-key-1',
    });
    const end = performance.now();
    timings.push(end - start);
  }

  const stats = calculateStats(timings);
  const targetP95 = parseFloat(process.env.P95_ISSUE_MAX || '10.0');

  return {
    operation: 'issue',
    timestamp: new Date().toISOString(),
    version: '0.9.26',
    iterations: ITERATIONS,
    timings_ms: stats,
    target_p95_ms: targetP95,
    passes_target: stats.p95 < targetP95,
  };
}

function printResults(result: BenchmarkResult): void {
  console.log(`\n${result.operation.toUpperCase()} Performance Results:`);
  console.log(`   Min: ${result.timings_ms.min}ms`);
  console.log(`   Max: ${result.timings_ms.max}ms`);
  console.log(`   Avg: ${result.timings_ms.avg}ms`);
  console.log(`   P50: ${result.timings_ms.p50}ms`);
  console.log(`   P95: ${result.timings_ms.p95}ms (target: <${result.target_p95_ms}ms)`);
  console.log(`   P99: ${result.timings_ms.p99}ms`);
  console.log(`\nTarget: ${result.passes_target ? 'PASS' : 'FAIL'}`);
  console.log(`P95_${result.operation.toUpperCase()}: ${result.timings_ms.p95}`);
}

async function main() {
  const mode = process.argv[2] || 'all';

  // 60s watchdog
  const kill = setTimeout(() => {
    console.log('P95_VERIFY: 999');
    console.log('P95_ISSUE: 999');
    process.exit(1);
  }, 60_000);

  try {
    const results: BenchmarkResult[] = [];

    if (mode === 'verify' || mode === 'all') {
      const verifyResult = await benchmarkVerify();
      printResults(verifyResult);
      results.push(verifyResult);
    }

    if (mode === 'issue' || mode === 'all') {
      const issueResult = await benchmarkIssue();
      printResults(issueResult);
      results.push(issueResult);
    }

    clearTimeout(kill);

    // Write results
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
