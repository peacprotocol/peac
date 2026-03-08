/**
 * EAT Passport Decoder
 *
 * Decodes COSE_Sign1 structures containing EAT (Entity Attestation Token)
 * payloads per RFC 9711. Optionally verifies Ed25519 signatures per
 * RFC 9052 Section 4.4 (Sig_structure construction).
 *
 * References:
 *   - RFC 9052 Section 4.2 (COSE_Sign1 structure)
 *   - RFC 9052 Section 4.4 (Signing and Verification Process)
 *   - RFC 9053 Table 2 (EdDSA algorithm identifier: -8)
 *   - RFC 9711 (Entity Attestation Token)
 *   - RFC 8949 (CBOR encoding)
 *
 * Security:
 *   - 64 KB size limit enforced BEFORE CBOR decode (DoS prevention)
 *   - Only Ed25519 (COSE alg -8) supported; all others rejected
 *   - No network I/O (DD-55)
 */

import cbor from 'cbor';

const cborDecode = cbor.decode;
const cborEncode = cbor.encode;
import { ed25519Verify } from '@peac/crypto';
import type { CoseSign1, CoseProtectedHeaders, EatClaims, EatPassportResult } from './types.js';
import { COSE_ALG, EAT_SIZE_LIMIT } from './types.js';

/** Error class for EAT adapter failures */
export class EatAdapterError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'EatAdapterError';
  }
}

/**
 * Decode a COSE_Sign1 array from raw CBOR bytes.
 *
 * Validates the COSE_Sign1 structure per RFC 9052 Section 4.2:
 *   [protected, unprotected, payload, signature]
 *
 * @param data - Raw CBOR bytes
 * @returns Parsed COSE_Sign1 structure
 * @throws EatAdapterError on invalid CBOR or COSE structure
 */
function decodeCoseSign1(data: Uint8Array): CoseSign1 {
  let decoded: unknown;
  try {
    decoded = cborDecode(data);
  } catch {
    throw new EatAdapterError('EAT token is not valid CBOR', 'E_EAT_INVALID_CBOR');
  }

  // COSE_Sign1 is a CBOR array of exactly 4 elements
  if (!Array.isArray(decoded) || decoded.length !== 4) {
    throw new EatAdapterError(
      'EAT token is not a valid COSE_Sign1 structure (expected 4-element array)',
      'E_EAT_INVALID_COSE'
    );
  }

  const [protectedBytes, unprotectedMap, payload, signature] = decoded;

  if (!(protectedBytes instanceof Uint8Array)) {
    throw new EatAdapterError(
      'COSE_Sign1 protected header must be a byte string',
      'E_EAT_INVALID_COSE'
    );
  }

  if (payload === null) {
    throw new EatAdapterError(
      'Detached COSE_Sign1 payload (null) is not supported; EAT tokens require an attached payload',
      'E_EAT_INVALID_COSE'
    );
  }

  if (!(payload instanceof Uint8Array)) {
    throw new EatAdapterError('COSE_Sign1 payload must be a byte string', 'E_EAT_INVALID_COSE');
  }

  if (!(signature instanceof Uint8Array)) {
    throw new EatAdapterError('COSE_Sign1 signature must be a byte string', 'E_EAT_INVALID_COSE');
  }

  // Ed25519 signatures are exactly 64 bytes
  if (signature.length !== 64) {
    throw new EatAdapterError(
      `COSE_Sign1 signature has unexpected length ${signature.length} (expected 64 for Ed25519)`,
      'E_EAT_INVALID_COSE'
    );
  }

  return {
    protected: protectedBytes,
    unprotected: unprotectedMap instanceof Map ? unprotectedMap : new Map<number, unknown>(),
    payload,
    signature,
  };
}

/**
 * Decode and validate COSE protected headers.
 *
 * @param protectedBytes - CBOR-encoded protected headers
 * @returns Decoded headers with algorithm and optional kid
 * @throws EatAdapterError if algorithm is not EdDSA (-8)
 */
function decodeProtectedHeaders(protectedBytes: Uint8Array): CoseProtectedHeaders {
  if (protectedBytes.length === 0) {
    throw new EatAdapterError('COSE_Sign1 protected headers are empty', 'E_EAT_INVALID_COSE');
  }

  let headerMap: unknown;
  try {
    headerMap = cborDecode(protectedBytes);
  } catch {
    throw new EatAdapterError(
      'COSE_Sign1 protected headers are not valid CBOR',
      'E_EAT_INVALID_COSE'
    );
  }

  if (!(headerMap instanceof Map)) {
    throw new EatAdapterError(
      'COSE_Sign1 protected headers must be a CBOR map',
      'E_EAT_INVALID_COSE'
    );
  }

  // Label 1 = alg
  const alg = headerMap.get(1);
  if (typeof alg !== 'number') {
    throw new EatAdapterError(
      'COSE_Sign1 protected headers missing algorithm (label 1)',
      'E_EAT_INVALID_COSE'
    );
  }

  if (alg !== COSE_ALG.EdDSA) {
    throw new EatAdapterError(
      `Unsupported COSE algorithm ${alg}; only EdDSA (-8) is supported`,
      'E_EAT_UNSUPPORTED_ALG'
    );
  }

  // Label 4 = kid (optional)
  const kid = headerMap.get(4);

  return {
    alg,
    kid: kid instanceof Uint8Array || typeof kid === 'string' ? kid : undefined,
  };
}

