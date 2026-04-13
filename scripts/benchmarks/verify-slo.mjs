#!/usr/bin/env node

/**
 * verify-slo.mjs
 *
 * Regression-based SLO gate for PEAC performance benchmarks.
 * Compares perf-results.json against specs/benchmarks/baseline.json.
 *
 * Exit 0: no regression detected
 * Exit 1: regression detected (p95 > 2x baseline)
 *
 * Absolute CI target breach emits a warning but does not fail the gate.
 * This avoids flaky failures on shared runners.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

const sloPath = resolve(root, 'specs/benchmarks/slo.json');
const baselinePath = resolve(root, 'specs/benchmarks/baseline.json');
const perfResultsPath = resolve(root, 'perf-results.json');

function loadJson(path) {
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main() {
  console.log('[slo] PEAC Performance SLO Regression Check\n');

  const slo = loadJson(sloPath);
  if (!slo) {
    console.log('[slo] SKIP: specs/benchmarks/slo.json not found');
    process.exit(0);
  }

  const baseline = loadJson(baselinePath);
  if (!baseline) {
    console.log('[slo] SKIP: specs/benchmarks/baseline.json not found');
    process.exit(0);
  }

  const perfResults = loadJson(perfResultsPath);
  if (!perfResults || !Array.isArray(perfResults) || perfResults.length === 0) {
    console.log('[slo] SKIP: perf-results.json not found or empty');
    process.exit(0);
  }

  const maxRatio = slo.regression?.max_ratio ?? 2.0;
  let hasRegression = false;
  let hasWarning = false;

  for (const target of slo.targets) {
    const op = target.operation;
    const baselineEntry = baseline.baselines?.find((b) => b.operation === op);
    const perfEntry = perfResults.find((p) => p.operation === op);

    if (!baselineEntry) {
      console.log(`[slo] SKIP: no baseline for operation "${op}"`);
      continue;
    }

    if (!perfEntry) {
      console.log(`[slo] SKIP: no perf result for operation "${op}"`);
      continue;
    }

    const currentP95 = perfEntry.timings_ms?.p95;
    const baselineP95 = baselineEntry.p95_ms;
    const ciTarget = target.p95_ms_ci;

    if (currentP95 === undefined || baselineP95 === undefined) {
      console.log(`[slo] SKIP: missing p95 data for "${op}"`);
      continue;
    }

    const ratio = currentP95 / baselineP95;
    const regressionThreshold = baselineP95 * maxRatio;

    console.log(`[slo] ${op}:`);
    console.log(`  baseline p95:  ${baselineP95.toFixed(3)} ms`);
    console.log(`  current  p95:  ${currentP95.toFixed(3)} ms`);
    console.log(`  ratio:         ${ratio.toFixed(2)}x`);
    console.log(`  threshold:     ${regressionThreshold.toFixed(3)} ms (${maxRatio}x baseline)`);
    console.log(`  CI target:     ${ciTarget} ms`);

    if (currentP95 > regressionThreshold) {
      console.log(`  [FAIL] REGRESSION: p95 exceeds ${maxRatio}x baseline`);
      hasRegression = true;
    } else if (currentP95 > ciTarget) {
      console.log(`  [WARN] p95 exceeds CI target (informational, not blocking)`);
      hasWarning = true;
    } else {
      console.log(`  [OK]`);
    }
    console.log('');
  }

  if (hasRegression) {
    console.log('[slo] FAIL: regression detected');
    process.exit(1);
  }

  if (hasWarning) {
    console.log('[slo] WARN: absolute target breach (non-blocking)');
  }

  console.log('[slo] OK: no regression detected');
  process.exit(0);
}

main();
