/**
 * Fingerprint Reference Conversion Functions (v0.11.3+, DD-146)
 *
 * Pure string manipulation functions for converting between Wire 0.1
 * string form ("alg:hex64") and Wire 0.2 object form ({ alg, value, key_id? }).
 *
 * These are opaque references. The schema validates format only.
 * Issuers compute values externally; verifiers MUST NOT assume
 * they can recompute the reference.
 *
 * Lives in Layer 1 (@peac/schema) because it is pure string manipulation,
 * not cryptographic computation. Zero dependencies, zero I/O.
 */

/**
 * Wire 0.2 object form of a fingerprint reference
 */
export interface FingerprintRefObject {
  /** Hash algorithm: 'sha256' or 'hmac-sha256' */
  alg: string;
  /** Base64url-encoded value */
  value: string;
  /** Optional key identifier (for hmac-sha256 references) */
  key_id?: string;
}

/**
 * Convert hex string to base64url encoding.
 * Pure function, no dependencies.
 */
function hexToBase64url(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  // Use Buffer in Node, or manual encoding
  let base64: string;
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(bytes).toString('base64');
  } else {
    // Fallback for non-Node environments
    base64 = btoa(String.fromCharCode(...bytes));
  }
  // base64 -> base64url
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Convert base64url string to hex encoding.
 * Pure function, no dependencies.
 */
function base64urlToHex(b64url: string): string {
  // base64url -> base64
  let base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  let bytes: Uint8Array;
  if (typeof Buffer !== 'undefined') {
    bytes = Buffer.from(base64, 'base64');
  } else {
    const binary = atob(base64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Supported algorithm prefixes
 */
const VALID_ALGS = ['sha256', 'hmac-sha256'] as const;
const STRING_FORM_PATTERN = /^(sha256|hmac-sha256):([a-f0-9]{64})$/;

/**
 * Maximum length for fingerprint reference string form.
 * "hmac-sha256:" (12) + 64 hex chars = 76 chars max.
 */
export const MAX_FINGERPRINT_REF_LENGTH = 76;

/**
 * Strict base64url character set (RFC 4648 section 5).
 * Only A-Z, a-z, 0-9, '-', '_'. No padding ('='), no whitespace.
 */
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Parse a Wire 0.1 string form fingerprint reference ("alg:hex64")
 * into a Wire 0.2 object form ({ alg, value }).
 *
 * The hex value is converted to base64url for the object form.
 *
 * @param s - String form: "sha256:<64 hex chars>" or "hmac-sha256:<64 hex chars>"
 * @returns Object form with base64url value, or null if invalid
 */
export function stringToFingerprintRef(s: string): FingerprintRefObject | null {
  if (s.length > MAX_FINGERPRINT_REF_LENGTH) {
    return null;
  }
  const match = STRING_FORM_PATTERN.exec(s);
  if (!match) {
    return null;
  }
  const alg = match[1];
  const hex = match[2];
  return {
    alg,
    value: hexToBase64url(hex),
  };
}

/**
 * Convert a Wire 0.2 object form fingerprint reference back to
 * the Wire 0.1 string form ("alg:hex64").
 *
 * The base64url value is converted back to hex for the string form.
 *
 * @param obj - Object form with alg and base64url value
 * @returns String form "alg:<64 hex chars>", or null if invalid
 */
export function fingerprintRefToString(obj: FingerprintRefObject): string | null {
  if (!VALID_ALGS.includes(obj.alg as (typeof VALID_ALGS)[number])) {
    return null;
  }
  // Strict base64url validation (RFC 4648 section 5): no padding, no whitespace
  if (!BASE64URL_PATTERN.test(obj.value)) {
    return null;
  }
  try {
    const hex = base64urlToHex(obj.value);
    if (hex.length !== 64) {
      return null;
    }
    return `${obj.alg}:${hex}`;
  } catch {
    return null;
  }
}
