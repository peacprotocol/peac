/**
 * @peac/mappings-tap - Visa Trusted Agent Protocol types
 *
 * Runtime-neutral types. Uses Record<string, string> instead of Headers.
 */

import type { SignatureVerifier } from '@peac/http-signatures';

/**
 * TAP tag values (supported interaction types).
 */
export type TapTag = 'agent-browser-auth' | 'agent-payer-auth';

/**
 * All TAP tags as array.
 */
export const TAP_TAGS: TapTag[] = ['agent-browser-auth', 'agent-payer-auth'];

/**
 * TAP-specific constants.
 */
export const TAP_CONSTANTS = {
  /** Maximum window in seconds (8 minutes) */
  MAX_WINDOW_SECONDS: 480,
  /** Default clock skew tolerance in seconds */
  CLOCK_SKEW_SECONDS: 60,
  /** Required algorithm */
  REQUIRED_ALGORITHM: 'ed25519',
} as const;

/**
 * Request data for TAP verification.
 * Uses Record<string, string> for runtime neutrality.
 */
export interface TapRequest {
  /** HTTP method */
  method: string;
  /** Request URL */
  url: string;
  /** Request headers as Record (NOT Headers object) */
  headers: Record<string, string>;
  /** Request body (optional) */
  body?: string | ArrayBuffer | Uint8Array;
}

/**
 * Key resolver for TAP verification.
 * Given issuer and keyid, returns SignatureVerifier or null.
 */
export type TapKeyResolver = (
  issuer: string,
  keyid: string
) => Promise<SignatureVerifier | null>;

/**
 * TAP verification options.
 */
export interface TapVerifyOptions {
  /** Key resolver function */
  keyResolver: TapKeyResolver;
  /** Current timestamp (defaults to Date.now() / 1000) */
  now?: number;
  /** Clock skew tolerance in seconds (defaults to 60) */
  clockSkewSeconds?: number;
  /** Allow unknown tags (defaults to false - fail-closed) */
  allowUnknownTags?: boolean;
}

/**
 * TAP control evidence shape for PEAC receipts.
 */
export interface TapEvidence {
  /** Vendor-specific protocol identifier */
  protocol: 'visa-tap';
  /** TAP tag (interaction type) */
  tag: string;
  /** Key ID used for signing */
  keyid: string;
  /** Signature creation timestamp */
  created: number;
  /** Signature expiration timestamp */
  expires: number;
  /** Nonce for replay prevention (optional) */
  nonce?: string;
  /** Covered component identifiers */
  coveredComponents: string[];
  /** Base64-encoded signature */
  signatureBase64: string;
  /** Whether signature was verified */
  verified: boolean;
  /** JWKS discovery path that resolved the key */
  jwksSource: '/.well-known/jwks' | '/.well-known/jwks.json' | '/keys';
}

/**
 * TAP control chain entry for PEAC receipts.
 */
export interface TapControlEntry {
  /** Vendor-neutral engine identifier */
  engine: 'tap';
  /** Result of verification */
  result: 'allow' | 'deny';
  /** TAP-specific evidence */
  evidence: TapEvidence;
}

/**
 * TAP verification result.
 */
export interface TapVerificationResult {
  /** Whether verification succeeded */
  valid: boolean;
  /** Control entry (if verification succeeded or partially succeeded) */
  controlEntry?: TapControlEntry;
  /** Error code if verification failed */
  errorCode?: string;
  /** Human-readable error message */
  errorMessage?: string;
}
