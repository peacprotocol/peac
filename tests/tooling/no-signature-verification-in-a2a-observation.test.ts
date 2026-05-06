/**
 * Artifact-shape import-graph test for A2A observation helpers.
 *
 * The A2A observation helpers in `packages/mappings/a2a/src/observation/` are
 * strictly observational. They MUST NOT verify Agent Card signatures and MUST
 * NOT import any signature-verification API. This boundary is enforced at the
 * import-graph level (NOT via source-grep, which is brittle): a TypeScript
 * AST walker reads each helper file's import statements and rejects any
 * import path that resolves to a signature/JWS/crypto module.
 *
 * Artifact-shape and import-graph tests are preferred over source-grep
 * tests for "no signature verification" / "no decision derivation" / etc.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const HELPER_FILES = [
  'packages/mappings/a2a/src/observation/agent-card.ts',
  'packages/mappings/a2a/src/observation/handoff.ts',
  'packages/mappings/a2a/src/observation/index.ts',
];

// Forbidden module specifiers (exact match)
const FORBIDDEN_EXACT = new Set<string>(['@peac/crypto', 'node:crypto', 'crypto', 'jose']);

// Forbidden module specifier substrings (path patterns)
const FORBIDDEN_SUBSTRINGS = ['@peac/protocol/verify', '/jws', '/sign', '/verify'];

function extractImports(filePath: string): string[] {
  const source = readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.ES2022, true);
  const imports: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (ts.isStringLiteral(spec)) {
        imports.push(spec.text);
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const spec = node.moduleSpecifier;
      if (ts.isStringLiteral(spec)) {
        imports.push(spec.text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return imports;
}

describe('A2A observation helpers cannot import signature-verification APIs', () => {
  for (const rel of HELPER_FILES) {
    it(`${rel} has no forbidden imports`, () => {
      const abs = join(ROOT, rel);
      const imports = extractImports(abs);

      const violations: string[] = [];
      for (const spec of imports) {
        if (FORBIDDEN_EXACT.has(spec)) {
          violations.push(spec);
          continue;
        }
        for (const sub of FORBIDDEN_SUBSTRINGS) {
          if (spec.includes(sub)) {
            violations.push(spec);
            break;
          }
        }
      }

      expect(
        violations,
        `Forbidden import(s) in ${rel}: ${violations.join(', ')}. ` +
          'A2A observation helpers must not perform or invoke signature verification; ' +
          'they record caller-supplied verification observations only.'
      ).toEqual([]);
    });
  }
});
