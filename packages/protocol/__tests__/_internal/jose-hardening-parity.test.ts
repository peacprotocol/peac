/**
 * Layer-isolated parity test: bounded internal JOSE header hardening
 * validator vs the canonical @peac/crypto.validateWire02Header.
 *
 * Compares the normalized {accepted, errorCode?} result byte-for-byte
 * across re-included header-hardening fixtures and a synthetic edge-
 * case set. Layer-isolated means: only the JOSE protected-header
 * hardening checks are exercised on either side; signature
 * verification, payload validation, kernel constraints, type-extension
 * mapping, temporal warnings, policy binding, and full compact-JWS
 * format/size checks are NOT in scope here.
 *
 * LEFT side: try { validateWire02Header(h) } catch (e) -> errorCode
 * RIGHT side: validateJoseHardeningInternal(h) -> result
 *
 * Order of checks (must match canonical first-hit semantics):
 *   1. kid presence/length
 *   2. embedded key material (jwk/x5c/x5u/jku)
 *   3. crit
 *   4. b64:false
 *   5. zip
 *
 * Any divergence is stop-the-line.
 */

import { describe, it, expect } from 'vitest';
import { validateWire02Header } from '@peac/crypto';
import {
  validateJoseHardeningInternal,
  type JoseHardeningInput,
  type JoseHardeningResult,
} from '../../src/_internal/record-core/validators';
import { loadFixtureManifest } from '../../src/_internal/test-helpers/fixture-manifest';

// ---------------------------------------------------------------------------
// LEFT (canonical) helper: catches CryptoError and projects to the
// normalized {accepted, errorCode?} shape
// ---------------------------------------------------------------------------

function runCanonicalJoseHardening(header: JoseHardeningInput): JoseHardeningResult {
  try {
    validateWire02Header(header);
    return { accepted: true };
  } catch (err) {
    const errAny = err as { code?: string };
    const errorCode = typeof errAny.code === 'string' ? errAny.code : 'CRYPTO_UNKNOWN';
    return { accepted: false, errorCode };
  }
}

function bothAgree(header: JoseHardeningInput): JoseHardeningResult {
  const left = runCanonicalJoseHardening(header);
  const right = validateJoseHardeningInternal(header);
  expect(right).toEqual(left);
  return left;
}

// ---------------------------------------------------------------------------
// Fixture-driven parity (re-included header-hardening fixtures)
// ---------------------------------------------------------------------------

const manifest = loadFixtureManifest();
const headerHardeningFixtures = manifest.included.filter(
  (e) => e.category === 'included_jose_header_hardening'
);

