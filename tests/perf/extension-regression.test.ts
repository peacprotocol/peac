/**
 * Wire 0.2 Extension Regression Tests
 *
 * Measures verifyLocal() and issueWire02() performance in strict mode
 * with registered first-party receipt types.
 *
 * Methodology:
 *   - Registered types (org.peacprotocol/payment, etc.)
 *   - Strict-mode verification with explicit issuer
 *   - ops/sec recorded to baseline-extension-results.json
 *   - Regression budget: no > 15% ops/sec drop vs stored baseline
 *   - Baseline update opt-in: PEAC_PERF_UPDATE=1
 *   - CI captures JSON artifacts for cross-version comparison (advisory)
 */

import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync, readFileSync, existsSync, renameSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { generateKeypair } from '@peac/crypto';
import { issueWire02, verifyLocal } from '@peac/protocol';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, 'baseline-extension-results.json');
const UPDATE_BASELINE = process.env.PEAC_PERF_UPDATE === '1';
const REGRESSION_BUDGET = 0.15; // 15% drop allowed

const WARMUP = 50;
const ITERATIONS = 500;

// -------------------------------------------------------------------------
// Helpers (same pattern as verify-baseline.test.ts)
// -------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((sorted.length * p) / 100) - 1;
  return sorted[Math.max(0, index)];
}

async function benchmarkAsync(
  fn: () => Promise<void>,
  iterations: number,
  warmup: number
): Promise<{ opsPerSec: number; p95Ms: number; p50Ms: number }> {
  for (let i = 0; i < warmup; i++) await fn();

  const timings: number[] = [];
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn();
    timings.push(performance.now() - t0);
  }
  const elapsed = performance.now() - start;
  const sorted = [...timings].sort((a, b) => a - b);

  return {
    opsPerSec: Math.round((iterations / elapsed) * 1000),
    p95Ms: percentile(sorted, 95),
    p50Ms: percentile(sorted, 50),
  };
}

function atomicWriteFileSync(path: string, content: string): void {
  const tmpDir = mkdtempSync(join(tmpdir(), 'peac-ext-baseline-'));
  const tmpPath = join(tmpDir, 'baseline.json');
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, path);
}

interface BaselineEntry {
  opsPerSec: number;
  p95Ms: number;
  p50Ms: number;
}

interface Baseline {
  timestamp: string;
  node_version: string;
  platform: string;
  peac_version: string;
  warmup: number;
  iterations: number;
  benchmarks: Record<string, BaselineEntry>;
}

const collectedMetrics: Record<string, BaselineEntry> = {};

// -------------------------------------------------------------------------
// Tests: registered types + strict mode
// -------------------------------------------------------------------------

