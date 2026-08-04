/**
 * Routing must not mask canonical errors.
 *
 * The unverified JWS decoder throws for crit, embedded key references, b64:false, zip, typ and Wire
 * incoherence -- masking canonical codes in 14 of 16 probed defect classes. The minimal routing
 * parser must let every one of those reach the canonical verifier instead.
 */
import { describe, it, expect } from 'vitest';
import { initializeLocalVerifier } from '../src/verify.js';
import { readProtectedKidForRouting } from '../src/lib/protected-kid.js';
import {
  BASE_HEADER,
  makeFixture,
  withProtectedHeader,
  withRawProtectedHeader,
} from './helpers/fixtures.js';

const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });

describe('JOSE and Wire defects reach the canonical verifier', () => {
  it.each([
    ['crit', { ...BASE_HEADER, crit: ['x'] }],
    ['embedded jwk', { ...BASE_HEADER, jwk: { kty: 'OKP' } }],
    ['embedded jku', { ...BASE_HEADER, jku: 'https://x/y' }],
    ['embedded x5c', { ...BASE_HEADER, x5c: ['a'] }],
    ['embedded x5u', { ...BASE_HEADER, x5u: 'https://x/y' }],
    ['b64 false', { ...BASE_HEADER, b64: false }],
    ['zip', { ...BASE_HEADER, zip: 'DEF' }],
    ['unknown typ', { ...BASE_HEADER, typ: 'application/something-else+jwt' }],
    ['typ absent', { alg: 'EdDSA', kid: 'k1' }],
  ])('%s is classified by the canonical verifier, not by routing', async (_label, header) => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: withProtectedHeader(f.record, header),
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(r.ok).toBe(false);
    // The decisive assertion: NOT an app-local routing code.
    expect('code' in r && r.code).not.toBe('E_VERIFIER_RECORD_MALFORMED');
    expect('code' in r && String(r.code).startsWith('E_')).toBe(true);
    // A canonical rejection after key selection always yields a report.
    expect(r.report).toBeDefined();
    expect(r.report?.failureCode).toBe('code' in r ? r.code : undefined);
  });

  it('a duplicate UNRELATED header member still reaches the canonical verifier', async () => {
    const f = await makeFixture();
    const raw =
      '{"alg":"EdDSA","typ":"application/peac-interaction-record+jwt","kid":"k1","zz":1,"zz":2}';
    const r = await verifier.verify({
      record: withRawProtectedHeader(f.record, raw),
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(r.ok).toBe(false);
    // I-JSON classification is PRESERVED, not collapsed into the generic malformed code.
    expect('code' in r && r.code).toBe('E_IJSON_DUPLICATE_MEMBER_NAME');
  });
});

describe('genuine routing-boundary failures', () => {
  it('rejects a record that is not three compact segments', () => {
    expect(() => readProtectedKidForRouting('a.b')).toThrowError(/three-part/);
  });

  it('rejects a non-base64url protected header', () => {
    expect(() => readProtectedKidForRouting('!!!!.b.c')).toThrowError(/base64url/);
  });

  it('returns undefined when the header carries no kid', async () => {
    const f = await makeFixture();
    const rec = withProtectedHeader(f.record, {
      alg: 'EdDSA',
      typ: 'application/peac-interaction-record+jwt',
    });
    expect(readProtectedKidForRouting(rec)).toBeUndefined();
  });

  it('extracts only the kid', async () => {
    const f = await makeFixture('routing-kid');
    expect(readProtectedKidForRouting(f.record)).toBe('routing-kid');
  });

  it('rejects an oversized kid', async () => {
    const f = await makeFixture();
    const rec = withProtectedHeader(f.record, { ...BASE_HEADER, kid: 'x'.repeat(257) });
    expect(() => readProtectedKidForRouting(rec)).toThrowError(/UTF-8 bytes/);
  });
});

describe('routing never parses the payload', () => {
  it('a payload containing a sentinel never surfaces in any thrown message', async () => {
    const f = await makeFixture();
    const [h, , s] = f.record.split('.');
    // A payload that is not even valid base64url: routing must not care.
    const rec = `${h}.!!!!not-base64url!!!!.${s}`;
    let seen = '';
    try {
      readProtectedKidForRouting(rec);
    } catch (e) {
      seen = String((e as Error).message);
    }
    // Routing succeeded (it only reads the header) or failed without mentioning the payload.
    expect(seen).not.toContain('not-base64url');
  });
});
