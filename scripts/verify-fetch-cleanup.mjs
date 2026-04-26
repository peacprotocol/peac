#!/usr/bin/env node
/**
 * safeFetchRaw cleanup gate.
 *
 * Greps tracked source files for `safeFetchRaw(` invocations and asserts
 * each enclosing function or block contains an `await <ident>.close()` call
 * inside a `finally` block (or, equivalently, the result is awaited and
 * closed via a guaranteed-cleanup pattern). This catches socket-leak bugs
 * where a caller fetches the raw response stream but forgets to close it.
 *
 * Heuristic implementation: locates each `safeFetchRaw(` call site and walks
 * forward looking for a same-block `await <name>.close()` inside a `finally`
 * clause within ~80 lines. Reports any call site that lacks a paired
 * cleanup. False positives are possible (e.g. helper that returns the raw
 * result for the caller to close) but are rare and worth flagging.
 *
 * Exit codes:
 *   0 = clean (every safeFetchRaw call site has a paired close)
 *   1 = one or more bare safeFetchRaw call sites
 *   2 = script error
 *
 * Usage:
 *   node scripts/verify-fetch-cleanup.mjs            # scan all
 *   node scripts/verify-fetch-cleanup.mjs --json
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  return { json: args.includes('--json') };
}

// Source-file extensions to inspect (TypeScript / JavaScript).
const SCANNABLE_EXTS = /\.(?:tsx?|jsx?|mjs|cjs)$/;

// Path-prefix excludes mirroring the git-grep exclude list. Applied to BOTH
// tracked and untracked candidates so locally-created files cannot bypass
// the check by being unstaged.
const EXCLUDED_PREFIXES = [
  'archive/',
  'node_modules/',
  'packages/net/node/',
];
const EXCLUDED_SEGMENTS = [
  '/node_modules/',
  '/dist/',
];
// The gate script itself references `safeFetchRaw` in comments + error
// messages; exclude it from candidate scanning to avoid self-matching.
// The gate's own self-test fixture file contains both unsafe and safe
// safeFetchRaw source examples as string literals; it tests the gate by
// dynamically writing temp files, not by being scanned itself.
const EXCLUDED_FILES = new Set([
  'scripts/verify-fetch-cleanup.mjs',
  'tests/tooling/verify-fetch-cleanup.test.ts',
]);

function isExcludedPath(rel) {
  if (EXCLUDED_FILES.has(rel)) return true;
  if (EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) return true;
  if (EXCLUDED_SEGMENTS.some((s) => rel.includes(s))) return true;
  if (!SCANNABLE_EXTS.test(rel)) return true;
  return false;
}

function listGitFiles(args) {
  try {
    const out = execFileSync('git', ['ls-files', '-z', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return out.split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

function findCandidates() {
  // Combine tracked + untracked source files; this catches locally-added
  // files that have not yet been `git add`-ed. CI sees only tracked files
  // (untracked do not exist in CI checkouts) but local pre-PR runs MUST
  // catch new files immediately.
  const tracked = listGitFiles(['--cached', '--others', '--exclude-standard']);
  const candidates = new Set(tracked.filter((p) => !isExcludedPath(p)));

  // Filter to files that actually contain the call site (cheap text grep).
  const matches = [];
  for (const rel of candidates) {
    let text;
    try {
      text = readFileSync(join(ROOT, rel), 'utf8');
    } catch {
      continue;
    }
    if (/safeFetchRaw\s*\(/.test(text)) matches.push(rel);
  }
  return matches;
}

function inspect(file) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  const lines = text.split('\n');
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/\bsafeFetchRaw\s*\(/.test(lines[i])) continue;
    // Try to extract the assigned identifier: `const <name> = await safeFetchRaw(...)`
    const assignMatch = lines[i].match(/(?:const|let|var)\s+(\w+)\s*=\s*await\s+safeFetchRaw/);
    const ident = assignMatch ? assignMatch[1] : null;

    // Look ahead up to 80 lines for a `finally` clause containing
    // `await <ident>.close()` (or any `await <name>.close()` if we can't
    // determine the identifier). This is intentionally a forgiving
    // heuristic: false positives are rarer and more useful to surface.
    const window = lines.slice(i, Math.min(lines.length, i + 80)).join('\n');
    const closePattern = ident
      ? new RegExp(
          `finally\\s*\\{[\\s\\S]*?await\\s+${ident}\\.close\\s*\\(\\s*\\)[\\s\\S]*?\\}`,
          'm',
        )
      : /finally\s*\{[\s\S]*?await\s+\w+\.close\s*\(\s*\)[\s\S]*?\}/m;
    const hasCleanup = closePattern.test(window);
    if (!hasCleanup) {
      violations.push({
        file,
        line: i + 1,
        identifier: ident,
        excerpt: lines[i].trim().slice(0, 160),
      });
    }
  }
  return violations;
}

async function main() {
  const args = parseArgs();
  const candidates = findCandidates();
  const violations = [];
  for (const file of candidates) {
    violations.push(...inspect(file));
  }

  if (args.json) {
    console.log(JSON.stringify({ violations, scanned: candidates.length }, null, 2));
  } else {
    if (violations.length === 0) {
      console.log(
        `OK: scanned ${candidates.length} file(s) calling safeFetchRaw(); every call site has a paired close() in finally.`,
      );
    } else {
      console.error(`FAIL: ${violations.length} bare safeFetchRaw() call site(s) without close()-in-finally:`);
      for (const v of violations) {
        console.error(
          `  ${v.file}:${v.line}  ${v.identifier ? `(assigned to "${v.identifier}")` : '(no assignment)'}`,
        );
        console.error(`    ${v.excerpt}`);
      }
    }
  }

  process.exit(violations.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Script error:', err.message);
  process.exit(2);
});
