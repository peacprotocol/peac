/**
 * The canonical `kid` validity rule, in ONE place.
 *
 * WHY UTF-8 BYTES, NOT `String.length`
 *
 * The length bound exists to cap the size of the serialized protected header (DoS safety).
 * JavaScript's `.length` counts UTF-16 code units, which does NOT bound that size: a 256-code-unit
 * kid built from astral code points serializes to 1024 UTF-8 bytes, four times the intended cap.
 * Bounding the UTF-8 serialization bounds the thing the rule is actually about.
 *
 * It is also the only unit that is deterministic ACROSS implementations. A bound stated in
 * "characters" denotes a different accepted set in JavaScript (UTF-16 code units), in Go and Rust
 * (bytes) and in Python (code points), so three conforming implementations would disagree about the
 * same record. A JSON Schema `maxLength` counts code points, which is a fourth answer again.
 *
 * WHY WELL-FORMEDNESS IS PART OF THE SAME RULE
 *
 * A length-only predicate accepted lone surrogates, and that was not merely untidy. Canonical
 * signing validates the kid and then `JSON.stringify`s the header, which emits an unpaired surrogate
 * as an escape such as `"\ud83d"`. The resulting protected header is rejected by the canonical I-JSON
 * verifier. The signer would therefore mint a record its own verifier refuses, and the failure would
 * surface at the recipient, where it is indistinguishable from tampering.
 *
 * There is no earlier raw-I-JSON boundary on the signing path or on programmatic schema validation,
 * so well-formedness must be checked HERE. Malformed UTF-16 is REJECTED, never silently replaced
 * with U+FFFD: substituting a replacement character would change the identifier the caller asked
 * for, and a verifier looking for the original kid would not find it.
 *
 * PACKAGE-PRIVATE. It sits beside the JWS implementation that owns kid validation and is exported
 * from no barrel; it does not need to be part of any published API to do its job.
 *
 * Applied to: the protected-header `kid` on signing and on verification, the JWK and JWKS `kid`, and
 * `VerificationContextV1.constraints.allowedKids` members. The internal JOSE-hardening observer in
 * `@peac/protocol` implements the same rule independently, so parity compares separate
 * implementations rather than a function with itself.
 *
 * NOT applied to the issuer-config revoked-key `kid`, which keeps its existing semantics.
 */

/** Maximum `kid` length, measured as UTF-8 bytes of the string's serialization. */
export const MAX_KID_UTF8_BYTES = 256;

/**
 * True when every surrogate in `s` belongs to a well-formed pair.
 *
 * Equivalent to `String.prototype.isWellFormed()` (ES2024), implemented directly so a Layer-0 rule
 * consumed by a browser app, by Node and by the test suites does not depend on the runtime's lib
 * level.
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
 * THROWS on malformed UTF-16 rather than returning a number. Returning one would invite callers to
 * accept a string on length grounds when it cannot be encoded at all; making the check impossible to
 * skip is what fixes the ordering, not a comment asking callers to remember.
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
