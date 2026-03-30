/**
 * PKCE (Proof Key for Code Exchange) utilities for A2A OAuth flows.
 *
 * Implements S256 challenge method per RFC 7636. Plain method is
 * rejected: S256 is the only method permitted by A2A v1.0.
 */

import { ERROR_CODES } from '@peac/kernel';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** RFC 7636 Section 4.1: verifier length range (43-128 unreserved chars) */
const VERIFIER_MIN_LENGTH = 43;
const VERIFIER_MAX_LENGTH = 128;

/** RFC 7636 unreserved characters: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~" */
const UNRESERVED_REGEX = /^[A-Za-z0-9\-._~]+$/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Result of PKCE challenge generation.
 */
export interface PKCEChallenge {
  /** High-entropy code verifier (43-128 unreserved chars) */
  readonly verifier: string;
  /** Base64url-encoded SHA-256 hash of the verifier */
  readonly challenge: string;
  /** Always 'S256' */
  readonly method: 'S256';
}

/**
 * Generate a PKCE code verifier and S256 challenge.
 *
 * Uses `crypto.getRandomValues()` for verifier entropy (32 bytes,
 * base64url-encoded to 43 chars). S256 only; plain method is not
 * supported per A2A v1.0 security requirements.
 *
 * @returns PKCE verifier + challenge pair
 */
export async function generatePKCEChallenge(): Promise<PKCEChallenge> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = base64urlEncodeBytes(bytes);
  const challenge = await computeS256Challenge(verifier);
  return { verifier, challenge, method: 'S256' };
}

/**
 * Compute the S256 challenge for a given verifier.
 *
 * `BASE64URL(SHA256(ASCII(code_verifier)))` per RFC 7636 Section 4.2.
 *
 * @param verifier - Code verifier string
 * @returns Base64url-encoded SHA-256 digest
 * @throws Error if verifier does not meet RFC 7636 requirements
 */
export async function computeS256Challenge(verifier: string): Promise<string> {
  validateVerifierFormat(verifier);
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64urlEncodeBytes(new Uint8Array(digest));
}

/**
 * Validate that a PKCE code verifier meets RFC 7636 requirements.
 *
 * Checks length (43-128) and character set (unreserved per RFC 7636 Section 4.1).
 *
 * @param verifier - Code verifier to validate
 * @throws Error with code `E_PKCE_INVALID_VERIFIER` if invalid
 */
export function validatePKCEVerifier(verifier: string): void {
  validateVerifierFormat(verifier);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function validateVerifierFormat(verifier: string): void {
  if (verifier.length < VERIFIER_MIN_LENGTH || verifier.length > VERIFIER_MAX_LENGTH) {
    throw Object.assign(
      new Error(
        `PKCE verifier length ${verifier.length} outside allowed range [${VERIFIER_MIN_LENGTH}, ${VERIFIER_MAX_LENGTH}]`
      ),
      { code: ERROR_CODES.E_PKCE_INVALID_VERIFIER }
    );
  }
  if (!UNRESERVED_REGEX.test(verifier)) {
    throw Object.assign(
      new Error('PKCE verifier contains characters outside RFC 7636 unreserved set'),
      { code: ERROR_CODES.E_PKCE_INVALID_VERIFIER }
    );
  }
}

/**
 * Node-safe base64url encoding from raw bytes.
 *
 * Uses Buffer when available (Node.js), falls back to manual
 * byte-to-char conversion for non-Node runtimes.
 */
function base64urlEncodeBytes(bytes: Uint8Array): string {
  let base64: string;
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(bytes).toString('base64');
  } else {
    base64 = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    base64 = btoa(base64);
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
