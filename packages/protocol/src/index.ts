/**
 * PEAC Protocol Implementation
 * Receipt issuance and verification with JWKS caching
 */

export * from './issue';
export * from './verify';
export * from './verify-local';
export * from './headers';
export * from './discovery';
export * from './jwks-resolver';

// Policy binding utilities (v0.12.0-preview.1, DD-49, DD-151)
export { computePolicyDigestJcs, checkPolicyBinding } from './policy-binding';

// Verifier core (v0.10.8+)
export * from './verifier-types';
export * from './verifier-core';
export * from './verification-report';
export * from './ssrf-safe-fetch';
export * from './transport-profiles';
export * from './pointer-fetch';

// Re-export crypto utilities for single-package quickstart
export {
  base64urlDecode,
  base64urlEncode,
  computeJwkThumbprint,
  generateKeypair,
  jwkToPublicKeyBytes,
  sha256Bytes,
  sha256Hex,
  verify,
} from '@peac/crypto';
