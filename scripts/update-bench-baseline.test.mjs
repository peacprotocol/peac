#!/usr/bin/env node
/**
 * Tests for scripts/update-bench-baseline.mjs.
 *
 * Drives the updater against a temp baseline file with a synthetic
 * bench-gate capture. The production script writes to
 * sdks/go/bench/baseline.json; `--baseline <path>` overrides the
 * target so tests stay hermetic.
 *
 * Cases:
 *   1. valid capture -> writes baseline with real ns/bytes/allocs medians
 *      and flips baseline_pending to false
 *   2. empty results -> exits 1 and leaves baseline untouched
 *   3. missing --input -> usage error exits 2
 *   4. nonexistent input file -> exits 2
 *   5. unknown argument -> exits 2
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, 'update-bench-baseline.mjs');

const tmp = mkdtempSync(join(tmpdir(), 'update-bench-baseline-test-'));
let failures = 0;

function run(args) {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  try {
    stdout = execFileSync('node', [SCRIPT, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  } catch (err) {
    exitCode = err.status ?? -1;
    stdout = (err.stdout || '').toString();
    stderr = (err.stderr || '').toString();
  }
  return { stdout, stderr, exitCode };
}

function expect(label, condition, detail) {
  if (condition) console.log(`PASS [${label}]`);
  else {
    failures += 1;
    console.error(`FAIL [${label}]: ${detail}`);
  }
}

function writeBaseline(path, overrides = {}) {
  const base = {
    baseline_pending: true,
    captured_commit: '',
    captured_at: '',
    platform: '',
    go_version: '',
    methodology: 'test',
    benchmarks: {
      BenchmarkVerify_Stable_JCSSmall: { ns_per_op: 0, allocs_per_op: 0, bytes_per_op: 0 },
      BenchmarkVerify_Stable_JCSNested: { ns_per_op: 0, allocs_per_op: 0, bytes_per_op: 0 },
      BenchmarkVerify_Stable_JCSHash: { ns_per_op: 0, allocs_per_op: 0, bytes_per_op: 0 },
    },
    thresholds: { ratio_warn: 1.1, ratio_fail: 1.25, absolute_fail_ns_min: 50000, reproduction_runs_required_for_fail: 2 },
    notes: '',
    ...overrides,
  };
  writeFileSync(path, JSON.stringify(base, null, 2) + '\n');
}

try {
  // Case 1: valid capture updates baseline with real medians and flips
  // baseline_pending to false.
  {
    const capturePath = join(tmp, 'case1-capture.json');
    const baselinePath = join(tmp, 'case1-baseline.json');
    writeBaseline(baselinePath);
    writeFileSync(
      capturePath,
      JSON.stringify({
        baseline_pending: true,
        thresholds: {},
        results: [
          {
            name: 'BenchmarkVerify_Stable_JCSSmall',
            median_ns_per_op: 1520,
            median_bytes_per_op: 1728,
            median_allocs_per_op: 25,
          },
          {
            name: 'BenchmarkVerify_Stable_JCSNested',
            median_ns_per_op: 2550,
            median_bytes_per_op: 2728,
            median_allocs_per_op: 40,
          },
          {
            name: 'BenchmarkVerify_Stable_JCSHash',
            median_ns_per_op: 2670,
            median_bytes_per_op: 2936,
            median_allocs_per_op: 43,
          },
        ],
      })
    );

    const r = run(['--input', capturePath, '--baseline', baselinePath]);
    const updated = JSON.parse(readFileSync(baselinePath, 'utf8'));
    expect(
      'valid capture writes baseline with real medians and flips pending to false',
      r.exitCode === 0 &&
        updated.baseline_pending === false &&
        updated.benchmarks.BenchmarkVerify_Stable_JCSSmall.ns_per_op === 1520 &&
        updated.benchmarks.BenchmarkVerify_Stable_JCSSmall.bytes_per_op === 1728 &&
        updated.benchmarks.BenchmarkVerify_Stable_JCSSmall.allocs_per_op === 25 &&
        updated.benchmarks.BenchmarkVerify_Stable_JCSNested.bytes_per_op === 2728 &&
        updated.benchmarks.BenchmarkVerify_Stable_JCSNested.allocs_per_op === 40 &&
        updated.benchmarks.BenchmarkVerify_Stable_JCSHash.allocs_per_op === 43,
      `exit=${r.exitCode} updated=${JSON.stringify(updated).slice(0, 600)}`
    );
    expect(
      'valid capture preserves thresholds and notes fields',
      updated.thresholds &&
        updated.thresholds.ratio_warn === 1.1 &&
        typeof updated.notes === 'string',
      `thresholds=${JSON.stringify(updated.thresholds)}`
    );
  }

  // Case 2: empty results exits 1 and leaves baseline untouched.
  {
    const capturePath = join(tmp, 'case2-capture.json');
    const baselinePath = join(tmp, 'case2-baseline.json');
    writeBaseline(baselinePath);
    const before = readFileSync(baselinePath, 'utf8');
    writeFileSync(capturePath, JSON.stringify({ results: [] }));
    const r = run(['--input', capturePath, '--baseline', baselinePath]);
    const after = readFileSync(baselinePath, 'utf8');
    expect(
      'empty results exits 1 and leaves baseline untouched',
      r.exitCode === 1 && before === after,
      `exit=${r.exitCode} before===after:${before === after}`
    );
  }

  // Case 3: missing --input exits 2.
  {
    const r = run([]);
    expect(
      'missing --input exits 2 with usage',
      r.exitCode === 2 && r.stderr.includes('usage:'),
      `exit=${r.exitCode} stderr=${JSON.stringify(r.stderr)}`
    );
  }

  // Case 4: nonexistent input exits 2.
  {
    const r = run(['--input', join(tmp, 'no-such.json')]);
    expect(
      'nonexistent input exits 2',
      r.exitCode === 2 && r.stderr.includes('capture not found'),
      `exit=${r.exitCode} stderr=${JSON.stringify(r.stderr)}`
    );
  }

  // Case 5: unknown argument exits 2.
  {
    const r = run(['--whoops']);
    expect(
      'unknown argument exits 2',
      r.exitCode === 2 && r.stderr.includes('unknown argument'),
      `exit=${r.exitCode} stderr=${JSON.stringify(r.stderr)}`
    );
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nupdate-bench-baseline.test: ${failures} case(s) failed`);
  process.exit(1);
} else {
  console.log('\nupdate-bench-baseline.test: all cases passed');
  process.exit(0);
}