/**
 * Decode EAT claims from COSE payload bytes.
 *
 * @param payload - CBOR-encoded payload
 * @returns EAT claims as a Map
 * @throws EatAdapterError if payload is not valid CBOR
 */
function decodeEatClaims(payload: Uint8Array): EatClaims {
  if (payload.length === 0) {
    return new Map();
  }

  let decoded: unknown;
  try {
    decoded = cborDecode(payload);
  } catch {
    throw new EatAdapterError('EAT payload is not valid CBOR', 'E_EAT_INVALID_CBOR');
  }

  if (decoded instanceof Map) {
    return decoded as EatClaims;
  }

  // Some CBOR decoders return plain objects for empty maps or when
  // configured without Map preference. Convert to Map for consistency.
  if (typeof decoded === 'object' && decoded !== null && !Array.isArray(decoded)) {
    const map = new Map<number | string, unknown>();
    for (const [k, v] of Object.entries(decoded as Record<string, unknown>)) {
      const numKey = Number(k);
      map.set(Number.isInteger(numKey) ? numKey : k, v);
    }
    return map;
  }

  throw new EatAdapterError('EAT payload must be a CBOR map', 'E_EAT_INVALID_CBOR');
}

/**
 * Construct the Sig_structure for COSE_Sign1 verification per RFC 9052 Section 4.4.
 *
 * Sig_structure1 = [
 *   context : "Signature1",
 *   body_protected : bstr,
 *   external_aad : bstr,
 *   payload : bstr
 * ]
 *
 * @param protectedBytes - Serialized protected headers
 * @param payload - Payload bytes
 * @param externalAad - External additional authenticated data (defaults to empty)
 * @returns CBOR-encoded Sig_structure bytes
 */
function buildSigStructure(
  protectedBytes: Uint8Array,
  payload: Uint8Array,
  externalAad: Uint8Array = new Uint8Array(0)
): Uint8Array {
  const sigStructure = ['Signature1', protectedBytes, externalAad, payload];
  return cborEncode(sigStructure);
}

/**
 * Decode an EAT passport from COSE_Sign1 CBOR bytes.
 *
 * Enforces a 64 KB size limit before CBOR decode (DoS prevention).
 * Validates COSE_Sign1 structure per RFC 9052 Section 4.2.
 * Optionally verifies Ed25519 signature per RFC 9052 Section 4.4.
 *
 * @param data - Raw COSE_Sign1 CBOR bytes
 * @param publicKey - Optional Ed25519 public key (32 bytes) for signature verification
 * @returns Decoded EAT passport with headers, claims, and optional signature validity
 * @throws EatAdapterError on size, CBOR, COSE, or algorithm errors
 */
export async function decodeEatPassport(
  data: Uint8Array,
  publicKey?: Uint8Array
): Promise<EatPassportResult> {
  // Size limit: 64 KB enforced BEFORE any CBOR decode
  if (data.length > EAT_SIZE_LIMIT) {
    throw new EatAdapterError(
      `EAT token is ${data.length} bytes, exceeding ${EAT_SIZE_LIMIT} byte limit`,
      'E_EAT_SIZE_EXCEEDED'
    );
  }

  if (data.length === 0) {
    throw new EatAdapterError('EAT token is empty', 'E_EAT_INVALID_CBOR');
  }

  // Step 1: Decode COSE_Sign1 structure
  const coseSign1 = decodeCoseSign1(data);

  // Step 2: Decode and validate protected headers
  const headers = decodeProtectedHeaders(coseSign1.protected);

  // Step 3: Decode EAT claims from payload
  const claims = decodeEatClaims(coseSign1.payload);

  // Step 4: Optionally verify Ed25519 signature
  let signatureValid: boolean | undefined;
  if (publicKey !== undefined) {
    if (publicKey.length !== 32) {
      throw new EatAdapterError(
        `Ed25519 public key must be 32 bytes, got ${publicKey.length}`,
        'E_EAT_SIGNATURE_FAILED'
      );
    }

    const sigStructureBytes = buildSigStructure(coseSign1.protected, coseSign1.payload);

    try {
      signatureValid = await ed25519Verify(coseSign1.signature, sigStructureBytes, publicKey);
    } catch {
      throw new EatAdapterError('Ed25519 signature verification failed', 'E_EAT_SIGNATURE_FAILED');
    }

    if (!signatureValid) {
      throw new EatAdapterError(
        'COSE_Sign1 Ed25519 signature is invalid',
        'E_EAT_SIGNATURE_FAILED'
      );
    }
  }

  return { headers, claims, signatureValid };
}
