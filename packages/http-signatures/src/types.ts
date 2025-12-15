/**
 * @peac/http-signatures - RFC 9421 HTTP Message Signatures
 *
 * Runtime-neutral types. No DOM dependencies (CryptoKey, Headers, etc.)
 * in public API surface.
 */

/**
 * Ed25519 signature verifier function (runtime-neutral).
 * Takes raw data and signature bytes, returns verification result.
 */
export type SignatureVerifier = (data: Uint8Array, signature: Uint8Array) => Promise<boolean>;

/**
 * Key resolver function type (runtime-neutral).
 * Given a key ID, returns a SignatureVerifier or null if key not found.
 */
export type KeyResolver = (keyid: string) => Promise<SignatureVerifier | null>;

/**
 * Parsed parameters from Signature-Input header.
 * All fields exposed for TAP and other higher-level protocol enforcement.
 */
export interface ParsedSignatureParams {
  /** Key identifier */
  keyid: string;
  /** Algorithm (must be "ed25519" for PEAC) */
  alg: string;
  /** Unix timestamp when signature was created */
  created: number;
  /** Unix timestamp when signature expires (optional) */
  expires?: number;
  /** Nonce for replay prevention (optional) */
  nonce?: string;
  /** Tag for interaction type (e.g., "agent-browser-auth") (optional) */
  tag?: string;
  /** Covered component identifiers */
  coveredComponents: string[];
}

/**
 * Complete parsed signature with raw signature bytes.
 */
export interface ParsedSignature {
  /** Signature label from Signature-Input header */
  label: string;
  /** Parsed parameters */
  params: ParsedSignatureParams;
  /** Raw signature bytes (decoded from base64) */
  signatureBytes: Uint8Array;
  /** Original base64-encoded signature */
  signatureBase64: string;
}

/**
 * Verification result with detailed information.
 */
export interface VerificationResult {
  /** Whether the signature is valid */
  valid: boolean;
  /** Parsed signature (if parsing succeeded) */
  signature?: ParsedSignature;
  /** Error code if verification failed */
  errorCode?: string;
  /** Human-readable error message */
  errorMessage?: string;
}

/**
 * Request-like object for signature verification.
 * Uses Record<string, string> instead of Headers for runtime neutrality.
 */
export interface SignatureRequest {
  /** HTTP method */
  method: string;
  /** Request URL (full or path) */
  url: string;
  /** Request headers as Record */
  headers: Record<string, string>;
  /** Request body (optional, for content-digest) */
  body?: string | ArrayBuffer | Uint8Array;
}

/**
 * Options for signature verification.
 */
export interface VerifyOptions {
  /** Key resolver function */
  keyResolver: KeyResolver;
  /** Current timestamp (defaults to Date.now() / 1000) */
  now?: number;
  /** Clock skew tolerance in seconds (defaults to 60) */
  clockSkewSeconds?: number;
  /** Signature label to verify (defaults to first available) */
  label?: string;
}
