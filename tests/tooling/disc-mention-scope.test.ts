/**
 * @peac/disc mention-scope guard.
 *
 * After v0.13.1 retirement, mentions of @peac/disc on tracked public surfaces
 * must fall inside an allowed context (migration / deprecation / archival /
 * historical changelog / release-notes archival paragraph). Active-install
 * recommendations like `npm install @peac/disc`, `pnpm add @peac/disc`,
 * `Use @peac/disc to`, `@peac/disc provides`, or `import ... from '@peac/disc'`
 * are forbidden on public-facing tracked files; they would mislead external
 * readers about a package that no longer ships.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// Public-surface tracked file globs to scan. archive/, reference/, .claude/,
// node_modules/, dist/, this test, the migration doc, the CHANGELOG (which
// is allowed to mention deprecated packages in historical entries), and the
// publish-manifest are excluded by the allow-list logic below.
const SCAN_PATHS: readonly string[] = [
  'README.md',
  'docs',
  'examples',
  'integrator-kits',
  'surfaces',
  'llms.txt',
];

// Patterns that constitute an active-install recommendation. Any of these
// inside a non-allowed-context surface is a failure.
const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\bnpm install @peac\/disc\b/i,
  /\bpnpm add @peac\/disc\b/i,
  /\byarn add @peac\/disc\b/i,
  /\bUse @peac\/disc to\b/i,
  /\b@peac\/disc provides\b/i,
  /\bimport[^;]*from\s*['"]@peac\/disc['"]/i,
  /\bimport[^;]*['"]@peac\/disc['"]/i,
  /\brequire\(\s*['"]@peac\/disc['"]\s*\)/i,
];

// Files whose entire content is allowed to mention @peac/disc (migration
// guide, archive READMEs, release notes that document the retirement, etc.).
// Paths are repo-relative.
const ALLOWED_FILES_EXACT: ReadonlySet<string> = new Set([
  'docs/MIGRATION_CURRENT.md',
  'CHANGELOG.md',
]);

// Path-prefix allow list: anything under these prefixes is allowed because
// historical record-keeping (release-notes, archived sources) MUST preserve
// the package name.
const ALLOWED_PATH_PREFIXES: readonly string[] = [
  'docs/release-notes/',
  'docs/case-studies/',
  'archive/',
];

function isAllowedPath(repoRelativePath: string): boolean {
  if (ALLOWED_FILES_EXACT.has(repoRelativePath)) return true;
  return ALLOWED_PATH_PREFIXES.some((prefix) => repoRelativePath.startsWith(prefix));
}

function gitGrepFiles(): string[] {
  // Use git ls-files to enumerate ONLY tracked files; ignores node_modules,
  // dist, untracked artifacts.
  const args = ['ls-files', '-z', '--', ...SCAN_PATHS];
  let stdout: string;
  try {
    stdout = execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return [];
  }
  return stdout.split('\0').filter((p) => p.length > 0);
}

function isTextLikely(path: string): boolean {
  // Restrict to .md / .json / .yaml / .yml / .ts / .tsx / .js / .mjs / .cjs /
  // .txt / .html / .toml. Other extensions (pngs etc.) are skipped.
  return /\.(?:md|markdown|json|ya?ml|tsx?|jsx?|mjs|cjs|txt|html|toml)$/i.test(path);
}

describe('@peac/disc: mention-scope guard on tracked public surfaces', () => {
  it('no active-install recommendation pattern appears outside allowed contexts', () => {
    const failures: string[] = [];
    const candidates = gitGrepFiles().filter(isTextLikely);

    for (const rel of candidates) {
      if (isAllowedPath(rel)) continue;
      let text: string;
      try {
        text = readFileSync(join(ROOT, rel), 'utf8');
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      lines.forEach((line, idx) => {
        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            failures.push(
              `${rel}:${idx + 1}: matches ${pattern} -> "${line.trim().slice(0, 120)}"`
            );
          }
        }
      });
    }

    expect(failures, '\n' + failures.join('\n')).toEqual([]);
  });
});
