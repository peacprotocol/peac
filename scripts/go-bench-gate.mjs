#!/usr/bin/env node
/**
 * Regression-aware Go benchmark gate.
 *
 * Runs the stable benchmark subset in sdks/go/bench/ and compares the
 * median ns/op of each benchmark against the committed baseline in
 * sdks/go/bench/baseline.json. The methodology follows the v0.12.13
 * plan rules:
 *
 *   - Stable benchmark subset only (`BenchmarkVerify_Stable_*` prefix).
 *   - N=10 runs per bench per CI job (override via --runs).
 *   - Threshold bands:
 *       ratio <= 1.10x            -> green
 *       1.10x < ratio <= 1.25x    -> warn (annotate; do not fail)
 *       ratio > 1.25x AND absolute breach > 50us  -> fail
 *   - A fail is blocking only when it reproduces in 2-of-3 consecutive
 *     CI runs; --strict forces the current run to block regardless.
 *   - Baseline updates land only via the dedicated workflow_dispatch
 *     entrypoint; this gate never edits baseline.json.
 *
 * When the committed baseline has `baseline_pending: true` the gate
 * runs in measurement-only mode: it captures and reports the current
 * numbers, writes them to sdks/go/bench/runs/ if `--save-run` is set,
 * and always exits 0. This lets CI run the gate before any real
 * baseline exists for the target platform.
 *
 * Usage:
 *   node scripts/go-bench-gate.mjs              # measure-and-compare
 *   node scripts/go-bench-gate.mjs --runs 10    # N=10 runs
 *   node scripts/go-bench-gate.mjs --strict     # any fail blocks now
 *   node scripts/go-bench-gate.mjs --save-run   # write runs/<ts>.json
 *   node scripts/go-bench-gate.mjs --json       # JSON output
 *   node scripts/go-bench-gate.mjs --dry-run    # skip `go test -bench`; read
 *                                               # --fixture-output instead
 *
 * Exit codes:
 *   0  green, or warn, or baseline_pending=true
 *   1  fail (reproduction requirement already met in this run)
 *   2  usage error or internal failure
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const BENCH_DIR = resolve(REPO_ROOT, 'sdks/go/bench');
const BASELINE_PATH = resolve(BENCH_DIR, 'baseline.json');
const RUNS_DIR = resolve(BENCH_DIR, 'runs');

const args = process.argv.slice(2);
let runs = 10;
let strict = false;
let saveRun = false;
let jsonOutput = false;
let dryRun = false;
let fixtureOutput = null;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--') continue;
  if (a === '--runs' && args[i + 1]) {
    runs = Number(args[i + 1]);
    i += 1;
  } else if (a === '--strict') {
    strict = true;
  } else if (a === '--save-run') {
    saveRun = true;
  } else if (a === '--json') {
    jsonOutput = true;
  } else if (a === '--dry-run') {
    dryRun = true;
  } else if (a === '--fixture-output' && args[i + 1]) {
    fixtureOutput = args[i + 1];
    i += 1;
  } else {
    process.stderr.write(`unknown argument: ${a}\n`);
    process.exit(2);
  }
}

if (!existsSync(BASELINE_PATH)) {
  process.stderr.write(`baseline not found: ${BASELINE_PATH}\n`);
  process.exit(2);
}
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

const STABLE_PREFIX = 'BenchmarkVerify_Stable_';

/**
 * Run `go test -bench` in the bench module. Returns raw benchmark
 * output text. Honors GOWORK=off so nested-module resolution works
 * from the repository checkout. Uses -benchtime=200ms so the total
 * wall time for all runs stays bounded on CI.
 */
