/**
 * @peac/adapter-did
 *
 * DID document resolution for PEAC receipt verification.
 * Interoperability adapter layer for W3C DID Core v1.0.
 *
 * Supported DID methods:
 * - did:key (Ed25519, zero network I/O)
 * - did:web (HTTPS, SSRF-hardened; added in PR7)
 *
 * @packageDocumentation
 */

// Types (W3C DID Core v1.0 subset)
export type {
  DIDDocument,
  DIDResolutionResult,
  DIDResolutionMetadata,
  DIDDocumentMetadata,
  VerificationMethod,
  JsonWebKey,
} from './types.js';

// Resolver interface
export type { DIDResolver } from './resolver.js';
export { createCompositeResolver } from './resolver.js';

// did:key resolver
export { DidKeyResolver } from './did-key.js';

// did:web resolver (caller-provided hardened fetch)
export type { DidWebResolverOptions, HardenedFetchResult, HardenedFetchFn } from './did-web.js';
export { DidWebResolver } from './did-web.js';

// Key extraction (DD-202 selection policy)
export type { ExtractKeyOptions } from './extract-key.js';
export { extractVerificationKey } from './extract-key.js';

// Multicodec utilities
export { extractEd25519FromMultibase } from './multicodec.js';

// Errors
export { DIDError } from './errors.js';
export type { DIDErrorCode } from './errors.js';
