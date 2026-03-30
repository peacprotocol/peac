/**
 * W3C DID Core v1.0 types for PEAC adapter-did.
 *
 * These types model the subset of W3C DID Core v1.0 (Recommendation 2022)
 * needed for Ed25519 key extraction. This is an interoperability adapter
 * layer, not a normative W3C dependency. did:key and did:web are CCG
 * drafts with no formal W3C Recommendation standing.
 *
 * @see https://www.w3.org/TR/did-core/
 */

// ---------------------------------------------------------------------------
// Verification Method
// ---------------------------------------------------------------------------

/**
 * A verification method entry in a DID Document.
 *
 * PEAC only extracts Ed25519 keys; other key types are silently skipped
 * (no oracle for key-type presence).
 */
export interface VerificationMethod {
  /** Verification method identifier (e.g., "did:key:z6Mk...#z6Mk...") */
  id: string;
  /**
   * Key type. PEAC recognizes:
   * - 'Ed25519VerificationKey2020'
   * - 'Multikey'
   * - 'JsonWebKey2020'
   */
  type: string;
  /** Controller DID */
  controller: string;
  /** Multibase-encoded public key (base58btc 'z' prefix or base64url 'u' prefix) */
  publicKeyMultibase?: string;
  /** JWK representation of the public key */
  publicKeyJwk?: JsonWebKey;
}

/**
 * Minimal JsonWebKey for Ed25519 (OKP curve).
 */
export interface JsonWebKey {
  kty: string;
  crv?: string;
  x?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// DID Document
// ---------------------------------------------------------------------------

/**
 * A W3C DID Document (subset relevant to PEAC key extraction).
 */
export interface DIDDocument {
  /** JSON-LD context */
  '@context': string | string[];
  /** The DID this document describes */
  id: string;
  /** Verification methods (key material) */
  verificationMethod?: VerificationMethod[];
  /** Authentication relationship references */
  authentication?: (string | VerificationMethod)[];
  /** Assertion method relationship references */
  assertionMethod?: (string | VerificationMethod)[];
  /** Controller DID(s) */
  controller?: string | string[];
}

// ---------------------------------------------------------------------------
// DID Resolution Result (W3C DID Resolution specification)
// ---------------------------------------------------------------------------

/** Metadata about the resolution process itself */
export interface DIDResolutionMetadata {
  /** Error code if resolution failed */
  error?: string;
  /** Content type of the DID Document */
  contentType?: string;
}

/** Metadata about the DID Document */
export interface DIDDocumentMetadata {
  /** When the DID Document was created */
  created?: string;
  /** When the DID Document was last updated */
  updated?: string;
  /** Whether the DID has been deactivated */
  deactivated?: boolean;
}

/** Complete DID resolution result */
export interface DIDResolutionResult {
  didDocument: DIDDocument | null;
  didResolutionMetadata: DIDResolutionMetadata;
  didDocumentMetadata: DIDDocumentMetadata;
}
