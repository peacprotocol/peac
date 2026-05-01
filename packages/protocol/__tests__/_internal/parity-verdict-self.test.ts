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
import {
  makeVerdict,
  verdictKey,
  verdictKeyErrorClass,
  type ParityVerdict,
} from '../../src/_internal/test-helpers/parity-verdict';
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

describe('verdictKeyErrorClass: error-class-equivalent comparison semantics', () => {
  // Construct verdicts literally (bypassing makeVerdict's dedup) so the
  // multiset semantics are preserved through the comparator. The helper
  // operates on the verdict's `.errors` array as given.
  function rawVerdict(
    accepted: boolean,
    errors: Array<{ code: string; path?: string }> = [],
    warnings: Array<{ code: string; path?: string }> = [],
    canonicalClaimsDigest?: string
  ): ParityVerdict {
    const verdict: ParityVerdict = {
      accepted,
      errors,
      warnings,
    };
    if (canonicalClaimsDigest !== undefined) {
      return { ...verdict, canonicalClaimsDigest };
    }
    return verdict;
  }

  it('same error codes in different order: equal key', () => {
    const left = rawVerdict(false, [{ code: 'E_ALPHA' }, { code: 'E_BETA' }, { code: 'E_GAMMA' }]);
    const right = rawVerdict(false, [{ code: 'E_GAMMA' }, { code: 'E_ALPHA' }, { code: 'E_BETA' }]);
    expect(verdictKeyErrorClass(left)).toBe(verdictKeyErrorClass(right));
  });

  it('duplicate code counts are preserved (multiset, no dedup)', () => {
    const single = rawVerdict(false, [{ code: 'E_DUP' }]);
    const triple = rawVerdict(false, [{ code: 'E_DUP' }, { code: 'E_DUP' }, { code: 'E_DUP' }]);
    expect(verdictKeyErrorClass(single)).not.toBe(verdictKeyErrorClass(triple));

    const tripleReordered = rawVerdict(false, [
      { code: 'E_DUP' },
      { code: 'E_DUP' },
      { code: 'E_DUP' },
    ]);
    expect(verdictKeyErrorClass(triple)).toBe(verdictKeyErrorClass(tripleReordered));
  });

  it('different duplicate counts of the same code: divergence', () => {
    const two = rawVerdict(false, [{ code: 'E_X' }, { code: 'E_X' }]);
    const three = rawVerdict(false, [{ code: 'E_X' }, { code: 'E_X' }, { code: 'E_X' }]);
    expect(verdictKeyErrorClass(two)).not.toBe(verdictKeyErrorClass(three));
  });

  it('different accepted value: divergence even with identical error sets', () => {
    const accepted = rawVerdict(true, [{ code: 'E_Y' }]);
    const rejected = rawVerdict(false, [{ code: 'E_Y' }]);
    expect(verdictKeyErrorClass(accepted)).not.toBe(verdictKeyErrorClass(rejected));
  });

  it('path differences do not affect the key (path is ignored)', () => {
    const left = rawVerdict(false, [{ code: 'E_PATH', path: '/a' }]);
    const right = rawVerdict(false, [{ code: 'E_PATH', path: '/b' }]);
    expect(verdictKeyErrorClass(left)).toBe(verdictKeyErrorClass(right));

    const noPath = rawVerdict(false, [{ code: 'E_PATH' }]);
    expect(verdictKeyErrorClass(left)).toBe(verdictKeyErrorClass(noPath));
  });

  it('warning differences do not affect the key (warnings are ignored)', () => {
    const noWarn = rawVerdict(true, [], []);
    const oneWarn = rawVerdict(true, [], [{ code: 'W_X' }]);
    const manyWarn = rawVerdict(true, [], [{ code: 'W_X' }, { code: 'W_Y', path: '/p' }]);
    expect(verdictKeyErrorClass(noWarn)).toBe(verdictKeyErrorClass(oneWarn));
    expect(verdictKeyErrorClass(noWarn)).toBe(verdictKeyErrorClass(manyWarn));
  });

  it('canonicalClaimsDigest does not affect the key (digest is ignored)', () => {
    const noDigest = rawVerdict(true, [], []);
    const withDigest = rawVerdict(true, [], [], 'sha256:aaaaaa');
    const otherDigest = rawVerdict(true, [], [], 'sha256:bbbbbb');
    expect(verdictKeyErrorClass(noDigest)).toBe(verdictKeyErrorClass(withDigest));
    expect(verdictKeyErrorClass(withDigest)).toBe(verdictKeyErrorClass(otherDigest));
  });

  it('different error codes: divergence', () => {
    const left = rawVerdict(false, [{ code: 'E_ALPHA' }]);
    const right = rawVerdict(false, [{ code: 'E_BETA' }]);
    expect(verdictKeyErrorClass(left)).not.toBe(verdictKeyErrorClass(right));
  });

  it('output is stable JSON with sorted errorCodes field', () => {
    const v = rawVerdict(false, [{ code: 'C' }, { code: 'A' }, { code: 'B' }, { code: 'A' }]);
    const key = verdictKeyErrorClass(v);
    expect(key).toBe(JSON.stringify({ accepted: false, errorCodes: ['A', 'A', 'B', 'C'] }));
  });

  it('empty errors: stable encoding', () => {
    const accepted = rawVerdict(true, [], []);
    const rejected = rawVerdict(false, [], []);
    expect(verdictKeyErrorClass(accepted)).toBe(JSON.stringify({ accepted: true, errorCodes: [] }));
    expect(verdictKeyErrorClass(rejected)).toBe(
      JSON.stringify({ accepted: false, errorCodes: [] })
    );
  });
});
