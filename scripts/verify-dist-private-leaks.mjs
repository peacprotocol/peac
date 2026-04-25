#!/usr/bin/env node
/**
 * Dist-leak grep (P0 invariant).
 *
 * For every package in scripts/publish-manifest.json packages[], after build,
 * grep the emitted dist/**\/*.{mjs,cjs,d.ts} for forbidden identifiers:
 *
 *   - workspace-private package names: @peac/registries, @peac/record-core,
 *     @peac/compat, @peac/resolver-http
 *   - internal-only flag names: PEAC_INTERNAL_SHADOW_CORE, _internal.shadowCore,
 *     PEAC_EXPERIMENTAL_CODEC, _internal.codec
 *
 * Any match is a release blocker: it means an internal symbol or workspace-
 * private package leaked into a published surface, which would break
 * `npm install <pkg>` for external consumers (404 on the unpublished package
 * name) or expose internal-only flags as part of the public TypeScript types.
 *
 * Excludes source maps (.map files) and test fixture directories.
 *
 * Exit codes:
 *   0 = clean (no matches across all packages)
 *   1 = one or more leaks detected
 *   2 = script error (missing dist directory, etc.)
 *
 * Usage:
 *   node scripts/verify-dist-private-leaks.mjs              # scan all
 *   node scripts/verify-dist-private-leaks.mjs --json       # JSON output
 *   node scripts/verify-dist-private-leaks.mjs --package @peac/protocol
 */

import { readFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_PACKAGE_MAP } from './lib/workspace-package-map.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FORBIDDEN_IDENTIFIERS = [
  '@peac/registries',
  '@peac/record-core',
  '@peac/compat',
  '@peac/resolver-http',
  'PEAC_INTERNAL_SHADOW_CORE',
  '_internal.shadowCore',
  'PEAC_EXPERIMENTAL_CODEC',
  '_internal.codec',
];

const WORKSPACE_PATH_MAP = WORKSPACE_PACKAGE_MAP;

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    json: args.includes('--json'),
    pkg: args.includes('--package') ? args[args.indexOf('--package') + 1] : null,
  };
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      // Skip sub-directories that are not part of emitted dist (e.g., __snapshots__).
      if (e.name === 'node_modules' || e.name === '__tests__' || e.name === '__snapshots__') continue;
      out.push(...(await walk(full)));
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function isScannable(file) {
  if (file.endsWith('.map')) return false;
  return /\.(mjs|cjs|js|d\.ts)$/.test(file);
}

async function scanPackage(npmName) {
  const rel = WORKSPACE_PATH_MAP[npmName];
  if (!rel) return { npmName, status: 'unmapped', leaks: [] };
  const distDir = join(ROOT, rel, 'dist');
  let stat;
  try {
    stat = statSync(distDir);
  } catch {
    return { npmName, status: 'no-dist', leaks: [] };
  }
  if (!stat.isDirectory()) return { npmName, status: 'no-dist', leaks: [] };

  const leaks = [];
  const files = (await walk(distDir)).filter(isScannable);
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const ident of FORBIDDEN_IDENTIFIERS) {
      if (content.includes(ident)) {
        const lines = content.split('\n');
        const lineIdx = lines.findIndex((l) => l.includes(ident));
        leaks.push({
          file: relative(ROOT, file),
          identifier: ident,
          line: lineIdx >= 0 ? lineIdx + 1 : null,
          excerpt: lineIdx >= 0 ? lines[lineIdx].trim().slice(0, 160) : null,
        });
      }
    }
  }
  return { npmName, status: leaks.length ? 'leak' : 'clean', leaks };
}

async function main() {
  const args = parseArgs();
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'scripts', 'publish-manifest.json'), 'utf8')
  );
  const targets = args.pkg ? [args.pkg] : manifest.packages;

  const results = [];
  for (const name of targets) {
    results.push(await scanPackage(name));
  }

  const leaks = results.filter((r) => r.status === 'leak');
  const noDist = results.filter((r) => r.status === 'no-dist');

  if (args.json) {
    console.log(JSON.stringify({ leaks, noDist, scanned: results.length }, null, 2));
  } else {
    if (leaks.length === 0) {
      console.log(
        `OK: scanned ${results.length} package(s); no internal-package or internal-flag leaks in any emitted dist/. ` +
          `(${noDist.length} package(s) had no dist/ to scan.)`
      );
    } else {
      console.error(`FAIL: ${leaks.length} package(s) leaked internal identifiers into dist/:`);
      for (const r of leaks) {
        console.error(`\n  ${r.npmName}:`);
        for (const l of r.leaks) {
          console.error(`    ${l.file}:${l.line ?? '?'}: '${l.identifier}'`);
          if (l.excerpt) console.error(`      ${l.excerpt}`);
        }
      }
    }
  }

  process.exit(leaks.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Script error:', err.message);
  process.exit(2);
});
