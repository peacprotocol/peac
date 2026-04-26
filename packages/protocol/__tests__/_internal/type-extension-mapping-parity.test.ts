/**
 * Layer-isolated parity test: bounded internal type-extension mapping
 * validator vs the canonical type/extension warning emission in
 * verify-local.ts:477-540 (interop strictness branch).
 *
 * Compares the normalized warning list (code + pointer only) byte-for-
 * byte across re-included wire-02 warning fixtures and a synthetic
 * edge-case set. Layer-isolated means: only the type/extension mapping
 * warning surface is exercised on either side; kernel constraints,
 * JOSE hardening, temporal warnings (occurred_at_skew), strictness
 * (typ_missing), policy binding, and full-JWS verification are NOT in
 * scope here.
 *
 * LEFT side: an inline canonical helper that calls the existing
 * exported pieces (REGISTERED_RECEIPT_TYPES, isValidExtensionKey,
 * checkTypeExtensionMapping, TYPE_TO_EXTENSION_MAP) in the same order
 * verify-local.ts emits warnings.
 *
 * RIGHT side: validateTypeExtensionMappingInternal from the bounded
 * validator module.
 *
 * Both sides return { code, pointer } only. The canonical emission also
 * carries `message`; messages are intentionally omitted because the
 * extension_group_missing/mismatch messages embed claim values and the
 * comparison is on the (code, pointer) shape that downstream consumers
 * rely on.
 *
 * Any divergence is stop-the-line.
 */

import { describe, it, expect } from 'vitest';
import {
  REGISTERED_EXTENSION_GROUP_KEYS,
  REGISTERED_RECEIPT_TYPES,
  WARNING_EXTENSION_GROUP_MISMATCH,
  WARNING_EXTENSION_GROUP_MISSING,
  WARNING_TYPE_UNREGISTERED,
  WARNING_UNKNOWN_EXTENSION,
  isValidExtensionKey,
} from '@peac/schema';
import { TYPE_TO_EXTENSION_MAP } from '@peac/kernel';
import { checkTypeExtensionMapping } from '../../src/type-extension-check';
import {
  validateTypeExtensionMappingInternal,
  type TypeExtensionMappingInput,
  type TypeExtensionMappingWarning,
} from '../../src/_internal/record-core/validators';
import { loadFixtureManifest } from '../../src/_internal/test-helpers/fixture-manifest';

// ---------------------------------------------------------------------------
// LEFT (canonical) helper — calls existing exported pieces in the same
// order as verify-local.ts:477-540 interop branch
// ---------------------------------------------------------------------------

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function runCanonicalTypeExtensionMapping(
  input: TypeExtensionMappingInput
): TypeExtensionMappingWarning[] {
  const warnings: TypeExtensionMappingWarning[] = [];

  if (!REGISTERED_RECEIPT_TYPES.has(input.type)) {
    warnings.push({ code: WARNING_TYPE_UNREGISTERED, pointer: '/type' });
  }

  if (input.extensions !== undefined) {
    for (const key of Object.keys(input.extensions)) {
      if (!REGISTERED_EXTENSION_GROUP_KEYS.has(key) && isValidExtensionKey(key)) {
        warnings.push({
          code: WARNING_UNKNOWN_EXTENSION,
          pointer: `/extensions/${escapeJsonPointerSegment(key)}`,
        });
      }
    }
  }

  const typeExtCheck = checkTypeExtensionMapping(
    input.kind,
    input.type,
    input.extensions,
    TYPE_TO_EXTENSION_MAP,
    REGISTERED_EXTENSION_GROUP_KEYS
  );
  if (typeExtCheck.status === 'missing') {
    warnings.push({ code: WARNING_EXTENSION_GROUP_MISSING, pointer: '/type' });
  } else if (typeExtCheck.status === 'mismatch') {
    warnings.push({ code: WARNING_EXTENSION_GROUP_MISMATCH, pointer: '/type' });
  }

  return warnings;
}

function bothAgree(input: TypeExtensionMappingInput): TypeExtensionMappingWarning[] {
  const left = runCanonicalTypeExtensionMapping(input);
  const right = validateTypeExtensionMappingInternal(input);
  expect(right).toEqual(left);
  return left;
}

