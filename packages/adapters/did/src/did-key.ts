/**
 * did:key resolver (Ed25519, zero network I/O).
 *
 * Implements the did:key method spec (W3C CCG v0.9).
 * Parses the multicodec-encoded Ed25519 public key directly from
 * the DID string. No network requests, no ambient discovery.
 *
 * Only Ed25519 keys (multicodec 0xed01) are supported.
 * Non-Ed25519 did:key DIDs produce an error without revealing
 * the actual key type (no oracle).
 */

import type { DIDDocument, VerificationMethod } from './types.js';
import type { DIDResolutionResult } from './types.js';
import type { DIDResolver } from './resolver.js';
import { extractEd25519FromMultibase } from './multicodec.js';
import { DIDError } from './errors.js';

// ---------------------------------------------------------------------------
// did:key Resolver
// ---------------------------------------------------------------------------

/**
 * Resolver for the did:key method.
 *
 * did:key encodes the public key directly in the DID string.
 * Resolution is pure computation with zero network I/O.
 *
 * @example
 * ```typescript
 * const resolver = new DidKeyResolver();
 * const result = await resolver.resolve('did:key:z6MkhaXgBZDvotDkL...');
 * const key = extractVerificationKey(result.didDocument!);
 * ```
 */
export class DidKeyResolver implements DIDResolver {
  readonly methods = ['key'] as const;

  async resolve(did: string): Promise<DIDResolutionResult> {
    // Validate DID format
    if (!did.startsWith('did:key:')) {
      return {
        didDocument: null,
        didResolutionMetadata: { error: 'invalidDid' },
        didDocumentMetadata: {},
      };
    }

    const multibaseValue = did.slice('did:key:'.length);
    if (!multibaseValue) {
      return {
        didDocument: null,
        didResolutionMetadata: { error: 'invalidDid' },
        didDocumentMetadata: {},
      };
    }

    // Extract Ed25519 public key (validates multicodec prefix).
    // Validate the multibase value contains a valid Ed25519 key.
    // Error boundary: DIDError.code is PEAC-internal (E_DID_*).
    // didResolutionMetadata.error uses DID-resolution-style values
    // for the public adapter contract.
    try {
      extractEd25519FromMultibase(multibaseValue);
    } catch (e) {
      if (e instanceof DIDError) {
        return {
          didDocument: null,
          didResolutionMetadata: { error: e.code },
          didDocumentMetadata: {},
        };
      }
      return {
        didDocument: null,
        didResolutionMetadata: { error: 'invalidDid' },
        didDocumentMetadata: {},
      };
    }

    // Build DID Document with the extracted key
    const keyId = `${did}#${multibaseValue}`;

    const verificationMethod: VerificationMethod = {
      id: keyId,
      type: 'Ed25519VerificationKey2020',
      controller: did,
      publicKeyMultibase: multibaseValue,
    };

    const document: DIDDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      id: did,
      verificationMethod: [verificationMethod],
      authentication: [keyId],
      assertionMethod: [keyId],
    };

    return {
      didDocument: document,
      didResolutionMetadata: { contentType: 'application/did+json' },
      didDocumentMetadata: {},
    };
  }
}
