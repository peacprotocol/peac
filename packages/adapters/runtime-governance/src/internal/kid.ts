/**
 * The PEAC `kid` rule: a non-empty, well-formed Unicode string whose UTF-8 serialization is at
 * most MAX_KID_UTF8_BYTES bytes. RFC 7515 leaves the structure of `kid` unspecified; the bound
 * and well-formedness requirements are PEAC application-level constraints.
 *
 * Adapter-private. The authoritative implementation lives in `@peac/crypto` (`src/kid.ts`) and is
 * not part of its public surface, so the rule is restated here and a behavioural parity test holds
 * the two implementations identical. The bound is measured in UTF-8 bytes rather than UTF-16 code
 * units: 256 UTF-16 code units consisting of supplementary-plane characters serialize to 512 UTF-8
 * bytes. A serialized-byte bound is portable across implementations.
 */

/** Maximum `kid` length, measured as UTF-8 bytes of the string's serialization. */
export const MAX_KID_UTF8_BYTES = 256;

/** True when every surrogate in `s` belongs to a well-formed pair. */
export function isWellFormedUnicode(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next < 0xdc00 || next > 0xdfff) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/**
 * UTF-8 byte length of a well-formed string. Throws on malformed UTF-16 so callers cannot silently
 * replace an unpaired surrogate with U+FFFD during UTF-8 encoding and thereby change the supplied
 * identifier.
 */
export function utf8ByteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next < 0xdc00 || next > 0xdfff) {
        throw new TypeError('utf8ByteLength: unpaired high surrogate');
      }
      n += 4;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      throw new TypeError('utf8ByteLength: unpaired low surrogate');
    } else n += 3;
  }
  return n;
}

/** The complete PEAC `kid` rule. */
export function isValidKid(kid: unknown): kid is string {
  if (typeof kid !== 'string' || kid.length === 0) return false;
  if (!isWellFormedUnicode(kid)) return false;
  return utf8ByteLength(kid) <= MAX_KID_UTF8_BYTES;
}
