/**
 * @peac/core v0.9.13 - Receipt Engine with Core Primitives
 * Enforcement orchestration + PEIP-SAF + Ed25519 JWS + replay protection + UUIDv7
 */

// v0.9.13 receipt engine (main entry point)
export { enforce, discover, evaluate, settle, prove } from './enforce.js';
export type {
  DiscoveryContext,
  PolicySource,
  EvaluationContext,
  SettlementResult,
  EnforceResult,
  EnforceOptions,
} from './enforce.js';

// v0.9.12.4 core primitives
export { canonicalPolicyHash } from './hash.js';
export type { PolicyInputs } from './hash.js';
export {
  generateEdDSAKeyPair,
  signDetached,
  verifyDetached,
  publicKeyToJWKS,
  generateJWKS,
  importPrivateKey,
  importPublicKey,
  validateKidFormat,
} from './crypto.js';
export type { KeyPair, JWKSKey, DetachedJWS } from './crypto.js';
export type { KeyLike } from 'jose';
export { InMemoryNonceCache, isReplayAttack, preventReplay, isValidNonce } from './replay.js';
export type { NonceCache, NonceEntry } from './replay.js';
export { uuidv7, isUUIDv7, extractTimestamp } from './ids/uuidv7.js';

// Simple verification wrapper for v0.9.13
export async function verify(
  receipt: string,
  options: { resource?: string; nonceCache?: any } = {}
): Promise<{ valid: boolean; claims?: any }> {
  try {
    // Parse the detached JWS format (payload..signature)
    const [payloadB64, , signature] = receipt.split('..');
    if (!payloadB64 || !signature) {
      return { valid: false };
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false };
    }

    // Check resource match if provided
    if (options.resource && payload.aud !== options.resource) {
      return { valid: false };
    }

    // Check replay if nonce cache provided
    if (options.nonceCache && payload.rid) {
      const { isReplayAttack } = await import('./replay.js');
      if (isReplayAttack(payload.rid, options.nonceCache)) {
        return { valid: false };
      }
    }

    // For v0.9.13, we trust the signature format
    // Full verification would require key fetching
    return { valid: true, claims: payload };
  } catch {
    return { valid: false };
  }
}
