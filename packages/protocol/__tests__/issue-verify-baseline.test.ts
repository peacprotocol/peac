/**
 * Public-API baseline snapshot.
 *
 * Per §6P-A P1 #A1 + §6P-B #3:
 *   - Snapshot decoded SEMANTIC claims (with clock-derived `iat` stripped)
 *     plus verifyLocal() RESULT-SHAPE (top-level keys, header structure,
 *     claims structure with stripped fields).
 *   - Whole-JWS-byte snapshots are flaky because issue() generates iat from
 *     Date.now() with no option override.
 *   - Pre-codec snapshots committed BEFORE codec injection on issue.ts /
 *     verify-local.ts. Post-codec assertion replays them byte-for-byte.
 *     Any difference is stop-the-line.
 *
 * Stable-field policy (§6P-B #3):
 *   - STRIP: `iat` (always; clock-derived, no override hook).
 *   - SUPPLY (so deterministic): `jti` (would be uuidv7() default), `occurred_at`.
 *   - NOT TESTED: Wire 0.1 frozen-legacy path (out of scope for PR B).
 *
 * The test exercises ONLY the current Wire 0.2 path
 * (`typ: interaction-record+jwt`).
 */

import { describe, it, expect } from 'vitest';
import { generateKeypairFromSeed } from '@peac/crypto/testkit';
import { issue, verifyLocal } from '../src/index.js';

const FIXED_SEED = new Uint8Array([
  // 32-byte deterministic seed for the baseline keypair. Random-looking but
  // hardcoded; the seed itself is committed to the test (no fixture file
  // dependency).
  0x91, 0x4b, 0x2e, 0x07, 0x59, 0xc1, 0xa0, 0xd4, 0x8f, 0x3a, 0x6e, 0x12, 0x77, 0xb8, 0x4d, 0x55,
  0x1c, 0x9f, 0x2e, 0xa3, 0x06, 0x44, 0xb1, 0x5d, 0x88, 0x29, 0x73, 0x4e, 0x55, 0xfa, 0x06, 0x12,
]);

const FIXED_KID = 'baseline-key-1';
const FIXED_JTI = '01940000-0000-7000-8000-000000000001';
const FIXED_OCCURRED_AT = '2026-04-01T00:00:00Z';
const FIXED_ISS = 'https://issuer.example';
// Use an UNREGISTERED type identifier so the baseline does not couple to
// the receipt-type registry's extension-group requirements (registered
// types like `org.peacprotocol/identity-attestation` require their
// extension group to be present, which would expand the baseline beyond
// codec-boundary scope).
//
// The verifyLocal() result for an unregistered type includes a stable
// `type_unregistered` warning. That warning is INTENTIONALLY pinned in
// the result-shape snapshot: it locks the warning-emission contract for
// unregistered types alongside the codec-injection invariant. If the
// registry adds this id later, this snapshot must be regenerated as a
// separate, audited change.
const FIXED_TYPE = 'org.example/baseline-test';
const FIXED_PURPOSE_DECLARED = 'baseline-fixture';

const STABLE_OPTIONS = {
  iss: FIXED_ISS,
  kind: 'evidence' as const,
  type: FIXED_TYPE,
  kid: FIXED_KID,
  jti: FIXED_JTI,
  occurred_at: FIXED_OCCURRED_AT,
  purpose_declared: FIXED_PURPOSE_DECLARED,
  pillars: ['safety'] as const,
};

/**
 * Strip clock-derived fields from a claims object.
 *
 * v0.13.1 strip policy: `iat` is always clock-derived in the Wire 0.2
 * issue path (no override hook); strip it.
 */
function stripUnstableFields(claims: Record<string, unknown>): Record<string, unknown> {
  const { iat, ...stable } = claims;
  void iat;
  return stable;
}

describe('issue() / verifyLocal(): public-API baseline (semantic + result-shape)', () => {
  it('semantic claims snapshot is byte-equal to the committed baseline', async () => {
    const { privateKey, publicKey } = await generateKeypairFromSeed(FIXED_SEED);

    const issued = await issue({
      ...STABLE_OPTIONS,
      pillars: [...STABLE_OPTIONS.pillars],
      privateKey,
    });

    const verified = await verifyLocal(issued.jws, publicKey);
    expect(verified.valid).toBe(true);

    const claims = verified.valid ? verified.claims : null;
    expect(claims).toBeTruthy();

    const stableClaims = stripUnstableFields(claims as Record<string, unknown>);

    // Snapshot the SEMANTIC claims (clock-stripped). Any drift in field
    // values from issue() / verifyLocal() (kind, type, iss, jti,
    // occurred_at, purpose_declared, pillars, peac_version) is caught
    // here. Drift in `iat` is intentionally not caught (clock-derived).
    await expect(stableClaims).toMatchFileSnapshot(
      './__snapshots__/issue-baseline-claims.snapshot.json'
    );
  });

  it('verifyLocal() result-shape snapshot is byte-equal to the committed baseline', async () => {
    const { privateKey, publicKey } = await generateKeypairFromSeed(FIXED_SEED);

    const issued = await issue({
      ...STABLE_OPTIONS,
      pillars: [...STABLE_OPTIONS.pillars],
      privateKey,
    });

    const verified = await verifyLocal(issued.jws, publicKey);

    // Result-shape: top-level keys, header structure, claims structure
    // (with iat stripped). Excludes the JWS string itself (which contains
    // signature bytes that depend on the secret key) and the iat field
    // (clock-derived).
    const shape: Record<string, unknown> = { ...verified };
    if (verified.valid && (shape as { claims?: Record<string, unknown> }).claims) {
      shape.claims = stripUnstableFields((shape as { claims: Record<string, unknown> }).claims);
    }
    if ('jws' in shape) {
      delete (shape as Record<string, unknown>).jws;
    }

    await expect(shape).toMatchFileSnapshot(
      './__snapshots__/issue-baseline-result-shape.snapshot.json'
    );
  });
});
