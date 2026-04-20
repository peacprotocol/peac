#!/usr/bin/env node
/**
 * Deterministic release-state stamping for mutable truth-surface fields.
 *
 * These fields are intentionally left at pre-release placeholder values in
 * release-prep PRs and are stamped post-tag / post-promotion via this
 * script, run from the release checklist in docs/RELEASING.md.
 *
 * Fields stamped:
 *
 *   --publish mode (run after `git tag v<X>` + successful publish workflow):
 *     - docs/releases/facts.json       : release_date
 *     - REPO_SURFACE_STATUS.json       : updated
 *
 *   --promote mode (run after promote-latest.yml succeeds):
 *     - docs/releases/facts.json       : dist_tag
 *     - docs/releases/current.json     : dist_tag
 *
 * Behavior is deterministic and idempotent. Re-running either mode with the
 * same date/tag is a no-op. --dry-run shows planned changes without writing.
 * --check exits non-zero if the expected post-stamp state is not present.
 *
 * Usage:
 *   node scripts/stamp-release-state.mjs --publish [YYYY-MM-DD]
 *   node scripts/stamp-release-state.mjs --promote [tag]
 *   node scripts/stamp-release-state.mjs --check --mode publish [YYYY-MM-DD]
 *   node scripts/stamp-release-state.mjs --check --mode promote [tag]
 *   node scripts/stamp-release-state.mjs --dry-run --publish [YYYY-MM-DD]
 *
 * Defaults:
 *   --publish with no date -> today in UTC (YYYY-MM-DD)
 *   --promote with no tag  -> "latest"
 *
 * Exit codes:
 *   0  success (or --dry-run or --check passed)
 *   1  invalid arguments
 *   2  file I/O error
 *   3  --check failed (state mismatch)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));

const dryRun = flags.has('--dry-run');
const check = flags.has('--check');

// --root <path> overrides the default repo root. Primarily for test isolation
// so smoke tests can point the script at a fake repo without mutating the
// real workspace. Paths are resolved against process.cwd() so relative roots
// work naturally in test fixtures.
function extractRoot() {
  const idx = args.indexOf('--root');
  if (idx !== -1 && args[idx + 1]) {
    return resolve(process.cwd(), args[idx + 1]);
  }
  return DEFAULT_ROOT;
}
const ROOT = extractRoot();

const FACTS_PATH = join(ROOT, 'docs/releases/facts.json');
const CURRENT_PATH = join(ROOT, 'docs/releases/current.json');
const SURFACE_PATH = join(ROOT, 'REPO_SURFACE_STATUS.json');

const positional = (() => {
  const filtered = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' || args[i] === '--mode') {
      i++;
      continue;
    }
    if (args[i].startsWith('--')) continue;
    filtered.push(args[i]);
  }
  return filtered;
})();

let mode;
if (flags.has('--publish')) mode = 'publish';
else if (flags.has('--promote')) mode = 'promote';
else if (check && positional[0] === 'publish') mode = 'publish';
else if (check && positional[0] === 'promote') mode = 'promote';
else {
  // support `--check --mode publish` style
  const modeIdx = args.indexOf('--mode');
  if (modeIdx !== -1 && args[modeIdx + 1]) {
    mode = args[modeIdx + 1];
  }
}

if (!mode || (mode !== 'publish' && mode !== 'promote')) {
  console.error('ERROR: must specify --publish or --promote');
  console.error('');
  console.error('Usage:');
  console.error('  node scripts/stamp-release-state.mjs --publish [YYYY-MM-DD]');
  console.error('  node scripts/stamp-release-state.mjs --promote [tag]');
  console.error('  node scripts/stamp-release-state.mjs --dry-run --publish [YYYY-MM-DD]');
  console.error('  node scripts/stamp-release-state.mjs --check --mode publish [YYYY-MM-DD]');
  process.exit(1);
}

// Extract the positional value (date or tag). `positional` already excludes
// --root / --mode arguments above; drop the mode label when --check is used
// without --publish / --promote flags.
const positionalArg = positional.filter((a) => a !== 'publish' && a !== 'promote')[0];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

let targetDate;
let targetTag;

if (mode === 'publish') {
  targetDate = positionalArg ?? todayUtc();
  if (!ISO_DATE.test(targetDate)) {
    console.error(`ERROR: --publish date "${targetDate}" is not ISO 8601 YYYY-MM-DD`);
    process.exit(1);
  }
  const parsed = new Date(targetDate + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime())) {
    console.error(`ERROR: --publish date "${targetDate}" is not a valid date`);
    process.exit(1);
  }
} else {
  targetTag = positionalArg ?? 'latest';
  if (typeof targetTag !== 'string' || targetTag.length === 0 || targetTag.length > 64) {
    console.error(`ERROR: --promote tag "${targetTag}" is not a valid non-empty string`);
    process.exit(1);
  }
  if (!/^[a-z][a-z0-9._-]*$/.test(targetTag)) {
    console.error(
      `ERROR: --promote tag "${targetTag}" does not match expected dist-tag format [a-z][a-z0-9._-]*`
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// JSON read / write helpers (preserve formatting / trailing newline)
// ---------------------------------------------------------------------------

function readJson(path) {
  if (!existsSync(path)) {
    console.error(`ERROR: ${path} not found`);
    process.exit(2);
  }
  const raw = readFileSync(path, 'utf-8');
  try {
    return { raw, data: JSON.parse(raw) };
  } catch (e) {
    console.error(`ERROR: ${path} is not valid JSON: ${e.message}`);
    process.exit(2);
  }
}

function writeJson(path, data, originalRaw) {
  // Preserve indent style from the original file
  const indentMatch = originalRaw.match(/^(\s+)"/m);
  const indent = indentMatch ? indentMatch[1] : '  ';
  const trailingNewline = originalRaw.endsWith('\n') ? '\n' : '';
  const next = JSON.stringify(data, null, indent) + trailingNewline;
  writeFileSync(path, next);
}

// ---------------------------------------------------------------------------
// Mutation planners (pure, return {from, to, noop})
// ---------------------------------------------------------------------------

function planFieldUpdate(current, next) {
  return { from: current, to: next, noop: current === next };
}

function loadPlanPublish() {
  const facts = readJson(FACTS_PATH);
  const surface = readJson(SURFACE_PATH);
  return {
    facts: {
      path: FACTS_PATH,
      raw: facts.raw,
      data: facts.data,
      field: 'release_date',
      plan: planFieldUpdate(facts.data.release_date, targetDate),
    },
    surface: {
      path: SURFACE_PATH,
      raw: surface.raw,
      data: surface.data,
      field: 'updated',
      plan: planFieldUpdate(surface.data.updated, targetDate),
    },
  };
}

function loadPlanPromote() {
  const facts = readJson(FACTS_PATH);
  const current = readJson(CURRENT_PATH);
  return {
    facts: {
      path: FACTS_PATH,
      raw: facts.raw,
      data: facts.data,
      field: 'dist_tag',
      plan: planFieldUpdate(facts.data.dist_tag, targetTag),
    },
    current: {
      path: CURRENT_PATH,
      raw: current.raw,
      data: current.data,
      field: 'dist_tag',
      plan: planFieldUpdate(current.data.dist_tag, targetTag),
    },
  };
}

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------

function runCheck(ops) {
  let ok = true;
  for (const key of Object.keys(ops)) {
    const op = ops[key];
    if (op.plan.noop) {
      console.log(`OK: ${op.path} ${op.field} = "${op.plan.to}"`);
    } else {
      console.error(
        `FAIL: ${op.path} ${op.field} = "${op.plan.from}", expected "${op.plan.to}"`
      );
      ok = false;
    }
  }
  return ok;
}

function runApply(ops) {
  let changed = 0;
  for (const key of Object.keys(ops)) {
    const op = ops[key];
    if (op.plan.noop) {
      console.log(`SKIP: ${op.path} ${op.field} already = "${op.plan.to}"`);
      continue;
    }
    if (dryRun) {
      console.log(`DRY: ${op.path} ${op.field} "${op.plan.from}" -> "${op.plan.to}"`);
    } else {
      op.data[op.field] = op.plan.to;
      writeJson(op.path, op.data, op.raw);
      console.log(`WROTE: ${op.path} ${op.field} "${op.plan.from}" -> "${op.plan.to}"`);
      changed++;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const ops = mode === 'publish' ? loadPlanPublish() : loadPlanPromote();

const header =
  mode === 'publish'
    ? `Release state stamping (publish mode) -> ${targetDate}`
    : `Release state stamping (promote mode) -> ${targetTag}`;
console.log(header);
console.log(''.padEnd(header.length, '='));

if (check) {
  const ok = runCheck(ops);
  process.exit(ok ? 0 : 3);
}

const changed = runApply(ops);

// --publish mutates REPO_SURFACE_STATUS.json.updated. The derived docs
// (docs/SURFACE_STATUS.md, docs/PACKAGE_STATUS.md) are regenerated from
// that JSON by scripts/generate-surface-status.mjs. Re-run the generator
// here so a stamp-only PR does not trip the Generated Status Doc Drift
// guard in CI. Skipped on dry-run and on --promote (promote does not
// touch REPO_SURFACE_STATUS.json).
if (!dryRun && !check && mode === 'publish' && changed > 0) {
  const generator = join(ROOT, 'scripts/generate-surface-status.mjs');
  if (existsSync(generator)) {
    const result = spawnSync('node', [generator], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      console.error('ERROR: generate-surface-status.mjs failed');
      process.exit(2);
    }
  }
}

console.log('');
if (dryRun) {
  console.log('(dry run: no files written)');
} else if (changed === 0) {
  console.log('No changes written (already up to date).');
} else {
  console.log(`Wrote ${changed} file(s).`);
  console.log('');
  console.log('Next: review the diff, commit on a release-state follow-up branch,');
  console.log('      open a micro-PR to main, and merge.');
}
