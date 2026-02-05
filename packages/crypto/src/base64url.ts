/**
 * Base64url encoding/decoding (RFC 4648 §5)
 *
 * Platform-agnostic implementation that works in Node.js, browser, and edge runtimes.
 * No Buffer dependency - uses pure JavaScript for maximum portability.
 *
 * @packageDocumentation
 */

// Standard base64 alphabet
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Reverse lookup table (lazily initialized)
let base64Lookup: Map<string, number> | null = null;

function getBase64Lookup(): Map<string, number> {
  if (!base64Lookup) {
    base64Lookup = new Map();
    for (let i = 0; i < BASE64_ALPHABET.length; i++) {
      base64Lookup.set(BASE64_ALPHABET[i], i);
    }
  }
  return base64Lookup;
}

/**
 * Encode bytes to base64url string (no padding)
 *
 * @param bytes - Byte array to encode
 * @returns Base64url encoded string (no padding)
 */
export function base64urlEncode(bytes: Uint8Array): string {
  let result = '';
  let i = 0;

  while (i < bytes.length) {
    const a = bytes[i++];
    const b = bytes[i++] ?? 0;
    const c = bytes[i++] ?? 0;

    const triplet = (a << 16) | (b << 8) | c;

    result += BASE64_ALPHABET[(triplet >> 18) & 0x3f];
    result += BASE64_ALPHABET[(triplet >> 12) & 0x3f];
    result += i - 2 < bytes.length ? BASE64_ALPHABET[(triplet >> 6) & 0x3f] : '';
    result += i - 1 < bytes.length ? BASE64_ALPHABET[triplet & 0x3f] : '';
  }

  // Convert to base64url (no padding)
  return result.replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Decode base64url string to bytes
 *
 * @param str - Base64url encoded string
 * @returns Decoded bytes
 */
export function base64urlDecode(str: string): Uint8Array {
  // Convert base64url to base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  const lookup = getBase64Lookup();
  const bytes: number[] = [];

  for (let i = 0; i < base64.length; i += 4) {
    const a = lookup.get(base64[i]) ?? 0;
    const b = lookup.get(base64[i + 1]) ?? 0;
    const c = lookup.get(base64[i + 2]) ?? 0;
    const d = lookup.get(base64[i + 3]) ?? 0;

    bytes.push((a << 2) | (b >> 4));
    if (base64[i + 2] !== '=') {
      bytes.push(((b & 0x0f) << 4) | (c >> 2));
    }
    if (base64[i + 3] !== '=') {
      bytes.push(((c & 0x03) << 6) | d);
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Encode UTF-8 string to base64url
 *
 * @param str - UTF-8 string to encode
 * @returns Base64url encoded string
 */
export function base64urlEncodeString(str: string): string {
  return base64urlEncode(new TextEncoder().encode(str));
}

/**
 * Decode base64url to UTF-8 string
 *
 * @param str - Base64url encoded string
 * @returns Decoded UTF-8 string
 */
export function base64urlDecodeString(str: string): string {
  return new TextDecoder().decode(base64urlDecode(str));
}
