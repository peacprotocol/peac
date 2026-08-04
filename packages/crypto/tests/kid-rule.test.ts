/**
 * The canonical `kid` rule.
 *
 * Stated once, package-privately, because a bound in "characters" denotes a different accepted set
 * in each of JavaScript, Go, Python and JSON Schema, and because a length-only predicate would let
 * signing mint a protected header that the I-JSON verifier rejects.
 */
import { describe, it, expect } from 'vitest';
import { MAX_KID_UTF8_BYTES, isValidKid, isWellFormedUnicode, utf8ByteLength } from '../src/kid';

const enc = new TextEncoder();

/** Build a string of EXACTLY n UTF-8 bytes from a repeated code point of the given byte width. */
function kidOfBytes(n: number, width: 1 | 2 | 3 | 4): string {
  const ch = width === 1 ? 'a' : width === 2 ? '\u00E9' : width === 3 ? '\u0800' : '\u{1F600}';
  const whole = Math.floor(n / width);
  return ch.repeat(whole) + 'a'.repeat(n - whole * width);
}

describe('isValidKid', () => {
  it('rejects a non-string', () => {
    for (const v of [undefined, null, 0, 1, true, {}, [], Symbol('k')]) {
      expect(isValidKid(v)).toBe(false);
    }
  });

  it('rejects the empty string', () => {
    expect(isValidKid('')).toBe(false);
  });

  it('rejects an unpaired HIGH surrogate', () => {
    expect(isValidKid('\uD83D')).toBe(false);
    expect(isValidKid('a\uD83D')).toBe(false);
    expect(isValidKid('\uD83Db')).toBe(false);
    expect(isValidKid('\uD83D\uD83D')).toBe(false); // high followed by high
  });

  it('rejects an unpaired LOW surrogate', () => {
    expect(isValidKid('\uDC00')).toBe(false);
    expect(isValidKid('a\uDC00')).toBe(false);
    expect(isValidKid('\uDC00b')).toBe(false);
    expect(isValidKid('\uDC00\uD83D')).toBe(false); // reversed pair
  });

  it('accepts a well-formed surrogate pair', () => {
    expect(isValidKid('\u{1F600}')).toBe(true);
    expect(isValidKid('a\u{1F600}b')).toBe(true);
    expect(isValidKid('\u{1F600}\u{1F600}')).toBe(true);
  });

  it('accepts exactly 256 ASCII bytes and rejects 257', () => {
    expect(isValidKid('a'.repeat(256))).toBe(true);
    expect(isValidKid('a'.repeat(257))).toBe(false);
  });

  it('accepts a multibyte value of exactly 256 UTF-8 bytes', () => {
    const kid = kidOfBytes(256, 3);
    expect(enc.encode(kid).length).toBe(256);
    expect(kid.length).toBeLessThan(256); // fewer code units than bytes
    expect(isValidKid(kid)).toBe(true);
  });

  it('rejects a multibyte value of 257 UTF-8 bytes', () => {
    for (const width of [2, 3, 4] as const) {
      const kid = kidOfBytes(257, width);
      expect(enc.encode(kid).length).toBe(257);
      expect(isValidKid(kid)).toBe(false);
    }
  });

  it('counts combining marks by their encoded bytes, not by rendered glyphs', () => {
    // Two sequences that RENDER identically but encode differently:
    //   U+00E9                      precomposed, 1 code unit,  2 bytes
    //   U+0065 U+0301               "e" + combining acute, 2 code units, 3 bytes
    // The bound follows the encoding, so the two have different capacities.
    const precomposed = '\u00E9';
    const combining = 'e\u0301';
    expect(enc.encode(precomposed).length).toBe(2);
    expect(enc.encode(combining).length).toBe(3);

    expect(isValidKid(precomposed.repeat(128))).toBe(true); // 256 bytes
    expect(isValidKid(precomposed.repeat(129))).toBe(false); // 258 bytes

    expect(isValidKid(combining.repeat(85))).toBe(true); // 255 bytes
    expect(isValidKid(combining.repeat(86))).toBe(false); // 258 bytes
  });

  it('counts astral code points as 4 bytes, not 2 code units', () => {
    const kid = '\u{1F600}'.repeat(64); // 64 code points, 128 code units, 256 bytes
    expect(kid.length).toBe(128);
    expect(enc.encode(kid).length).toBe(256);
    expect(isValidKid(kid)).toBe(true);
    expect(isValidKid(kid + 'a')).toBe(false);
  });

  it('declares the bound as 256', () => {
    expect(MAX_KID_UTF8_BYTES).toBe(256);
  });
});

describe('isWellFormedUnicode', () => {
  it.each([
    ['empty', '', true],
    ['ascii', 'abc', true],
    ['two-byte', 'é', true],
    ['three-byte', 'ࠀ', true],
    ['valid pair', '\u{1F600}', true],
    ['lone high', '\uD83D', false],
    ['lone low', '\uDC00', false],
    ['high at end', 'ab\uD83D', false],
    ['low at start', '\uDC00ab', false],
    ['reversed pair', '\uDC00\uD83D', false],
    ['high then ascii', '\uD83Da', false],
  ])('%s', (_label, s, expected) => {
    expect(isWellFormedUnicode(s)).toBe(expected);
  });
});

describe('utf8ByteLength', () => {
  it('agrees with TextEncoder on every well-formed input', () => {
    const cases = ['', 'a', 'é', 'ࠀ', '\u{1F600}', 'a\u{1F600}b', 'ࠀ'.repeat(200), 'a'.repeat(256)];
    for (const s of cases) expect(utf8ByteLength(s)).toBe(enc.encode(s).length);
  });

  it('THROWS on malformed UTF-16 rather than returning a plausible number', () => {
    // Returning 3 (what TextEncoder would emit for U+FFFD) would let a caller accept, on length
    // grounds, a string that cannot be encoded at all.
    expect(() => utf8ByteLength('\uD83D')).toThrowError(/unpaired high surrogate/);
    expect(() => utf8ByteLength('\uDC00')).toThrowError(/unpaired low surrogate/);
    expect(() => utf8ByteLength('ab\uD83D')).toThrow();
  });

  it('does not throw for a well-formed pair', () => {
    expect(() => utf8ByteLength('\u{1F600}')).not.toThrow();
  });
});

describe('the signing invariant this rule protects', () => {
  it('every accepted kid survives a UTF-8 round trip unchanged', () => {
    // `JSON.stringify` emits a lone surrogate as an escape, and the resulting protected header is
    // rejected by the canonical I-JSON verifier. A kid that round-trips cannot produce that mismatch.
    const accepted = ['a', 'é', 'ࠀ', '\u{1F600}', 'kid-1', 'a'.repeat(256), kidOfBytes(256, 3)];
    for (const kid of accepted) {
      expect(isValidKid(kid)).toBe(true);
      expect(new TextDecoder().decode(enc.encode(kid))).toBe(kid);
    }
  });

  it('every rejected malformed kid would NOT have survived that round trip', () => {
    for (const kid of ['\uD83D', '\uDC00', 'a\uD83D', '\uDC00b']) {
      expect(isValidKid(kid)).toBe(false);
      expect(new TextDecoder().decode(enc.encode(kid))).not.toBe(kid);
    }
  });
});
