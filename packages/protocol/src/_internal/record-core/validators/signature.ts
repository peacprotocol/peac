/**
 * Bounded internal signature validator (canonical-composed).
 *
 * INTERNAL ONLY. Thin wrapper around `verify` from `@peac/crypto`.
 * Surfaces the canonical Ed25519 signature-verification result
 * projected into the bounded validator's accept/reject contract.
 * The wrapper has no decision logic of its own and never re-implements
 * Ed25519; it always delegates to the canonical signer/verifier.
 *
 * Module is observational only; not re-exported from
 * `packages/protocol/src/index.ts` and not wired into the public
 * runtime path.
 *
 * SCOPE:
 *   - Run `verify(serialized, publicKey)` against the supplied compact JWS.
 *   - On structural-format failure (CryptoError with a CRYPTO_* code),
 *     surface the code unchanged.
 *   - On signature mismatch, surface CRYPTO_INVALID_SIGNATURE.
 *   - On success, accepted=true with no further claims projection.
 *
 * Out of scope:
 *   - JOSE header hardening (handled by `jose-hardening.ts`).
 *   - typ strictness routing (handled by `jose-typ-strictness.ts`).
 *   - Schema parse on the verified payload (handled by `schema-parse.ts`).
 */

import { verify as cryptoVerify } from '@peac/crypto';

export interface SignatureResult {
  readonly accepted: boolean;
  readonly errorCode?: string;
}

export async function validateSignatureInternal(
  serialized: string,
  publicKey: Uint8Array
): Promise<SignatureResult> {
  try {
    const result = await cryptoVerify(serialized, publicKey);
    if (result.valid) return { accepted: true };
    return { accepted: false, errorCode: 'CRYPTO_INVALID_SIGNATURE' };
  } catch (err) {
    const code =
      err &&
      typeof err === 'object' &&
      'code' in err &&
      typeof (err as { code: unknown }).code === 'string'
        ? (err as { code: string }).code
        : 'CRYPTO_UNKNOWN';
    return { accepted: false, errorCode: code };
  }
}
