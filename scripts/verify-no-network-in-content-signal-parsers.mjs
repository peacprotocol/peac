#!/usr/bin/env node
/**
 * verify-no-network-in-content-signal-parsers.mjs
 *
 * CI gate: no network I/O in the content-signal parser packages.
 *
 * The content-signal-family parser packages take pre-fetched bytes only.
 * Callers are responsible for network I/O (subject to their own SSRF /
 * redirect / timeout / size-cap policy).
 *
 * Watched:
 *   - `packages/aipref/src/**` (deprecated facade over
 *     @peac/mappings-content-signals)
 *   - `packages/mappings/content-signals/src/**`
 *
 * Other mapping packages (for example `packages/mappings/ucp/`) that
 * legitimately fetch upstream profile documents are intentionally out of
 * scope. Broadening the rule to `packages/mappings/**` is tracked as a
 * follow-up in the roadmap when each mapping has been classified.
 *
 * This script scans every tracked `.ts` / `.mjs` / `.js` file under the
 * watched globs for:
 *
 *   - bare-name `fetch(` calls
 *   - imports of `node:http`, `node:https`, `node:net`, `http`, `https`,
 *     `net`, `undici`, `node-fetch`, `got`, `axios`
 *
 * Exceptions:
 *   - `packages/aipref/src/robots.ts` is allowed to mention the literal
 *     string `fetchRobots` in the deprecated throwing stub; the stub does
 *     not call `fetch` or import any network primitive.
 *   - Test files (`*.test.*`, `**\/tests/**`, `**\/__tests__/**`) are
 *     scanned with the same rules; we do NOT want tests to accidentally
 *     depend on network either.
 *
 * Exit codes:
 *   0 - clean
 *   1 - violations found (listed as `<file>:<line>: <reason>`)
 *   2 - script error
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// Scope: parser packages whose job is to map pre-fetched content into typed
// content-signal entries or AIPrefPolicy. UCP and other mapping packages
// that legitimately fetch their upstream profile documents are not in
// scope; any future broadening of the rule is tracked separately.
const WATCHED_ROOTS = [
  join(REPO_ROOT, 'packages', 'aipref', 'src'),
  join(REPO_ROOT, 'packages', 'mappings', 'content-signals', 'src'),
];

const EXT_RE = /\.(mjs|cjs|js|ts|tsx)$/;

const FORBIDDEN_IMPORT_SPECIFIERS = new Set([
  'node:http',
  'node:https',
  'node:net',
  'http',
  'https',
  'net',
  'undici',
  'node-fetch',
  'got',
  'axios',
]);

// Skips: dist / node_modules / test-and-tooling areas we do not care to scan.
const SKIP_DIR_NAMES = new Set(['dist', 'node_modules', '.turbo', '.cache']);

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile() && EXT_RE.test(entry.name)) {
      yield full;
    }
  }
}

function checkFile(file) {
  const violations = [];
  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    return violations;
  }

  const rel = relative(REPO_ROOT, file).split(sep).join('/');
  const lines = source.split('\n');

  // fetchRobots throwing stub in @peac/pref/robots.ts: the function body
  // intentionally references the literal "fetch" in a diagnostic message and
  // exports a stub named `fetchRobots`. The stub does NOT call `fetch()` and
  // does NOT import any network module; we scan the file the same as others
  // and rely on the rules below to recognize that absence.

  const importRe = /^\s*import\s+(?:[^'";]*\s+from\s+)?['"]([^'"]+)['"]/;
  const dynamicImportRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const fetchCallRe = /\bfetch\s*\(/g;

  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const lineNo = i + 1;

    // Strip single-line block comments and leading block-comment bodies
    // ("* @peac/pref ..." inside /** ... */). This is a coarse heuristic
    // sufficient to avoid false positives in JSDoc / banner comments.
    const trimmed = line.trim();
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith('*')) continue;
    // Strip trailing `// ...` line comments before scanning.
    const commentIdx = line.indexOf('//');
    if (commentIdx >= 0) line = line.slice(0, commentIdx);

    const importMatch = line.match(importRe);
    if (importMatch && FORBIDDEN_IMPORT_SPECIFIERS.has(importMatch[1])) {
      violations.push(`${rel}:${lineNo}: forbidden network import "${importMatch[1]}"`);
    }

    let m;
    dynamicImportRe.lastIndex = 0;
    while ((m = dynamicImportRe.exec(line)) !== null) {
      if (FORBIDDEN_IMPORT_SPECIFIERS.has(m[1])) {
        violations.push(`${rel}:${lineNo}: forbidden dynamic import "${m[1]}"`);
      }
    }

    requireRe.lastIndex = 0;
    while ((m = requireRe.exec(line)) !== null) {
      if (FORBIDDEN_IMPORT_SPECIFIERS.has(m[1])) {
        violations.push(`${rel}:${lineNo}: forbidden require() of "${m[1]}"`);
      }
    }

    fetchCallRe.lastIndex = 0;
    while ((m = fetchCallRe.exec(line)) !== null) {
      const before = line.slice(0, m.index);
      if (/[.\w$]$/.test(before)) continue; // e.g., `await myObj.fetch(` or `fetchRobots(`
      // Skip method signatures in interfaces / type literals (no `new` / `=` /
      // `await` / `return` token on the call line and a TypeScript return-type
      // annotation after the parens).
      const afterParens = line.slice(m.index);
      const looksLikeMethodSig =
        !/\b(await|return|new)\b/.test(before) && /\)\s*:/.test(afterParens) && /;\s*$/.test(line);
      if (looksLikeMethodSig) continue;
      violations.push(`${rel}:${lineNo}: forbidden call to global fetch()`);
    }
  }

  return violations;
}

function main() {
  const violations = [];

  for (const root of WATCHED_ROOTS) {
    try {
      statSync(root);
    } catch {
      continue;
    }
    for (const file of walk(root)) {
      violations.push(...checkFile(file));
    }
  }

  if (violations.length > 0) {
    console.error('verify-no-network-in-parsers: violations detected\n');
    for (const v of violations) console.error(`  ${v}`);
    console.error(
      '\nContent-signal parser packages take pre-fetched bytes only. ' +
        'Move network I/O to the caller.'
    );
    process.exit(1);
  }

  console.log('verify-no-network-in-parsers: clean');
  process.exit(0);
}

try {
  main();
} catch (err) {
  console.error('verify-no-network-in-parsers: script error');
  console.error(err);
  process.exit(2);
}
