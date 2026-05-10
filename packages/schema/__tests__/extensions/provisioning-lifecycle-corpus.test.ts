/**
 * provisioning-lifecycle parity-corpus validity test.
 *
 * The shipped parity corpus carries 29 vectors. Every vector is
 * envelope-accepted (`expected.accepted = true`). Negative vectors
 * additionally declare `expected.errors[]` carrying the stable code
 * under `provisioning.*` that `validateProvisioningLifecycle` must
 * emit for that vector's extension content. This test reads
 * `expected.errors[]` directly from `vectors.json`; there is no
 * TypeScript-only mapping that would make the corpus less portable
 * to cross-language consumers.
 *
 *   - Positive vectors (`pl-NNN-...`): `expected.errors` is absent;
 *     `validateProvisioningLifecycle` must return `{ ok: true, ... }`.
 *     The 10 positive vectors cover all 10 `*-observed` event families.
 *   - Negative vectors (`pl-nNN-...`): `expected.errors[0].code`
 *     declares the stable provisioning.* code;
 *     `validateProvisioningLifecycle` must return `{ ok: false, ... }`
 *     with that code present in the result. The 19 negative vectors
 *     cover 19 validator-emitted error codes.
 *
 * Two stable codes are intentionally not exercised by corpus vectors
 * and are covered by the schema unit tests at
 * `provisioning-lifecycle.test.ts` instead:
 *   - `provisioning.invalid_utf8` (fixture-loader-only).
 *   - `provisioning.structure_too_deep` (kernel and extension walker
 *     share the same depth cap; round-tripping the rejection through
 *     parity-vector comparison is path-sensitive and brittle).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PROVISIONING_LIFECYCLE_EXTENSION_KEY,
  PROVISIONING_LIFECYCLE_TYPE_URIS,
  validateProvisioningLifecycle,
} from '../../src/extensions/provisioning-lifecycle';

interface ParityVector {
  id: string;
  description: string;
  input: { payload: Record<string, unknown> };
  expected: {
    accepted: boolean;
    errors?: Array<{ code: string; path?: string }>;
  };
}

interface ParityCorpus {
  family: string;
  description: string;
  version: string;
  generator?: string;
  vectors: ParityVector[];
}

const CORPUS_PATH = resolve(
  __dirname,
  '../../../../specs/conformance/parity-corpus/provisioning-lifecycle/vectors.json'
);

const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf-8')) as ParityCorpus;

const POSITIVE_VECTORS = corpus.vectors.filter((v) => !v.id.startsWith('pl-n'));
const NEGATIVE_VECTORS = corpus.vectors.filter((v) => v.id.startsWith('pl-n'));

/** Codes that must be exercised by at least one negative vector. The
 * `provisioning.invalid_utf8` and `provisioning.structure_too_deep`
 * codes are covered by schema unit tests; see file header. */
const EXPECTED_CORPUS_COVERAGE_CODES: ReadonlyArray<string> = [
  'provisioning.inline_credential_blocked',
  'provisioning.opaque_ref_grammar_violation',
  'provisioning.token_material_blocked',
  'provisioning.forbidden_key_name',
  'provisioning.invalid_storage_surface',
  'provisioning.invalid_material_redaction',
  'provisioning.invalid_event_kind',
  'provisioning.invalid_sub_event',
  'provisioning.invalid_scheme_id',
  'provisioning.unrecognized_field',
  'provisioning.invalid_amount_minor',
  'provisioning.invalid_observed_at',
  'provisioning.invalid_retrieved_at',
  'provisioning.invalid_expires_at',
  'provisioning.invalid_currency',
  'provisioning.field_too_large',
  'provisioning.replacement_character_in_string',
  'provisioning.structure_too_large',
  'provisioning.missing_required_field',
];

function extensionOf(v: ParityVector): unknown {
  const extensions = v.input.payload.extensions as Record<string, unknown>;
  return extensions[PROVISIONING_LIFECYCLE_EXTENSION_KEY];
}

function declaredCodesOf(v: ParityVector): string[] {
  return (v.expected.errors ?? []).map((e) => e.code);
}

