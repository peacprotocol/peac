/**
 * Defensive paths that coverage showed were never exercised.
 *
 * An untested defensive throw is indistinguishable from a dead one. Each case below was first
 * checked for REACHABILITY, then pinned. Nothing here is a coverage-percentage exercise: a branch
 * that could not be reached would have been deleted, not tested.
 */
import { describe, it, expect } from 'vitest';
import { readProtectedKidForRouting } from '../src/lib/protected-kid.js';
import { parseStrictJsonText } from '../src/lib/strict-json.js';
import { parseVerificationContext } from '../src/lib/context.js';
import { initializeLocalVerifier } from '../src/verify.js';
import { MAX_RECORD_BYTES } from '../src/lib/limits.js';
import { makeFixture } from './helpers/fixtures.js';

const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect((e as { code: string }).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}, nothing was thrown`);
}

async function expectCodeAsync(fn: () => Promise<unknown>, code: string) {
  try {
    await fn();
  } catch (e) {
    expect((e as { code: string }).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}, nothing was thrown`);
}

describe('protected-header routing: defensive branches', () => {
  it('rejects a header segment whose length makes base64url undecodable', () => {
    // Passes the charset check, fails atob: length 1 (mod 4 === 1) is not a valid base64 length.
    expectCode(
      () => readProtectedKidForRouting('A.eyJhIjoxfQ.c2ln'),
      'E_VERIFIER_RECORD_MALFORMED'
    );
  });

  it('rejects a header that decodes to text that is not JSON', () => {
    expectCode(
      () => readProtectedKidForRouting(`${b64url('not json at all')}.eyJhIjoxfQ.c2ln`),
      'E_VERIFIER_RECORD_MALFORMED'
    );
  });

  it('rejects a header that is valid JSON but not an object', () => {
    for (const notObject of ['[1,2,3]', '"a string"', '42', 'null', 'true']) {
      expectCode(
        () => readProtectedKidForRouting(`${b64url(notObject)}.eyJhIjoxfQ.c2ln`),
        'E_VERIFIER_RECORD_MALFORMED'
      );
    }
  });

  it('rejects a non-string or empty kid', () => {
    for (const kid of ['123', 'null', 'true', '["k1"]', '{"a":1}', '""']) {
      const header = `{"alg":"EdDSA","kid":${kid}}`;
      expectCode(
        () => readProtectedKidForRouting(`${b64url(header)}.eyJhIjoxfQ.c2ln`),
        'E_VERIFIER_KID_INVALID'
      );
    }
  });
});

describe('strict JSON: defensive branches', () => {
  it('rejects an unpaired LOW surrogate', () => {
    // The high-surrogate case is covered elsewhere; the low-surrogate branch is a separate arm.
    expectCode(
      () => parseStrictJsonText('{"a":"\uDC00"}', 'E_VERIFIER_CONTEXT_INVALID'),
      'E_VERIFIER_CONTEXT_INVALID'
    );
  });

  it('rejects well-formed UTF-8 that is not valid JSON', () => {
    expectCode(
      () => parseStrictJsonText('{"a":', 'E_VERIFIER_CONTEXT_INVALID'),
      'E_VERIFIER_CONTEXT_INVALID'
    );
  });
});

describe('context: defensive branches', () => {
  it('rejects a non-string member inside a string array', async () => {
    await expectCodeAsync(
      () =>
        parseVerificationContext('{"contextVersion":"1","trust":{"trustedJwkThumbprints":[1]}}'),
      'E_VERIFIER_CONTEXT_INVALID'
    );
    await expectCodeAsync(
      () =>
        parseVerificationContext('{"contextVersion":"1","trust":{"trustedJwkThumbprints":[""]}}'),
      'E_VERIFIER_CONTEXT_INVALID'
    );
  });
});

describe('orchestrator: defensive branches', () => {
  it('rejects an oversized record before any parsing', async () => {
    const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });
    const f = await makeFixture();
    const result = await verifier.verify({
      record: 'a'.repeat(MAX_RECORD_BYTES + 1),
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(result).toMatchObject({
      ok: false,
      failureStage: 'input',
      code: 'E_VERIFIER_RECORD_TOO_LARGE',
    });
    expect(result).not.toHaveProperty('report');
  });

  it('classifies a malformed record as an INPUT failure, not a key-selection failure', async () => {
    // Routing is only mandatory with more than one supplied key, so this needs a two-key JWKS.
    const a = await makeFixture('k1');
    const b = await makeFixture('k2');
    const jwks = JSON.stringify({ keys: [a.publicJwk, b.publicJwk] });
    const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });
    const result = await verifier.verify({
      record: `${b64url('not json')}.eyJhIjoxfQ.c2ln`,
      keyDocument: jwks,
      evaluationTimeUnixSeconds: a.evaluationTime,
    });
    expect(result).toMatchObject({
      ok: false,
      failureStage: 'input',
      code: 'E_VERIFIER_RECORD_MALFORMED',
    });
  });
});
