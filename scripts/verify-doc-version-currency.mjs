#!/usr/bin/env node
/**
 * Version-currency gate for source surfaces.
 *
 * Some version-bearing constants and pins are stamped by hand at release
 * time and are not covered by `pnpm version:bump` or the release verifier
 * (for example the @peac/telemetry-otel package-version constant and the
 * smithery.yaml mcp-server pin). When a release moves forward those sites
 * silently drift. This gate reads the current release version from
 * `docs/releases/current.json` (the source of truth) and fails if any
 * enumerated source site does not match it. It produces actionable
 * file:line output and is deterministic / network-free.
 *
 * This gate is deliberately narrow: it checks SOURCE constants and pins, not
 * markdown banners. Stale version banners in evergreen docs are already
 * gated by tests/tooling/docs-version-banner-truth.test.ts, and this gate
 * does not duplicate that.
 *
 * Exit codes:
 *   0  Every enumerated site matches the current release version.
 *   1  At least one site is stale or its pattern was not found (fail closed).
 *   2  Usage error.
 *
 * Flags:
 *   --json          Emit the result as JSON.
 *   --root <dir>    Resolve the source-of-truth file and all sites under
 *                   <dir> instead of the repository root (relative paths
 *                   resolve from the current working directory). Used by
 *                   tests to drive a synthetic tree.
 *
 * Usage:
 *   node scripts/verify-doc-version-currency.mjs
 *   node scripts/verify-doc-version-currency.mjs --json
 *   node scripts/verify-doc-version-currency.mjs --root <dir>
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

/**
 * Enumerated version-bearing source sites that must equal the current
 * release version. Each pattern's first capture group is the version.
 */
export const SITES = [
  {
    label: 'TELEMETRY_OTEL_VERSION',
    file: 'packages/telemetry-otel/src/version.ts',
    pattern: /TELEMETRY_OTEL_VERSION\s*=\s*['"]([^'"]+)['"]/,
  },
  {
    label: 'smithery mcp-server pin',
    file: 'packages/mcp-server/smithery.yaml',
    pattern: /@peac\/mcp-server@(\d+\.\d+\.\d+)/,
  },
];

/**
 * Anti-drift guards: patterns that must NOT appear. These catch a hardcoded
 * version literal where the value should derive from the single source
 * (./version.ts) instead, so the same drift class cannot reappear.
 */
export const FORBIDDEN = [
  {
    label: 'provider.ts hardcoded TELEMETRY_VERSION literal',
    file: 'packages/telemetry-otel/src/provider.ts',
    pattern: /TELEMETRY_VERSION\s*=\s*['"]\d+\.\d+\.\d+['"]/,
    message:
      'derive the telemetry version from TELEMETRY_OTEL_VERSION (./version.js); do not hardcode a version literal',
  },
];

/**
 * Check a single site's content against the expected version.
 *
 * Pure: no filesystem, env, stdout, or exit. The caller reads the file and
 * the source of truth, so this maps deterministically for unit tests.
 *
 * @param {string} content - The file content to scan.
 * @param {RegExp} pattern - Pattern whose first capture group is the version.
 * @param {string} expected - The expected (current) version.
 * @returns {{ ok: boolean, value: string|null, reason: string|null }}
 */
export function checkSite(content, pattern, expected) {
  const m = content.match(pattern);
  if (!m) {
    return { ok: false, value: null, reason: 'version pattern not found' };
  }
  const value = m[1];
  if (value === expected) {
    return { ok: true, value, reason: null };
  }
  return { ok: false, value, reason: `found ${value}, expected ${expected}` };
}

/**
 * Check that a forbidden anti-drift pattern is absent from content.
 *
 * Pure: no filesystem, env, stdout, or exit. Returns ok=true when the
 * forbidden pattern is NOT present.
 *
 * @param {string} content - The file content to scan.
 * @param {RegExp} pattern - Pattern that must not match.
 * @returns {{ ok: boolean }}
 */
export function checkForbidden(content, pattern) {
  return { ok: !pattern.test(content) };
}

function lineOf(content, pattern) {
  const m = content.match(pattern);
  if (!m || m.index === undefined) return 0;
  return content.slice(0, m.index).split('\n').length;
}

function main() {
  const args = process.argv.slice(2);
  let jsonOutput = false;
  let root = REPO_ROOT;

  const usage = 'usage: verify-doc-version-currency.mjs [--json] [--root <dir>]\n';
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') continue;
    else if (a === '--json') jsonOutput = true;
    else if (a === '--root') {
      if (!args[i + 1]) {
        process.stderr.write('error: --root requires a path\n');
        process.stderr.write(usage);
        process.exit(2);
      }
      root = resolve(process.cwd(), args[i + 1]);
      i += 1;
    } else {
      process.stderr.write(`unknown argument: ${a}\n`);
      process.stderr.write(usage);
      process.exit(2);
    }
  }

  let expected;
  try {
    const current = JSON.parse(readFileSync(resolve(root, 'docs/releases/current.json'), 'utf-8'));
    expected = current.version;
  } catch (err) {
    process.stderr.write(`error: could not read docs/releases/current.json: ${err.message}\n`);
    process.exit(1);
  }
  if (!expected) {
    process.stderr.write('error: docs/releases/current.json has no version\n');
    process.exit(1);
  }

  const rows = [];
  for (const site of SITES) {
    const path = resolve(root, site.file);
    let content;
    try {
      content = readFileSync(path, 'utf-8');
    } catch (err) {
      rows.push({
        label: site.label,
        file: site.file,
        line: 0,
        ok: false,
        value: null,
        reason: `unreadable: ${err.message}`,
      });
      continue;
    }
    const result = checkSite(content, site.pattern, expected);
    rows.push({
      label: site.label,
      file: site.file,
      line: result.value === null ? 0 : lineOf(content, site.pattern),
      ok: result.ok,
      value: result.value,
      reason: result.reason,
    });
  }

  for (const guard of FORBIDDEN) {
    const path = resolve(root, guard.file);
    let content;
    try {
      content = readFileSync(path, 'utf-8');
    } catch (err) {
      rows.push({
        label: guard.label,
        file: guard.file,
        line: 0,
        ok: false,
        value: null,
        reason: `unreadable: ${err.message}`,
      });
      continue;
    }
    const result = checkForbidden(content, guard.pattern);
    rows.push({
      label: guard.label,
      file: guard.file,
      line: result.ok ? 0 : lineOf(content, guard.pattern),
      ok: result.ok,
      value: null,
      reason: result.ok ? null : guard.message,
    });
  }

  const failed = rows.filter((r) => !r.ok);

  if (jsonOutput) {
    process.stdout.write(
      JSON.stringify({ expected, rows, ok: failed.length === 0 }, null, 2) + '\n'
    );
  } else {
    process.stdout.write(`verify-doc-version-currency: expected version=${expected}\n`);
    for (const r of rows) {
      const tag = r.ok ? 'OK' : 'STALE';
      const loc = r.line > 0 ? `${r.file}:${r.line}` : r.file;
      process.stdout.write(`  [${tag}] ${r.label} (${loc})${r.ok ? '' : `: ${r.reason}`}\n`);
    }
    process.stdout.write(
      failed.length === 0
        ? `summary: all ${rows.length} site(s) current\n`
        : `summary: ${failed.length} of ${rows.length} site(s) stale\n`
    );
  }

  process.exit(failed.length === 0 ? 0 : 1);
}

// Main guard: importing this module (for example to unit-test checkSite or
// SITES) must not parse argv, read files, or exit.
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
