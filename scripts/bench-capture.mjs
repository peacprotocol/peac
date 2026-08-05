#!/usr/bin/env node
/**
 * bench-capture.mjs -- run package benchmarks and capture local JSON output.
 *
 * Output is LOCAL DIAGNOSTIC EVIDENCE written to the ignored `bench-results/` directory. It is not
 * a tracked baseline and is not comparable across machines: the tracked regression baseline is
 * `specs/benchmarks/baseline.json` and the tracked threshold authority is
 * `specs/benchmarks/slo.json`.
 *
 * A capture is all-or-nothing. Benchmarks run into a temporary directory and replace the previous
 * capture only when every package succeeds, so a partial run can never overwrite a complete one.
 *
 * Usage:
 *   node scripts/bench-capture.mjs
 *   node scripts/bench-capture.mjs --filter @peac/crypto [--filter ...]
 *   node scripts/bench-capture.mjs --out-dir <dir>
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, cpus, totalmem, type as osType, release as osRelease } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST_SCHEMA_VERSION = 1;
const BENCH_TIMEOUT_MS = 120_000;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PNPM = process.env.PEAC_PNPM ?? 'pnpm';

const DEFAULT_PACKAGES = [
  { filter: '@peac/crypto', file: 'crypto.json' },
  { filter: '@peac/schema', file: 'schema.json' },
  { filter: '@peac/protocol', file: 'protocol.json' },
];

function parseArgs(argv) {
  const filters = [];
  let outDir = join(ROOT, 'bench-results');
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--filter') {
      const value = argv[++i];
      if (!value) throw new Error('--filter requires a package name');
      filters.push(value);
    } else if (arg === '--out-dir') {
      const value = argv[++i];
      if (!value) throw new Error('--out-dir requires a directory');
      outDir = value;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  const packages = filters.length
    ? filters.map((filter) => ({
        filter,
        file: `${filter.replace(/^@/, '').replace(/[^\w.-]/g, '-')}.json`,
      }))
    : DEFAULT_PACKAGES;
  return { packages, outDir };
}

/** Run a command as an argument array. No shell, so no interpolation and no quoting hazard. */
function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', ...options });
}

function capturedStdout(command, args) {
  const result = run(command, args);
  if (result.status !== 0 || typeof result.stdout !== 'string') return null;
  return result.stdout.trim();
}

function environmentRecord() {
  const cpuList = cpus();
  return {
    node_version: process.version,
    pnpm_version: capturedStdout(PNPM, ['--version']) ?? 'unknown',
    os_type: osType(),
    os_release: osRelease(),
    platform: process.platform,
    arch: process.arch,
    cpu_model: cpuList[0]?.model ?? 'unknown',
    cpu_count: cpuList.length,
    total_memory_bytes: totalmem(),
  };
}

function repositoryRecord() {
  const commit = capturedStdout('git', ['rev-parse', 'HEAD']);
  const status = capturedStdout('git', ['status', '--porcelain']);
  return {
    commit: commit ?? 'unknown',
    // A dirty tree means the numbers correspond to no published commit.
    worktree: status === null ? 'unknown' : status.length === 0 ? 'clean' : 'dirty',
  };
}

const { packages, outDir } = parseArgs(process.argv.slice(2));
const staging = mkdtempSync(join(tmpdir(), 'peac-bench-'));
const startedAt = new Date().toISOString();
const failures = [];

try {
  for (const { filter, file } of packages) {
    const target = join(staging, file);
    console.log(`Running benchmarks for ${filter}...`);
    const result = run(
      PNPM,
      ['--filter', filter, 'exec', 'vitest', 'bench', '--run', '--outputJson', target],
      { stdio: 'inherit', timeout: BENCH_TIMEOUT_MS }
    );
    if (result.status !== 0 || !existsSync(target)) {
      const reason =
        result.error?.message ??
        (result.signal ? `terminated by ${result.signal}` : `exit status ${result.status}`);
      console.error(`  FAILED: ${filter} (${reason})`);
      failures.push({ filter, reason });
    }
  }

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} of ${packages.length} package benchmark(s) failed. ` +
        'Nothing was written: any previous capture is retained unchanged.'
    );
    process.exitCode = 1;
  } else {
    writeFileSync(
      join(staging, 'manifest.json'),
      `${JSON.stringify(
        {
          manifest_schema_version: MANIFEST_SCHEMA_VERSION,
          captured_at_utc: startedAt,
          repository: repositoryRecord(),
          environment: environmentRecord(),
          filters: packages.map((p) => p.filter),
          outputs: packages.map((p) => p.file),
          success: true,
        },
        null,
        2
      )}\n`
    );

    // Stage the complete capture beside the destination first, so the previous one is removed only
    // once its replacement is fully present on the same filesystem.
    const incoming = `${outDir}.incoming`;
    rmSync(incoming, { recursive: true, force: true });
    cpSync(staging, incoming, { recursive: true });
    rmSync(outDir, { recursive: true, force: true });
    renameSync(incoming, outDir);

    console.log(`\nCaptured ${packages.length} package benchmark(s) into ${basename(outDir)}/.`);
    console.log('Local diagnostic evidence only; the tracked baseline is specs/benchmarks/.');
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}
