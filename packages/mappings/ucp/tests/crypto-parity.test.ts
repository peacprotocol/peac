/**
 * H2 parity: prove the @peac/crypto helpers now used by @peac/mappings-ucp are
 * byte-identical to the UCP-local helpers this PR removed.
 *
 * The `legacy*` functions below preserve the byte-output behavior of the pre-H2
 * `@peac/mappings-ucp/src/util.ts` `base64urlEncode` and `jcsCanonicalizeSync`
 * helpers. The old UCP encoder also had a 16 MB guard; that behavior is preserved
 * in `verify.ts` at the detached-JWS call site, not in this byte-output parity
 * helper. UCP feeds these helpers JSON.parse-derived values (webhook bodies,
 * profile JSON) and small byte arrays (payloads, digests), so the corpora below
 * reflect those inputs.
 */

import { describe, it, expect } from 'vitest';
import { base64urlEncode, canonicalize } from '@peac/crypto';

// --- byte-output references for the removed UCP util.ts helpers ---

function legacyBase64ToBase64url(base64: string): string {
  let result = '';
  for (let i = 0; i < base64.length; i++) {
    const c = base64.charCodeAt(i);
    if (c === 43) {
      result += '-'; // '+' -> '-'
    } else if (c === 47) {
      result += '_'; // '/' -> '_'
    } else if (c === 61) {
      break; // '=' padding - skip
    } else {
      result += base64.charAt(i);
    }
  }
  return result;
}

function legacyBase64urlEncode(data: Uint8Array): string {
  const base64 = Buffer.from(data).toString('base64');
  return legacyBase64ToBase64url(base64);
}

function legacyJcs(obj: unknown): string {
  if (obj === null) return 'null';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) {
      throw new Error('JCS does not support NaN or Infinity');
    }
    return Object.is(obj, -0) ? '0' : String(obj);
  }
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(legacyJcs).join(',') + ']';
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs = keys
      .filter((k) => (obj as Record<string, unknown>)[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + legacyJcs((obj as Record<string, unknown>)[k]));
    return '{' + pairs.join(',') + '}';
  }
  throw new Error(`Cannot canonicalize type: ${typeof obj}`);
}

// Deterministic pseudo-random bytes (LCG; no Math.random for stable vectors).
function lcgBytes(seed: number, length: number): Uint8Array {
  let s = seed;
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    s = (1103515245 * s + 12345) & 0x7fffffff;
    out[i] = s & 0xff;
  }
  return out;
}

describe('H2 parity: @peac/crypto base64urlEncode matches the removed UCP helper', () => {
  const vectors: Array<[string, Uint8Array]> = [
    ['empty', new Uint8Array([])],
    ['1 byte', new Uint8Array([0])],
    ['2 bytes', new Uint8Array([0, 1])],
    ['3 bytes', new Uint8Array([0, 1, 2])],
    ['4 bytes', new Uint8Array([0, 1, 2, 3])],
    ['high byte', new Uint8Array([255])],
    ['tail 0x..', new Uint8Array([255, 254, 253])],
    ['bytes 0..255', Uint8Array.from({ length: 256 }, (_, i) => i)],
    ['lcg-199', lcgBytes(12345, 199)],
    ['lcg-32 (digest-sized)', lcgBytes(67890, 32)],
  ];
  for (const [name, v] of vectors) {
    it(`matches for ${name}`, () => {
      expect(base64urlEncode(v)).toBe(legacyBase64urlEncode(v));
    });
  }
});

describe('H2 parity: @peac/crypto canonicalize matches the removed UCP JCS (JSON-parse-derived inputs)', () => {
  const corpus: Array<[string, unknown]> = [
    ['null', null],
    ['true', true],
    ['false', false],
    ['int 0', 0],
    ['int 42', 42],
    ['negative', -1],
    ['decimal', 3.14],
    ['minus zero', -0],
    ['large int', 123456789012345],
    ['exponent form', 1e21],
    ['empty string', ''],
    ['ascii', 'hello'],
    ['quotes', 'with "quotes" and \\ backslash'],
    ['unicode', 'unicode: cafe ☕ 𝕏'],
    ['control chars', 'tab\tnewline\n'],
    ['empty array', []],
    ['number array', [1, 2, 3]],
    ['string array', ['a', 'b']],
    ['object array', [{ a: 1 }, { b: 2 }]],
    ['empty object', {}],
    ['unsorted keys', { b: 2, a: 1 }],
    ['three keys', { z: 1, a: 2, m: 3 }],
    ['nested', { nested: { deep: { x: [1, { y: 2 }] } }, arr: [true, null, 'x'] }],
    [
      'ucp-order-ish',
      JSON.parse('{"order":{"id":"o1","items":[{"p":9.99,"q":2}]},"ts":"2026-06-19T00:00:00Z"}'),
    ],
    ['jwk thumbprint shape', { crv: 'P-256', kty: 'EC', x: 'abc', y: 'def' }],
  ];
  for (const [name, value] of corpus) {
    it(`matches for ${name}`, () => {
      expect(canonicalize(value)).toBe(legacyJcs(value));
    });
  }
});
