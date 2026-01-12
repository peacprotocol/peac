/**
 * @peac/mappings-ucp - Shared utilities
 *
 * Crypto and encoding helpers used by both verification and evidence generation.
 * Extracted to prevent architectural coupling between modules.
 */

import { createHash } from 'node:crypto';
import { ErrorCodes, ucpError } from './errors.js';

/**
 * SHA-256 hash as hex string.
 */
export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * SHA-256 hash as Uint8Array.
 */
export function sha256Bytes(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}

/**
 * Convert base64 to base64url by replacing chars.
 */
function base64ToBase64url(base64: string): string {
  let result = '';
  for (let i = 0; i < base64.length; i++) {
    const c = base64.charCodeAt(i);
    if (c === 43) {
      // '+' -> '-'
      result += '-';
    } else if (c === 47) {
      // '/' -> '_'
      result += '_';
    } else if (c === 61) {
      // '=' padding - skip
      break;
    } else {
      result += base64.charAt(i);
    }
  }
  return result;
}

// Maximum size for base64url encoding (16MB - reasonable limit for webhook payloads)
const MAX_ENCODE_SIZE = 16 * 1024 * 1024;

/**
 * Base64url encode without padding.
 * Uses standard base64 + manual conversion for maximum portability.
 * Works with Node.js 12+ (does not require 'base64url' encoding from Node 15.7.0+).
 */
export function base64urlEncode(data: Uint8Array): string {
  // Safety check for unreasonably large input
  if (data.length > MAX_ENCODE_SIZE) {
    throw ucpError(
      ErrorCodes.SIGNATURE_MALFORMED,
      `Input too large for base64url encoding: ${data.length} bytes`
    );
  }

  // Use Buffer in Node.js, then convert base64 to base64url
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    const base64 = Buffer.from(data).toString('base64');
    return base64ToBase64url(base64);
  }

  // Fallback for non-Node environments (browsers)
  // Build binary string with bounded iteration
  const len = data.length;
  let binary = '';
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(data[i]);
  }
  const base64 = btoa(binary);
  return base64ToBase64url(base64);
}

/**
 * JCS canonicalize (RFC 8785) - synchronous.
 * Produces deterministic JSON with sorted keys and no whitespace.
 */
export function jcsCanonicalizeSync(obj: unknown): string {
  if (obj === null) return 'null';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) {
      throw ucpError(
        ErrorCodes.EVIDENCE_SERIALIZATION_FAILED,
        'JCS does not support NaN or Infinity'
      );
    }
    // Use ES6 number serialization (matches JSON.stringify for finite numbers)
    return Object.is(obj, -0) ? '0' : String(obj);
  }
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(jcsCanonicalizeSync).join(',') + ']';
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs = keys
      .filter((k) => (obj as Record<string, unknown>)[k] !== undefined)
      .map(
        (k) => JSON.stringify(k) + ':' + jcsCanonicalizeSync((obj as Record<string, unknown>)[k])
      );
    return '{' + pairs.join(',') + '}';
  }
  throw ucpError(
    ErrorCodes.EVIDENCE_SERIALIZATION_FAILED,
    `Cannot canonicalize type: ${typeof obj}`
  );
}
