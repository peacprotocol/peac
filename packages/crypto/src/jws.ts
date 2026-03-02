/**
 * JWS compact serialization with Ed25519 (RFC 8032)
 * Dual-stack: Wire 0.1 (peac-receipt/0.1) and Wire 0.2 (interaction-record+jwt)
 */

import {
  sign as ed25519Sign,
  verify as ed25519Verify,
  getPublicKey,
  randomSecretKey,
} from './ed25519.js';
import { WIRE_01_JWS_TYP, WIRE_02_JWS_TYP, WIRE_02_JWS_TYP_ACCEPT, PEAC_ALG } from '@peac/kernel';
import {
  base64urlEncode,
  base64urlDecode,
  base64urlEncodeString,
  base64urlDecodeString,
} from './base64url';
import { CryptoError } from './errors';

// ---------------------------------------------------------------------------
// JWS header types: 3-variant discriminated union (Correction 1, DD-156)
// ---------------------------------------------------------------------------

/**
 * JWS header for Wire 0.1 receipts (typ: 'peac-receipt/0.1')
 */
export interface Wire01JWSHeader {
  typ: typeof WIRE_01_JWS_TYP;
  alg: typeof PEAC_ALG;
  kid: string;
}

/**
 * JWS header for Wire 0.2 receipts (typ: 'interaction-record+jwt', compact canonical form)
 *
 * The full media type 'application/interaction-record+jwt' is accepted by verify()
 * and decode() but normalized to this compact form before returning.
 */
export interface Wire02JWSHeader {
  typ: typeof WIRE_02_JWS_TYP;
  alg: typeof PEAC_ALG;
  kid: string;
}

/**
 * JWS header for tokens with no typ field
 *
 * Crypto layer passes these through without error.
 * The strictness decision (hard error vs. warning) belongs exclusively
 * in @peac/protocol.verifyLocal() (Correction 1, DD-156).
 */
export interface UnTypedJWSHeader {
  typ?: undefined;
  alg: typeof PEAC_ALG;
  kid: string;
}

/**
 * Discriminated union of all recognized JWS header variants.
 *
 * Callers narrow by checking `header.typ`:
 *   if (header.typ === WIRE_02_JWS_TYP) { ... Wire 0.2 path ... }
 *   if (header.typ === WIRE_01_JWS_TYP) { ... Wire 0.1 path ... }
 *   if (header.typ === undefined) { ... UnTyped / interop path ... }
 */
export type JWSHeader = Wire01JWSHeader | Wire02JWSHeader | UnTypedJWSHeader;

/**
 * Result of JWS verification
 */
export interface VerifyResult<T = unknown> {
  header: JWSHeader;
  payload: T;
  valid: boolean;
}

// ---------------------------------------------------------------------------
// Internal constants (NOT exported)
// ---------------------------------------------------------------------------

/** All typ values accepted by verify() / decode(). Includes full media type form. */
const ACCEPTED_TYP_VALUES = new Set<string>([WIRE_01_JWS_TYP, ...WIRE_02_JWS_TYP_ACCEPT]);

// ---------------------------------------------------------------------------
// validateWire02Header (exported, JOSE hardening, Correction 9, DD-156)
// ---------------------------------------------------------------------------

/**
 * Validate JOSE header fields for Wire 0.2 JOSE hardening requirements.
 *
 * Rejects:
 *   - Embedded key material (jwk, x5c, x5u, jku)
 *   - crit header (critical extensions)
 *   - b64: false (RFC 7797 unencoded payload)
 *   - zip header (payload compression)
 *   - Missing, empty, or oversized kid (DoS safety: max 256 chars)
 *
 * @param header - Raw parsed JWS header object
 * @throws CryptoError with CRYPTO_JWS_* code on any violation
 */
export function validateWire02Header(header: Record<string, unknown>): void {
  // kid: required, non-empty, max 256 chars (Correction 9, DoS safety)
  if (
    !header.kid ||
    typeof header.kid !== 'string' ||
    header.kid.length === 0 ||
    header.kid.length > 256
  ) {
    throw new CryptoError(
      'CRYPTO_JWS_MISSING_KID',
      'kid is missing, empty, or exceeds 256 characters'
    );
  }

  // Embedded key material: hard reject (prevents key confusion attacks)
  if (
    header.jwk !== undefined ||
    header.x5c !== undefined ||
    header.x5u !== undefined ||
    header.jku !== undefined
  ) {
    throw new CryptoError(
      'CRYPTO_JWS_EMBEDDED_KEY',
      'embedded key material (jwk/x5c/x5u/jku) is not permitted'
    );
  }

  // crit: hard reject
  if (header.crit !== undefined) {
    throw new CryptoError('CRYPTO_JWS_CRIT_REJECTED', 'crit header is not permitted');
  }

  // b64: false — RFC 7797 unencoded payload rejected
  if (header.b64 === false) {
    throw new CryptoError(
      'CRYPTO_JWS_B64_REJECTED',
      'b64:false (unencoded payload) is not permitted'
    );
  }

  // zip: hard reject
  if (header.zip !== undefined) {
    throw new CryptoError('CRYPTO_JWS_ZIP_REJECTED', 'zip header is not permitted');
  }
}