describe('Wire 0.2 extension regression (strict mode, registered types)', () => {
  afterAll(() => {
    const jsonPath = process.env.PEAC_BENCH_JSON;
    if (jsonPath) {
      const output = {
        timestamp: new Date().toISOString(),
        node_version: process.version,
        platform: `${process.platform}-${process.arch}`,
        suite: 'extension-regression',
        metrics: collectedMetrics,
      };
      writeFileSync(
        join(dirname(jsonPath), 'ci-ext-bench-result.json'),
        JSON.stringify(output, null, 2) + '\n'
      );
    }
  });

  // Scenario: single extension, access-decision type, strict mode.
  // Uses registered type org.peacprotocol/access-decision with mapped
  // extension group org.peacprotocol/access.
  it('verifyLocal_single_extension_strict: access-decision', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/access-decision',
      privateKey,
      kid: 'bench-single',
      extensions: {
        'org.peacprotocol/access': {
          resource: 'https://api.example.com/v1/data',
          action: 'read',
          decision: 'allow',
        },
      },
    });

    const metrics = await benchmarkAsync(
      async () => {
        const result = await verifyLocal(jws, publicKey, {
          strictness: 'strict',
          issuer: 'https://api.example.com',
        });
        expect(result.valid).toBe(true);
      },
      ITERATIONS,
      WARMUP
    );

    collectedMetrics['verifyLocal_single_extension_strict'] = metrics;
    expect(metrics.opsPerSec).toBeGreaterThan(0);
  });

  // Scenario: single extension, payment type, strict mode.
  it('verifyLocal_payment_strict: commerce extension', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      privateKey,
      kid: 'bench-commerce',
      pillars: ['commerce'],
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '5000',
          currency: 'USD',
          reference: 'pi_bench_single',
        },
      },
    });

    const metrics = await benchmarkAsync(
      async () => {
        const result = await verifyLocal(jws, publicKey, {
          strictness: 'strict',
          issuer: 'https://api.example.com',
        });
        expect(result.valid).toBe(true);
      },
      ITERATIONS,
      WARMUP
    );

    collectedMetrics['verifyLocal_payment_strict'] = metrics;
    expect(metrics.opsPerSec).toBeGreaterThan(0);
  });

  // Scenario: 5 extension groups, payment type, strict mode.
  it('verifyLocal_multi_extension_strict: 5 groups', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      privateKey,
      kid: 'bench-multi',
      sub: 'user:bench',
      pillars: ['access', 'commerce', 'consent', 'identity', 'safety'],
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '5000',
          currency: 'USD',
          reference: 'pi_bench_multi',
        },
        'org.peacprotocol/access': {
          resource: 'https://api.example.com/v1/data',
          action: 'read',
          decision: 'allow',
        },
        'org.peacprotocol/consent': {
          consent_basis: 'explicit',
          consent_status: 'granted',
        },
        'org.peacprotocol/safety': {
          review_status: 'reviewed',
          risk_level: 'minimal',
        },
        'org.peacprotocol/identity': {
          proof_ref: 'sha256:abc123def456',
        },
      },
    });

    const metrics = await benchmarkAsync(
      async () => {
        const result = await verifyLocal(jws, publicKey, {
          strictness: 'strict',
          issuer: 'https://api.example.com',
        });
        expect(result.valid).toBe(true);
      },
      ITERATIONS,
      WARMUP
    );

    collectedMetrics['verifyLocal_multi_extension_strict'] = metrics;
    expect(metrics.opsPerSec).toBeGreaterThan(0);
  });

  // Scenario: issue path, 5 extension groups.
  it('issueWire02_multi_extension: 5 groups', async () => {
    const { privateKey } = await generateKeypair();

    const metrics = await benchmarkAsync(
      async () => {
        await issueWire02({
          iss: 'https://api.example.com',
          kind: 'evidence',
          type: 'org.peacprotocol/payment',
          privateKey,
          kid: 'bench-issue-multi',
          sub: 'user:bench',
          pillars: ['access', 'commerce', 'consent', 'identity', 'safety'],
          extensions: {
            'org.peacprotocol/commerce': {
              payment_rail: 'stripe',
              amount_minor: '5000',
              currency: 'USD',
              reference: 'pi_bench_multi',
            },
            'org.peacprotocol/access': {
              resource: 'https://api.example.com/v1/data',
              action: 'read',
              decision: 'allow',
            },
            'org.peacprotocol/consent': {
              consent_basis: 'explicit',
              consent_status: 'granted',
            },
            'org.peacprotocol/safety': {
              review_status: 'reviewed',
              risk_level: 'minimal',
            },
            'org.peacprotocol/identity': {
              proof_ref: 'sha256:abc123def456',
            },
          },
        });
      },
      ITERATIONS,
      WARMUP
    );

    collectedMetrics['issueWire02_multi_extension'] = metrics;
    expect(metrics.opsPerSec).toBeGreaterThan(0);
  });

  // Baseline recording (same pattern as verify-baseline.test.ts)
  it('records baseline measurements (write gated by PEAC_PERF_UPDATE=1)', () => {
    const baseline: Baseline = {
      timestamp: new Date().toISOString().split('T')[0],
      node_version: process.version,
      platform: `${process.platform}-${process.arch}`,
      peac_version: '0.12.2',
      warmup: WARMUP,
      iterations: ITERATIONS,
      benchmarks: { ...collectedMetrics },
    };

    if (UPDATE_BASELINE) {
      atomicWriteFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
      const written = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
      expect(written.peac_version).toBe('0.12.3');
    }

    for (const [name, entry] of Object.entries(collectedMetrics)) {
      expect(entry.opsPerSec, `${name} ops/sec > 0`).toBeGreaterThan(0);
    }
  });

  // Regression check (percentage budget, not absolute thresholds)
  it('no regression vs stored baseline (if baseline exists)', () => {
    if (!existsSync(BASELINE_PATH)) return;

    const stored = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as Baseline;

    for (const [name, current] of Object.entries(collectedMetrics)) {
      const storedEntry = stored.benchmarks[name];
      if (!storedEntry) continue;

      const threshold = storedEntry.opsPerSec * (1 - REGRESSION_BUDGET);
      expect(
        current.opsPerSec,
        `${name}: ${current.opsPerSec} ops/sec < ${threshold} (${Math.round(REGRESSION_BUDGET * 100)}% regression budget vs ${storedEntry.opsPerSec})`
      ).toBeGreaterThanOrEqual(threshold);
    }
  });
});
