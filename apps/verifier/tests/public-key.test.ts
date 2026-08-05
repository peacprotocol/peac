/** Strict key parsing and deterministic selection. */
import { describe, it, expect } from 'vitest';
import { base64urlEncode, generateKeypair } from '@peac/crypto';
import { parseKeyDocument, selectFromKeySet, selectSoleKey } from '../src/lib/public-key.js';
import { MAX_JWKS_BYTES } from '../src/lib/limits.js';
import { initializeLocalVerifier } from '../src/verify.js';
import { makeFixture } from './helpers/fixtures.js';

async function pub(): Promise<string> {
  const { publicKey } = await generateKeypair();
  return base64urlEncode(publicKey);
}
const jwk = async (o: Record<string, unknown> = {}) => ({
  kty: 'OKP',
  crv: 'Ed25519',
  x: await pub(),
  ...o,
});
const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (e) {
    expect((e as { code: string }).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
};

describe('JWK validation', () => {
  it('accepts a valid bare JWK', async () => {
    expect(parseKeyDocument(JSON.stringify(await jwk()))).toHaveLength(1);
  });

  it('accepts key_ops exactly ["verify"]', async () => {
    expect(parseKeyDocument(JSON.stringify(await jwk({ key_ops: ['verify'] })))).toHaveLength(1);
  });

  it('accepts an unknown NON-critical extension member (RFC 7638 uses required members only)', async () => {
    const k = await jwk({ ext: true, 'x-vendor': 'anything' });
    expect(parseKeyDocument(JSON.stringify(k))).toHaveLength(1);
  });

  it('rejects private key material', async () => {
    const k = await jwk({ d: 'AAAA' });
    expectCode(() => parseKeyDocument(JSON.stringify(k)), 'E_VERIFIER_PRIVATE_KEY_REJECTED');
  });

  it.each([
    ['EC/P-256', { kty: 'EC', crv: 'P-256' }],
    ['RSA', { kty: 'RSA', crv: 'Ed25519' }],
    ['wrong curve', { kty: 'OKP', crv: 'X25519' }],
  ])('rejects %s', async (_l, over) => {
    const k = { ...(await jwk()), ...over };
    expectCode(() => parseKeyDocument(JSON.stringify(k)), 'E_VERIFIER_KEY_TYPE_UNSUPPORTED');
  });

  it.each([
    ['alg ES256', { alg: 'ES256' }],
    ['use enc', { use: 'enc' }],
    ['key_ops sign', { key_ops: ['sign'] }],
    ['key_ops verify+sign', { key_ops: ['verify', 'sign'] }],
    ['key_ops empty', { key_ops: [] }],
    // RFC 7517 s4.3: duplicate key operation values MUST NOT be present.
    ['key_ops duplicate verify', { key_ops: ['verify', 'verify'] }],
    ['key_ops non-string entry', { key_ops: [1] }],
    ['key_ops not an array', { key_ops: 'verify' }],
    ['key_ops nested', { key_ops: [['verify']] }],
  ])('rejects %s', async (_l, over) => {
    const k = await jwk(over);
    expectCode(() => parseKeyDocument(JSON.stringify(k)), 'E_VERIFIER_KEY_METADATA_INVALID');
  });

  it.each([
    ['padded x', 'A'.repeat(42) + '='],
    ['31 bytes', base64urlEncode(new Uint8Array(31))],
    ['33 bytes', base64urlEncode(new Uint8Array(33))],
    ['wrong alphabet', 'A'.repeat(42) + '+'],
  ])('rejects %s', (_l, x) => {
    expectCode(
      () => parseKeyDocument(JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x })),
      'E_VERIFIER_KEY_MATERIAL_INVALID'
    );
  });

  it('rejects a duplicate JSON member before JSON.parse collapses it', async () => {
    const x = await pub();
    const raw = `{"kty":"OKP","crv":"Ed25519","x":"${x}","kid":"a","kid":"b"}`;
    expectCode(() => parseKeyDocument(raw), 'E_IJSON_DUPLICATE_MEMBER_NAME');
  });
});

