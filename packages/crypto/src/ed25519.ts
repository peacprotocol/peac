/**
 * Internal Ed25519 wrapper -- async-only surface
 *
 * Signing uses the async methods from @noble/ed25519 (Web Crypto backed).
 * In noble v3, sync methods require explicit hash configuration; async methods
 * use built-in Web Crypto and need no configuration.
 *
 * Verification uses the PEAC Ed25519 verification profile (see verify() below),
 * which is implemented on the Web Crypto Subtle API rather than noble, because
 * noble's verifier (both ZIP215 default and { zip215: false }) uses cofactored
 * verification on certain edge inputs and therefore does NOT agree with the Go
 * reference verifier (crypto/ed25519, cofactorless) on the ed25519-speccheck
 * corpus. Web Crypto Ed25519 is cofactorless and matches Go.
 *
 * This module re-exports only the async surface to prevent accidental sync
 * usage. All other modules in @peac/crypto MUST import from this file, never
 * directly from '@noble/ed25519'.
 *
 * Key material handling:
 * - Private keys are 32-byte Uint8Array (Ed25519 seed)
 * - Public keys are 32-byte Uint8Array (compressed Ed25519 point)
 * - JavaScript cannot guarantee memory zeroization; callers should avoid
 *   storing keys longer than necessary and never log key bytes
 * - randomSecretKey() uses crypto.getRandomValues() (CSPRNG)
 */

// Namespace import avoids tsup tree-shaking false positive in multi-entry builds
// where signAsync appears unused in the testkit entry point.
import * as ed from '@noble/ed25519';

import { isRejectedEd25519PointEncoding } from './internal/ed25519-admissibility';

/** Sign a message with Ed25519 (async, Web Crypto backed) */
export const sign = ed.signAsync;

/** Derive public key from private key (async, Web Crypto backed) */
export const getPublicKey = ed.getPublicKeyAsync;

/** Generate a cryptographically random 32-byte secret key (CSPRNG) */
export const randomSecretKey = ed.utils.randomSecretKey;

const ED25519_PUBLIC_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;

/**
 * Ed25519 group order L = 2^252 + 27742317777372353535851937790883648493,
 * encoded as 32 little-endian bytes (the same layout as the signature scalar S,
 * which occupies signature bytes 32..64 little-endian). The scalar S MUST be
 * reduced modulo L; values S >= L are non-canonical and are rejected (the
 * RFC 8032 malleability guard, part of the PEAC Ed25519 verification profile).
 * Stored as bytes (not a bigint) so the admissibility check is a fixed-width
 * byte comparison with no allocation.
 */
const ED25519_GROUP_ORDER_L_LE = Uint8Array.from([
  0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde, 0x14,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
]);

/**
 * True if the signature scalar S (signature bytes 32..64, little-endian) is
 * greater than or equal to the Ed25519 group order L. Both S and L are 32-byte
 * little-endian magnitudes; compare from the most significant byte (index 31)
 * down. No bigint, no allocation; constant 32-byte work over public inputs.
 */
function scalarIsNonCanonical(signature: Uint8Array): boolean {
  for (let i = ED25519_PUBLIC_KEY_BYTES - 1; i >= 0; i--) {
    const sByte = signature[ED25519_PUBLIC_KEY_BYTES + i];
    const lByte = ED25519_GROUP_ORDER_L_LE[i];
    if (sByte !== lByte) return sByte > lByte;
  }
  // S == L exactly: non-canonical (S must be strictly < L).
  return true;
}

/**
 * Thrown only when the runtime cannot provide the cofactorless Ed25519
 * primitive PEAC requires. The verifier fails closed: it never silently falls
 * back to a different verification predicate.
 */
export class Ed25519RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Ed25519RuntimeError';
  }
}

// Web Crypto types (CryptoKey, BufferSource, SubtleCrypto) are not in this
// package's `lib` ("ES2022", no DOM). Derive what we need from the ambient
// `globalThis.crypto` typing provided by @types/node, mirroring the pattern in
// hash.ts and @peac/http-signatures, so no DOM lib is required.
type Subtle = NonNullable<typeof globalThis.crypto>['subtle'];

function subtleCrypto(): Subtle {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Ed25519RuntimeError(
      'Web Crypto SubtleCrypto is unavailable; PEAC Ed25519 verification requires it'
    );
  }
  return c.subtle;
}

/**
 * Read an error's `name` structurally (no `instanceof DOMException`, which is
 * not defined in every runtime). Used to tell an unsupported-algorithm runtime
 * failure apart from a malformed-input rejection.
 */
