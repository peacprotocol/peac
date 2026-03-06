/**
 * EAT (Entity Attestation Token) and COSE types
 *
 * References:
 *   - RFC 9711 (Entity Attestation Token)
 *   - RFC 9052 Section 4.2 (COSE_Sign1)
 *   - RFC 9053 (COSE Initial Algorithms)
 *   - RFC 8949 (CBOR)
 */

/**
 * COSE_Sign1 structure per RFC 9052 Section 4.2.
 *
 * COSE_Sign1 = [
 *   protected : bstr,        -- Serialized protected headers (CBOR-encoded map)
 *   unprotected : map,       -- Unprotected headers (CBOR map, may be empty)
 *   payload : bstr / nil,    -- Payload bytes
 *   signature : bstr         -- Signature bytes
 * ]
 */
export interface CoseSign1 {
  protected: Uint8Array;
  unprotected: Map<number, unknown>;
  payload: Uint8Array;
  signature: Uint8Array;
}

/**
 * Decoded COSE protected headers.
 *
 * COSE header parameter labels (integer keys per RFC 9052 Section 3.1):
 *   1 = alg (algorithm)
 *   4 = kid (key identifier)
 */
export interface CoseProtectedHeaders {
  alg: number;
  kid?: Uint8Array | string;
}

/** COSE algorithm identifiers per RFC 9053 Table 2 */
export const COSE_ALG = {
  /** EdDSA (Ed25519 or Ed448) */
  EdDSA: -8,
} as const;

/**
 * EAT standard claim keys (CBOR integer labels per RFC 9711 Section 4).
 *
 * Many of these inherit from CWT (RFC 8392) claim labels.
 */
export const EAT_CLAIM_KEY = {
  iss: 1,
  sub: 2,
  aud: 3,
  exp: 4,
  nbf: 5,
  iat: 6,
  cti: 7,
  nonce: 10,
  ueid: 256,
  sueids: 257,
  oemid: 258,
  hwmodel: 259,
  hwversion: 260,
  swname: 271,
  swversion: 272,
  oemueid: 273,
  secboot: 262,
  dbgstat: 263,
  location: 264,
  profile: 265,
  submods: 266,
  uptime: 261,
  intuse: 267,
  dloas: 268,
  manifests: 269,
  measurements: 270,
} as const;

/**
 * Decoded EAT claims (CBOR map with integer or string keys).
 *
 * The decoder preserves the raw CBOR map. The claim mapper extracts
 * specific claims by integer key.
 */
export type EatClaims = Map<number | string, unknown>;

/** Result of decoding and verifying an EAT passport */
export interface EatPassportResult {
  /** Decoded protected headers */
  headers: CoseProtectedHeaders;
  /** Raw EAT claims map */
  claims: EatClaims;
  /** Whether the Ed25519 signature is valid (only present if publicKey provided) */
  signatureValid?: boolean;
}

/** Options for the claim mapper */
export interface ClaimMapperOptions {
  /**
   * Claim keys whose raw values should be included in the mapped output.
   * By default, all claim values are hashed (SHA-256 digest) for privacy.
   * List specific integer keys here to include their raw values.
   */
  includeRawClaims?: number[];
  /** Receipt type (reverse-DNS or URI). Defaults to 'org.peacprotocol/attestation' */
  type?: string;
  /** Pillars to include on the receipt. Defaults to ['identity'] */
  pillars?: string[];
}

/** Mapped Wire 0.2 claims from an EAT passport */
export interface MappedEatClaims {
  kind: 'evidence';
  type: string;
  pillars?: string[];
  /** Hashed or raw claim values, keyed by claim label */
  attestation_claims: Record<string, string>;
  /** Original issuer from EAT (if present) */
  eat_iss?: string;
  /** Original subject from EAT (if present) */
  eat_sub?: string;
}

/** Size limit for EAT tokens (64 KB, consistent with carrier transport limits) */
export const EAT_SIZE_LIMIT = 65_536;
