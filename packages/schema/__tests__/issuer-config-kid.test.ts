/**
 * Revoked-key `kid` semantics: the issuer-config schema accepts exactly the canonical JWS `kid`
 * domain (non-empty, well-formed Unicode, at most 256 UTF-8 bytes).
 *
 * The parity suite runs the same vectors through the schema-private predicate and the canonical
 * `@peac/crypto` implementation (imported by source path: the schema package cannot depend on a
 * higher layer), so a divergence in either implementation fails here.
 */
import { describe, it, expect } from 'vitest';
import { RevokedKeyEntrySchema } from '../src/issuer-config';
import {
  MAX_KID_UTF8_BYTES,
  isValidKid,
  isWellFormedUnicode,
  utf8ByteLength,
} from '../src/internal/kid';
import {
  MAX_KID_UTF8_BYTES as CRYPTO_MAX,
  isValidKid as cryptoIsValidKid,
  utf8ByteLength as cryptoUtf8ByteLength,
} from '../../crypto/src/kid';

const encoder = new TextEncoder();

/** A string of exactly `n` UTF-8 bytes built from code points of the given encoded width. */
function kidOfBytes(n: number, width: 1 | 2 | 3 | 4): string {
  const ch = width === 1 ? 'a' : width === 2 ? 'é' : width === 3 ? '€' : '\u{1F600}';
  const whole = Math.floor(n / width);
  let s = ch.repeat(whole);
  s += 'a'.repeat(n - whole * width);
  expect(encoder.encode(s).length).toBe(n);
  return s;
}

const entry = (kid: string) => ({ kid, revoked_at: '2026-02-28T12:00:00Z' });

describe('revoked-key kid accepts the canonical JWS domain', () => {
  it.each([1, 2, 3, 4] as const)('accepts 255 and 256 bytes of %i-byte code points', (width) => {
    for (const n of [255, 256]) {
      const kid = kidOfBytes(n, width);
      expect(RevokedKeyEntrySchema.safeParse(entry(kid)).success, `${width}-byte x ${n}`).toBe(
        true
      );
    }
  });

  it.each([1, 2, 3, 4] as const)('rejects 257 bytes of %i-byte code points', (width) => {
    const kid = kidOfBytes(257, width);
    expect(RevokedKeyEntrySchema.safeParse(entry(kid)).success).toBe(false);
  });

  it('rejects what string-length counting used to accept', () => {
    // 200 astral code points: 200 UTF-16 length pairs under the old max(256), 800 UTF-8 bytes.
    const kid = '\u{1F600}'.repeat(200);
    expect(kid.length).toBeLessThanOrEqual(256 + 256);
    expect(encoder.encode(kid).length).toBe(800);
    expect(RevokedKeyEntrySchema.safeParse(entry(kid)).success).toBe(false);
  });

  it('rejects malformed surrogates', () => {
    for (const kid of ['\ud800', '\udc00', 'a\ud800z', 'a\udc00', '\ud800'.repeat(2), 'ok\ud83d']) {
      expect(RevokedKeyEntrySchema.safeParse(entry(kid)).success, JSON.stringify(kid)).toBe(false);
    }
  });

  it('accepts combining sequences and counts their bytes as supplied', () => {
    const combining = 'é'; // 3 UTF-8 bytes, not normalized
    expect(utf8ByteLength(combining)).toBe(3);
    const kid = combining.repeat(85) + 'a'; // 256 bytes exactly
    expect(encoder.encode(kid).length).toBe(256);
    expect(RevokedKeyEntrySchema.safeParse(entry(kid)).success).toBe(true);
    expect(RevokedKeyEntrySchema.safeParse(entry(kid + 'a')).success).toBe(false);
  });

  it('rejects the empty string and non-strings', () => {
    expect(RevokedKeyEntrySchema.safeParse(entry('')).success).toBe(false);
    expect(
      RevokedKeyEntrySchema.safeParse({ kid: 42, revoked_at: '2026-02-28T12:00:00Z' }).success
    ).toBe(false);
  });
});

describe('parity with the canonical crypto implementation', () => {
  const vectors: string[] = [
    'key-2026-01',
    'a',
    kidOfBytes(255, 1),
    kidOfBytes(256, 1),
    kidOfBytes(257, 1),
    kidOfBytes(255, 2),
    kidOfBytes(256, 2),
    kidOfBytes(257, 2),
    kidOfBytes(255, 3),
    kidOfBytes(256, 3),
    kidOfBytes(257, 3),
    kidOfBytes(255, 4),
    kidOfBytes(256, 4),
    kidOfBytes(257, 4),
    '',
    'é'.repeat(85) + 'a',
    'é'.repeat(86),
    '\u{1F600}'.repeat(64),
    '\u{1F600}'.repeat(64) + 'a',
    '\ud800',
    '\udc00',
    'a\ud800z',
    'a\udc00',
    '𐀀', // well-formed pair
    'ok\ud83d',
  ];

  it('shares the byte bound constant', () => {
    expect(MAX_KID_UTF8_BYTES).toBe(CRYPTO_MAX);
  });

  it('accepts and rejects identically across the vector corpus', () => {
    for (const v of vectors) {
      expect(isValidKid(v), `isValidKid ${JSON.stringify(v).slice(0, 40)}`).toBe(
        cryptoIsValidKid(v)
      );
    }
  });

  it('computes identical byte lengths for well-formed vectors', () => {
    for (const v of vectors) {
      if (!isWellFormedUnicode(v)) continue;
      expect(utf8ByteLength(v)).toBe(cryptoUtf8ByteLength(v));
      expect(utf8ByteLength(v)).toBe(encoder.encode(v).length);
    }
  });

  it('both throw on malformed vectors', () => {
    for (const v of vectors) {
      if (isWellFormedUnicode(v)) continue;
      expect(() => utf8ByteLength(v)).toThrow();
      expect(() => cryptoUtf8ByteLength(v)).toThrow();
    }
  });
});