// ---------------------------------------------------------------------------
// Internal helper: build typed JWSHeader from raw parsed object
// ---------------------------------------------------------------------------

/**
 * Build a typed JWSHeader from a raw parsed header object, applying typ
 * normalization (Correction 2, DD-156): 'application/interaction-record+jwt'
 * is normalized to 'interaction-record+jwt' before returning.
 *
 * @param raw - Raw header object from JSON.parse
 * @returns Typed JWSHeader
 * @throws CryptoError if alg is not PEAC_ALG, or if typ is present and not in ACCEPTED_TYP_VALUES
 */
function buildHeader(raw: Record<string, unknown>): JWSHeader {
  // Validate alg (required)
  if (raw.alg !== PEAC_ALG) {
    throw new CryptoError(
      'CRYPTO_INVALID_ALG',
      `Invalid alg: expected ${PEAC_ALG}, got ${String(raw.alg)}`
    );
  }

  const rawTyp = raw.typ as string | undefined;

  // Normalize full media type to compact form (Correction 2)
  const canonicalTyp = rawTyp === 'application/interaction-record+jwt' ? WIRE_02_JWS_TYP : rawTyp;

  if (canonicalTyp !== undefined && !ACCEPTED_TYP_VALUES.has(rawTyp!)) {
    throw new CryptoError('CRYPTO_INVALID_TYP', `Invalid typ: ${String(rawTyp)}`);
  }

  const kid = typeof raw.kid === 'string' ? raw.kid : '';

  if (canonicalTyp === WIRE_01_JWS_TYP) {
    return { typ: WIRE_01_JWS_TYP, alg: PEAC_ALG, kid } satisfies Wire01JWSHeader;
  }
  if (canonicalTyp === WIRE_02_JWS_TYP) {
    return { typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid } satisfies Wire02JWSHeader;
  }

  // canonicalTyp is undefined: return UnTypedJWSHeader
  return { typ: undefined, alg: PEAC_ALG, kid } satisfies UnTypedJWSHeader;
}

// ---------------------------------------------------------------------------
// sign (Wire 0.1)
// ---------------------------------------------------------------------------

/**
 * Sign a payload with Ed25519 and return JWS compact serialization (Wire 0.1)
 *
 * Always sets typ to WIRE_01_JWS_TYP ('peac-receipt/0.1').
 * For Wire 0.2, use signWire02() instead.
 *
 * @param payload - JSON-serializable payload
 * @param privateKey - Ed25519 private key (32 bytes)
 * @param kid - Key ID (ISO 8601 timestamp)
 * @returns JWS compact serialization (header.payload.signature)
 */
export async function sign(payload: unknown, privateKey: Uint8Array, kid: string): Promise<string> {
  if (privateKey.length !== 32) {
    throw new CryptoError('CRYPTO_INVALID_KEY_LENGTH', 'Ed25519 private key must be 32 bytes');
  }

  const header: Wire01JWSHeader = {
    typ: WIRE_01_JWS_TYP,
    alg: PEAC_ALG,
    kid,
  };

  const headerB64 = base64urlEncodeString(JSON.stringify(header));
  const payloadB64 = base64urlEncodeString(JSON.stringify(payload));

  const signingInput = `${headerB64}.${payloadB64}`;
  const signingInputBytes = new TextEncoder().encode(signingInput);

  const signatureBytes = await ed25519Sign(signingInputBytes, privateKey);
  const signatureB64 = base64urlEncode(signatureBytes);

  return `${signingInput}.${signatureB64}`;
}

// ---------------------------------------------------------------------------
// signWire02 (Wire 0.2)
// ---------------------------------------------------------------------------

/**
 * Sign a Wire 0.2 payload with Ed25519 and return JWS compact serialization
 *
 * Always sets typ to WIRE_02_JWS_TYP ('interaction-record+jwt').
 * The payload MUST include peac_version: '0.2'.
 *
 * @param payload - JSON-serializable Wire 0.2 claims payload
 * @param privateKey - Ed25519 private key (32 bytes)
 * @param kid - Key ID (max 256 chars per JOSE hardening rules)
 * @returns JWS compact serialization (header.payload.signature)
 */
