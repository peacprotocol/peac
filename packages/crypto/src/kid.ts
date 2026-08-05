/**
 * The canonical `kid` rule.
 *
 * A `kid` is a non-empty, well-formed Unicode string whose UTF-8 serialization is at most
 * MAX_KID_UTF8_BYTES bytes.
 *
 * The bound is in UTF-8 bytes because that is what bounds the serialized protected header: 256
 * UTF-16 code units of astral code points serialize to 1024 bytes. It is also the only unit on which
 * independent implementations agree, since a bound stated in "characters" counts code units in
 * JavaScript, bytes in Go and Rust, and code points in Python and JSON Schema.
 *
 * Well-formedness is part of the same rule because signing serializes the header with
 * JSON.stringify, which emits an unpaired surrogate as an escape that the I-JSON verifier rejects.
 * Without this check a signer could mint a record its own verifier refuses. Malformed input is
 * rejected rather than replaced with U+FFFD, which would change the identifier the caller supplied.
 *
 * Package-private: applied by signing, header validation, and the verifier application through an
 * explicit source import.
 */

/** Maximum `kid` length, measured as UTF-8 bytes of the string's serialization. */
export const MAX_KID_UTF8_BYTES = 256;

/**
 * True when every surrogate in `s` belongs to a well-formed pair.
 *
 * Equivalent to `String.prototype.isWellFormed()` (ES2024), implemented directly so the rule does
 * not depend on the runtime's lib level.
 */
export function isWellFormedUnicode(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      // High surrogate: the next unit must be a low surrogate.
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next < 0xdc00 || next > 0xdfff) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      // A low surrogate not consumed by the branch above is unpaired.
      return false;
    }
  }
  return true;
}

/**
 * UTF-8 byte length of a WELL-FORMED string, computed without allocating an encoded copy.
 *
 * Throws on malformed UTF-16 rather than returning a number, so a caller cannot accept a string on
 * length grounds when it cannot be encoded at all.
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
      n += 4; // a well-formed surrogate pair is one 4-byte code point
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      throw new TypeError('utf8ByteLength: unpaired low surrogate');
    } else n += 3;
  }
  return n;
}

/**
 * The complete canonical `kid` rule: a non-empty, well-formed Unicode string whose UTF-8
 * serialization is at most `MAX_KID_UTF8_BYTES` bytes.
 */
export function isValidKid(kid: unknown): kid is string {
  if (typeof kid !== 'string' || kid.length === 0) return false;
  if (!isWellFormedUnicode(kid)) return false;
  return utf8ByteLength(kid) <= MAX_KID_UTF8_BYTES;
}
