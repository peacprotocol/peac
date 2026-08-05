/** Verification-context parsing: closed schema, set semantics, semantic digest. */
import { describe, it, expect } from 'vitest';
import { parseVerificationContext } from '../src/lib/context.js';

const TP = 'A'.repeat(43);
const bad = async (doc: unknown, code = 'E_VERIFIER_CONTEXT_INVALID') =>
  expect(
    parseVerificationContext(typeof doc === 'string' ? doc : JSON.stringify(doc))
  ).rejects.toMatchObject({ code });

describe('shape', () => {
  it('rejects an empty object', async () => {
    await bad({});
  });
  it('rejects version-only (no trust, no constraints)', async () => {
    await bad({ contextVersion: '1' });
  });
  it('rejects a wrong version', async () => {
    await bad({ contextVersion: '2', trust: { trustedJwkThumbprints: [TP] } });
  });
  it('rejects an unknown top-level member', async () => {
    await bad({ contextVersion: '1', nope: 1, trust: { trustedJwkThumbprints: [TP] } });
  });
  it('rejects an unknown trust member', async () => {
    await bad({ contextVersion: '1', trust: { trustedJwkThumbprints: [TP], nope: 1 } });
  });
  it('rejects an unknown constraint member', async () => {
    await bad({ contextVersion: '1', constraints: { nope: 1 } });
  });
  it('rejects empty constraints', async () => {
    await bad({ contextVersion: '1', constraints: {} });
  });
  it('rejects an oversized document', async () => {
    await bad(
      { contextVersion: '1', constraints: { allowedKids: ['x'.repeat(9000)] } },
      'E_VERIFIER_CONTEXT_TOO_LARGE'
    );
  });
  it('rejects a duplicate JSON member before parse', async () => {
    await bad(
      `{"contextVersion":"1","contextVersion":"1","trust":{"trustedJwkThumbprints":["${TP}"]}}`,
      'E_IJSON_DUPLICATE_MEMBER_NAME'
    );
  });
});

describe('sets', () => {
  it('rejects an empty array', async () => {
    await bad({ contextVersion: '1', trust: { trustedJwkThumbprints: [] } });
  });
  it('rejects duplicates', async () => {
    await bad({ contextVersion: '1', trust: { trustedJwkThumbprints: [TP, TP] } });
  });
  it('rejects a malformed thumbprint', async () => {
    await bad({ contextVersion: '1', trust: { trustedJwkThumbprints: ['short'] } });
  });
  it('rejects over the maximum count', async () => {
    const many = Array.from({ length: 33 }, (_, i) =>
      (i.toString(36) + 'A'.repeat(43)).slice(0, 43)
    );
    await bad({ contextVersion: '1', trust: { trustedJwkThumbprints: many } });
  });
});

describe('canonical validators are reused', () => {
  it('rejects a non-canonical issuer', async () => {
    await bad({ contextVersion: '1', constraints: { expectedIssuer: 'not a canonical issuer' } });
  });
  it('rejects an https issuer with a path', async () => {
    await bad({ contextVersion: '1', constraints: { expectedIssuer: 'https://x.example/path' } });
  });
  it('accepts an https origin', async () => {
    const c = await parseVerificationContext(
      JSON.stringify({ contextVersion: '1', constraints: { expectedIssuer: 'https://x.example' } })
    );
    expect(c.value.constraints?.expectedIssuer).toBe('https://x.example');
  });
  it('accepts a did identifier', async () => {
    const c = await parseVerificationContext(
      JSON.stringify({ contextVersion: '1', constraints: { expectedIssuer: 'did:example:abc' } })
    );
    expect(c.value.constraints?.expectedIssuer).toBe('did:example:abc');
  });
  it('rejects an invalid record type', async () => {
    await bad({ contextVersion: '1', constraints: { allowedRecordTypes: ['not-a-peac-type'] } });
  });
  it('accepts reverse-DNS and absolute-URI types', async () => {
    const c = await parseVerificationContext(
      JSON.stringify({
        contextVersion: '1',
        constraints: { allowedRecordTypes: ['org.example/flow', 'https://example.com/type'] },
      })
    );
    expect(c.value.constraints?.allowedRecordTypes).toHaveLength(2);
  });
});

describe('semantic digest', () => {
  it('is identical for reordered arrays', async () => {
    const a = await parseVerificationContext(
      JSON.stringify({ contextVersion: '1', constraints: { allowedKids: ['b', 'a'] } })
    );
    const b = await parseVerificationContext(
      JSON.stringify({ contextVersion: '1', constraints: { allowedKids: ['a', 'b'] } })
    );
    expect(a.sha256).toBe(b.sha256);
  });

  it('is identical for reformatted whitespace', async () => {
    const a = await parseVerificationContext(
      '{"contextVersion":"1","constraints":{"allowedKids":["a"]}}'
    );
    const b = await parseVerificationContext(
      '{\n  "contextVersion": "1",\n  "constraints": { "allowedKids": ["a"] }\n}'
    );
    expect(a.sha256).toBe(b.sha256);
  });

  it('differs when a member differs', async () => {
    const a = await parseVerificationContext(
      JSON.stringify({ contextVersion: '1', constraints: { allowedKids: ['a'] } })
    );
    const b = await parseVerificationContext(
      JSON.stringify({ contextVersion: '1', constraints: { allowedKids: ['z'] } })
    );
    expect(a.sha256).not.toBe(b.sha256);
  });

  it('does not case-fold', async () => {
    const a = await parseVerificationContext(
      JSON.stringify({ contextVersion: '1', constraints: { expectedIssuer: 'https://x.example' } })
    );
    await bad({ contextVersion: '1', constraints: { expectedIssuer: 'https://X.EXAMPLE' } });
    expect(a.sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