export async function signWire02(
  payload: unknown,
  privateKey: Uint8Array,
  kid: string
): Promise<string> {
  if (privateKey.length !== 32) {
    throw new CryptoError('CRYPTO_INVALID_KEY_LENGTH', 'Ed25519 private key must be 32 bytes');
  }

  // Validate kid length (Correction 9, DoS safety)
  if (!kid || kid.length === 0 || kid.length > 256) {
    throw new CryptoError(
      'CRYPTO_JWS_MISSING_KID',
      'kid is missing, empty, or exceeds 256 characters'
    );
  }

  // Always set typ: WIRE_02_JWS_TYP — no code path may omit it
  const header: Wire02JWSHeader = {
    typ: WIRE_02_JWS_TYP,
    alg: PEAC_ALG,
    kid,
  };

  const headerB64 = base64urlEncodeString(JSON.stringify(header));
  const payloadB64 = base64urlEncodeString(JSON.stringify(payload));

  const signingInput = `${headerB64}.${payloadB64}`;
  const signingInputBytes = new TextEncoder().encode(signingInput);

  const signatureBytes = await ed25519Sign(signingInputBytes, privateKey);
  const signatureB64 = base64urlEncode(signatureBytes);

  return `${signingInput}.${signatureB64}`;
}

// ---------------------------------------------------------------------------
// verify (dual-stack)
// ---------------------------------------------------------------------------

/**
 * Verify a JWS compact serialization with Ed25519
 *
 * Dual-stack: accepts Wire 0.1 (peac-receipt/0.1) and Wire 0.2
 * (interaction-record+jwt or application/interaction-record+jwt).
 *
 * Typ normalization (Correction 2): 'application/interaction-record+jwt' is
 * normalized to 'interaction-record+jwt' in the returned header.
 *
 * UnTypedJWSHeader (Correction 1): tokens with no typ are returned with
 * typ: undefined without error; @peac/protocol.verifyLocal() applies strictness.
 *
 * Coherence check:
 *   - typ === WIRE_02_JWS_TYP but payload.peac_version !== '0.2': CRYPTO_WIRE_VERSION_MISMATCH
 *   - typ === WIRE_01_JWS_TYP but payload.peac_version === '0.2': CRYPTO_WIRE_VERSION_MISMATCH
 *   - typ absent: no coherence check here; verifyLocal() handles it
 *
 * @param jws - JWS compact serialization
 * @param publicKey - Ed25519 public key (32 bytes)
 * @returns Verification result with typed header and decoded payload
 */
export async function verify<T = unknown>(
  jws: string,
  publicKey: Uint8Array
): Promise<VerifyResult<T>> {
  if (publicKey.length !== 32) {
    throw new CryptoError('CRYPTO_INVALID_KEY_LENGTH', 'Ed25519 public key must be 32 bytes');
  }

  const parts = jws.split('.');
  if (parts.length !== 3) {
    throw new CryptoError(
      'CRYPTO_INVALID_JWS_FORMAT',
      'Invalid JWS: must have three dot-separated parts'
    );
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Decode and build typed header
  const headerJson = base64urlDecodeString(headerB64);
  const rawHeader = JSON.parse(headerJson) as Record<string, unknown>;
  const header = buildHeader(rawHeader);

  // Apply JOSE hardening for Wire 0.2 and UnTyped tokens (Correction 1, DD-156).
  // JOSE security invariants (embedded key material, crit, b64:false, zip) MUST be
  // enforced regardless of whether typ is present. Interop mode controls routing only;
  // it does not exempt tokens from key-injection or unencoded-payload attacks.
  // Wire 0.1 tokens are excluded: the legacy format predates these constraints.
  if (header.typ === WIRE_02_JWS_TYP || header.typ === undefined) {
    validateWire02Header(rawHeader);
  }

  // Decode payload
  const payloadJson = base64urlDecodeString(payloadB64);
  const payload = JSON.parse(payloadJson) as T;

  // Coherence check: wire version consistency (only when typ is present)
  if (header.typ !== undefined) {
    const payloadVersion = (payload as Record<string, unknown>).peac_version;
    if (header.typ === WIRE_02_JWS_TYP && payloadVersion !== '0.2') {
      throw new CryptoError(
        'CRYPTO_WIRE_VERSION_MISMATCH',
        `typ is ${WIRE_02_JWS_TYP} but peac_version is ${String(payloadVersion)} (expected '0.2')`
      );
    }
    if (header.typ === WIRE_01_JWS_TYP && payloadVersion === '0.2') {
      throw new CryptoError(
        'CRYPTO_WIRE_VERSION_MISMATCH',
        `typ is ${WIRE_01_JWS_TYP} but peac_version is '0.2' (Wire 0.2 must use ${WIRE_02_JWS_TYP})`
      );
    }
  }

  // Verify Ed25519 signature
  const signatureBytes = base64urlDecode(signatureB64);
  const signingInput = `${headerB64}.${payloadB64}`;
  const signingInputBytes = new TextEncoder().encode(signingInput);
  const valid = await ed25519Verify(signatureBytes, signingInputBytes, publicKey);

  return { header, payload, valid };
}

// ---------------------------------------------------------------------------
// decode (dual-stack, unverified)
// ---------------------------------------------------------------------------

/**
 * Decode JWS without verifying signature
 *
 * UNSAFE: This function is for debugging and diagnostic inspection only.
 * It does NOT verify the Ed25519 signature and does NOT apply JOSE hardening
 * (embedded-key rejection, b64/zip/crit checks). Tokens returned by decode()
 * must never be trusted for authorization decisions.
 *
 * For secure verification use verify() instead.
 *
 * Applies the same typ normalization and header typing as verify().
 * Unrecognized typ values still throw CryptoError.
 *
 * @param jws - JWS compact serialization
 * @returns Decoded header and payload (unverified, no JOSE hardening applied)
 */
export function decode<T = unknown>(jws: string): { header: JWSHeader; payload: T } {
  const parts = jws.split('.');
  if (parts.length !== 3) {
    throw new CryptoError(
      'CRYPTO_INVALID_JWS_FORMAT',
      'Invalid JWS: must have three dot-separated parts'
    );
  }

  const [headerB64, payloadB64] = parts;

  const headerJson = base64urlDecodeString(headerB64);
  const rawHeader = JSON.parse(headerJson) as Record<string, unknown>;
  const header = buildHeader(rawHeader);

  const payloadJson = base64urlDecodeString(payloadB64);
  const payload = JSON.parse(payloadJson) as T;

  return { header, payload };
}

// ---------------------------------------------------------------------------
// generateKeypair
// ---------------------------------------------------------------------------

/**
 * Generate a random Ed25519 keypair
 *
 * @returns Private key (32 bytes) and public key (32 bytes)
 */
export async function generateKeypair(): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}> {
  const privateKey = randomSecretKey();
  const publicKey = await getPublicKey(privateKey);

  return { privateKey, publicKey };
}

