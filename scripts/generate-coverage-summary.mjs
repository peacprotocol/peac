#!/usr/bin/env node
/**
 * Generate a machine-readable coverage summary from vitest coverage output.
 *
 * Runs vitest with coverage, extracts the JSON summary, and writes a small
 * artifact to docs/releases/coverage-summary.json. The README badge points
 * at this file via a Shields dynamic badge URL.
 *
 * Usage:
 *   node scripts/generate-coverage-summary.mjs
 *
 * Output: docs/releases/coverage-summary.json
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const COVERAGE_DIR = join(REPO_ROOT, 'coverage');
const SUMMARY_PATH = join(COVERAGE_DIR, 'coverage-summary.json');
const OUTPUT_PATH = join(REPO_ROOT, 'docs', 'releases', 'coverage-summary.json');

// Run vitest with coverage and JSON summary reporter.
// Exclude perf tests: coverage instrumentation overhead causes SLO
// assertions (p95 latency thresholds) to fail under instrumentation.
const result = spawnSync(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    '--coverage',
    '--coverage.reporter=json-summary',
    '--exclude',
    'tests/perf/**',
  ],
  {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    timeout: 300_000,
  },
);

if (result.status !== 0) {
  console.error('Coverage run failed');
  process.exit(1);
}

if (!existsSync(SUMMARY_PATH)) {
  console.error(`Coverage summary not found at ${SUMMARY_PATH}`);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(SUMMARY_PATH, 'utf-8'));
const total = raw.total;

const summary = {
  generated_at: new Date().toISOString(),
  version: JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')).version,
  coverage_provider: '@vitest/coverage-v8',
  scope: 'non-perf',
  excluded_suites: ['tests/perf/**'],
  statements: { pct: total.statements.pct },
  branches: { pct: total.branches.pct },
  functions: { pct: total.functions.pct },
  lines: { pct: total.lines.pct },
};

writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2) + '\n');
console.log(`Coverage summary written to ${OUTPUT_PATH}`);
console.log(JSON.stringify(summary, null, 2));
