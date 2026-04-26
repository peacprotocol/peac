#!/usr/bin/env node
/**
 * Tarball-content guard.
 *
 * For every package in scripts/publish-manifest.json packages[], pack the
 * package and inspect the resulting tarball file list. Fail if the tarball
 * contains:
 *
 *   - any src/_internal/** path (internal source MUST stay out of published
 *     tarballs; only emitted dist/ output may surface)
 *   - any local-only planning artifact (.claude/, reference/, internal-only
 *     plan markdown files such as warm-percolating-flask.md)
 *   - any test fixture path that wasn't intended for consumers
 *
 * Allowed contents (typical published package tarball):
 *   - dist/**
 *   - README.md, LICENSE, package.json
 *   - declared additional files (per package.json files[])
 *
 * Exit codes:
 *   0 = clean
 *   1 = one or more violations
 *   2 = script error
 *
 * Usage:
 *   node scripts/verify-tarball-contents.mjs
 *   node scripts/verify-tarball-contents.mjs --json
 *   node scripts/verify-tarball-contents.mjs --package @peac/protocol
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_PACKAGE_MAP } from './lib/workspace-package-map.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FORBIDDEN_PATTERNS = [
  /\bsrc\/_internal\//,
  /^\.claude\//,
  /\/\.claude\//,
  /^reference\//,
  /\/reference\//,
  /\bwarm-percolating-flask\.md$/,
  /\b__tests__\//,
  /\b__snapshots__\//,
  // Local-only planning artifacts identifiable by directory or naming.
  /\bMEMORY\.md$/,
  /\bCLAUDE\.md$/,
];

const WORKSPACE_PATH_MAP = WORKSPACE_PACKAGE_MAP;

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    json: args.includes('--json'),
    pkg: args.includes('--package') ? args[args.indexOf('--package') + 1] : null,
  };
}

function packAndList(npmName) {
  const rel = WORKSPACE_PATH_MAP[npmName];
  if (!rel) return { npmName, status: 'unmapped', files: [], violations: [] };
  const packageDir = join(ROOT, rel);

  let packOut;
  try {
    packOut = execFileSync('pnpm', ['pack', '--pack-destination', '/tmp'], {
      cwd: packageDir,
      encoding: 'utf8',
    });
  } catch (err) {
    return {
      npmName,
      status: 'pack-failed',
      error: err.stderr?.toString() ?? err.message,
      files: [],
      violations: [],
    };
  }

  // pnpm pack prints the tarball path on stdout (last non-empty line).
  const tarball = packOut.trim().split('\n').filter(Boolean).pop();
  if (!tarball || !tarball.endsWith('.tgz')) {
    return {
      npmName,
      status: 'pack-failed',
      error: `pnpm pack output did not include a .tgz path: ${packOut.trim().slice(0, 200)}`,
      files: [],
      violations: [],
    };
  }

  let listOut;
  try {
    listOut = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' });
  } catch (err) {
    return {
      npmName,
      status: 'pack-failed',
      error: `tar -tzf failed: ${err.message}`,
      files: [],
      violations: [],
    };
  }

  // tarball entries are prefixed with "package/"; strip it for pattern checks.
  const files = listOut
    .split('\n')
    .filter(Boolean)
    .map((p) => (p.startsWith('package/') ? p.slice('package/'.length) : p));

  const violations = [];
  for (const file of files) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(file)) {
        violations.push({ file, pattern: pattern.toString() });
      }
    }
  }
  return { npmName, status: violations.length ? 'violation' : 'clean', files, violations };
}

async function main() {
  const args = parseArgs();
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'scripts', 'publish-manifest.json'), 'utf8'),
  );
  const targets = args.pkg ? [args.pkg] : manifest.packages;

  const results = [];
  for (const name of targets) {
    results.push(packAndList(name));
  }

  const violations = results.filter((r) => r.status === 'violation');
  const failures = results.filter((r) => r.status === 'pack-failed' || r.status === 'unmapped');

  if (args.json) {
    console.log(JSON.stringify({ violations, failures, scanned: results.length }, null, 2));
  } else {
    if (violations.length === 0 && failures.length === 0) {
      console.log(`OK: scanned ${results.length} package tarball(s); no forbidden content.`);
    } else {
      if (failures.length > 0) {
        console.error('Pack/skip failures:');
        for (const f of failures) {
          console.error(`  ${f.npmName}: ${f.status} ${f.error ?? ''}`);
        }
      }
      if (violations.length > 0) {
        console.error('Tarball-content violations:');
        for (const r of violations) {
          console.error(`\n  ${r.npmName}:`);
          for (const v of r.violations) {
            console.error(`    ${v.file}  (matched ${v.pattern})`);
          }
        }
      }
    }
  }

  process.exit(violations.length === 0 && failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Script error:', err.message);
  process.exit(2);
});
