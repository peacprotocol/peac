/**
 * Privacy-preserving hashing utilities
 *
 * Used to hash identifiers before storage in receipts or metrics
 * to prevent re-identification.
 */

import { createHash } from 'crypto';
import type { HashOptions, HashResult } from './types.js';

/**
 * Hash an identifier for privacy-preserving storage
 *
 * @param value - The value to hash
 * @param options - Hashing options
 * @returns Hash result
 */
export function hashIdentifier(value: string, options: HashOptions = {}): HashResult {
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
