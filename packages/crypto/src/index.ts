/**
 * PEAC Protocol Crypto Package
 *
 * Ed25519 JWS signing/verification, JSON Canonicalization (RFC 8785),
 * and platform-agnostic cryptographic utilities.
 *
 * All primitives are runtime-agnostic (Node.js, browser, edge workers).
 *
 * @packageDocumentation
 */

export * from './base64url';
export * from './errors';
export * from './hash';
export * from './jcs';
export * from './jws';

// Raw Ed25519 primitives (re-exported with `ed25519` prefix to avoid name collisions)
export {
  sign as ed25519Sign,
  verify as ed25519Verify,
  getPublicKey as ed25519GetPublicKey,
  randomSecretKey as ed25519RandomSecretKey,
} from './ed25519';