function runBenchmarks() {
  if (dryRun && fixtureOutput) {
    return readFileSync(fixtureOutput, 'utf8');
  }
  const args = [
    'test',
    '-run=^$',
    `-bench=^${STABLE_PREFIX}`,
    '-benchmem',
    `-count=${runs}`,
    '-benchtime=200ms',
    './...',
  ];
  const env = { ...process.env, GOWORK: 'off' };
  try {
    return execFileSync('go', args, {
      cwd: BENCH_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (err) {
    const stdout = (err.stdout || '').toString();
    const stderr = (err.stderr || '').toString();
    process.stderr.write(`go test -bench failed:\n${stdout}\n${stderr}\n`);
    process.exit(2);
  }
}

/**
 * Parse Go benchmark output into { name: [ns_per_op, ...] }. Accepts
 * lines like:
 *   BenchmarkVerify_Stable_JCSSmall-10   149181   1540 ns/op   1728 B/op   25 allocs/op
 */
function parseBenchmarkOutput(text) {
  const rows = {};
  const re = /^(Benchmark\S+?)(?:-\d+)?\s+\d+\s+([\d.]+)\s+ns\/op\s+([\d.]+)\s+B\/op\s+([\d.]+)\s+allocs\/op/;
  for (const line of text.split('\n')) {
    const m = line.match(re);
    if (!m) continue;
    if (!m[1].startsWith(STABLE_PREFIX)) continue;
    const row = rows[m[1]] ?? { ns: [], bytes: [], allocs: [] };
    row.ns.push(Number(m[2]));
    row.bytes.push(Number(m[3]));
    row.allocs.push(Number(m[4]));
    rows[m[1]] = row;
  }
  return rows;
}

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function evaluate(rows, baseline) {
  const thresholds = baseline.thresholds || {
    ratio_warn: 1.1,
    ratio_fail: 1.25,
    absolute_fail_ns_min: 50000,
    reproduction_runs_required_for_fail: 2,
  };
  const results = [];
  for (const name of Object.keys(rows)) {
    const row = rows[name];
    const medianNs = median(row.ns);
    const baselineRow = baseline.benchmarks?.[name] ?? null;
    const baselineNs = baselineRow?.ns_per_op ?? 0;
    let status;
    let reason = null;
    if (!baselineRow || baselineNs === 0) {
      status = 'SEED';
      reason = 'no baseline value for this benchmark';
    } else {
      const ratio = medianNs / baselineNs;
      const absBreach = medianNs - baselineNs;
      if (ratio > thresholds.ratio_fail && absBreach > thresholds.absolute_fail_ns_min) {
        status = 'FAIL';
        reason = `ratio=${ratio.toFixed(3)} absolute_breach_ns=${absBreach.toFixed(0)}`;
      } else if (ratio > thresholds.ratio_warn) {
        status = 'WARN';
        reason = `ratio=${ratio.toFixed(3)}`;
      } else {
        status = 'GREEN';
        reason = `ratio=${ratio.toFixed(3)}`;
      }
    }
    results.push({
      name,
      median_ns_per_op: medianNs,
      median_bytes_per_op: median(row.bytes),
      median_allocs_per_op: median(row.allocs),
      baseline_ns_per_op: baselineNs,
      samples: row.ns.length,
      status,
      reason,
    });
  }
  return { thresholds, results };
}

function writeRunRecord(rows, evaluation) {
  if (!saveRun) return;
  mkdirSync(RUNS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const path = resolve(RUNS_DIR, `${ts}.json`);
  writeFileSync(
    path,
    JSON.stringify({ timestamp: ts, rows, evaluation }, null, 2) + '\n'
  );
  if (!jsonOutput) process.stdout.write(`wrote run record: ${path}\n`);
}

const output = runBenchmarks();
const rows = parseBenchmarkOutput(output);

if (Object.keys(rows).length === 0) {
  process.stderr.write('no stable benchmarks captured; check the go test -bench output above\n');
  process.exit(2);
}

const evaluation = evaluate(rows, baseline);
writeRunRecord(rows, evaluation);

const fails = evaluation.results.filter((r) => r.status === 'FAIL');
const warns = evaluation.results.filter((r) => r.status === 'WARN');
const greens = evaluation.results.filter((r) => r.status === 'GREEN');
const seeds = evaluation.results.filter((r) => r.status === 'SEED');

if (jsonOutput) {
  process.stdout.write(
    JSON.stringify(
      {
        baseline_pending: baseline.baseline_pending === true,
        thresholds: evaluation.thresholds,
        results: evaluation.results,
        counts: {
          GREEN: greens.length,
          WARN: warns.length,
          FAIL: fails.length,
          SEED: seeds.length,
        },
      },
      null,
      2
    ) + '\n'
  );
} else {
  process.stdout.write(
    `go-bench-gate: baseline_pending=${baseline.baseline_pending === true} runs=${runs} strict=${strict}\n`
  );
  for (const r of evaluation.results) {
    process.stdout.write(
      `  [${r.status}] ${r.name}  median=${r.median_ns_per_op.toFixed(0)}ns/op baseline=${r.baseline_ns_per_op}ns/op  ${r.reason}\n`
    );
  }
  process.stdout.write(
    `summary: ${greens.length} GREEN / ${warns.length} WARN / ${fails.length} FAIL / ${seeds.length} SEED\n`
  );
}

if (baseline.baseline_pending === true) {
  if (!jsonOutput) process.stdout.write('baseline_pending=true; measurement-only run, not gating\n');
  process.exit(0);
}

if (fails.length > 0 && strict) {
  process.exit(1);
}

const reproRequired = evaluation.thresholds.reproduction_runs_required_for_fail ?? 2;
if (fails.length > 0 && reproRequired <= 1) {
  process.exit(1);
}

// Default: non-strict, reproduction required => single-run fails warn
// but do not block. CI should invoke with --strict after 2 prior runs
// have also produced fails on the same benchmark(s).
process.exit(0);
