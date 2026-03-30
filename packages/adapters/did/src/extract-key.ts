/**
 * Verification key extraction from DID Documents.
 *
 * Implements DD-202 (DID Verification Method Selection Policy):
 * 1. Prefer methods referenced in authentication/assertionMethod
 * 2. If multiple eligible Ed25519 methods remain, require caller keyId
 *    or fail with E_DID_KEY_AMBIGUOUS
 * 3. Only Ed25519 keys extracted; other types silently skipped
 * 4. Iterates ALL methods regardless of match (no early-return oracle)
 */

import type { DIDDocument, VerificationMethod } from './types.js';
import { extractEd25519FromMultibase } from './multicodec.js';
import { DIDError } from './errors.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ExtractKeyOptions {
  /**
   * Explicit key ID to select.
   * If provided, only methods with this ID are considered.
   */
  keyId?: string;
  /**
   * Which verification relationship to prefer.
   * Default: 'authentication'
   */
  relationship?: 'authentication' | 'assertionMethod';
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Extract an Ed25519 public key from a DID Document.
 *
 * Selection policy (DD-202):
 * 1. Collect all verification methods from the document
 * 2. Filter by keyId if provided
 * 3. Filter by relationship references (authentication/assertionMethod)
 * 4. Try to extract Ed25519 key from each eligible method
 * 5. If exactly one Ed25519 key found: return it
 * 6. If zero found: return null
 * 7. If multiple found without keyId: throw E_DID_KEY_AMBIGUOUS
 *
 * All methods are iterated regardless of match to prevent key-type oracle.
 *
 * @param document - The resolved DID Document
 * @param options - Key selection options
 * @returns 32-byte Ed25519 public key, or null if no suitable key found
 * @throws DIDError with E_DID_KEY_AMBIGUOUS if multiple eligible keys
 */
export function extractVerificationKey(
  document: DIDDocument,
  options?: ExtractKeyOptions
): Uint8Array | null {
  const methods = document.verificationMethod ?? [];
  const relationship = options?.relationship ?? 'authentication';
  const keyId = options?.keyId;

  // Get relationship-referenced method IDs
  const relationshipRefs = getRelationshipRefs(document, relationship);

  // Collect all eligible Ed25519 keys (iterate ALL methods, no early return)
  const candidates: Uint8Array[] = [];

  for (const method of methods) {
    // Filter by keyId if specified
    if (keyId && method.id !== keyId) {
      continue;
    }

    // Prefer relationship-referenced methods if refs exist
    if (relationshipRefs.length > 0 && !relationshipRefs.includes(method.id)) {
      continue;
    }

    // Try to extract Ed25519 key (silently skip non-Ed25519)
    const key = tryExtractEd25519(method);
    if (key) {
      candidates.push(key);
    }
  }

  // If no relationship-referenced methods found, fall back to all methods
  if (candidates.length === 0 && relationshipRefs.length > 0) {
    for (const method of methods) {
      if (keyId && method.id !== keyId) continue;
      const key = tryExtractEd25519(method);
      if (key) candidates.push(key);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  // Multiple Ed25519 keys without explicit keyId selection
  throw new DIDError(
    'E_DID_KEY_AMBIGUOUS',
    `Found ${candidates.length} eligible Ed25519 keys. Provide keyId to select.`
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get verification method IDs referenced by a relationship.
 */
function getRelationshipRefs(
  document: DIDDocument,
  relationship: 'authentication' | 'assertionMethod'
): string[] {
  const refs = document[relationship];
  if (!refs) return [];

  return refs
    .map((ref) => (typeof ref === 'string' ? ref : ref.id))
    .filter((id): id is string => typeof id === 'string');
}

/**
 * Try to extract an Ed25519 key from a verification method.
 * Returns null for non-Ed25519 methods (no oracle).
 */
function tryExtractEd25519(method: VerificationMethod): Uint8Array | null {
  // Try publicKeyMultibase (Multikey / Ed25519VerificationKey2020)
  if (method.publicKeyMultibase) {
    try {
      return extractEd25519FromMultibase(method.publicKeyMultibase);
    } catch {
      return null;
    }
  }

  // Try publicKeyJwk (JsonWebKey2020, OKP/Ed25519)
  if (method.publicKeyJwk) {
    const jwk = method.publicKeyJwk;
    if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519' && typeof jwk.x === 'string') {
      try {
        // JWK x value is base64url-encoded raw key
        const bytes = new Uint8Array(Buffer.from(jwk.x, 'base64url'));
        if (bytes.length === 32) return bytes;
      } catch {
        return null;
      }
    }
    return null;
  }

  return null;
}
