/**
 * API Contract Extraction
 *
 * Deterministic extraction of public API surface for critical packages.
 * Emits machine-readable JSON artifacts for release diffing and gate validation.
 *
 * Extracted contracts for validation-only packages
 * (@peac/kernel, @peac/schema, @peac/crypto, @peac/protocol):
 *   - value exports with typeof classification
 *   - type exports via TypeScript AST barrel analysis
 *   - accessor surface (get*Extension functions)
 *   - Wire 0.2 extension keys vs legacy extension keys
 *   - extension schemas
 *
 * Artifacts at contracts/api/<package>.json are release-review
 * artifacts, not runtime inputs. Ordering is deterministic (sorted).
 *
 * Check mode (--check) compares contract surface only, ignoring volatile
 * metadata (timestamp, node_version). Fails on:
 *   - removed exports
 *   - added exports
 *   - accessor surface drift
 *   - extension key/schema surface drift
 *
 * Usage:
 *   pnpm exec tsx scripts/extract-api-contract.ts          # extract all
 *   pnpm exec tsx scripts/extract-api-contract.ts --check   # diff against stored
 */

import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'contracts', 'api');

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface ApiContract {
  package: string;
  version: string;
  extracted_at: string;
  node_version: string;
  value_exports: Array<{ name: string; typeof: string }>;
  type_exports: string[];
  star_exports: string[];
  accessors: string[];
  wire02_extension_keys: string[];
  legacy_extension_keys: string[];
  extension_schemas: string[];
  total_value_exports: number;
  total_type_exports: number;
}

// Wire 0.2 extension keys (12 groups)
const WIRE02_EXTENSION_KEY_NAMES = new Set([
  'ACCESS_EXTENSION_KEY',
  'ATTRIBUTION_EXTENSION_KEY',
  'CHALLENGE_EXTENSION_KEY',
  'COMMERCE_EXTENSION_KEY',
  'COMPLIANCE_EXTENSION_KEY',
  'CONSENT_EXTENSION_KEY',
  'CORRELATION_EXTENSION_KEY',
  'IDENTITY_EXTENSION_KEY',
  'PRIVACY_EXTENSION_KEY',
  'PROVENANCE_EXTENSION_KEY',
  'PURPOSE_EXTENSION_KEY',
  'SAFETY_EXTENSION_KEY',
]);

// -------------------------------------------------------------------------
// Barrel AST analysis
// -------------------------------------------------------------------------

/**
 * Resolve a relative module specifier to a .ts file path.
 * Handles './foo' -> './foo.ts' and './foo' -> './foo/index.ts'.
 */
function resolveModulePath(fromFile: string, specifier: string): string | null {
  const dir = dirname(fromFile);
  // Try direct .ts
  const direct = join(dir, specifier.replace(/\.js$/, '') + '.ts');
  if (existsSync(direct)) return direct;
  // Try index.ts in directory
  const indexPath = join(dir, specifier.replace(/\.js$/, ''), 'index.ts');
  if (existsSync(indexPath)) return indexPath;
  return null;
}

/**
 * Extract all exports from a barrel file, recursively resolving
 * `export * from './module'` to capture the full public surface.
 */
