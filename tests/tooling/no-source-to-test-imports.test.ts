/**
 * Source-to-test import-direction guard (static).
 *
 * Shipped TypeScript source must never import a test-only module. The normal
 * direction is test -> source (a test imports the code it exercises); the
 * reverse, source -> test, would pull test code, mocks, fixtures, and dev-only
 * dependencies into a shipped build. A one-way source -> test import is not a
 * cycle, so a circular-dependency check does not catch it, and the dependency
 * graph linter only scans `src/`, so this guard closes that gap.
 *
 * It is AST-based (string-literal module specifiers from imports, re-exports,
 * dynamic imports, and require calls) and source-text only, so it covers every
 * runtime surface without a harness. The checker is unit-tested below with
 * in-memory snippets so the guard proves it works, not merely that the tree is
 * clean today.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import * as ts from 'typescript';

const ROOT = resolve(__dirname, '..', '..');

// Roots whose `src/` trees ship as packages, surfaces, or apps.
const SOURCE_ROOTS = ['packages', 'surfaces', 'apps'];

// Directory names never descended into.
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'archive',
  'tests',
  '__tests__',
  'fixtures',
  '.turbo',
  'coverage',
]);

// Shipped TypeScript source extensions and their test/spec counterparts.
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'] as const;
const TEST_EXTENSIONS = [
  '.test.ts',
  '.test.tsx',
  '.test.mts',
  '.test.cts',
  '.spec.ts',
  '.spec.tsx',
  '.spec.mts',
  '.spec.cts',
] as const;

/** A shipped source file under a `src/` segment that is not a test/spec or declaration file. */
function isShippedSourceFile(relPath: string): boolean {
  if (!relPath.includes('/src/')) return false;
  if (relPath.endsWith('.d.ts')) return false;
  if (!SOURCE_EXTENSIONS.some((extension) => relPath.endsWith(extension))) return false;
  if (TEST_EXTENSIONS.some((extension) => relPath.endsWith(extension))) return false;
  return true;
}

/** Read a directory's entries, or an empty list if it cannot be read. */
function readEntries(absDir: string) {
  try {
    return readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Recursively collect shipped source files under the given roots. */
function collectSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (absDir: string, relDir: string): void => {
    for (const entry of readEntries(absDir)) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(join(absDir, entry.name), rel);
      } else if (entry.isFile() && isShippedSourceFile(`/${rel}`)) {
        out.push(rel);
      }
    }
  };
  for (const root of SOURCE_ROOTS) {
    walk(join(ROOT, root), root);
  }
  return out;
}

/** True if a module specifier resolves to a test, spec, or fixture module. */
function isTestModuleSpecifier(specifier: string): boolean {
  return (
    /\.(test|spec)(\.(c|m)?(j|t)sx?)?$/.test(specifier) ||
    /(^|\/)(tests|__tests__|fixtures)(\/|$)/.test(specifier)
  );
}

type SpecifierRef = { specifier: string; line: number };

/**
 * Collect every static string-literal module specifier in a source file:
 * `import ... from 'x'`, `export ... from 'x'` / `export * from 'x'`,
 * dynamic `import('x')`, and `require('x')`.
 */
function collectModuleSpecifiers(source: string, fileName = 'in-memory.ts'): SpecifierRef[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const refs: SpecifierRef[] = [];
  const record = (node: ts.Node | undefined): void => {
    if (node && ts.isStringLiteralLike(node)) {
      refs.push({
        specifier: node.text,
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      });
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      record(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      record(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      record(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        record(node.arguments[0]);
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        record(node.arguments[0]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return refs;
}

describe('source files do not import test-only modules', () => {
  const files = collectSourceFiles();

  it('finds a non-trivial set of shipped source files to scan', () => {
    // Guards against a broken walker silently scanning nothing.
    expect(files.length).toBeGreaterThan(100);
  });

  it('no shipped source file imports a .test/.spec module or a tests/__tests__/fixtures path', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      const source = readFileSync(join(ROOT, rel), 'utf8');
      for (const { specifier, line } of collectModuleSpecifiers(source, rel)) {
        if (isTestModuleSpecifier(specifier)) {
          offenders.push(`${rel}:${line} imports '${specifier}'`);
        }
      }
    }
    expect(offenders, `source -> test imports found:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('the checker itself catches every source-to-test import form', () => {
  const bad: Array<[string, string]> = [
    ['default import of a .test module', `import x from './foo.test';`],
    ['re-export star from tests/', `export * from '../tests/foo';`],
    ['named re-export from fixtures/', `export { x } from '../fixtures/foo';`],
    ['dynamic import of __tests__/', `await import('../__tests__/foo');`],
    ['require of a .spec module', `const x = require('../foo.spec');`],
    ['named import from a /tests/ path', `import { y } from '@peac/foo/tests/util';`],
    ['import equals require of a .spec module', `import x = require('../foo.spec');`],
    ['tsx test module import', `import x from './foo.test.tsx';`],
    ['mts spec module import', `import x from './foo.spec.mts';`],
  ];

  it.each(bad)('flags: %s', (_label, snippet) => {
    const flagged = collectModuleSpecifiers(snippet).filter((r) =>
      isTestModuleSpecifier(r.specifier)
    );
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('does NOT flag normal production imports', () => {
    const ok = [
      `import { x } from '../lib/foo';`,
      `export { y } from './bar.js';`,
      `import pkg from '@peac/contracts';`,
      `const z = require('node:path');`,
      `await import('./lazy-module.js');`,
      // A path that merely contains "test" as a substring of a longer word.
      `import { t } from './latest-record';`,
      `import { c } from './contest-helper';`,
    ].join('\n');
    const flagged = collectModuleSpecifiers(ok).filter((r) => isTestModuleSpecifier(r.specifier));
    expect(flagged).toEqual([]);
  });
});