// NOTE: generateKeypairFromSeed has been moved to @peac/crypto/testkit
// It's intentionally NOT exported from the main module to prevent accidental
// use in production. Use: import { generateKeypairFromSeed } from '@peac/crypto/testkit'

// ---------------------------------------------------------------------------
// Ed25519 JWK utilities
// ---------------------------------------------------------------------------

/**
 * Ed25519 JWK interface for private keys
 */
export interface Ed25519PrivateJwk {
  kty: 'OKP';
  crv: 'Ed25519';
  /** Public key (base64url encoded, 32 bytes) */
  x: string;
  /** Private key (base64url encoded, 32 bytes) */
  d: string;
}

/**
 * Derive the Ed25519 public key from a private key
 *
 * @param privateKey - Ed25519 private key (32 bytes)
 * @returns Public key (32 bytes)
 */
export async function derivePublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
  if (privateKey.length !== 32) {
    throw new CryptoError('CRYPTO_INVALID_KEY_LENGTH', 'Ed25519 private key must be 32 bytes');
  }
  return getPublicKey(privateKey);
}

/**
 * Validate that an Ed25519 JWK has a consistent keypair
 *
 * Derives the public key from the private key (d) and verifies it matches
 * the declared public key (x). This catches configuration errors where
 * the wrong key components are paired.
 *
 * @param jwk - Ed25519 JWK with both public (x) and private (d) components
 * @returns true if the keypair is consistent, false otherwise
 *
 * @example
 * ```typescript
 * const jwk = {
 *   kty: 'OKP',
 *   crv: 'Ed25519',
 *   x: 'base64url-encoded-public-key',
 *   d: 'base64url-encoded-private-key',
 * };
 *
 * if (!await validateKeypair(jwk)) {
 *   throw new Error('Invalid keypair: d does not derive to x');
 * }
 * ```
 */
export async function validateKeypair(jwk: Ed25519PrivateJwk): Promise<boolean> {
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519') {
    return false;
  }

  let privateKeyBytes: Uint8Array;
  let declaredPublicKeyBytes: Uint8Array;

  try {
    privateKeyBytes = base64urlDecode(jwk.d);
    declaredPublicKeyBytes = base64urlDecode(jwk.x);
  } catch {
    return false;
  }

  if (privateKeyBytes.length !== 32 || declaredPublicKeyBytes.length !== 32) {
    return false;
  }

  const derivedPublicKeyBytes = await getPublicKey(privateKeyBytes);

  if (derivedPublicKeyBytes.length !== declaredPublicKeyBytes.length) {
    return false;
  }

  for (let i = 0; i < derivedPublicKeyBytes.length; i++) {
    if (derivedPublicKeyBytes[i] !== declaredPublicKeyBytes[i]) {
      return false;
    }
  }

  return true;
}
