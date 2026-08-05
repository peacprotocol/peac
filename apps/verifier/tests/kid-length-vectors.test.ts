/**
 * Cross-implementation `kid` length vectors.
 *
 * THE PROBLEM THESE PIN
 *
 * A bound stated in "characters" names four different accepted sets:
 *
 *   JavaScript `.length`   UTF-16 code units
 *   Go / Rust `len()`      UTF-8 bytes
 *   Python `len()`         Unicode code points
 *   JSON Schema maxLength  Unicode code points
 *
 * Five layers of this system had disagreed on which one they meant, and that disagreement was
 * reachable: routing rejected a kid the canonical verifier accepted. The rule is now stated once, in
 * UTF-8 BYTES, package-privately in `@peac/crypto` -- the unit that actually bounds the serialized
 * protected header and the only one on which independent implementations can agree.
 *
 * Every layer below must produce the SAME accepted set.
 */
import { describe, it, expect } from 'vitest';
import { MAX_KID_UTF8_BYTES, isValidKid } from '../../../packages/crypto/src/kid';
import { validateWire02Header } from '@peac/crypto';
import { utf8ByteLength } from '../../../packages/crypto/src/kid';
import { readProtectedKidForRouting } from '../src/lib/protected-kid.js';
import { parseKeyDocument } from '../src/lib/public-key.js';
import { parseVerificationContext } from '../src/lib/context.js';
import { makeFixture } from './helpers/fixtures.js';

const enc = new TextEncoder();

/** Build a string of EXACTLY n UTF-8 bytes from a repeated code point of the given width. */
function kidOfBytes(n: number, width: 1 | 2 | 3 | 4): string {
  const ch = width === 1 ? 'a' : width === 2 ? 'é' : width === 3 ? 'ࠀ' : '\u{1F600}';
  const whole = Math.floor(n / width);
  let s = ch.repeat(whole);
  s += 'a'.repeat(n - whole * width); // pad with 1-byte chars to hit the exact total
  return s;
}

