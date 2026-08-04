/**
 * The I-JSON boundary.
 *
 * Every JSON document the verifier accepts -- key material and verification context -- passes
 * through here before JSON.parse can silently normalize it away.
 *
 * `assertIJson` is imported by DIRECT SOURCE PATH. It is not in the @peac/crypto exports map, and a
 * bundler alias for a non-exported subpath fails `tsc` (TS2307) because moduleResolution "bundler"
 * honours the exports map. This import resolves identically in tsc, Vite and Vitest.
 */
import { assertIJson } from '../../../../packages/crypto/src/ijson';
import { VerifierError, type VerifierErrorCode } from './errors.js';

const BOM = '\uFEFF';

/** UTF-8 byte length of a JS string. */
/**
 * UTF-8 byte length for input SIZE LIMITS.
 *
 * Deliberately distinct from the Layer-0 helper of the same name, which throws on malformed UTF-16
 * because it backs a validity rule. This one measures arbitrary user input before anything is known
 * about it, so it must return a number for every string: a size check that throws would convert an
 * oversized-input rejection into an internal error. The two are not duplicates and must not be
 * consolidated.
 */
export function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * TextEncoder silently replaces lone surrogates with U+FFFD, which would change both the bytes we
 * hash and the bytes the I-JSON gate inspects. Reject them at the string boundary instead.
 */
export function assertNoLoneSurrogates(s: string, code: VerifierErrorCode): void {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new VerifierError(code, 'unpaired high surrogate');
      }
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      throw new VerifierError(code, 'unpaired low surrogate');
    }
  }
}

/**
 * Map an I-JSON failure to a code, PRESERVING the three distinct pathologies.
 *
 * Collapsing all of them into one generic code destroys interoperable semantics: a duplicate member
 * name, an out-of-range number and an invalid string are different defects and downstream consumers
 * can act on the difference.
 */
export function ijsonCodeFor(
  cryptoCode: string | undefined,
  fallback: VerifierErrorCode
): VerifierErrorCode {
  switch (cryptoCode) {
    case 'CRYPTO_IJSON_DUPLICATE_MEMBER_NAME':
      return 'E_IJSON_DUPLICATE_MEMBER_NAME';
    case 'CRYPTO_IJSON_NUMBER_OUT_OF_RANGE':
      return 'E_IJSON_NUMBER_OUT_OF_RANGE';
    case 'CRYPTO_IJSON_INVALID_STRING':
      return 'E_IJSON_INVALID_STRING';
    default:
      return fallback;
  }
}

/** Run the raw-bytes I-JSON gate, preserving its classification. */
export function assertIJsonBytes(bytes: Uint8Array, fallback: VerifierErrorCode): void {
  try {
    assertIJson(bytes);
  } catch (e) {
    const cc = (e as { code?: string }).code;
    throw new VerifierError(ijsonCodeFor(cc, fallback), 'document is not valid I-JSON', cc);
  }
}

/**
 * Parse JSON under I-JSON (RFC 7493). Duplicate member names -- including escaped-equivalent ones
 * such as {"kid":"a","kid":"b"} -- are rejected on the RAW BYTES, before JSON.parse collapses
 * them to the last occurrence.
 */
export function parseStrictJsonText(text: string, invalidCode: VerifierErrorCode): unknown {
  if (text.startsWith(BOM)) throw new VerifierError(invalidCode, 'leading byte order mark');
  assertNoLoneSurrogates(text, invalidCode);
  assertIJsonBytes(new TextEncoder().encode(text), invalidCode);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new VerifierError(invalidCode, 'document is not valid JSON');
  }
}

/**
 * File input is decoded with a FATAL decoder so malformed or overlong UTF-8 is rejected rather than
 * silently replaced. Never use File.text() where byte identity matters.
 */
export function decodeFileBytesStrict(bytes: Uint8Array, code: VerifierErrorCode): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new VerifierError(code, 'input is not valid UTF-8');
  }
}
