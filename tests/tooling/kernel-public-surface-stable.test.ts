/**
 * @peac/kernel public-surface stability gate.
 *
 * v0.13.1 binding rule: @peac/kernel/src/index.ts is unchanged byte-for-byte
 * from v0.13.0 (no exports added, no exports removed, no @deprecated JSDoc
 * markers added). The new @peac/registries facade re-exports FROM @peac/kernel;
 * the reverse direction is forbidden by the private-package dependency
 * invariant (a published package may not depend on a workspace-private package).
 *
 * This test asserts that:
 *   1. The set of named runtime exports from @peac/kernel matches the v0.13.0
 *      baseline (snapshot of canonical names). Drift in either direction (added
 *      exports or removed exports) fails this test.
 *   2. @peac/kernel/package.json's dependencies, peerDependencies, and
 *      optionalDependencies do NOT contain @peac/registries, @peac/record-core,
 *      @peac/compat, or @peac/resolver-http.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as kernel from '@peac/kernel';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// v0.13.0 named-export baseline. Captured from packages/kernel/src/index.ts at
// commit 18939646 (v0.13.0 closeout). Adding or removing any name requires an
// explicit, reviewed change to this list AND a documented rationale.
const KERNEL_PUBLIC_EXPORT_BASELINE_V0_13_0 = [
  // Error categories
  'ERROR_CATEGORIES',
  // Constants
  'WIRE_TYPE',
  'WIRE_VERSION',
  'ALGORITHMS',
  'HEADERS',
  'POLICY',
  'ISSUER_CONFIG',
  'DISCOVERY',
  'JWKS',
  'RECEIPT',
  'LIMITS',
  'BUNDLE_VERSION',
  'VERIFICATION_REPORT_VERSION',
  'HASH',
  'parseHash',
  'formatHash',
  'isValidHash',
  'VERIFIER_LIMITS',
  'VERIFIER_NETWORK',
  'PRIVATE_IP_RANGES',
  'VERIFIER_POLICY_VERSION',
  'VERIFICATION_MODES',
  'CONSTANTS',
  'WIRE_01_JWS_TYP',
  'WIRE_02_JWS_TYP',
  'WIRE_02_JWS_TYP_ACCEPT',
  'WIRE_02_VERSION',
  'WIRE_VERSIONS',
  'ISS_CANONICAL',
  'TYPE_GRAMMAR',
  'POLICY_BLOCK',
  'OCCURRED_AT_TOLERANCE_SECONDS',
  'PEAC_ALG',
  'EXTENSION_BUDGET',
  // Errors
  'ERROR_CODES',
  'ERRORS',
  'BUNDLE_ERRORS',
  'DISPUTE_ERRORS',
  'getError',
  'isRetryable',
  // Registries
  'PAYMENT_RAILS',
  'CONTROL_ENGINES',
  'TRANSPORT_METHODS',
  'AGENT_PROTOCOLS',
  'PROOF_TYPES',
  'RECEIPT_TYPES',
  'EXTENSION_GROUPS',
  'PILLAR_VALUES',
  'TYPE_TO_EXTENSION_MAP',
  'REGISTRIES',
  'findPaymentRail',
  'findControlEngine',
  'findTransportMethod',
  'findAgentProtocol',
  'findProofType',
  'findReceiptType',
  'findExtensionGroup',
  // HTTP utilities
  'VARY_HEADERS',
  'applyPurposeVary',
  'getPeacVaryHeaders',
  'needsPurposeVary',
  // Carrier surface
  'PEAC_RECEIPT_HEADER',
  'PEAC_RECEIPT_URL_HEADER',
];

const PRIVATE_REBOOT_PACKAGE_NAMES = [
  '@peac/registries',
  '@peac/record-core',
  '@peac/compat',
  '@peac/resolver-http',
];

describe('@peac/kernel: public-surface stability', () => {
  it('runtime named exports match the v0.13.0 baseline (no additions, no removals)', () => {
    const actual = Object.keys(kernel).sort();
    const expected = [...KERNEL_PUBLIC_EXPORT_BASELINE_V0_13_0].sort();
    expect(actual).toEqual(expected);
  });

  it('package.json declares zero dependencies on workspace-private reboot packages', () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, 'packages', 'kernel', 'package.json'), 'utf8')
    ) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };

    for (const depKind of ['dependencies', 'peerDependencies', 'optionalDependencies'] as const) {
      const deps = pkg[depKind] ?? {};
      for (const reboot of PRIVATE_REBOOT_PACKAGE_NAMES) {
        expect(
          deps[reboot],
          `@peac/kernel.${depKind}.${reboot} must not be present`
        ).toBeUndefined();
      }
    }
  });

  it('source index.ts contains no @deprecated JSDoc on top-level exports', () => {
    // A compat-barrel concept was rejected for v0.13.1. Catch accidental
    // re-introduction by greping for @deprecated within an export statement.
    const indexSrc = readFileSync(join(ROOT, 'packages', 'kernel', 'src', 'index.ts'), 'utf8');
    // Comment lines marking exports as deprecated are out-of-policy in v0.13.1.
    // Existing inline comments like "// @deprecated - use POLICY instead" on
    // a re-export item (e.g., DISCOVERY) are allowed because they predate
    // v0.13.1 and only annotate. Adding a new @deprecated JSDoc block above
    // an export statement is what we forbid.
    const newDeprecatedJsdocBlock = /\/\*\*[\s\S]*?@deprecated[\s\S]*?\*\/\s*\n\s*export\b/m;
    expect(newDeprecatedJsdocBlock.test(indexSrc)).toBe(false);
  });
});
