/**
 * Performance baseline (DD-118 Polish Bucket)
 *
 * Records machine-readable performance measurements to baseline-results.json.
 * In v0.10.14 this was informational only. In v0.11.0+ (post Zod 4), this
 * becomes a regression gate (no >10% drop vs recorded baseline).
 *
 * File write is opt-in: set PEAC_PERF_UPDATE=1 to update baseline-results.json.
 * Without that flag, benchmarks run but never write to disk -- prevents
 * accidental CI churn and dirty working tree after `pnpm test`.
 *
 * IMPORTANT: CI should NEVER set PEAC_PERF_UPDATE=1. Baselines are updated
 * manually by developers on controlled hardware to ensure reproducible results.
 *
 * Benchmarks:
 * - validateKernelConstraints: structural constraint checking
 * - assertJsonSafeIterative: JSON safety validation
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, readFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { validateKernelConstraints } from '@peac/schema';
import { assertJsonSafeIterative } from '@peac/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, 'baseline-results.json');
const UPDATE_BASELINE = process.env.PEAC_PERF_UPDATE === '1';

const WARMUP_ITERATIONS = 100;
const MEASUREMENT_ITERATIONS = 1000;

/** Benchmark a synchronous function, return ops/sec */
function benchmark(fn: () => void, iterations: number): number {
  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const elapsed = performance.now() - start;
  return Math.round((iterations / elapsed) * 1000);
}

/** Build a realistic receipt claims object */
function makeRealisticClaims(): Record<string, unknown> {
  return {
    iss: 'https://issuer.example.com',
    sub: 'https://resource.example.com/api/v1/data',
    iat: 1700000000,
    rid: 'receipt-test-001',
    interaction_id: 'int-test-001',
    auth: {
      method: 'oauth2',
      verified: true,
      token_hash: 'sha256:abcdef1234567890',
    },
    evidence: {
      type: 'payment',
      amount: 100,
      currency: 'USD',
      provider: 'stripe',
      tx_id: 'tx_1234567890',
    },
    _meta: {
      wire_format: 'peac-receipt/0.1',
      sdk_version: '0.11.0',
    },
    purpose_declared: ['model-training', 'analytics'],
    extensions: {
      'org.peacprotocol/interaction@0.1': {
        kind: 'toolcall',
        executor: { agent_id: 'agent-001', framework: 'langchain' },
      },
    },
  };
}

/**
 * Atomic write: write to temp file then rename.
 * Prevents partial writes from corrupting baseline-results.json.
 */
function atomicWriteFileSync(path: string, content: string): void {
  const tmpPath = join(tmpdir(), `peac-baseline-${Date.now()}.json`);
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, path);
}

describe('Performance baseline (DD-118)', () => {
  const claims = makeRealisticClaims();

  it('validateKernelConstraints produces finite positive ops/sec', () => {
    const opsPerSec = benchmark(() => validateKernelConstraints(claims), MEASUREMENT_ITERATIONS);
    expect(Number.isFinite(opsPerSec)).toBe(true);
    expect(opsPerSec).toBeGreaterThan(0);
  });

  it('assertJsonSafeIterative produces finite positive ops/sec', () => {
    const opsPerSec = benchmark(() => assertJsonSafeIterative(claims), MEASUREMENT_ITERATIONS);
    expect(Number.isFinite(opsPerSec)).toBe(true);
    expect(opsPerSec).toBeGreaterThan(0);
  });

  it('records baseline measurements (write gated by PEAC_PERF_UPDATE=1)', () => {
    const validateOps = benchmark(() => validateKernelConstraints(claims), MEASUREMENT_ITERATIONS);
    const jsonSafeOps = benchmark(() => assertJsonSafeIterative(claims), MEASUREMENT_ITERATIONS);

    const baseline = {
      timestamp: new Date().toISOString().split('T')[0],
      node_version: process.version,
      platform: `${process.platform}-${process.arch}`,
      cpu: process.arch === 'arm64' ? 'Apple M-series (ARM64)' : `${process.arch}`,
      peac_version: '0.11.0',
      warmup_iterations: WARMUP_ITERATIONS,
      measurement_iterations: MEASUREMENT_ITERATIONS,
      notes:
        'Single-run baseline; stddev not captured. Re-run with verify-baseline.test.ts for comparable results.',
      benchmarks: {
        validate_constraints_per_sec: validateOps,
        assert_json_safe_per_sec: jsonSafeOps,
      },
    };

    if (UPDATE_BASELINE) {
      atomicWriteFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
      const written = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
      expect(written.peac_version).toBe('0.11.0');
      expect(written.benchmarks.validate_constraints_per_sec).toBeGreaterThan(0);
      expect(written.node_version).toBe(process.version);
      expect(written.platform).toBe(`${process.platform}-${process.arch}`);
    }

    // Always verify measurements are sane, even when not writing
    expect(baseline.benchmarks.validate_constraints_per_sec).toBeGreaterThan(0);
    expect(baseline.benchmarks.assert_json_safe_per_sec).toBeGreaterThan(0);
  });
});
