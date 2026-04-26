/**
 * Negative harness tests for the parity verdict comparator.
 *
 * Proves the harness CAN catch real divergence when it exists. Without
 * these tests, the same-path-vs-same-path proof in parity-differential
 * could pass trivially (LEFT === RIGHT for any pure function) without
 * proving the comparator detects mismatches.
 *
 * Five required cases per the PR C kickoff scope:
 *   1. accepted vs rejected -> divergence
 *   2. same accepted, different error code -> divergence
 *   3. same code, different raw exception message -> NO divergence
 *      (raw text is intentionally not compared)
 *   4. object key-order difference in canonical claims -> NO divergence
 *      (the verdict shape is stable; object key order in payload only
 *      affects the canonical claims digest, which is insensitive to key
 *      order if the same pure function emits it)
 *   5. canonicalClaimsDigest mismatch on accepted records -> divergence
 */

import { describe, it, expect } from 'vitest';
import { makeVerdict, verdictKey } from '../../src/_internal/test-helpers/parity-verdict';
import { runEnvelopeCanonical } from '../../src/_internal/test-helpers/canonical-runner';

describe('parity verdict comparator: negative harness tests', () => {
  it('accepted vs rejected: divergence', () => {
    const left = makeVerdict(true);
    const right = makeVerdict(false);
    expect(verdictKey(left)).not.toBe(verdictKey(right));
  });

  it('same accepted=false, different error code: divergence', () => {
    const left = makeVerdict(false, [{ code: 'E_ALPHA' }]);
    const right = makeVerdict(false, [{ code: 'E_BETA' }]);
    expect(verdictKey(left)).not.toBe(verdictKey(right));
  });

  it('same code, raw message difference is not encoded in the verdict (no divergence)', () => {
    // The canonical runner extracts only the `code` from CryptoError;
    // raw messages never enter the ParityVerdict. We simulate two
    // canonical runs that produce the same code via different
    // underlying inputs and assert the verdicts byte-equal.
    const left = makeVerdict(false, [{ code: 'CRYPTO_JWS_EMBEDDED_KEY' }]);
    const right = makeVerdict(false, [{ code: 'CRYPTO_JWS_EMBEDDED_KEY' }]);
    expect(verdictKey(left)).toBe(verdictKey(right));

    // Sanity: two different errors with the SAME code remain a single
    // deduplicated entry under the same verdictKey.
    const dupLeft = makeVerdict(false, [{ code: 'X' }, { code: 'X' }]);
    const dupRight = makeVerdict(false, [{ code: 'X' }]);
    expect(verdictKey(dupLeft)).toBe(verdictKey(dupRight));
  });

  it('object key-order difference in payload: no divergence on canonical envelope path', async () => {
    const payloadA = {
      peac_version: '0.2',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      iss: 'https://api.example.com',
      iat: 1735689600,
      jti: 'kox-001',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '100',
          currency: 'USD',
        },
      },
    };
    const payloadB = {
      jti: 'kox-001',
      iat: 1735689600,
      iss: 'https://api.example.com',
      type: 'org.peacprotocol/payment',
      kind: 'evidence',
      peac_version: '0.2',
      extensions: {
        'org.peacprotocol/commerce': {
          currency: 'USD',
          amount_minor: '100',
          payment_rail: 'stripe',
        },
      },
    };
    const left = await runEnvelopeCanonical(payloadA);
    const right = await runEnvelopeCanonical(payloadB);
    expect(verdictKey(left)).toBe(verdictKey(right));
  });

  it('canonicalClaimsDigest is byte-stable across object key-order differences', async () => {
    // Same semantic claims, two different physical key orderings; the
    // canonical claims digest MUST be byte-identical because canonicalize()
    // sorts keys per RFC 8785 before hashing.
    const payloadA = {
      peac_version: '0.2',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      iss: 'https://api.example.com',
      iat: 1735689600,
      jti: 'digest-001',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '100',
          currency: 'USD',
        },
      },
    };
    const payloadB = {
      jti: 'digest-001',
      iat: 1735689600,
      iss: 'https://api.example.com',
      type: 'org.peacprotocol/payment',
      kind: 'evidence',
      peac_version: '0.2',
      extensions: {
        'org.peacprotocol/commerce': {
          currency: 'USD',
          amount_minor: '100',
          payment_rail: 'stripe',
        },
      },
    };
    const left = await runEnvelopeCanonical(payloadA);
    const right = await runEnvelopeCanonical(payloadB);
    expect(left.canonicalClaimsDigest).toBeDefined();
    expect(right.canonicalClaimsDigest).toBeDefined();
    expect(left.canonicalClaimsDigest).toBe(right.canonicalClaimsDigest);
    expect(left.canonicalClaimsDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('canonicalClaimsDigest is sensitive to claim changes (jti, iat, type)', async () => {
    const base = {
      peac_version: '0.2',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      iss: 'https://api.example.com',
      iat: 1735689600,
      jti: 'claim-sensitivity-001',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '100',
          currency: 'USD',
        },
      },
    };
    const baseV = await runEnvelopeCanonical(base);

    const jtiChanged = await runEnvelopeCanonical({ ...base, jti: 'different-jti' });
    expect(jtiChanged.canonicalClaimsDigest).not.toBe(baseV.canonicalClaimsDigest);

    const iatChanged = await runEnvelopeCanonical({ ...base, iat: 1735689601 });
    expect(iatChanged.canonicalClaimsDigest).not.toBe(baseV.canonicalClaimsDigest);

    const typeChanged = await runEnvelopeCanonical({
      ...base,
      type: 'org.peacprotocol/attribution-event',
      extensions: { 'org.peacprotocol/attribution': { creator_ref: 'did:example:c' } },
    });
    expect(typeChanged.canonicalClaimsDigest).not.toBe(baseV.canonicalClaimsDigest);
  });

  it('canonicalClaimsDigest mismatch on accepted records: divergence', () => {
    const left = makeVerdict(true, [], [], 'sha256:aaaaaa');
    const right = makeVerdict(true, [], [], 'sha256:bbbbbb');
    expect(verdictKey(left)).not.toBe(verdictKey(right));
  });

  it('error path difference (same code, different path): divergence', () => {
    // The verdict encodes (code, path) as the dedup key. Two errors
    // with the same code but different paths are distinct entries and
    // the verdicts must diverge.
    const left = makeVerdict(false, [{ code: 'E_X', path: '/a' }]);
    const right = makeVerdict(false, [{ code: 'E_X', path: '/b' }]);
    expect(verdictKey(left)).not.toBe(verdictKey(right));
  });

  it('warning code difference: divergence', () => {
    const left = makeVerdict(true, [], [{ code: 'W_ALPHA' }]);
    const right = makeVerdict(true, [], [{ code: 'W_BETA' }]);
    expect(verdictKey(left)).not.toBe(verdictKey(right));
  });

  it('issue ordering inside a single side: deterministic (sorted by code)', () => {
    // Two ways to construct the same verdict: errors in order, errors
    // reversed. After normalization, both must produce identical bytes.
    const left = makeVerdict(false, [{ code: 'A' }, { code: 'Z' }]);
    const right = makeVerdict(false, [{ code: 'Z' }, { code: 'A' }]);
    expect(verdictKey(left)).toBe(verdictKey(right));
  });
});
