/**
 * Verifies that runtime-read `PEAC_INTERNAL_*` flags under
 * `packages/protocol/src/_internal/**` are listed in the
 * `docs/STABILITY-CONTRACT.md` internal-only flags table.
 *
 * The check prevents source/documentation drift without exposing these
 * flags as public API. Comment regions in source are stripped before
 * scanning so cross-references in JSDoc do not double-count.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SOURCE_ROOT = join(REPO_ROOT, 'packages', 'protocol', 'src', '_internal');
const STABILITY_CONTRACT = join(REPO_ROOT, 'docs', 'STABILITY-CONTRACT.md');

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...walkTs(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source: string): string {
  // Strip /* block */ comments first, then // line comments. Naive but
  // sufficient: the source files in scope are hand-written TypeScript
  // and do not contain comment-shaped string literals adjacent to flag
  // identifiers.
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function collectFlagLiterals(): Set<string> {
  const literals = new Set<string>();
  // Confirm the source root exists; fail loudly if the repo has been
  // restructured.
  statSync(SOURCE_ROOT);
  const files = walkTs(SOURCE_ROOT);
  const FLAG_RE = /\bPEAC_INTERNAL_[A-Z_][A-Z0-9_]*/g;
  for (const file of files) {
    const text = stripComments(readFileSync(file, 'utf8'));
    for (const match of text.matchAll(FLAG_RE)) {
      literals.add(match[0]);
    }
  }
  return literals;
}

describe('stability-contract internal-flags table coverage', () => {
  it('every PEAC_INTERNAL_* literal in _internal/ source has a contract row', () => {
    const literals = collectFlagLiterals();
    expect(literals.size).toBeGreaterThan(0); // sanity: scan found something

    const contract = readFileSync(STABILITY_CONTRACT, 'utf8');
    // Locate the "Internal-only flags" subsection. Slice from the
    // section header to the next H2, falling back to end-of-file.
    const headerIdx = contract.indexOf('## Internal-only flags');
    expect(
      headerIdx,
      'STABILITY-CONTRACT.md is missing the "Internal-only flags" section'
    ).toBeGreaterThanOrEqual(0);
    const after = contract.slice(headerIdx + '## Internal-only flags'.length);
    const nextH2 = after.search(/\n## [^#]/);
    const section = nextH2 >= 0 ? after.slice(0, nextH2) : after;

    const missing: string[] = [];
    for (const literal of literals) {
      if (!section.includes(literal)) missing.push(literal);
    }
    expect(missing).toEqual([]);
  });
});
