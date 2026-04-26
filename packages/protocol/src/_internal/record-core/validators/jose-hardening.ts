/**
 * Bounded internal JOSE header hardening validator.
 *
 * INTERNAL ONLY. This is the parity-observed counterpart of
 * @peac/crypto.validateWire02Header. Both implementations consume the
 * same JOSE protected-header object and apply the same five hardening
 * checks in the same order; behavioral parity is proven byte-equal by
 * the parity tests, not by code copy.
 *
 * Existing canonical hardening in @peac/crypto remains canonical. This
 * module is observational only; it is NOT re-exported from
 * packages/protocol/src/index.ts and is NOT wired into runtime paths
 * (issue.ts, verify-local.ts, peekHeader) in v0.13.1.
 *
 * Scope (must mirror validateWire02Header in packages/crypto/src/jws.ts):
 *
 *   1. kid presence and length:
 *      - missing kid (undefined / non-string / empty) -> CRYPTO_JWS_MISSING_KID
 *      - kid length > 256 chars -> CRYPTO_JWS_MISSING_KID
 *
 *   2. embedded key material (jwk, x5c, x5u, jku):
 *      - any of the four set -> CRYPTO_JWS_EMBEDDED_KEY
 *
 *   3. crit header:
 *      - any value (including null / empty array) -> CRYPTO_JWS_CRIT_REJECTED
 *
 *   4. b64: false (RFC 7797 unencoded payload):
 *      - the only rejected value is the boolean false; other values pass through
 *      - rejection -> CRYPTO_JWS_B64_REJECTED
 *
 *   5. zip header:
 *      - any value -> CRYPTO_JWS_ZIP_REJECTED
 *
 * Out of scope for this module (mirroring validateWire02Header exactly):
 *   - alg validation (lives in buildHeader, not validateWire02Header)
 *   - typ validation (lives in buildHeader)
 *   - signature verification
 *   - compact-JWS shape / size checks
 *
 * Order is significant: the canonical function returns the FIRST
 * matching violation per call (it throws on the first hit). The
 * internal validator emits the same first-hit code.
 */

/** Header input shape (matches the parsed JOSE protected header). */
export type JoseHardeningInput = Record<string, unknown>;

/**
 * Normalized result. accepted=true means the header passes all five
 * hardening checks. accepted=false carries the canonical CryptoError
 * code emitted by the corresponding canonical check.
 */
export type JoseHardeningResult =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly errorCode: string };

const KID_MAX_LENGTH = 256;

const ACCEPTED: JoseHardeningResult = { accepted: true } as const;

function rejected(errorCode: string): JoseHardeningResult {
  return { accepted: false, errorCode };
}

export function validateJoseHardeningInternal(header: JoseHardeningInput): JoseHardeningResult {
  // 1. kid presence and length
  if (
    !header.kid ||
    typeof header.kid !== 'string' ||
    header.kid.length === 0 ||
    header.kid.length > KID_MAX_LENGTH
  ) {
    return rejected('CRYPTO_JWS_MISSING_KID');
  }

  // 2. embedded key material
  if (
    header.jwk !== undefined ||
    header.x5c !== undefined ||
    header.x5u !== undefined ||
    header.jku !== undefined
  ) {
    return rejected('CRYPTO_JWS_EMBEDDED_KEY');
  }

  // 3. crit
  if (header.crit !== undefined) {
    return rejected('CRYPTO_JWS_CRIT_REJECTED');
  }

  // 4. b64: false (RFC 7797 unencoded payload)
  if (header.b64 === false) {
    return rejected('CRYPTO_JWS_B64_REJECTED');
  }

  // 5. zip
  if (header.zip !== undefined) {
    return rejected('CRYPTO_JWS_ZIP_REJECTED');
  }

  return ACCEPTED;
}