describe('jose-hardening parity (LEFT validateWire02Header vs RIGHT internal)', () => {
  it('manifest re-included at least one header-hardening fixture', () => {
    expect(headerHardeningFixtures.length).toBeGreaterThan(0);
  });

  describe('result byte-equal on every re-included fixture', () => {
    for (const entry of headerHardeningFixtures) {
      it(`${entry.source}/${entry.family}/${entry.id}: LEFT === RIGHT`, () => {
        bothAgree(entry.input);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Synthetic edge cases
// ---------------------------------------------------------------------------

const VALID_BASE = { alg: 'EdDSA', typ: 'interaction-record+jwt', kid: 'test-kid' } as const;

describe('jose-hardening edge cases (LEFT vs RIGHT)', () => {
  it('valid EdDSA header passes', () => {
    const r = bothAgree({ ...VALID_BASE });
    expect(r).toEqual({ accepted: true });
  });

  it('embedded jwk: CRYPTO_JWS_EMBEDDED_KEY', () => {
    const r = bothAgree({
      ...VALID_BASE,
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'sample-x' },
    });
    expect(r).toEqual({ accepted: false, errorCode: 'CRYPTO_JWS_EMBEDDED_KEY' });
  });

  it('embedded x5c: CRYPTO_JWS_EMBEDDED_KEY', () => {
    const r = bothAgree({ ...VALID_BASE, x5c: ['MIIBkTCB-EXAMPLE'] });
    expect(r).toEqual({ accepted: false, errorCode: 'CRYPTO_JWS_EMBEDDED_KEY' });
  });

  it('embedded x5u: CRYPTO_JWS_EMBEDDED_KEY', () => {
    const r = bothAgree({ ...VALID_BASE, x5u: 'https://example.com/cert.pem' });
    expect(r).toEqual({ accepted: false, errorCode: 'CRYPTO_JWS_EMBEDDED_KEY' });
  });

  it('embedded jku: CRYPTO_JWS_EMBEDDED_KEY', () => {
    const r = bothAgree({ ...VALID_BASE, jku: 'https://example.com/jwks.json' });
    expect(r).toEqual({ accepted: false, errorCode: 'CRYPTO_JWS_EMBEDDED_KEY' });
  });

  it('crit set: CRYPTO_JWS_CRIT_REJECTED', () => {
    const r = bothAgree({ ...VALID_BASE, crit: ['x-custom'] });
    expect(r).toEqual({ accepted: false, errorCode: 'CRYPTO_JWS_CRIT_REJECTED' });
  });

  it('b64:false: CRYPTO_JWS_B64_REJECTED', () => {
    const r = bothAgree({ ...VALID_BASE, b64: false });
    expect(r).toEqual({ accepted: false, errorCode: 'CRYPTO_JWS_B64_REJECTED' });
  });

  it('b64:true is not rejected (only the boolean false is rejected)', () => {
    // Sanity: per validateWire02Header, the explicit b64=false is the
    // only unencoded-payload trigger; true / undefined / other values
    // pass the b64 check.
    const r = bothAgree({ ...VALID_BASE, b64: true });
    expect(r).toEqual({ accepted: true });
  });

  it('zip set: CRYPTO_JWS_ZIP_REJECTED', () => {
    const r = bothAgree({ ...VALID_BASE, zip: 'DEF' });
    expect(r).toEqual({ accepted: false, errorCode: 'CRYPTO_JWS_ZIP_REJECTED' });
  });

  it('missing kid: CRYPTO_JWS_MISSING_KID', () => {
    const { alg, typ } = VALID_BASE;
    const r = bothAgree({ alg, typ });
    expect(r).toEqual({ accepted: false, errorCode: 'CRYPTO_JWS_MISSING_KID' });
  });

  it('empty kid: CRYPTO_JWS_MISSING_KID', () => {
    const r = bothAgree({ ...VALID_BASE, kid: '' });
    expect(r).toEqual({ accepted: false, errorCode: 'CRYPTO_JWS_MISSING_KID' });
  });

  it('kid exactly at max length (256 chars) accepted', () => {
    const r = bothAgree({ ...VALID_BASE, kid: 'k'.repeat(256) });
    expect(r).toEqual({ accepted: true });
  });

  it('kid one over max length (257 chars): CRYPTO_JWS_MISSING_KID', () => {
    const r = bothAgree({ ...VALID_BASE, kid: 'k'.repeat(257) });
    expect(r).toEqual({ accepted: false, errorCode: 'CRYPTO_JWS_MISSING_KID' });
  });

  it('non-string kid (number): CRYPTO_JWS_MISSING_KID', () => {
    const r = bothAgree({ ...VALID_BASE, kid: 12345 });
    expect(r).toEqual({ accepted: false, errorCode: 'CRYPTO_JWS_MISSING_KID' });
  });

  it('first-hit ordering: kid check fires before embedded-key check', () => {
    // Both kid (missing) and jwk (embedded) are wrong; canonical
    // returns kid first because it is the first check in the chain.
    const r = bothAgree({
      alg: 'EdDSA',
      typ: 'interaction-record+jwt',
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'sample-x' },
    });
    expect(r).toEqual({ accepted: false, errorCode: 'CRYPTO_JWS_MISSING_KID' });
  });

  it('first-hit ordering: embedded-key check fires before crit check', () => {
    const r = bothAgree({
      ...VALID_BASE,
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'sample-x' },
      crit: ['x-flag'],
    });
    expect(r).toEqual({ accepted: false, errorCode: 'CRYPTO_JWS_EMBEDDED_KEY' });
  });

  it('first-hit ordering: crit check fires before b64 check', () => {
    const r = bothAgree({ ...VALID_BASE, crit: ['x-flag'], b64: false });
    expect(r).toEqual({ accepted: false, errorCode: 'CRYPTO_JWS_CRIT_REJECTED' });
  });

  it('first-hit ordering: b64 check fires before zip check', () => {
    const r = bothAgree({ ...VALID_BASE, b64: false, zip: 'DEF' });
    expect(r).toEqual({ accepted: false, errorCode: 'CRYPTO_JWS_B64_REJECTED' });
  });
});
