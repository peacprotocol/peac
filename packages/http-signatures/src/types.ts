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
  /**
   * Algorithm. Optional per RFC 9421: some profiles omit `alg` from
   * Signature-Input and derive the algorithm from the resolved key (e.g. UCP
   * derives ES256/ES384 from the JWK `crv`). The PEAC/TAP path requires it via
   * `parseSignature(..., { requireAlg: true })`, which is the default.
   */
  alg?: string;
  /**
   * Unix timestamp when the signature was created. Optional per RFC 9421;
   * some profiles (e.g. UCP) omit it and handle replay at the business layer.
   * Required for the PEAC/TAP path via the default `requireCreated: true`.
   */
  created?: number;
  /** Unix timestamp when signature expires (optional) */
  expires?: number;
  /** Nonce for replay prevention (optional) */
  nonce?: string;
  /** Tag for interaction type (e.g., "agent-browser-auth") (optional) */
  tag?: string;
  /** Covered component identifiers */
  coveredComponents: string[];
  /**
   * Exact serialized `@signature-params` value (the inner list plus parameters)
   * for this label, as received in Signature-Input. RFC 9421 requires the
   * signature base to reuse this exact serialization rather than a reconstructed
   * one; `buildSignatureBase(..., { preferSerializedParams: true })` uses it when
   * present. Populated by the parser; absent for programmatically built params.
   */
  signatureParamsValue?: string;
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