function errorName(err: unknown): string | undefined {
  return err !== null &&
    typeof err === 'object' &&
    'name' in err &&
    typeof (err as { name: unknown }).name === 'string'
    ? (err as { name: string }).name
    : undefined;
}

/**
 * True when a Web Crypto operation failed because the runtime does not support
 * the Ed25519 algorithm (as opposed to rejecting a malformed/invalid input).
 * Web Crypto raises NotSupportedError for an unsupported algorithm. We map this
 * to a fail-closed Ed25519RuntimeError so an unsupported runtime is never
 * misreported as an invalid signature.
 */
function isUnsupportedEd25519Runtime(err: unknown): boolean {
  return errorName(err) === 'NotSupportedError';
}

/**
 * Verify an Ed25519 signature under the PEAC Ed25519 verification profile.
 *
 * Profile order, identical in the Go reference verifier:
 *   1. validate public-key and signature lengths;
 *   2. bounded admissibility precheck on the public key A;
 *   3. reject a non-reduced scalar S >= L (the RFC 8032 malleability guard);
 *   4. bounded admissibility precheck on the signature component R;
 *   5. delegate remaining curve validity and the signature equation to the runtime primitive.
 *
 * Steps 2 and 4 are the SAME bounded precheck applied to two different inputs. It rejects encoded
 * y >= p, the two x = 0 encodings whose sign bit is set, the eight canonical torsion encodings and
 * two canonical order-4L encodings retained by PEAC policy. It performs neither complete point
 * decoding, complete curve validation, prime-subgroup membership testing, nor complete mixed-order
 * rejection.
 *
 * Rationale: runtimes disagree at these edges. Web Cryptography Level 2 rejects invalid or
 * small-order A and R before applying the cofactorless equation and notes implementations have not
 * behaved uniformly; RFC 8032 permits the cofactored equation, whose accepted set differs here.
 * Deciding the enumerated cases in PEAC makes the outcome independent of the primitive underneath.
 *
 * Verify-only: signing output is unchanged, so every signature produced by sign() remains valid.
 *
 * Fails closed: if the runtime lacks Web Crypto Ed25519 this throws Ed25519RuntimeError. It never
 * falls back to a different verification path, which would silently change the predicate.
 */
export async function verify(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array
): Promise<boolean> {
  // 1. Length checks (constant, public inputs).
  if (publicKey.length !== ED25519_PUBLIC_KEY_BYTES) return false;
  if (signature.length !== ED25519_SIGNATURE_BYTES) return false;

  // 2. Bounded admissibility precheck on the public key.
  if (isRejectedEd25519PointEncoding(publicKey)) return false;

  // 3. Reject non-reduced scalar S >= L (fixed-width little-endian byte
  // comparison; both operands are public signature bytes, an admissibility
  // guard, not secret-dependent key handling).
  if (scalarIsNonCanonical(signature)) return false;

  // 4. The same bounded precheck on the signature component R. Reached only after the 64-byte
  //    length check above, so this zero-copy view is always in range.
  if (isRejectedEd25519PointEncoding(signature.subarray(0, ED25519_PUBLIC_KEY_BYTES))) return false;

  // 5. Cofactorless verification via Web Crypto (fails closed if unavailable).
  const subtle = subtleCrypto();
  let key: Awaited<ReturnType<Subtle['importKey']>>;
  try {
    key = await subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify']);
  } catch (err) {
    // A runtime that has crypto.subtle but does NOT support Ed25519 raises
    // NotSupportedError here. That is a runtime-capability failure, not an
    // invalid key: fail closed rather than misreport it as an invalid
    // signature. A malformed / non-decodable public-key encoding (DataError or
    // similar) is a genuine rejection and returns false.
    if (isUnsupportedEd25519Runtime(err)) {
      throw new Ed25519RuntimeError(
        'Web Crypto Ed25519 verification is unavailable in this runtime'
      );
    }
    return false;
  }
  try {
    return await subtle.verify({ name: 'Ed25519' }, key, signature, message);
  } catch (err) {
    // Same distinction at the verify step: an unsupported-algorithm runtime
    // fails closed; any other operational error is a verification failure.
    if (isUnsupportedEd25519Runtime(err)) {
      throw new Ed25519RuntimeError(
        'Web Crypto Ed25519 verification is unavailable in this runtime'
      );
    }
    return false;
  }
}
