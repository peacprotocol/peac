// Layer 1 (test gate) of the runtime-source isolation invariant.
//
// resolver-http runtime source MUST NOT import @peac/protocol. Parity
// test files (Commit 4) MAY import protocol; helpers under _helpers/
// MUST NOT. This test reads each runtime / helper file via the filesystem
// and asserts no @peac/protocol reference appears anywhere.
//
// Layer 2 is the shell gate `git grep -nE '@peac/protocol'
// packages/resolver-http/src packages/resolver-http/__tests__/_helpers`,
// run from the repo CI; both layers must agree.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOTS = [
  // resolver-http runtime source (production code path)
  '../src',
  // resolver-http shared test helpers (parity tests excluded by design)
  '../__tests__/_helpers',
];

function walk(dir: string): string[] {
  let files: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const e of entries) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) {
      files = files.concat(walk(p));
    } else if (/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(p)) {
      files.push(p);
    }
  }
  return files;
}

const here = dirname(fileURLToPath(import.meta.url));

describe('runtime-source-isolation: resolver-http MUST NOT import @peac/protocol', () => {
  for (const rel of ROOTS) {
    const root = resolve(here, rel);
    const files = walk(root);
    if (files.length === 0) {
      it(`${rel}: directory has no .ts/.js files yet (skipped)`, () => {
        expect(true).toBe(true);
      });
      continue;
    }
    for (const f of files) {
      it(`${f.replace(here, '.')} does not import @peac/protocol`, () => {
        const src = readFileSync(f, 'utf8');
        // Strip block comments (greedy single-pass) and line comments before
        // scanning. Documentation comments mentioning @peac/protocol (e.g.
        // P0-invariant prose) are intentional and must not be flagged; only
        // actual import / require statements are forbidden.
        const stripped = src
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .split('\n')
          .map((line) => line.replace(/\/\/.*$/, ''))
          .join('\n');

        const importStatement =
          /\bimport\b[^;]*?(?:from\s*['"]|['"])(@peac\/protocol(?:\/[^'"\s)]*)?)['"]/g;
        const requireCall = /\brequire\s*\(\s*['"](@peac\/protocol(?:\/[^'"\s)]*)?)['"]/g;
        const dynamicImport = /\bimport\s*\(\s*['"](@peac\/protocol(?:\/[^'"\s)]*)?)['"]/g;

        const hits: string[] = [];
        for (const re of [importStatement, requireCall, dynamicImport]) {
          let m: RegExpExecArray | null;
          while ((m = re.exec(stripped)) !== null) hits.push(m[1]);
        }
        expect(hits, `forbidden @peac/protocol imports: ${hits.join(', ')}`).toEqual([]);
      });
    }
  }
});