describe('JWKS', () => {
  it.each([
    ['keys not an array', { keys: {} }],
    ['keys empty', { keys: [] }],
  ])('rejects %s', (_l, doc) => {
    expectCode(() => parseKeyDocument(JSON.stringify(doc)), 'E_VERIFIER_JWKS_INVALID');
  });

  it('rejects more than the maximum key count', async () => {
    const k = await jwk();
    expectCode(
      () => parseKeyDocument(JSON.stringify({ keys: Array.from({ length: 33 }, () => k) })),
      'E_VERIFIER_JWKS_TOO_MANY_KEYS'
    );
  });

  it('rejects duplicate kid', async () => {
    const a = await jwk({ kid: 'same' });
    const b = await jwk({ kid: 'same' });
    expectCode(
      () => parseKeyDocument(JSON.stringify({ keys: [a, b] })),
      'E_VERIFIER_KID_AMBIGUOUS'
    );
  });

  it('selects the exact kid match', async () => {
    const a = await jwk({ kid: 'a' });
    const b = await jwk({ kid: 'b' });
    const keys = parseKeyDocument(JSON.stringify({ keys: [a, b] }));
    const sel = await selectFromKeySet(keys, 'b');
    expect(sel.selectedJwkKid).toBe('b');
  });

  it('requires a kid when several keys are supplied', async () => {
    const keys = parseKeyDocument(
      JSON.stringify({ keys: [await jwk({ kid: 'a' }), await jwk({ kid: 'b' })] })
    );
    await expect(selectFromKeySet(keys, undefined)).rejects.toMatchObject({
      code: 'E_VERIFIER_KID_REQUIRED',
    });
  });

  it('never falls back to the first key', async () => {
    const keys = parseKeyDocument(
      JSON.stringify({ keys: [await jwk({ kid: 'a' }), await jwk({ kid: 'b' })] })
    );
    await expect(selectFromKeySet(keys, 'absent')).rejects.toMatchObject({
      code: 'E_VERIFIER_KID_NOT_FOUND',
    });
  });

  it('selects a sole key without needing a routing kid', async () => {
    const keys = parseKeyDocument(JSON.stringify(await jwk()));
    const sel = await selectSoleKey(keys);
    expect(sel.publicKeyBytes).toHaveLength(32);
    expect(sel.protectedKid).toBeUndefined();
  });
});

describe('end to end via the verifier', () => {
  it('a JWKS whose kid does not match the record fails key selection with no report', async () => {
    const f = await makeFixture('k1');
    const doc = JSON.stringify({
      keys: [{ ...f.publicJwk, kid: 'a' }, { ...(await jwk({ kid: 'b' })) }],
    });
    const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });
    const r = await verifier.verify({
      record: f.record,
      keyDocument: doc,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect('failureStage' in r && r.failureStage).toBe('key_selection');
    expect(r.report).toBeUndefined();
  });
});

/**
 * Invariant guards.
 *
 * Neither of these can fire through the orchestrator: `selectSoleKey` is only called inside a
 * length check, and `parseKeyDocument` rejects duplicate kids before selection ever runs. They are
 * tested by DIRECT call, and labelled as invariant guards rather than presented as live paths, so a
 * later reader does not mistake coverage here for coverage of a reachable branch.
 */
describe('exported selection invariants (direct call only)', () => {
  it('parseKeyDocument rejects duplicate kids, which is why the ambiguity guard is unreachable', async () => {
    const a = await jwk({ kid: 'dup' });
    const b = await jwk({ kid: 'dup' });
    expect(() => parseKeyDocument(JSON.stringify({ keys: [a, b] }))).toThrowError(
      expect.objectContaining({ code: 'E_VERIFIER_KID_AMBIGUOUS' })
    );
  });

  it('selectFromKeySet still refuses to pick arbitrarily if deduplication ever drifts', async () => {
    const a = await jwk({ kid: 'dup' });
    const keys = parseKeyDocument(JSON.stringify(a));
    // Hand-construct the state parseKeyDocument forbids.
    await expect(selectFromKeySet([keys[0], keys[0]], 'dup')).rejects.toMatchObject({
      code: 'E_VERIFIER_KID_AMBIGUOUS',
    });
  });

  it('selectSoleKey refuses a set that is not exactly one key', async () => {
    const keys = parseKeyDocument(JSON.stringify(await jwk({ kid: 'k1' })));
    await expect(selectSoleKey([])).rejects.toMatchObject({ code: 'E_VERIFIER_INTERNAL_ERROR' });
    await expect(selectSoleKey([keys[0], keys[0]])).rejects.toMatchObject({
      code: 'E_VERIFIER_INTERNAL_ERROR',
    });
  });
});

describe('key document bounds', () => {
  it('rejects an oversized key document', () => {
    expect(() => parseKeyDocument('x'.repeat(MAX_JWKS_BYTES + 1))).toThrowError(
      expect.objectContaining({ code: 'E_VERIFIER_KEY_INPUT_TOO_LARGE' })
    );
  });

  it('rejects a key document that is valid JSON but not an object', () => {
    for (const notObject of ['[]', '"s"', '1', 'null', 'true']) {
      expect(() => parseKeyDocument(notObject)).toThrowError(
        expect.objectContaining({ code: 'E_VERIFIER_KEY_JSON_INVALID' })
      );
    }
  });
});
