/**
 * Privacy-preserving hashing utilities
 *
 * Used to hash identifiers before storage in receipts or metrics
 * to prevent re-identification.
 *
 * IMPORTANT: Salt is REQUIRED by default to prevent rainbow table attacks.
 * Use unsafeAllowUnsalted=true only for non-sensitive test data.
 */

import { createHash } from 'crypto';
import type { HashOptions, HashResult } from './types.js';

/**
 * Hash an identifier for privacy-preserving storage
 *
 * @param value - The value to hash
 * @param options - Hashing options (salt REQUIRED unless unsafeAllowUnsalted=true)
 * @returns Hash result
 * @throws Error if salt is not provided and unsafeAllowUnsalted is not true
 */
export function hashIdentifier(value: string, options: HashOptions = {}): HashResult {
  // Enforce salt requirement for privacy safety
  if (!options.salt && !options.unsafeAllowUnsalted) {
    throw new Error(
      'Salt is required for privacy-preserving hashing. ' +
        'Provide a salt or set unsafeAllowUnsalted=true for non-sensitive data.'
    );
  }

  const algorithm = options.algorithm ?? 'sha256';
  const hash = createHash(algorithm);

  if (options.salt) {
    hash.update(options.salt);
  }

  hash.update(value);

  return {
    hash: hash.digest('hex'),
    algorithm,
    salted: !!options.salt,
  };
}

/**
 * Hash a URL for privacy-preserving storage
 *
 * @param url - The URL to hash
 * @param options - Hashing options
 * @returns Hash result
 */
export function hashUrl(url: string, options: HashOptions = {}): HashResult {
  // Normalize URL before hashing
  const normalized = url.toLowerCase().trim();
  return hashIdentifier(normalized, options);
}

/**
 * Hash an email for privacy-preserving storage
 *
 * @param email - The email to hash
 * @param options - Hashing options
 * @returns Hash result
 */
export function hashEmail(email: string, options: HashOptions = {}): HashResult {
  // Normalize email before hashing
  const normalized = email.toLowerCase().trim();
  return hashIdentifier(normalized, options);
}

/**
 * Hash an IP address for privacy-preserving storage
 *
 * @param ip - The IP address to hash
 * @param options - Hashing options
 * @returns Hash result
 */
export function hashIp(ip: string, options: HashOptions = {}): HashResult {
  return hashIdentifier(ip.trim(), options);
}
