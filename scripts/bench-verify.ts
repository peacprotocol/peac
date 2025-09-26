/**
 * @peac/core v0.9.14 - Verification performance benchmark
 * Measures p95 latency for verifyReceipt() with proper @peac/core imports
 */

import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { verifyReceipt, createAndSignReceipt } from '@peac/core';
import { generateJWKS } from '@peac/core/crypto';

const ITERATIONS = 1000;
const WARMUP_ITERATIONS = 50;

async function benchmark() {
  console.log('🔧 Setting up test data...');

  // Generate test key pair
  const jwks = await generateJWKS();
  const keyId = Object.keys(jwks)[0];
  const keyPair = jwks[keyId];

  // Create test receipt
  const testReceipt = await createAndSignReceipt({
    subject: 'https://example.com/test-resource',
    aipref: { status: 'allowed' },
    purpose: 'train-ai',
    enforcement: { method: 'none' },
    kid: keyId,
    privateKey: keyPair,
  });

  // Prepare verification keys (public only)
  const verifyKeys = {
    [keyId]: {
      kty: keyPair.kty,
      crv: keyPair.crv,
      x: keyPair.x,
    },
  };

  console.log('🔥 Warming up...');

  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    await verifyReceipt(testReceipt, verifyKeys);
  }

  console.log(`📊 Running ${ITERATIONS} verification operations...`);

  const timings: number[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await verifyReceipt(testReceipt, verifyKeys);
    const end = performance.now();
    timings.push(end - start);
  }

  // Calculate statistics
  timings.sort((a, b) => a - b);

  const min = timings[0];
  const max = timings[timings.length - 1];
  const avg = timings.reduce((sum, t) => sum + t, 0) / timings.length;
  const p50 = timings[Math.floor(timings.length * 0.5)];
  const p95 = timings[Math.floor(timings.length * 0.95)];
  const p99 = timings[Math.floor(timings.length * 0.99)];

  const results = {
    timestamp: new Date().toISOString(),
    version: '0.9.14',
    operations: ITERATIONS,
    timings_ms: {
      min: Number(min.toFixed(3)),
      max: Number(max.toFixed(3)),
      avg: Number(avg.toFixed(3)),
      p50: Number(p50.toFixed(3)),
      p95: Number(p95.toFixed(3)),
      p99: Number(p99.toFixed(3)),
    },
    target_p95_ms: 1.0,
    passes_target: p95 < 1.0,
  };

  console.log('\n📈 Performance Results:');
  console.log(`   Min: ${min.toFixed(3)}ms`);
  console.log(`   Max: ${max.toFixed(3)}ms`);
  console.log(`   Avg: ${avg.toFixed(3)}ms`);
  console.log(`   P50: ${p50.toFixed(3)}ms`);
  console.log(`   P95: ${p95.toFixed(3)}ms (target: <1ms)`);
  console.log(`   P99: ${p99.toFixed(3)}ms`);
  console.log(`\n🎯 Target: ${results.passes_target ? '✅ PASS' : '❌ FAIL'}`);

  // Write results to file
  writeFileSync('perf-results.json', JSON.stringify(results, null, 2));
  console.log('\n💾 Results saved to perf-results.json');

  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  benchmark().catch(console.error);
}

export { benchmark };