describe('provisioning-lifecycle parity corpus shape and counts', () => {
  it('declares family = provisioning-lifecycle', () => {
    expect(corpus.family).toBe('provisioning-lifecycle');
  });

  it('contains at least 29 vectors total', () => {
    expect(corpus.vectors.length).toBeGreaterThanOrEqual(29);
  });

  it('every vector is envelope-accepted (expected.accepted = true)', () => {
    for (const v of corpus.vectors) {
      expect(v.expected.accepted, `vector ${v.id} declared expected.accepted=false`).toBe(true);
    }
  });

  it('contains 10 positive vectors covering all 10 event_kind values', () => {
    expect(POSITIVE_VECTORS.length).toBe(10);
    const seen = new Set<string>();
    for (const v of POSITIVE_VECTORS) {
      const ext = extensionOf(v) as Record<string, unknown>;
      seen.add(ext.event_kind as string);
    }
    expect(seen.size).toBe(PROVISIONING_LIFECYCLE_TYPE_URIS.length);
  });

  it('contains 19 negative vectors and each declares exactly one provisioning.* code', () => {
    expect(NEGATIVE_VECTORS.length).toBe(19);
    for (const v of NEGATIVE_VECTORS) {
      const codes = declaredCodesOf(v);
      expect(codes.length, `vector ${v.id} declared ${codes.length} codes; expected 1`).toBe(1);
      expect(
        codes[0].startsWith('provisioning.'),
        `vector ${v.id} declared non-provisioning code ${codes[0]}`
      ).toBe(true);
    }
  });

  it('positive vectors do not declare expected.errors', () => {
    for (const v of POSITIVE_VECTORS) {
      expect(declaredCodesOf(v).length, `vector ${v.id} unexpectedly declared errors`).toBe(0);
    }
  });

  it('every vector id is unique', () => {
    const ids = corpus.vectors.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every payload is wrapped in a Wire 0.2 claims envelope', () => {
    for (const v of corpus.vectors) {
      expect(v.input.payload.peac_version).toBe('0.2');
      expect(v.input.payload.kind).toBe('evidence');
      const extensions = v.input.payload.extensions as Record<string, unknown>;
      expect(extensions[PROVISIONING_LIFECYCLE_EXTENSION_KEY]).toBeDefined();
    }
  });
});

describe('provisioning-lifecycle parity corpus: positive vectors validate', () => {
  for (const v of POSITIVE_VECTORS) {
    it(`${v.id}: validateProvisioningLifecycle returns ok=true`, () => {
      const result = validateProvisioningLifecycle(extensionOf(v));
      if (!result.ok) {
        const summary = result.errors
          .map((e) => `${e.code}${e.path ? ` (${e.path})` : ''}: ${e.message}`)
          .join('\n  ');
        throw new Error(`vector ${v.id} expected positive but rejected:\n  ${summary}`);
      }
      expect(result.ok).toBe(true);
    });
  }
});

describe('provisioning-lifecycle parity corpus: negative vectors reject with the declared code', () => {
  for (const v of NEGATIVE_VECTORS) {
    const declared = declaredCodesOf(v);
    const expectedCode = declared[0];
    it(`${v.id}: validateProvisioningLifecycle emits ${expectedCode}`, () => {
      const result = validateProvisioningLifecycle(extensionOf(v));
      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      const seenCodes = result.errors.map((e) => e.code);
      expect(
        seenCodes,
        `vector ${v.id} expected error code ${expectedCode} not found in [${seenCodes.join(', ')}]`
      ).toContain(expectedCode);
    });
  }
});

describe('provisioning-lifecycle parity corpus: full code coverage of validator-emitted codes', () => {
  it('every validator-emitted stable code (except invalid_utf8 and structure_too_deep) is exercised by at least one negative vector', () => {
    const exercisedCodes = new Set<string>();
    for (const v of NEGATIVE_VECTORS) {
      for (const code of declaredCodesOf(v)) {
        exercisedCodes.add(code);
      }
    }
    for (const code of EXPECTED_CORPUS_COVERAGE_CODES) {
      expect(
        exercisedCodes,
        `expected at least one negative vector to declare error code ${code}`
      ).toContain(code);
    }
  });
});
