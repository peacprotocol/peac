/**
 * API Contract Snapshot Tests
 *
 * Verifies that the public API surface of critical packages remains
 * stable. Detects accidental removals, unexpected additions, and
 * validates accessor completeness for Wire 0.2 extension groups.
 *
 * Contract artifacts: contracts/api/<package>.json
 * Regenerate: pnpm api-contract:extract
 */

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Runtime imports (resolved via vitest aliases to source)
import * as schema from '@peac/schema';
import * as kernel from '@peac/kernel';
import * as crypto from '@peac/crypto';
import * as protocol from '@peac/protocol';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

/**
 * Extract named exports from a barrel file using TypeScript AST.
 * Returns categorized export names (values and types).
 * Does not resolve star exports; those are covered by runtime checks.
 */
function extractBarrelExports(barrelPath: string): {
  values: string[];
  types: string[];
  starExports: string[];
} {
  const source = readFileSync(barrelPath, 'utf8');
  const sf = ts.createSourceFile(barrelPath, source, ts.ScriptTarget.Latest, true);
  const values: string[] = [];
  const types: string[] = [];
  const starExports: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isExportDeclaration(node)) {
      const isTypeOnly = node.isTypeOnly;
      const moduleSpec =
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
          ? node.moduleSpecifier.text
          : undefined;

      // Star exports: export * from './module'
      if (!node.exportClause && moduleSpec) {
        starExports.push(moduleSpec);
        return;
      }

      // Named exports: export { A, B } from './module'
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          const name = element.name.text;
          if (isTypeOnly || element.isTypeOnly) {
            types.push(name);
          } else {
            values.push(name);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return {
    values: values.sort(),
    types: types.sort(),
    starExports: starExports.sort(),
  };
}

// -------------------------------------------------------------------------
// @peac/schema API contract
// -------------------------------------------------------------------------

describe('API contract: @peac/schema', () => {
  const exports = Object.keys(schema).sort();

  it('value exports match snapshot', () => {
    expect(exports).toMatchSnapshot();
  });

  it('exports 12 typed extension group accessors', () => {
    const accessors = exports.filter((k) => k.startsWith('get') && k.endsWith('Extension')).sort();
    expect(accessors).toEqual([
      'getAccessExtension',
      'getAttributionExtension',
      'getChallengeExtension',
      'getCommerceExtension',
      'getComplianceExtension',
      'getConsentExtension',
      'getCorrelationExtension',
      'getIdentityExtension',
      'getPrivacyExtension',
      'getProvenanceExtension',
      'getPurposeExtension',
      'getSafetyExtension',
    ]);
  });

  it('exports 12 Wire 0.2 extension group key constants', () => {
    // Wire 0.2 typed extension group keys (12 groups)
    const wire02Keys = [
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
    ];
    for (const key of wire02Keys) {
      expect(exports, `missing Wire 0.2 extension key: ${key}`).toContain(key);
    }
    expect(wire02Keys).toHaveLength(12);
  });

  it('exports all extension key constants (Wire 0.1 + Wire 0.2 + observation surfaces)', () => {
    const allKeys = exports.filter((k) => k.endsWith('_EXTENSION_KEY')).sort();
    // 12 Wire 0.2 groups + 8 legacy extension keys + 2 observation
    // surfaces (a2a-handoff + cli-execution) = 22 total
    expect(allKeys).toHaveLength(22);
  });

  it('exports all extension group schemas (Wire 0.2 + legacy)', () => {
    const schemas = exports.filter((k) => k.endsWith('ExtensionSchema')).sort();
    // 12 Wire 0.2 + 1 legacy (ObligationsExtensionSchema) = 13
    expect(schemas).toHaveLength(13);
  });

  it('ProofMethodSchema is removed (DD-185; removed in v0.13.0 PR B)', () => {
    // Transport-binding method values (http-message-signature, dpop, mtls,
    // jwk-thumbprint) are now inlined on AgentProofSchema.method. See
    // docs/MIGRATION_CURRENT.md and docs/STABILITY-CONTRACT.md.
    expect(exports).not.toContain('ProofMethodSchema');
    expect(exports).not.toContain('PROOF_METHODS');
  });

  it('ProofTypeSchema remains exported (canonical trust-root model)', () => {
    expect(exports).toContain('ProofTypeSchema');
    expect(exports).toContain('PROOF_TYPES');
  });

  it('Wire 0.2 core schemas are exported', () => {
    expect(exports).toContain('Wire02ClaimsSchema');
    expect(exports).toContain('Wire02KindSchema');
    expect(exports).toContain('ReceiptTypeSchema');
    expect(exports).toContain('CanonicalIssSchema');
    expect(exports).toContain('PolicyBlockSchema');
    expect(exports).toContain('PillarsSchema');
  });

  it('Wire 0.2 helpers are exported', () => {
    expect(exports).toContain('isCanonicalIss');
    expect(exports).toContain('isValidReceiptType');
    expect(exports).toContain('checkOccurredAtSkew');
    expect(exports).toContain('verifyPolicyBinding');
    expect(exports).toContain('detectWireVersion');
    expect(exports).toContain('parseReceiptClaims');
  });

  it('warning constants are exported', () => {
    expect(exports).toContain('WARNING_TYPE_UNREGISTERED');
    expect(exports).toContain('WARNING_UNKNOWN_EXTENSION');
    expect(exports).toContain('WARNING_OCCURRED_AT_SKEW');
    expect(exports).toContain('WARNING_TYP_MISSING');
    expect(exports).toContain('WARNING_EXTENSION_GROUP_MISSING');
    expect(exports).toContain('WARNING_EXTENSION_GROUP_MISMATCH');
  });

  it('extension budget constants are exported', () => {
    expect(exports).toContain('EXTENSION_BUDGET');
    expect(exports).toContain('EXTENSION_LIMITS');
  });

  it('registry constants are exported', () => {
    expect(exports).toContain('REGISTERED_RECEIPT_TYPES');
    expect(exports).toContain('REGISTERED_EXTENSION_GROUP_KEYS');
  });

  it('all value exports are defined (not undefined)', () => {
    for (const key of exports) {
      const value = (schema as Record<string, unknown>)[key];
      expect(value, `export '${key}' is undefined`).toBeDefined();
    }
  });

  it('barrel type exports match snapshot (static AST)', () => {
    const barrel = extractBarrelExports(join(ROOT, 'packages/schema/src/index.ts'));
    expect(barrel.types).toMatchSnapshot();
  });
});

// -------------------------------------------------------------------------
// @peac/kernel API contract
// -------------------------------------------------------------------------

describe('API contract: @peac/kernel', () => {
  const exports = Object.keys(kernel).sort();

  it('value exports match snapshot', () => {
    expect(exports).toMatchSnapshot();
  });

  it('extension budget constants are exported', () => {
    expect(exports).toContain('EXTENSION_BUDGET');
  });

  it('error code constants are exported', () => {
    expect(exports).toContain('ERROR_CODES');
  });

  it('all value exports are defined', () => {
    for (const key of exports) {
      expect(
        (kernel as Record<string, unknown>)[key],
        `export '${key}' is undefined`
      ).toBeDefined();
    }
  });

  it('barrel type exports match snapshot (static AST)', () => {
    const barrel = extractBarrelExports(join(ROOT, 'packages/kernel/src/index.ts'));
    expect(barrel.types).toMatchSnapshot();
  });
});

// -------------------------------------------------------------------------
// @peac/crypto API contract
// -------------------------------------------------------------------------

describe('API contract: @peac/crypto', () => {
  const exports = Object.keys(crypto).sort();

  it('value exports match snapshot', () => {
    expect(exports).toMatchSnapshot();
  });

  it('core crypto functions are exported', () => {
    expect(exports).toContain('generateKeypair');
    expect(exports).toContain('signWire02');
    expect(exports).toContain('validateWire02Header');
  });

  it('all value exports are defined', () => {
    for (const key of exports) {
      expect(
        (crypto as Record<string, unknown>)[key],
        `export '${key}' is undefined`
      ).toBeDefined();
    }
  });

  it('barrel type exports match snapshot (static AST)', () => {
    const barrel = extractBarrelExports(join(ROOT, 'packages/crypto/src/index.ts'));
    expect(barrel.types).toMatchSnapshot();
  });
});

// -------------------------------------------------------------------------
// @peac/protocol API contract
// -------------------------------------------------------------------------

describe('API contract: @peac/protocol', () => {
  const exports = Object.keys(protocol).sort();

  it('value exports match snapshot', () => {
    expect(exports).toMatchSnapshot();
  });

  it('core protocol functions are exported', () => {
    expect(exports).toContain('issueWire02');
    expect(exports).toContain('verifyLocal');
    expect(exports).toContain('verifyReceipt');
  });

  it('all value exports are defined', () => {
    for (const key of exports) {
      expect(
        (protocol as Record<string, unknown>)[key],
        `export '${key}' is undefined`
      ).toBeDefined();
    }
  });

  it('barrel type exports match snapshot (static AST)', () => {
    const barrel = extractBarrelExports(join(ROOT, 'packages/protocol/src/index.ts'));
    expect(barrel.types).toMatchSnapshot();
  });
});

// -------------------------------------------------------------------------
// Contract artifact validation (Layer 3: machine-readable JSON baseline)
// -------------------------------------------------------------------------

interface ContractArtifact {
  package: string;
  value_exports: Array<{ name: string; typeof: string }>;
  type_exports: string[];
  accessors: string[];
  extension_keys: string[];
  extension_schemas: string[];
}

const CONTRACT_DIR = join(ROOT, 'contracts', 'api');

describe('API contract: artifact validation', () => {
  const packages: Array<{
    name: string;
    file: string;
    mod: Record<string, unknown>;
  }> = [
    { name: '@peac/kernel', file: 'kernel.json', mod: kernel as Record<string, unknown> },
    { name: '@peac/schema', file: 'schema.json', mod: schema as Record<string, unknown> },
    { name: '@peac/crypto', file: 'crypto.json', mod: crypto as Record<string, unknown> },
    { name: '@peac/protocol', file: 'protocol.json', mod: protocol as Record<string, unknown> },
  ];

  for (const pkg of packages) {
    const contractPath = join(CONTRACT_DIR, pkg.file);

    it(`${pkg.name}: contract artifact exists`, () => {
      expect(existsSync(contractPath), `missing ${contractPath}`).toBe(true);
    });

    it(`${pkg.name}: contract exports exist at runtime`, () => {
      if (!existsSync(contractPath)) return;
      const contract = JSON.parse(readFileSync(contractPath, 'utf8')) as ContractArtifact;
      const storedNames = contract.value_exports.map((e) => e.name);
      const runtimeNames = new Set(Object.keys(pkg.mod));

      // Every named export in the contract must exist at runtime
      const missing = storedNames.filter((n) => !runtimeNames.has(n));
      expect(missing, `${pkg.name}: contract exports missing at runtime`).toEqual([]);
    });
  }
});
