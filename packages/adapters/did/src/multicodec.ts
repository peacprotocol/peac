/**
 * Ed25519 multicodec prefix parsing.
 *
 * Supports both multibase forms allowed by the did:key spec (CCG v0.9):
 * - 'z' prefix: base58btc encoding
 * - 'u' prefix: base64url encoding
 *
 * The Ed25519 multicodec prefix is 0xed01 as a varint (2 bytes).
 * After stripping the 2-byte prefix, the remaining 32 bytes are
 * the raw Ed25519 public key.
 */

import { DIDError } from './errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Ed25519 multicodec prefix as varint: [0xed, 0x01] */
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);

/** Expected Ed25519 public key length in bytes */
const ED25519_KEY_LENGTH = 32;

/** Total expected length: 2 byte prefix + 32 byte key */
const ED25519_MULTICODEC_LENGTH = ED25519_MULTICODEC_PREFIX.length + ED25519_KEY_LENGTH;

// ---------------------------------------------------------------------------
// Base58btc decoder (minimal, for 'z' prefix multibase)
// ---------------------------------------------------------------------------

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP = new Map<string, number>();
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP.set(BASE58_ALPHABET[i], i);
}

function base58btcDecode(input: string): Uint8Array {
  if (input.length === 0) return new Uint8Array(0);

  // Count leading '1's (zero bytes)
  let zeros = 0;
  while (zeros < input.length && input[zeros] === '1') {
    zeros++;
  }

  // Decode
  const size = Math.ceil((input.length * 733) / 1000) + 1;
  const b256 = new Uint8Array(size);
  let length = 0;

  for (let i = zeros; i < input.length; i++) {
    const value = BASE58_MAP.get(input[i]);
    if (value === undefined) {
      throw new DIDError('E_DID_DOCUMENT_INVALID', `Invalid base58btc character: ${input[i]}`);
    }
    let carry = value;
    for (let j = 0; j < length || carry > 0; j++) {
      carry += 58 * (b256[j] || 0);
      b256[j] = carry % 256;
      carry = Math.floor(carry / 256);
      if (j >= length) length = j + 1;
    }
  }

  // Build result with leading zeros
  const result = new Uint8Array(zeros + length);
  for (let i = 0; i < length; i++) {
    result[zeros + length - 1 - i] = b256[i];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Base64url decoder (for 'u' prefix multibase)
// ---------------------------------------------------------------------------

function base64urlDecode(input: string): Uint8Array {
  return new Uint8Array(Buffer.from(input, 'base64url'));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract an Ed25519 public key from a multibase-encoded multicodec value.
 *
 * Supports both multibase prefixes:
 * - 'z': base58btc (e.g., did:key:z6Mk...)
 * - 'u': base64url
 *
 * @param multibaseValue - The multibase-encoded value (including prefix character)
 * @returns 32-byte Ed25519 public key
 * @throws DIDError if not Ed25519 or malformed
 */
export function extractEd25519FromMultibase(multibaseValue: string): Uint8Array {
  if (multibaseValue.length < 2) {
    throw new DIDError('E_DID_DOCUMENT_INVALID', 'Multibase value too short');
  }

  const prefix = multibaseValue[0];
  const encoded = multibaseValue.slice(1);
  let decoded: Uint8Array;

  if (prefix === 'z') {
    decoded = base58btcDecode(encoded);
  } else if (prefix === 'u') {
    decoded = base64urlDecode(encoded);
  } else {
    throw new DIDError(
      'E_DID_DOCUMENT_INVALID',
      `Unsupported multibase prefix: '${prefix}'. Expected 'z' (base58btc) or 'u' (base64url).`
    );
  }

  // Check total length
  if (decoded.length !== ED25519_MULTICODEC_LENGTH) {
    throw new DIDError(
      'E_DID_KEY_NOT_FOUND',
      `Expected ${ED25519_MULTICODEC_LENGTH} bytes (2 prefix + 32 key), got ${decoded.length}`
    );
  }

  // Verify Ed25519 multicodec prefix (0xed, 0x01)
  if (decoded[0] !== ED25519_MULTICODEC_PREFIX[0] || decoded[1] !== ED25519_MULTICODEC_PREFIX[1]) {
    // Non-Ed25519 key type: do NOT throw an oracle-revealing error about
    // what type it is. Just say Ed25519 not found.
    throw new DIDError('E_DID_KEY_NOT_FOUND', 'Multicodec prefix does not indicate Ed25519');
  }

  return decoded.slice(2);
}
