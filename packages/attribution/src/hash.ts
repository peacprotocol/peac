/**
 * Content Hashing Utilities (v0.9.26+)
 *
 * SHA-256 content hashing with base64url encoding for attribution attestations.
 */
import { createHash } from 'node:crypto';
import type { ContentHash } from '@peac/schema';

/**
 * Compute SHA-256 hash of content and return ContentHash object.
 *
 * @param content - Content to hash (string or Uint8Array)
 * @returns ContentHash with sha-256 algorithm and base64url encoding
 *
 * @example
 * ```typescript
 * const hash = computeContentHash('Hello, world!');
 * // { alg: 'sha-256', value: 'MV9b23bQeMQ7isAGTkoBZGErH853yGk0W_yUx1iU7dM', enc: 'base64url' }
 * ```
 */
export function computeContentHash(content: string | Uint8Array): ContentHash {
  const data = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
  const hashBuffer = createHash('sha256').update(data).digest();

  // Base64url encode without padding (RFC 4648 Section 5)
  const base64 = hashBuffer.toString('base64');
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return {
    alg: 'sha-256',
    value: base64url,
    enc: 'base64url',
  };
}

/**
 * Verify that content matches a ContentHash.
 *
 * Accepts both padded and unpadded base64url values for interoperability.
 * Comparison is done after normalizing both values to canonical unpadded form.
 *
 * @param content - Content to verify
 * @param expected - Expected ContentHash
 * @returns true if content matches the hash
 *
 * @example
 * ```typescript
 * const hash = computeContentHash('Hello, world!');
 * verifyContentHash('Hello, world!', hash); // true
 * verifyContentHash('Hello, world', hash);  // false
 *
 * // Also accepts padded input
 * const paddedHash = { ...hash, value: hash.value + '==' };
 * verifyContentHash('Hello, world!', paddedHash); // true
 * ```
 */
export function verifyContentHash(content: string | Uint8Array, expected: ContentHash): boolean {
  if (expected.alg !== 'sha-256') {
    return false; // Only sha-256 supported in v0.9.26
  }
  if (expected.enc !== 'base64url') {
    return false; // Only base64url encoding supported
  }

  const computed = computeContentHash(content);
  // Use base64url normalization for interop with padded/unpadded inputs
  return normalizeBase64url(computed.value) === normalizeBase64url(expected.value);
}

/**
 * Compute SHA-256 hash of an excerpt for content-minimizing verification.
 *
 * Excerpts are hashed to allow verification without storing or transmitting
 * the original text. This is a **non-reversible fingerprint** suitable for
 * proving knowledge of specific content.
 *
 * **Security Note**: This hash is NOT privacy-preserving against dictionary
 * attacks on short or predictable excerpts. For high-entropy content (e.g.,
 * long paragraphs with unique phrasing), the hash provides reasonable
 * content minimization. For short or predictable text, consider using
 * a keyed HMAC with a shared secret instead.
 *
 * @param excerpt - Excerpt text to hash
 * @returns ContentHash for the excerpt
 */
export function computeExcerptHash(excerpt: string): ContentHash {
  return computeContentHash(excerpt);
}

/**
 * Normalize a base64url string to canonical unpadded form.
 *
 * Handles:
 * - Padded base64url (with trailing `=`)
 * - Standard base64 alphabet (`+` and `/`)
 * - Mixed padding and alphabet issues
 *
 * Returns the canonical unpadded base64url form (RFC 4648 Section 5).
 *
 * @param input - Base64 or base64url string (padded or unpadded)
 * @returns Canonical unpadded base64url string
 *
 * @example
 * ```typescript
 * normalizeBase64url('abc+/==');  // 'abc-_'
 * normalizeBase64url('abc-_');    // 'abc-_' (no-op if already canonical)
 * normalizeBase64url('abc-_==');  // 'abc-_'
 * ```
 */
export function normalizeBase64url(input: string): string {
  // Convert standard base64 alphabet to base64url
  let normalized = input.replace(/\+/g, '-').replace(/\//g, '_');

  // Remove padding
  normalized = normalized.replace(/=+$/, '');

  return normalized;
}

/**
 * Compare two base64url values for equality, normalizing both first.
 *
 * This handles cases where the same hash value might be encoded differently:
 * - One with padding, one without
 * - One with standard base64, one with base64url alphabet
 *
 * @param a - First base64url value
 * @param b - Second base64url value
 * @returns true if the values are equivalent after normalization
 *
 * @example
 * ```typescript
 * base64urlEqual('abc-_', 'abc-_==');  // true
 * base64urlEqual('abc-_', 'abc+/');    // true
 * base64urlEqual('abc-_', 'xyz');      // false
 * ```
 */
export function base64urlEqual(a: string, b: string): boolean {
  return normalizeBase64url(a) === normalizeBase64url(b);
}
