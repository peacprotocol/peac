#!/usr/bin/env node
/**
 * Update sdks/go/bench/baseline.json from a go-bench-gate --json capture.
 *
 * This script is the only supported way to edit baseline.json. It is
 * invoked exclusively by the bench-gate update-baseline workflow, which
 * runs on a specific CI runner profile (ubuntu-24.04). Reviewers
 * approve the resulting baseline-refresh pull request.
 *
 * Usage:
 *   node scripts/update-bench-baseline.mjs --input <bench-capture.json>
 *
 * Exit codes:
 *   0  baseline.json updated (or was already up to date)
 *   1  capture input missing required fields
 *   2  usage error
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_BASELINE_PATH = resolve(REPO_ROOT, 'sdks/go/bench/baseline.json');

const args = process.argv.slice(2);
let inputPath = null;
let baselinePath = DEFAULT_BASELINE_PATH;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--input' && args[i + 1]) {
    inputPath = resolve(args[i + 1]);
    i += 1;
  } else if (args[i] === '--baseline' && args[i + 1]) {
    // Override the baseline path for tests. Production callers omit this
    // and the script writes to sdks/go/bench/baseline.json.
    baselinePath = resolve(args[i + 1]);
    i += 1;
  } else if (args[i] === '--') {
    continue;
  } else {
    process.stderr.write(`unknown argument: ${args[i]}\n`);
    process.exit(2);
  }
}
const BASELINE_PATH = baselinePath;

if (!inputPath) {
  process.stderr.write('usage: update-bench-baseline.mjs --input <capture.json>\n');
  process.exit(2);
}
if (!existsSync(inputPath)) {
  process.stderr.write(`capture not found: ${inputPath}\n`);
  process.exit(2);
}

const capture = JSON.parse(readFileSync(inputPath, 'utf8'));
if (!Array.isArray(capture.results) || capture.results.length === 0) {
  process.stderr.write('capture.results is empty; refusing to overwrite baseline\n');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const benchmarks = {};
for (const r of capture.results) {
  const ns = typeof r.median_ns_per_op === 'number' ? r.median_ns_per_op : 0;
  const bytes = typeof r.median_bytes_per_op === 'number' ? r.median_bytes_per_op : 0;
  const allocs = typeof r.median_allocs_per_op === 'number' ? r.median_allocs_per_op : 0;
  benchmarks[r.name] = {
    ns_per_op: Math.round(ns),
    allocs_per_op: Math.round(allocs),
    bytes_per_op: Math.round(bytes),
  };
}

let commit = '';
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
} catch {
  commit = '';
}
let goVersion = '';
try {
  goVersion = execFileSync('go', ['version'], { encoding: 'utf8' }).trim();
} catch {
  goVersion = '';
}

const updated = {
  ...baseline,
  baseline_pending: false,
  captured_commit: commit,
  captured_at: new Date().toISOString(),
  platform: `${process.platform}/${process.arch}`,
  go_version: goVersion,
  benchmarks,
};

writeFileSync(BASELINE_PATH, JSON.stringify(updated, null, 2) + '\n');
process.stdout.write(`updated ${BASELINE_PATH}\n`);
process.stdout.write(`  baseline_pending=false\n`);
for (const name of Object.keys(benchmarks)) {
  process.stdout.write(`  ${name}: ${benchmarks[name].ns_per_op}ns/op\n`);
}
