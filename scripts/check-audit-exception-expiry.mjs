#!/usr/bin/env node
/**
 * Audit-exception expiry / review check.
 *
 * A focused, offline, network-free release-hygiene gate over the dependency
 * audit allowlist (`security/audit-allowlist.json`). It reuses the shared
 * `parseAllowlist()` validator from `scripts/audit-gate-lib.mjs` (the same
 * logic `scripts/audit-gate.mjs` applies during the full audit) and reports
 * the allowlist's expiry / renewal-review health, without running `pnpm
 * audit`. Run it during release-prep so no audit exception silently expires
 * or goes past its renewal-review window across a release.
 *
 * Verdict:
 *   RED    - one or more entries are expired or invalid (fail closed).
 *   YELLOW - one or more entries are expiring soon (<= 14 days) or were
 *            added more than 30 days ago without a reviewed_at date.
 *   GREEN  - no expired / invalid entries and no warnings.
 *
 * Exit codes:
 *   0  GREEN, or YELLOW without --strict.
 *   1  RED, or YELLOW with --strict.
 *   2  Usage error.
 *
 * Flags:
 *   --strict           Pass strict mode to parseAllowlist (entries older
 *                      than the 60-day review window without reviewed_at are
 *                      rejected as invalid) and fail (exit 1) on any YELLOW
 *                      warning. This is the release-gate mode.
 *   --json             Emit the evaluation result as JSON.
 *   --allowlist <path> Read the allowlist from <path> instead of the default
 *                      security/audit-allowlist.json (relative paths resolve
 *                      from the current working directory). Useful for tests.
 *
 * Usage:
 *   node scripts/check-audit-exception-expiry.mjs
 *   node scripts/check-audit-exception-expiry.mjs --strict
 *   node scripts/check-audit-exception-expiry.mjs --json
 *   node scripts/check-audit-exception-expiry.mjs --allowlist <path> --strict
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAllowlist, EXPIRY_WARNING_DAYS } from './audit-gate-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const ALLOWLIST_PATH = resolve(REPO_ROOT, 'security/audit-allowlist.json');

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Evaluate the audit allowlist's expiry / review health.
 *
 * Pure helper: it does not read the filesystem, env, or argv, and does not
 * print or exit. It delegates all validation to parseAllowlist() and maps
 * the result to a GREEN / YELLOW / RED verdict, so the verdict can be
 * unit-asserted deterministically with a fixed `now`.
 *
 * @param {object} raw - Parsed allowlist JSON (the { allowlist: [...] } shape).
 * @param {Date} [now] - Reference date (defaults to current time).
 * @param {{ strict?: boolean }} [opts] - strict passes through to parseAllowlist.
 * @returns {{ status: 'GREEN'|'YELLOW'|'RED', expired: string[], invalid: string[],
 *             warnings: string[], active: Array<object>, counts: object }}
 */
export function evaluateAllowlistExpiry(raw, now = new Date(), opts = {}) {
  const strict = opts.strict === true;
  const { active, expired, invalid, warnings } = parseAllowlist(raw, now, { strict });

  // Display-only view of the validated active entries with days-to-expiry.
  // parseAllowlist has already validated expires_at as strict YYYY-MM-DD, so
  // these dates parse cleanly.
  const activeEntries = [];
  for (const entry of active.values()) {
    const expiry = new Date(entry.expires_at + 'T00:00:00Z');
    const daysToExpiry = Math.ceil((expiry - now) / MS_PER_DAY);
    activeEntries.push({
      advisory_id: entry.advisory_id,
      scope: entry.scope,
      expires_at: entry.expires_at,
      days_to_expiry: daysToExpiry,
      reviewed_at: entry.reviewed_at || null,
    });
  }
  activeEntries.sort((a, b) => a.days_to_expiry - b.days_to_expiry);

  let status = 'GREEN';
  if (expired.length > 0 || invalid.length > 0) status = 'RED';
  else if (warnings.length > 0) status = 'YELLOW';

  return {
    status,
    expired,
    invalid,
    warnings,
    active: activeEntries,
    counts: {
      active: activeEntries.length,
      expired: expired.length,
      invalid: invalid.length,
      warnings: warnings.length,
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  let strict = false;
  let jsonOutput = false;
  let allowlistPath = ALLOWLIST_PATH;

  const usage = 'usage: check-audit-exception-expiry.mjs [--strict] [--json] [--allowlist <path>]\n';
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') continue;
    else if (a === '--strict') strict = true;
    else if (a === '--json') jsonOutput = true;
    else if (a === '--allowlist') {
      if (!args[i + 1]) {
        process.stderr.write('error: --allowlist requires a path\n');
        process.stderr.write(usage);
        process.exit(2);
      }
      allowlistPath = resolve(process.cwd(), args[i + 1]);
      i += 1;
    } else {
      process.stderr.write(`unknown argument: ${a}\n`);
      process.stderr.write(usage);
      process.exit(2);
    }
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(allowlistPath, 'utf-8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      // No allowlist file means no exceptions to expire.
      if (jsonOutput) {
        process.stdout.write(
          JSON.stringify(
            { status: 'GREEN', expired: [], invalid: [], warnings: [], active: [], counts: { active: 0, expired: 0, invalid: 0, warnings: 0 } },
            null,
            2
          ) + '\n'
        );
      } else {
        process.stdout.write('check-audit-exception-expiry: no allowlist file; no exceptions to check\n');
        process.stdout.write('summary: GREEN\n');
      }
      process.exit(0);
    }
    process.stderr.write(`error: could not read ${allowlistPath}: ${err.message}\n`);
    process.exit(1);
  }

  const result = evaluateAllowlistExpiry(raw, new Date(), { strict });

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(
      `check-audit-exception-expiry: ${result.counts.active} active / ${result.counts.expired} expired / ${result.counts.invalid} invalid / ${result.counts.warnings} warning(s) (strict=${strict})\n`
    );
    for (const id of result.expired) {
      process.stdout.write(`  [RED] expired: ${id}\n`);
    }
    for (const desc of result.invalid) {
      process.stdout.write(`  [RED] invalid: ${desc}\n`);
    }
    for (const w of result.warnings) {
      process.stdout.write(`  [YELLOW] ${w}\n`);
    }
    if (result.active.length > 0) {
      process.stdout.write(`  active exceptions (warn at <= ${EXPIRY_WARNING_DAYS} days to expiry):\n`);
      for (const e of result.active) {
        process.stdout.write(
          `    - ${e.advisory_id} scope=${e.scope} expires ${e.expires_at} in ${e.days_to_expiry}d reviewed ${e.reviewed_at || '(none)'}\n`
        );
      }
    }
    process.stdout.write(`summary: ${result.status}\n`);
  }

  if (result.status === 'RED') process.exit(1);
  if (strict && result.status === 'YELLOW') process.exit(1);
  process.exit(0);
}

// Main guard: importing this module (for example to unit-test
// evaluateAllowlistExpiry) must not parse argv, read the allowlist, or exit.
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