function headerWith(kid: string): string {
  const json = JSON.stringify({ alg: 'EdDSA', typ: 'interaction-record+jwt', kid });
  const b64 = btoa(String.fromCharCode(...enc.encode(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${b64}.eyJhIjoxfQ.c2ln`;
}

const accepts = {
  /** The rule itself. */
  kernel: (kid: string) => isValidKid(kid),
  /**
   * Canonical verification, via the PACKAGE EXPORT rather than a direct source import.
   *
   * Importing `packages/crypto/src/jws.ts` by path would drag the whole crypto source tree into this
   * application's typecheck graph. The package export is also the surface real consumers use, so
   * this exercises what actually ships.
   */
  canonical: (kid: string) => {
    try {
      validateWire02Header({ alg: 'EdDSA', typ: 'interaction-record+jwt', kid });
      return true;
    } catch {
      return false;
    }
  },
  /** Browser protected-header routing. */
  routing: (kid: string) => {
    try {
      readProtectedKidForRouting(headerWith(kid));
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * "Accepted" means the layer returned normally.
 *
 * Filtering on one expected error code hides a layer that rejects for a DIFFERENT valid reason: a
 * malformed kid reaches routing as an escaped surrogate in the header bytes and is refused by the
 * I-JSON gate rather than by the kid check. Every fixture here varies only the kid, so any rejection
 * is a rejection of that kid. The specific codes are asserted separately below.
 */

/**
 * Bare JWK `kid`, probed with a REAL key.
 *
 * Uses a REAL key. Non-canonical key material is rejected before the `kid` is ever inspected, so a
 * placeholder `x` would make this probe report "accepted" for every input regardless of what the JWK
 * layer does.
 */
async function jwkAccepts(kid: string): Promise<boolean> {
  const f = await makeFixture();
  const jwk = { ...(f.publicJwk as Record<string, unknown>), kid };
  try {
    parseKeyDocument(JSON.stringify(jwk));
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === 'E_VERIFIER_KID_INVALID') return false;
    throw e; // any other rejection means the probe itself is malformed
  }
}

describe('every layer bounds kid in UTF-8 bytes, identically', () => {
  it('the declared bound is 256 UTF-8 bytes', () => {
    expect(MAX_KID_UTF8_BYTES).toBe(256);
  });

  it('utf8ByteLength agrees with TextEncoder across all code-point widths', () => {
    for (const s of ['', 'a', 'é', 'ࠀ', '\u{1F600}', 'a\u{1F600}b', 'ࠀ'.repeat(200)]) {
      expect(utf8ByteLength(s)).toBe(enc.encode(s).length);
    }
  });

  // The core matrix: at, below and above the bound, in every code-point width.
  for (const width of [1, 2, 3, 4] as const) {
    for (const n of [255, 256, 257]) {
      const kid = kidOfBytes(n, width);
      const expected = n <= MAX_KID_UTF8_BYTES;
      it(`${n} UTF-8 bytes of ${width}-byte code points is ${expected ? 'accepted' : 'rejected'} by every layer`, async () => {
        expect(enc.encode(kid).length).toBe(n);
        for (const [layer, fn] of Object.entries(accepts)) {
          expect({ layer, n, width, accepted: fn(kid) }).toEqual({
            layer,
            n,
            width,
            accepted: expected,
          });
        }
        expect({ layer: 'jwk', accepted: await jwkAccepts(kid) }).toEqual({
          layer: 'jwk',
          accepted: expected,
        });
        // context.allowedKids goes through the same rule (async, so checked separately)
        const ctx = JSON.stringify({ contextVersion: '1', constraints: { allowedKids: [kid] } });
        let ctxAccepted = true;
        try {
          await parseVerificationContext(ctx);
        } catch {
          ctxAccepted = false;
        }
        expect({ layer: 'context.allowedKids', accepted: ctxAccepted }).toEqual({
          layer: 'context.allowedKids',
          accepted: expected,
        });
      });
    }
  }

  it('256 ASCII bytes accepted, 257 rejected', () => {
    expect(isValidKid('a'.repeat(256))).toBe(true);
    expect(isValidKid('a'.repeat(257))).toBe(false);
  });

  it('a multibyte kid of exactly 256 UTF-8 bytes is accepted even though it is fewer characters', () => {
    const kid = 'ࠀ'.repeat(85) + 'a'; // 85*3 + 1 = 256 bytes, 86 code points
    expect(enc.encode(kid).length).toBe(256);
    expect(kid.length).toBe(86);
    expect(isValidKid(kid)).toBe(true);
  });

  it('astral code points count as 4 bytes, not 2 units', () => {
    const kid = '\u{1F600}'.repeat(64); // 64 code points, 128 UTF-16 units, 256 bytes
    expect(kid.length).toBe(128);
    expect(enc.encode(kid).length).toBe(256);
    expect(isValidKid(kid)).toBe(true);
    expect(isValidKid(kid + 'a')).toBe(false); // 257 bytes
  });

  it('combining marks are counted by their own encoding, not by rendered glyphs', () => {
    // "e" + COMBINING ACUTE renders as one glyph but is 1 + 2 = 3 bytes.
    const unit = 'é';
    expect(enc.encode(unit).length).toBe(3);
    expect(isValidKid(unit.repeat(85))).toBe(true); // 255 bytes
    expect(isValidKid(unit.repeat(86))).toBe(false); // 258 bytes
  });

  it('an empty kid is rejected by every layer', async () => {
    expect(isValidKid('')).toBe(false);
    for (const [layer, fn] of Object.entries(accepts)) {
      expect({ layer, accepted: fn('') }).toEqual({ layer, accepted: false });
    }
    expect(await jwkAccepts('')).toBe(false);
  });

  it('a lone surrogate is rejected on well-formedness, not on length', () => {
    // It cannot round-trip through UTF-8, so it could never appear verbatim in real header bytes.
    // The rule rejects it before length is considered, and `utf8ByteLength` refuses to produce a
    // number for it at all rather than returning one a caller might act on.
    const kid = '\uD83D' + 'a'.repeat(10);
    expect(new TextDecoder().decode(enc.encode(kid))).not.toBe(kid);
    expect(isValidKid(kid)).toBe(false);
    expect(() => utf8ByteLength(kid)).toThrowError(/unpaired high surrogate/);
    for (const [layer, fn] of Object.entries(accepts)) {
      expect({ layer, accepted: fn(kid) }).toEqual({ layer, accepted: false });
    }
  });

  it('names the code each layer uses to reject a malformed kid', () => {
    const kid = '\uD83Da';
    // Canonical header validation sees the value directly and applies the kid rule.
    let canonicalCode: string | undefined;
    try {
      validateWire02Header({ alg: 'EdDSA', typ: 'interaction-record+jwt', kid });
    } catch (e) {
      canonicalCode = (e as { code?: string }).code;
    }
    expect(canonicalCode).toBe('CRYPTO_JWS_MISSING_KID');

    // Routing sees it as an escaped surrogate in the header bytes, which is not valid I-JSON, so it
    // is refused one step earlier and under the I-JSON classification. Both outcomes are rejections.
    let routingCode: string | undefined;
    try {
      readProtectedKidForRouting(headerWith(kid));
    } catch (e) {
      routingCode = (e as { code?: string }).code;
    }
    expect(routingCode).toBe('E_IJSON_INVALID_STRING');
  });
});

describe('JSON Schema cannot enforce the byte rule alone', () => {
  it('maxLength counts code points, so schema validation is necessary but not sufficient', () => {
    // 100 astral code points: 100 code points (schema passes maxLength 256) but 400 UTF-8 bytes.
    const kid = '\u{1F600}'.repeat(100);
    const codePoints = [...kid].length;
    expect(codePoints).toBe(100);
    expect(enc.encode(kid).length).toBe(400);
    // JSON Schema `maxLength: 256` would ACCEPT this; the canonical rule rejects it. The schema is
    // therefore documented as a structural bound, with byte enforcement done semantically in code.
    expect(codePoints).toBeLessThanOrEqual(256);
    expect(isValidKid(kid)).toBe(false);
  });
});
