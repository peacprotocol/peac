#!/usr/bin/env node

/**
 * Bundle Vector Drift Verifier
 *
 * Regenerates bundle vectors and checks for drift.
 * Catches both tracked changes AND untracked new files.
 *
 * Uses baseline/delta approach: snapshots working tree before regen,
 * then only evaluates changes introduced by regen. This makes
 * --allow-dirty usable locally without false positives from unrelated edits.
 *
 * Exit codes:
 * - 0: No drift (vectors are deterministic)
 * - 1: Drift detected (vectors need to be committed)
 * - 2: Script error (regen failed, touched unexpected files, dirty repo, etc.)
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BUNDLE_DIR = 'specs/conformance/fixtures/bundle';
const BUNDLE_PREFIX = `${BUNDLE_DIR}/`;

// Platform-specific command names
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const GIT = process.platform === 'win32' ? 'git.exe' : 'git';

// CLI flags
const ALLOW_DIRTY = process.argv.includes('--allow-dirty');

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: 'pipe',
    ...options,
  });

  // Handle missing command (ENOENT)
  if (res.error?.code === 'ENOENT') {
    console.error(`ERROR: Command not found: ${cmd}`);
    console.error(`  args: ${args.join(' ')}`);
    console.error('  Ensure git and pnpm are installed and in PATH.');
    process.exit(2);
  }

  return res;
}

function normalizePath(p) {
  return p.replaceAll('\\', '/');
}

/**
 * Parse `git status --porcelain=v1 -z` output into entries.
 * For renames/copies, porcelain -z emits two NUL-separated paths:
 *   "R  old\0new\0" or "C  old\0new\0"
 */
function getStatusEntries() {
  const res = run(GIT, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (res.status !== 0) {
    console.error('ERROR: git status failed');
    console.error(res.stderr);
    process.exit(2);
  }

  const parts = res.stdout.split('\0').filter(Boolean);
  const entries = [];

  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i];
    // Format: "XY <path>" where XY can be "??" too.
    const xy = raw.slice(0, 2);
    const path = raw.slice(3); // skip "XY " (3 chars)

    if (!path) continue;

    if (xy[0] === 'R' || xy[0] === 'C') {
      // rename/copy emits: "R  old" then "new" as the next record
      const oldPath = normalizePath(path);
      const newPath = normalizePath(parts[i + 1] ?? '');
      entries.push({ xy, path: oldPath });
      if (newPath) entries.push({ xy, path: newPath });
      i += 1;
      continue;
    }

    entries.push({ xy, path: normalizePath(path) });
  }

  return entries;
}

function toPathSet(entries) {
  return new Set(entries.map((e) => e.path));
}

function setDiff(after, before) {
  const out = new Set();
  for (const p of after) {
    if (!before.has(p)) out.add(p);
  }
  return out;
}

async function main() {
  console.log('PEAC Bundle Vector Drift Verifier');
  console.log('==================================\n');

  if (process.env.CI && ALLOW_DIRTY) {
    console.error('ERROR: --allow-dirty is not permitted in CI.');
    process.exit(2);
  }

  // Baseline snapshot (used to isolate what regen actually changed)
  const baselineEntries = getStatusEntries();
  const baselineSet = toPathSet(baselineEntries);

  // If allowing dirty, validate that dirty state won't hide generator bugs:
  // 1. Bundle dir must be clean (otherwise baseline/delta masks changes)
  // 2. No dirty files outside bundle dir (otherwise can't detect if regen touched them)
  if (ALLOW_DIRTY) {
    const dirtyBundle = baselineEntries.filter((e) => e.path.startsWith(BUNDLE_PREFIX));
    if (dirtyBundle.length > 0) {
      console.error('ERROR: Bundle directory is already dirty; cannot verify drift reliably.');
      for (const e of dirtyBundle) console.error(`  ${e.xy} ${e.path}`);
      process.exit(2);
    }

    const dirtyOutside = baselineEntries.filter((e) => !e.path.startsWith(BUNDLE_PREFIX));
    if (dirtyOutside.length > 0) {
      // Warn but allow - baseline/delta can't detect if regen touched these
      console.log('WARNING: Files dirty outside bundle dir (generator bug detection limited):');
      for (const e of dirtyOutside.slice(0, 5)) console.log(`  ${e.xy} ${e.path}`);
      if (dirtyOutside.length > 5) console.log(`  ... and ${dirtyOutside.length - 5} more`);
      console.log('');
    }
  }

  // Step 1: Require clean repo unless --allow-dirty
  if (!ALLOW_DIRTY) {
    console.log('Checking for clean working tree...');
    if (baselineSet.size > 0) {
      console.error('ERROR: Working tree is dirty. Commit or stash changes first.');
      console.error('Use --allow-dirty to skip this check (not recommended for CI).\n');
      console.error('Dirty entries:');
      for (const e of baselineEntries) console.error(`  ${e.xy} ${e.path}`);
      process.exit(2);
    }
    console.log('Working tree is clean.\n');
  }

  // Step 2: Regenerate vectors (inherit stdio so CI sees output)
  console.log('Regenerating bundle vectors...');
  const regen = run(PNPM, ['conformance:regen:bundle'], { stdio: 'inherit' });
  if (regen.status !== 0) {
    console.error('ERROR: Failed to regenerate vectors');
    process.exit(2);
  }
  console.log('Regeneration complete.\n');

  // Step 3: Compute delta introduced by regen
  console.log('Checking for changes...');
  const afterEntries = getStatusEntries();
  const afterSet = toPathSet(afterEntries);

  const delta = setDiff(afterSet, baselineSet);

  if (delta.size === 0) {
    console.log('\nPASS: No bundle vector drift detected.');
    console.log('Vectors are deterministic.');
    process.exit(0);
  }

  // Step 4: Ensure regen ONLY touched files in bundle dir
  const outsideBundle = [...delta].filter((p) => !p.startsWith(BUNDLE_PREFIX)).sort();
  if (outsideBundle.length > 0) {
    console.error('\nERROR: Regen modified files outside bundle directory:');
    for (const p of outsideBundle) console.error(`  - ${p}`);
    console.error('\nThis indicates a bug in generate-bundle-vectors.ts.');
    console.error(`The generator should only write to ${BUNDLE_PREFIX}`);
    process.exit(2);
  }

  // Step 5: Show drift in bundle dir
  console.log('\nDRIFT DETECTED in bundle directory:\n');

  // Tracked diffs (unstaged)
  const diff = run(GIT, ['diff', '--', BUNDLE_DIR]);
  if (diff.status === 0 && diff.stdout.trim()) {
    console.log(diff.stdout);
  }

  // Staged diffs (rare, but makes debugging complete)
  const diffCached = run(GIT, ['diff', '--cached', '--', BUNDLE_DIR]);
  if (diffCached.status === 0 && diffCached.stdout.trim()) {
    console.log(diffCached.stdout);
  }

  // New/untracked (diff doesn't show these)
  const newUntracked = afterEntries
    .filter((e) => e.xy === '??' && delta.has(e.path))
    .map((e) => e.path)
    .sort();

  if (newUntracked.length > 0) {
    console.log('New untracked files:');
    for (const p of newUntracked) console.log(`  ? ${p}`);
    console.log('');
  }

  console.error('FAIL: Bundle vectors have drifted.');
  console.error('Run: pnpm conformance:regen:bundle');
  console.error('Then commit the updated vectors.');
  process.exit(1);
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(2);
});