function extractBarrelExports(
  barrelPath: string,
  visited: Set<string> = new Set()
): {
  values: string[];
  types: string[];
} {
  if (visited.has(barrelPath)) return { values: [], types: [] };
  visited.add(barrelPath);

  const source = readFileSync(barrelPath, 'utf8');
  const sf = ts.createSourceFile(barrelPath, source, ts.ScriptTarget.Latest, true);
  const values: string[] = [];
  const types: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isExportDeclaration(node)) {
      const isTypeOnly = node.isTypeOnly;
      const moduleSpec =
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
          ? node.moduleSpecifier.text
          : undefined;

      // Star export: recursively resolve
      if (!node.exportClause && moduleSpec) {
        const resolved = resolveModulePath(barrelPath, moduleSpec);
        if (resolved) {
          const sub = extractBarrelExports(resolved, visited);
          if (isTypeOnly) {
            types.push(...sub.values, ...sub.types);
          } else {
            values.push(...sub.values);
            types.push(...sub.types);
          }
        }
        return;
      }

      // Named exports
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          if (isTypeOnly || element.isTypeOnly) {
            types.push(element.name.text);
          } else {
            values.push(element.name.text);
          }
        }
      }
    }

    // Inline export declarations: export const/function/class
    if (
      (ts.isVariableStatement(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node)) &&
      node.modifiers?.some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) values.push(decl.name.text);
        }
      } else if (node.name) {
        values.push(node.name.text);
      }
    }

    // Inline export type/interface
    if (
      (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
      node.modifiers?.some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      types.push(node.name.text);
    }

    // Inline export enum
    if (
      ts.isEnumDeclaration(node) &&
      node.modifiers?.some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      values.push(node.name.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return {
    values: [...new Set(values)].sort(),
    types: [...new Set(types)].sort(),
  };
}

// -------------------------------------------------------------------------
// Package extraction
// -------------------------------------------------------------------------

interface PackageTarget {
  name: string;
  barrelPath: string;
}

const TARGETS: PackageTarget[] = [
  {
    name: 'kernel',
    barrelPath: join(ROOT, 'packages/kernel/src/index.ts'),
  },
  {
    name: 'schema',
    barrelPath: join(ROOT, 'packages/schema/src/index.ts'),
  },
  {
    name: 'crypto',
    barrelPath: join(ROOT, 'packages/crypto/src/index.ts'),
  },
  {
    name: 'protocol',
    barrelPath: join(ROOT, 'packages/protocol/src/index.ts'),
  },
];

function extractContract(target: PackageTarget): ApiContract {
  const barrel = extractBarrelExports(target.barrelPath);

  const valueExports = barrel.values.map((name) => ({
    name,
    typeof: 'static' as string,
  }));

  const accessors = barrel.values
    .filter((k) => k.startsWith('get') && k.endsWith('Extension'))
    .sort();

  const allExtKeys = barrel.values.filter((k) => k.endsWith('_EXTENSION_KEY')).sort();
  const wire02Keys = allExtKeys.filter((k) => WIRE02_EXTENSION_KEY_NAMES.has(k));
  const legacyKeys = allExtKeys.filter((k) => !WIRE02_EXTENSION_KEY_NAMES.has(k));

  const extensionSchemas = barrel.values.filter((k) => k.endsWith('ExtensionSchema')).sort();

  const pkgJsonPath = join(ROOT, `packages/${target.name}/package.json`);
  let version = 'unknown';
  if (existsSync(pkgJsonPath)) {
    version = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).version;
  }

  return {
    package: `@peac/${target.name}`,
    version,
    extracted_at: new Date().toISOString().split('T')[0],
    node_version: process.version,
    value_exports: valueExports,
    type_exports: barrel.types,
    star_exports: [],
    accessors,
    wire02_extension_keys: wire02Keys,
    legacy_extension_keys: legacyKeys,
    extension_schemas: extensionSchemas,
    total_value_exports: valueExports.length,
    total_type_exports: barrel.types.length,
  };
}

// -------------------------------------------------------------------------
// Check mode: compare contract surface only, ignore volatile metadata
// -------------------------------------------------------------------------

interface DriftReport {
  package: string;
  removedExports: string[];
  addedExports: string[];
  accessorDrift: { removed: string[]; added: string[] };
  extensionKeyDrift: { removed: string[]; added: string[] };
  extensionSchemaDrift: { removed: string[]; added: string[] };
}

function checkDrift(stored: ApiContract, current: ApiContract): DriftReport {
  const storedNames = stored.value_exports.map((e) => e.name);
  const currentNames = current.value_exports.map((e) => e.name);

  return {
    package: current.package,
    removedExports: storedNames.filter((n) => !currentNames.includes(n)),
    addedExports: currentNames.filter((n) => !storedNames.includes(n)),
    accessorDrift: {
      removed: stored.accessors.filter((a) => !current.accessors.includes(a)),
      added: current.accessors.filter((a) => !stored.accessors.includes(a)),
    },
    extensionKeyDrift: {
      removed: [...stored.wire02_extension_keys, ...stored.legacy_extension_keys].filter(
        (k) => ![...current.wire02_extension_keys, ...current.legacy_extension_keys].includes(k)
      ),
      added: [...current.wire02_extension_keys, ...current.legacy_extension_keys].filter(
        (k) => ![...stored.wire02_extension_keys, ...stored.legacy_extension_keys].includes(k)
      ),
    },
    extensionSchemaDrift: {
      removed: stored.extension_schemas.filter((s) => !current.extension_schemas.includes(s)),
      added: current.extension_schemas.filter((s) => !stored.extension_schemas.includes(s)),
    },
  };
}

function hasDrift(report: DriftReport): boolean {
  return (
    report.removedExports.length > 0 ||
    report.addedExports.length > 0 ||
    report.accessorDrift.removed.length > 0 ||
    report.accessorDrift.added.length > 0 ||
    report.extensionKeyDrift.removed.length > 0 ||
    report.extensionKeyDrift.added.length > 0 ||
    report.extensionSchemaDrift.removed.length > 0 ||
    report.extensionSchemaDrift.added.length > 0
  );
}

function printDrift(report: DriftReport) {
  if (report.removedExports.length > 0)
    console.log(`    Removed exports: ${report.removedExports.join(', ')}`);
  if (report.addedExports.length > 0)
    console.log(`    Added exports: ${report.addedExports.join(', ')}`);
  if (report.accessorDrift.removed.length > 0)
    console.log(`    Removed accessors: ${report.accessorDrift.removed.join(', ')}`);
  if (report.accessorDrift.added.length > 0)
    console.log(`    Added accessors: ${report.accessorDrift.added.join(', ')}`);
  if (report.extensionKeyDrift.removed.length > 0)
    console.log(`    Removed extension keys: ${report.extensionKeyDrift.removed.join(', ')}`);
  if (report.extensionKeyDrift.added.length > 0)
    console.log(`    Added extension keys: ${report.extensionKeyDrift.added.join(', ')}`);
  if (report.extensionSchemaDrift.removed.length > 0)
    console.log(`    Removed extension schemas: ${report.extensionSchemaDrift.removed.join(', ')}`);
  if (report.extensionSchemaDrift.added.length > 0)
    console.log(`    Added extension schemas: ${report.extensionSchemaDrift.added.join(', ')}`);
}

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------

function main() {
  const isCheck = process.argv.includes('--check');

  mkdirSync(OUT_DIR, { recursive: true });

  let hasFailed = false;
  let totalExports = 0;

  console.log('PEAC Protocol: API Contract Extraction');
  console.log('======================================');
  console.log('');

  for (const target of TARGETS) {
    const contract = extractContract(target);
    const outPath = join(OUT_DIR, `${target.name}.json`);
    totalExports += contract.total_value_exports + contract.total_type_exports;

    if (isCheck) {
      if (!existsSync(outPath)) {
        console.log(`  FAIL: ${contract.package} contract not found at ${outPath}`);
        console.log('    Run: pnpm exec tsx scripts/extract-api-contract.ts');
        hasFailed = true;
        continue;
      }

      const stored = JSON.parse(readFileSync(outPath, 'utf8')) as ApiContract;
      const drift = checkDrift(stored, contract);

      if (hasDrift(drift)) {
        console.log(`  CHANGED: ${contract.package}`);
        printDrift(drift);
        hasFailed = true;
      } else {
        console.log(
          `  OK: ${contract.package} (${contract.total_value_exports} value, ${contract.total_type_exports} type, ${contract.accessors.length} accessors, ${contract.wire02_extension_keys.length} Wire 0.2 keys)`
        );
      }
    } else {
      writeFileSync(outPath, JSON.stringify(contract, null, 2) + '\n');
      console.log(
        `  OK: ${contract.package} -> ${target.name}.json (${contract.total_value_exports} value, ${contract.total_type_exports} type, ${contract.accessors.length} accessors)`
      );
    }
  }

  console.log('');
  console.log(`Total: ${totalExports} exports across ${TARGETS.length} packages.`);

  if (isCheck && hasFailed) {
    console.log('');
    console.log('FAIL: API contract drift detected. Update artifacts:');
    console.log('  pnpm exec tsx scripts/extract-api-contract.ts');
    process.exit(1);
  }

  if (!isCheck) {
    console.log(`Contracts written to contracts/api/`);
  }
}

main();
