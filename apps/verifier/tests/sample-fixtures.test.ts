/**
 * The committed sample fixtures under apps/verifier/samples/ back the "Try it" walkthrough in the
 * README. They are static (public key material only, no private key) so a record can be verified
 * without generating one. This test runs each fixture
 * through the actual verification pipeline so the fixtures cannot silently rot: the valid record is
 * accepted, the tampered record is rejected at the signature, and the trust context distinguishes a
 * matched from a mismatched trusted key.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeLocalVerifier } from '../src/verify.js';
import { DEFAULT_MAX_CLOCK_SKEW_SECONDS } from '../src/lib/limits.js';

function sample(name: string): string {
  // Read exactly; the verifier rejects surrounding whitespace rather than trimming it, so the
  // fixtures must be byte-exact and this test proves they are.
  return readFileSync(new URL(`../samples/${name}`, import.meta.url), 'utf8');
}

const record = sample('record.jws');
const tampered = sample('record-tampered.jws');
const keyDocument = sample('key.jwk.json');
const contextTrustMatch = sample('context-trust-match.json');
const contextTrustMismatch = sample('context-trust-mismatch.json');

// The record has no expiry (Wire 0.2), and its iat predates any later run, so a current evaluation
// time accepts it indefinitely.
const evaluationTimeUnixSeconds = Math.floor(Date.now() / 1000);
const base = { evaluationTimeUnixSeconds, maxClockSkewSeconds: DEFAULT_MAX_CLOCK_SKEW_SECONDS };

const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });

describe('committed sample fixtures back the public verifier walkthrough', () => {
  it('the sample record verifies under its key (integrity-only)', async () => {
    const r = await verifier.verify({ record, keyDocument, ...base });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe('integrity-only');
  });

  it('the tampered sample record is rejected at the signature', async () => {
    const r = await verifier.verify({ record: tampered, keyDocument, ...base });
    expect(r.ok).toBe(false);
    if (!r.ok && 'code' in r) expect(r.code).toBe('E_INVALID_SIGNATURE');
  });

  it('the trust-match context yields the trusted-key mode', async () => {
    const r = await verifier.verify({
      record,
      keyDocument,
      contextDocument: contextTrustMatch,
      ...base,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe('trusted-key');
  });

  it('the trust-mismatch context is rejected at the trusted-key stage', async () => {
    const r = await verifier.verify({
      record,
      keyDocument,
      contextDocument: contextTrustMismatch,
      ...base,
    });
    expect(r.ok).toBe(false);
    if (!r.ok && 'failureStage' in r) {
      expect(r.failureStage).toBe('trusted_key');
      expect(r.code).toBe('E_VERIFIER_TRUSTED_KEY_MISMATCH');
    }
  });
});
