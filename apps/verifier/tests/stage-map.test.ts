/**
 * The canonical stage map must cover the REAL error union exactly.
 *
 * A regex or default branch would silently map an unrecognised code to the post-signature stage,
 * making the verifier assert "signature valid under supplied key" with no evidence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STAGE_BY_CODE, stageForCanonicalCode } from '../src/lib/stage-map.js';

/** Extract VerifyLocalErrorCode members from the real source of truth. */
function realUnionMembers(): string[] {
  const src = readFileSync(
    resolve(__dirname, '../../../packages/protocol/src/verify-local.ts'),
    'utf8'
  );
  const start = src.indexOf('export type VerifyLocalErrorCode');
  const end = src.indexOf(';', start);
  return [...src.slice(start, end).matchAll(/'([A-Z_0-9]+)'/g)].map((m) => m[1]);
}

describe('coverage against the real union', () => {
  it('maps every member, with no extras', () => {
    const real = new Set(realUnionMembers());
    const mapped = new Set(Object.keys(STAGE_BY_CODE));
    expect(real.size).toBeGreaterThan(20);
    expect([...real].filter((c) => !mapped.has(c))).toEqual([]);
    expect([...mapped].filter((c) => !real.has(c))).toEqual([]);
  });

  it('has no default branch: an unknown code returns undefined', () => {
    expect(stageForCanonicalCode('E_TOTALLY_NEW_CODE')).toBeUndefined();
  });
});

describe('stage assignment', () => {
  it('signature is the only signature-stage code', () => {
    const sig = Object.entries(STAGE_BY_CODE)
      .filter(([, v]) => v === 'signature')
      .map(([k]) => k);
    expect(sig).toEqual(['E_INVALID_SIGNATURE']);
  });

  it.each([
    'E_INVALID_FORMAT',
    'E_JWS_EMBEDDED_KEY',
    'E_JWS_CRIT_REJECTED',
    'E_JWS_MISSING_KID',
    'E_JWS_B64_REJECTED',
    'E_JWS_ZIP_REJECTED',
    'E_IJSON_DUPLICATE_MEMBER_NAME',
    'E_IJSON_NUMBER_OUT_OF_RANGE',
    'E_IJSON_INVALID_STRING',
    'E_WIRE_VERSION_MISMATCH',
    'E_UNSUPPORTED_WIRE_VERSION',
  ])('%s is pre-signature (the signature was never reached)', (code) => {
    expect(stageForCanonicalCode(code)).toBe('record_validation_pre_signature');
  });

  it.each([
    'E_CONSTRAINT_VIOLATION',
    'E_EXPIRED',
    'E_NOT_YET_VALID',
    'E_INVALID_ISSUER',
    'E_INVALID_AUDIENCE',
    'E_INVALID_SUBJECT',
    'E_INVALID_RECEIPT_ID',
    'E_MISSING_EXP',
    'E_OCCURRED_AT_FUTURE',
    'E_POLICY_BINDING_FAILED',
    'E_EXTENSION_GROUP_REQUIRED',
    'E_EXTENSION_GROUP_MISMATCH',
  ])('%s is post-signature (the signature verified first)', (code) => {
    expect(stageForCanonicalCode(code)).toBe('record_validation_post_signature');
  });

  it('E_INTERNAL is an internal error, never a validation verdict', () => {
    expect(stageForCanonicalCode('E_INTERNAL')).toBe('internal_error');
  });
});
