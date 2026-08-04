/**
 * One acceptance matrix, three surfaces.
 *
 * A `kid` is inspected in three places: the protected header (routing), the supplied JWK or JWKS,
 * and `VerificationContextV1.constraints.allowedKids`. If any of them accepts a value another
 * rejects, the result is a verdict nobody can act on. A constraint expressed in a value the verifier
 * could never accept is unsatisfiable and would surface as a mismatch rather than as the malformed
 * input it is; a routing bound stricter than the verifier's produces the opposite defect, where
 * routing refuses a record the verifier would have accepted.
 *
 * Every vector below is checked against all three surfaces and must produce the same answer.
 */
import { describe, it, expect } from 'vitest';
import { readProtectedKidForRouting } from '../src/lib/protected-kid.js';
import { parseKeyDocument } from '../src/lib/public-key.js';
import { parseVerificationContext } from '../src/lib/context.js';
import { MAX_KID_UTF8_BYTES } from '../src/lib/limits.js';
import { makeFixture } from './helpers/fixtures.js';

const enc = new TextEncoder();

/** A string of exactly n UTF-8 bytes from a repeated code point of the given byte width. */
function kidOfBytes(n: number, width: 1 | 2 | 3 | 4): string {
  const ch = width === 1 ? 'a' : width === 2 ? 'é' : width === 3 ? 'ࠀ' : '\u{1F600}';
  const whole = Math.floor(n / width);
  return ch.repeat(whole) + 'a'.repeat(n - whole * width);
}

function headerWith(kid: string): string {
  const json = JSON.stringify({ alg: 'EdDSA', typ: 'interaction-record+jwt', kid });
  const b64 = btoa(String.fromCharCode(...enc.encode(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${b64}.eyJhIjoxfQ.c2ln`;
}

/** Accepted means the surface returned normally. Any rejection is a rejection of this kid. */
function routingAccepts(kid: string): boolean {
  try {
    readProtectedKidForRouting(headerWith(kid));
    return true;
  } catch {
    return false;
  }
}

async function jwkAccepts(kid: string): Promise<boolean> {
  const f = await makeFixture();
  try {
    parseKeyDocument(JSON.stringify({ ...(f.publicJwk as Record<string, unknown>), kid }));
    return true;
  } catch {
    return false;
  }
}

async function allowedKidsAccepts(kid: string): Promise<boolean> {
  try {
    await parseVerificationContext(
      JSON.stringify({ contextVersion: '1', constraints: { allowedKids: [kid] } })
    );
    return true;
  } catch {
    return false;
  }
}

interface Vector {
  name: string;
  kid: string;
  accepted: boolean;
}

const VECTORS: Vector[] = [
  { name: 'empty', kid: '', accepted: false },
  { name: 'malformed high surrogate', kid: '\uD83D', accepted: false },
  { name: 'malformed low surrogate', kid: '\uDC00', accepted: false },
  { name: 'high surrogate after ascii', kid: 'k\uD83D', accepted: false },
  { name: 'reversed surrogate pair', kid: '\uDC00\uD83D', accepted: false },

  { name: '255 bytes, 1-byte code points', kid: kidOfBytes(255, 1), accepted: true },
  { name: '256 bytes, 1-byte code points', kid: kidOfBytes(256, 1), accepted: true },
  { name: '257 bytes, 1-byte code points', kid: kidOfBytes(257, 1), accepted: false },

  { name: '255 bytes, 2-byte code points', kid: kidOfBytes(255, 2), accepted: true },
  { name: '256 bytes, 2-byte code points', kid: kidOfBytes(256, 2), accepted: true },
  { name: '257 bytes, 2-byte code points', kid: kidOfBytes(257, 2), accepted: false },

  { name: '255 bytes, 3-byte code points', kid: kidOfBytes(255, 3), accepted: true },
  { name: '256 bytes, 3-byte code points', kid: kidOfBytes(256, 3), accepted: true },
  { name: '257 bytes, 3-byte code points', kid: kidOfBytes(257, 3), accepted: false },

  { name: '255 bytes, 4-byte code points', kid: kidOfBytes(255, 4), accepted: true },
  { name: '256 bytes, 4-byte code points', kid: kidOfBytes(256, 4), accepted: true },
  { name: '257 bytes, 4-byte code points', kid: kidOfBytes(257, 4), accepted: false },

  // "e" + COMBINING ACUTE renders as one glyph and encodes as three bytes, so a combining sequence
  // reaches the bound at a different count than the precomposed character it looks like.
  { name: 'combining sequence, 255 bytes', kid: 'é'.repeat(85), accepted: true },
  { name: 'combining sequence, 258 bytes', kid: 'é'.repeat(86), accepted: false },
  { name: 'precomposed equivalent, 256 bytes', kid: 'é'.repeat(128), accepted: true },
  { name: 'precomposed equivalent, 258 bytes', kid: 'é'.repeat(129), accepted: false },
];

describe('protected-header kid, JWK kid and allowedKids share one acceptance matrix', () => {
  it.each(VECTORS.map((v) => [v.name, v] as const))('%s', async (_name, v) => {
    // Sanity: a vector rejected purely on length must actually exceed the bound, and one accepted
    // must not. A fixture that is not the size it claims would otherwise masquerade as agreement.
    const bytes = enc.encode(v.kid).length;
    const wellFormed = !/[\uD800-\uDFFF]/.test(
      v.kid.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    );
    if (wellFormed && v.kid.length > 0) {
      expect({ name: v.name, withinBound: bytes <= MAX_KID_UTF8_BYTES }).toEqual({
        name: v.name,
        withinBound: v.accepted,
      });
    }

    const results = {
      routing: routingAccepts(v.kid),
      jwk: await jwkAccepts(v.kid),
      allowedKids: await allowedKidsAccepts(v.kid),
    };

    expect(results).toEqual({
      routing: v.accepted,
      jwk: v.accepted,
      allowedKids: v.accepted,
    });
  });

  it('covers every case the contract enumerates', () => {
    const names = VECTORS.map((v) => v.name).join(' ');
    for (const required of [
      'empty',
      'high surrogate',
      'low surrogate',
      '255 bytes',
      '256 bytes',
      '257 bytes',
      'combining',
    ]) {
      expect(names).toContain(required);
    }
    for (const width of ['1-byte', '2-byte', '3-byte', '4-byte']) {
      expect(names).toContain(width);
    }
  });
});
