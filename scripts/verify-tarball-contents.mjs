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

// Forbidden subpaths in package.json `exports`. Per §6P-B #2: dist/_internal/**
// files MAY exist in the published tarball (the runtime relative-import path
// from src/issue.ts -> src/_internal/record-core/codec/jws-jwt.ts resolves to
// dist/_internal/record-core/codec/jws-jwt.{mjs,cjs} at runtime), but they
// MUST NOT be exposed as public subpaths via the `exports` map.
const FORBIDDEN_EXPORT_KEY_PATTERNS = [
  /^\.\/_internal(?:\/.*)?$/,
  /^\.\/record-core(?:\/.*)?$/,
  /^\.\/codec(?:\/.*)?$/,
  /^\.\/compat(?:\/.*)?$/,
  /^\.\/migration(?:\/.*)?$/,
  /^\.\/shadow(?:\/.*)?$/,
];

const WORKSPACE_PATH_MAP = WORKSPACE_PACKAGE_MAP;

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    json: args.includes('--json'),
    pkg: args.includes('--package') ? args[args.indexOf('--package') + 1] : null,
    // --package-dir <abs-path> runs against a single fixture package at the
    // given directory. Used by self-tests so the gate operates on temporary
    // fixture packages without touching real workspace files.
    pkgDir: args.includes('--package-dir') ? args[args.indexOf('--package-dir') + 1] : null,
  };
}

function packAndList(npmName, pkgRootOverride = null) {
  let packageDir;
  if (pkgRootOverride) {
    packageDir = pkgRootOverride;
  } else {
    const rel = WORKSPACE_PATH_MAP[npmName];
    if (!rel) return { npmName, status: 'unmapped', files: [], violations: [] };
    packageDir = join(ROOT, rel);
  }

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

// -----------------------------------------------------------------------------
// Export-map check (per §6P-B #2).
// -----------------------------------------------------------------------------
//
// Walks package.json `exports` for every published package. Fails if any
// subpath key matches FORBIDDEN_EXPORT_KEY_PATTERNS (./_internal, ./codec,
// ./record-core, ./compat, ./migration, ./shadow and any nested form).
//
// dist/_internal/** files are allowed in the tarball (necessary for the
// relative-import runtime path); the export-map check distinguishes
// implementation files in tarball (allowed) from public API surface in
// exports (forbidden).

function collectExportKeys(node, prefix = '') {
  const keys = [];
  if (node === null || node === undefined) return keys;
  if (typeof node === 'string') return keys;
  if (Array.isArray(node)) {
    for (const item of node) keys.push(...collectExportKeys(item, prefix));
    return keys;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      // Only top-level subpath keys are public surface paths. Nested
      // objects are condition keys (types/import/require/default) and
      // their values are the actual file targets, not subpaths.
      if (k.startsWith('./') || k === '.') {
        keys.push(k);
      }
      keys.push(...collectExportKeys(v, prefix));
    }
  }
  return keys;
}

function checkExportMap(npmName, pkgRootOverride = null) {
  let pkgRoot;
  if (pkgRootOverride) {
    pkgRoot = pkgRootOverride;
  } else {
    const rel = WORKSPACE_PATH_MAP[npmName];
    if (!rel) return { npmName, status: 'unmapped', violations: [] };
    pkgRoot = join(ROOT, rel);
  }
  let pkgJson;
  try {
    pkgJson = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
  } catch {
    return { npmName, status: 'no-package-json', violations: [] };
  }

  const exportsField = pkgJson.exports;
  if (!exportsField || typeof exportsField !== 'object') {
    return { npmName, status: 'clean', violations: [] };
  }

  const subpathKeys = [...new Set(collectExportKeys(exportsField))];
  const violations = [];
  for (const key of subpathKeys) {
    for (const pattern of FORBIDDEN_EXPORT_KEY_PATTERNS) {
      if (pattern.test(key)) {
        violations.push({ key, pattern: pattern.toString() });
      }
    }
  }
  return { npmName, status: violations.length ? 'violation' : 'clean', violations };
}

async function main() {
  const args = parseArgs();

  let targets;
  let pkgRootOverride = null;
  if (args.pkgDir) {
    let fixturePkgJson;
    try {
      fixturePkgJson = JSON.parse(readFileSync(join(args.pkgDir, 'package.json'), 'utf8'));
    } catch (err) {
      console.error(`Script error: failed to read package.json at ${args.pkgDir}: ${err.message}`);
      process.exit(2);
    }
    targets = [fixturePkgJson.name ?? '@fixture/unknown'];
    pkgRootOverride = args.pkgDir;
  } else {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, 'scripts', 'publish-manifest.json'), 'utf8'),
    );
    targets = args.pkg ? [args.pkg] : manifest.packages;
  }

  const results = [];
  const exportMapResults = [];
  for (const name of targets) {
    results.push(packAndList(name, pkgRootOverride));
    exportMapResults.push(checkExportMap(name, pkgRootOverride));
  }

  const violations = results.filter((r) => r.status === 'violation');
  const exportMapViolations = exportMapResults.filter((r) => r.status === 'violation');
  const failures = results.filter((r) => r.status === 'pack-failed' || r.status === 'unmapped');
  const totalProblemCount = violations.length + exportMapViolations.length + failures.length;

  if (args.json) {
    console.log(
      JSON.stringify(
        { violations, exportMapViolations, failures, scanned: results.length },
        null,
        2,
      ),
    );
  } else {
    if (totalProblemCount === 0) {
      console.log(
        `OK: scanned ${results.length} package tarball(s) and export map(s); no forbidden content or subpaths.`,
      );
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
      if (exportMapViolations.length > 0) {
        console.error('Export-map subpath violations (forbidden public subpath in package.json exports):');
        for (const r of exportMapViolations) {
          console.error(`\n  ${r.npmName}:`);
          for (const v of r.violations) {
            console.error(`    "${v.key}"  (matched ${v.pattern})`);
          }
        }
      }
    }
  }

  process.exit(totalProblemCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Script error:', err.message);
  process.exit(2);
});
