#!/usr/bin/env node
/**
 * Tests for scripts/go-bench-gate.mjs.
 *
 * The gate shells out to `go test -bench` in production; this harness
 * drives the parsing and evaluation logic via `--dry-run --fixture-output
 * <path>` so tests are deterministic and do not require a Go toolchain.
 *
 * Cases:
 *   1. parses `go test -bench` output, reports SEED when baseline is pending
 *   2. emits --json with median_ns_per_op, median_bytes_per_op,
 *      median_allocs_per_op per result
 *   3. unknown argument exits 2
 *   4. "--" sentinel accepted
 *   5. missing fixture-output in dry-run exits 2 (no go toolchain shell-out)
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, 'go-bench-gate.mjs');

const tmp = mkdtempSync(join(tmpdir(), 'go-bench-gate-test-'));
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

// Canned `go test -bench -count=3 -benchmem` output covering the three
// stable benchmarks. Apple M1 numbers, but the gate does not care about
// the machine profile in test mode.
const FIXTURE_OUTPUT = [
  'goos: linux',
  'goarch: amd64',
  'pkg: github.com/peacprotocol/peac/sdks/go/bench',
  'cpu: fixture',
  'BenchmarkVerify_Stable_JCSSmall-4     150000   1500 ns/op   1728 B/op   25 allocs/op',
  'BenchmarkVerify_Stable_JCSSmall-4     151000   1510 ns/op   1728 B/op   25 allocs/op',
  'BenchmarkVerify_Stable_JCSSmall-4     152000   1520 ns/op   1728 B/op   25 allocs/op',
  'BenchmarkVerify_Stable_JCSNested-4     96000   2500 ns/op   2728 B/op   40 allocs/op',
  'BenchmarkVerify_Stable_JCSNested-4     97000   2550 ns/op   2728 B/op   40 allocs/op',
  'BenchmarkVerify_Stable_JCSNested-4     98000   2600 ns/op   2728 B/op   40 allocs/op',
  'BenchmarkVerify_Stable_JCSHash-4       86000   2650 ns/op   2936 B/op   43 allocs/op',
  'BenchmarkVerify_Stable_JCSHash-4       87000   2670 ns/op   2936 B/op   43 allocs/op',
  'BenchmarkVerify_Stable_JCSHash-4       88000   2690 ns/op   2936 B/op   43 allocs/op',
  'PASS',
  'ok  	github.com/peacprotocol/peac/sdks/go/bench	3.155s',
  '',
].join('\n');

try {
  // Case 1: parses fixture output, reports SEED on pending baseline.
  const fixturePath = join(tmp, 'fixture-1.txt');
  writeFileSync(fixturePath, FIXTURE_OUTPUT);
  const r1 = run(['--dry-run', '--fixture-output', fixturePath, '--runs', '3']);
  expect(
    'parses fixture output and reports SEED against pending baseline',
    r1.exitCode === 0 &&
      r1.stdout.includes('baseline_pending=true') &&
      r1.stdout.includes('[SEED] BenchmarkVerify_Stable_JCSSmall') &&
      r1.stdout.includes('[SEED] BenchmarkVerify_Stable_JCSNested') &&
      r1.stdout.includes('[SEED] BenchmarkVerify_Stable_JCSHash'),
    `exit=${r1.exitCode} stdout=${JSON.stringify(r1.stdout.slice(0, 400))}`
  );

  // Case 2: --json emits medians for ns_per_op, bytes_per_op, allocs_per_op.
  const r2 = run([
    '--dry-run',
    '--fixture-output',
    fixturePath,
    '--runs',
    '3',
    '--json',
  ]);
  let parsed = null;
  try {
    parsed = JSON.parse(r2.stdout);
  } catch {
    parsed = null;
  }
  const ok =
    r2.exitCode === 0 &&
    parsed &&
    Array.isArray(parsed.results) &&
    parsed.results.length === 3 &&
    parsed.results.every(
      (r) =>
        typeof r.median_ns_per_op === 'number' &&
        typeof r.median_bytes_per_op === 'number' &&
        typeof r.median_allocs_per_op === 'number' &&
        r.median_ns_per_op > 0 &&
        r.median_bytes_per_op > 0 &&
        r.median_allocs_per_op > 0
    );
  expect(
    '--json emits medians for ns_per_op, bytes_per_op, allocs_per_op',
    ok,
    `exit=${r2.exitCode} parsed=${JSON.stringify(parsed).slice(0, 400)}`
  );

  // Specifically check the JCSNested median values (middle samples).
  if (parsed) {
    const nested = parsed.results.find((r) => r.name === 'BenchmarkVerify_Stable_JCSNested');
    expect(
      'JCSNested medians match the middle sample of the fixture',
      nested && nested.median_ns_per_op === 2550 && nested.median_bytes_per_op === 2728 && nested.median_allocs_per_op === 40,
      `nested=${JSON.stringify(nested)}`
    );
  }

  // Case 3: unknown argument exits 2.
  const r3 = run(['--nope']);
  expect(
    'unknown argument exits 2',
    r3.exitCode === 2 && r3.stderr.includes('unknown argument'),
    `exit=${r3.exitCode} stderr=${JSON.stringify(r3.stderr)}`
  );

  // Case 4: "--" sentinel accepted.
  const r4 = run([
    '--',
    '--dry-run',
    '--fixture-output',
    fixturePath,
    '--runs',
    '3',
  ]);
  expect(
    '"--" sentinel is accepted',
    r4.exitCode === 0 && r4.stdout.includes('baseline_pending=true'),
    `exit=${r4.exitCode} stdout=${JSON.stringify(r4.stdout.slice(0, 200))}`
  );

  // Case 5: dry-run without a fixture-output file still invokes go; to
  // guarantee the test never shells out, we point at a missing file
  // and expect a failure. (This case simply confirms --dry-run alone
  // is not silently ok when no fixture is given.)
  const r5 = run(['--dry-run', '--fixture-output', join(tmp, 'no-such.txt')]);
  expect(
    'dry-run with missing fixture-output fails with nonzero exit',
    r5.exitCode !== 0,
    `exit=${r5.exitCode} stderr=${JSON.stringify(r5.stderr.slice(0, 200))}`
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\ngo-bench-gate.test: ${failures} case(s) failed`);
  process.exit(1);
} else {
  console.log('\ngo-bench-gate.test: all cases passed');
  process.exit(0);
}