function inputFromClaims(claims: Record<string, unknown>): TypeExtensionMappingInput {
  return {
    kind: typeof claims.kind === 'string' ? claims.kind : '',
    type: typeof claims.type === 'string' ? claims.type : '',
    extensions:
      claims.extensions && typeof claims.extensions === 'object'
        ? (claims.extensions as Record<string, unknown>)
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Fixture-driven parity (re-included type-extension warning fixtures)
// ---------------------------------------------------------------------------

const manifest = loadFixtureManifest();
const typeExtMappingFixtures = manifest.included.filter(
  (e) => e.category === 'included_type_extension_mapping_warning'
);

describe('type-extension mapping parity (LEFT canonical vs RIGHT internal)', () => {
  it('manifest re-included at least one type-extension mapping warning fixture', () => {
    expect(typeExtMappingFixtures.length).toBeGreaterThan(0);
  });

  describe('warning list byte-equal on every re-included fixture', () => {
    for (const entry of typeExtMappingFixtures) {
      it(`${entry.source}/${entry.family}/${entry.id}: LEFT === RIGHT`, () => {
        bothAgree(inputFromClaims(entry.input));
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Synthetic edge cases
// ---------------------------------------------------------------------------

describe('type-extension mapping edge cases (LEFT vs RIGHT)', () => {
  it('registered type + matching registered extension: no warning', () => {
    const w = bothAgree({
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '100',
          currency: 'USD',
        },
      },
    });
    expect(w).toEqual([]);
  });

  it('unregistered type: emits type_unregistered', () => {
    const w = bothAgree({
      kind: 'evidence',
      type: 'com.example.custom/event',
    });
    expect(w).toEqual([{ code: WARNING_TYPE_UNREGISTERED, pointer: '/type' }]);
  });

  it('unknown extension key: emits unknown_extension_preserved with escaped pointer', () => {
    const w = bothAgree({
      kind: 'evidence',
      type: 'com.example.custom/event',
      extensions: { 'com.example/custom-data': { ok: true } },
    });
    expect(w).toEqual([
      { code: WARNING_TYPE_UNREGISTERED, pointer: '/type' },
      {
        code: WARNING_UNKNOWN_EXTENSION,
        pointer: '/extensions/com.example~1custom-data',
      },
    ]);
  });

  it('registered type missing required extension group: emits extension_group_missing', () => {
    // org.peacprotocol/payment maps to org.peacprotocol/commerce.
    // Empty extensions => missing.
    const w = bothAgree({
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {},
    });
    expect(w).toEqual([{ code: WARNING_EXTENSION_GROUP_MISSING, pointer: '/type' }]);
  });

  it('registered type with wrong registered extension group: emits extension_group_mismatch', () => {
    // org.peacprotocol/payment maps to org.peacprotocol/commerce; we
    // supply org.peacprotocol/attribution instead (a different
    // registered group), which canonical classifies as mismatch.
    const w = bothAgree({
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/attribution': { creator_ref: 'did:example:c' },
      },
    });
    expect(w).toEqual([{ code: WARNING_EXTENSION_GROUP_MISMATCH, pointer: '/type' }]);
  });

  it('no extensions object on a registered type with mapped group: emits extension_group_missing', () => {
    const w = bothAgree({
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
    });
    expect(w).toEqual([{ code: WARNING_EXTENSION_GROUP_MISSING, pointer: '/type' }]);
  });

  it('challenge kind with mapped registered type but no extension: skipped (no missing/mismatch)', () => {
    const w = bothAgree({
      kind: 'challenge',
      type: 'org.peacprotocol/payment',
    });
    expect(w).toEqual([]);
  });

  it('multiple unknown extensions emit warnings in object-key iteration order', () => {
    const w = bothAgree({
      kind: 'evidence',
      type: 'com.example.custom/event',
      extensions: {
        'com.example/alpha': { a: 1 },
        'com.example/beta': { b: 2 },
        'com.example/gamma': { c: 3 },
      },
    });
    expect(w).toEqual([
      { code: WARNING_TYPE_UNREGISTERED, pointer: '/type' },
      { code: WARNING_UNKNOWN_EXTENSION, pointer: '/extensions/com.example~1alpha' },
      { code: WARNING_UNKNOWN_EXTENSION, pointer: '/extensions/com.example~1beta' },
      { code: WARNING_UNKNOWN_EXTENSION, pointer: '/extensions/com.example~1gamma' },
    ]);
  });

  it('combined unregistered type + unknown extension: emission order matches verify-local.ts (type first, then extension keys)', () => {
    const w = bothAgree({
      kind: 'evidence',
      type: 'com.example.custom/event',
      extensions: { 'com.example/data': { v: 1 } },
    });
    expect(w[0]?.code).toBe(WARNING_TYPE_UNREGISTERED);
    expect(w[1]?.code).toBe(WARNING_UNKNOWN_EXTENSION);
  });

  it('registered type + matching extension + extra unknown extension: emits unknown_extension_preserved only', () => {
    const w = bothAgree({
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '100',
          currency: 'USD',
        },
        'com.example/extra': { v: 1 },
      },
    });
    expect(w).toEqual([
      { code: WARNING_UNKNOWN_EXTENSION, pointer: '/extensions/com.example~1extra' },
    ]);
  });

  it('challenge kind with unregistered type: emits type_unregistered (not skipped at this layer)', () => {
    const w = bothAgree({
      kind: 'challenge',
      type: 'com.example.custom/event',
    });
    expect(w).toEqual([{ code: WARNING_TYPE_UNREGISTERED, pointer: '/type' }]);
  });

  it('unmapped (custom) type + unregistered extension: no extension_group warnings (only the two preserve warnings)', () => {
    const w = bothAgree({
      kind: 'evidence',
      type: 'com.example.custom/event',
      extensions: { 'com.example/data': { v: 1 } },
    });
    // Two warnings: type_unregistered + unknown_extension_preserved.
    // checkTypeExtensionMapping returns 'skip' (unmapped type), so no
    // extension_group_missing/mismatch.
    expect(w.find((e) => e.code === WARNING_EXTENSION_GROUP_MISSING)).toBeUndefined();
    expect(w.find((e) => e.code === WARNING_EXTENSION_GROUP_MISMATCH)).toBeUndefined();
  });
});
