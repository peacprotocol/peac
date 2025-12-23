/**
 * x402 Payment Header Detection (Headers-Only)
 *
 * Provides minimal headers-only detection and extraction for x402 payment flow.
 * No Response objects, no body parsing.
 *
 * x402 Header Names (per Coinbase x402 spec):
 * - PAYMENT-REQUIRED: Server challenge with payment details
 * - PAYMENT-SIGNATURE: Client payment proof
 * - PAYMENT-RESPONSE: Server success response
 */

/**
 * Headers-like object with .get() method.
 * Compatible with native Headers, node-fetch, undici, etc.
 */
export interface HeadersWithGet {
  get(name: string): string | null;
}

/**
 * Plain header object (Node.js/Express IncomingHttpHeaders style).
 * Values can be string, string[], or undefined.
 */
export type HeadersPlainObject = Record<string, string | string[] | undefined>;

/**
 * Union type accepting both Headers-like objects and plain objects.
 * Works with:
 * - Native Headers (browser, Cloudflare Workers, Deno)
 * - node-fetch, undici Headers
 * - Express/Node.js req.headers (IncomingHttpHeaders)
 * - Plain objects
 */
export type HeadersLike = HeadersWithGet | HeadersPlainObject;

/**
 * Check if headers object has a .get() method.
 */
function hasGetMethod(headers: HeadersLike): headers is HeadersWithGet {
  return typeof (headers as HeadersWithGet).get === 'function';
}

/**
 * Get header value from plain object, handling case-insensitivity and arrays.
 * Node.js lowercases all header names, so we check multiple casings.
 */
function getFromPlainObject(headers: HeadersPlainObject, name: string): string | null {
  // Common casings to try
  const casings = [
    name.toLowerCase(),
    name.toUpperCase(),
    name
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
      .join('-'),
  ];

  for (const key of casings) {
    const value = headers[key];
    if (value !== undefined) {
      // Handle array values (take first element)
      return Array.isArray(value) ? (value[0] ?? null) : value;
    }
  }

  // Also try exact match and iterate all keys for case-insensitive match
  const lowerName = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lowerName) {
      const value = headers[key];
      if (value !== undefined) {
        return Array.isArray(value) ? (value[0] ?? null) : value;
      }
    }
  }

  return null;
}

/**
 * Case-insensitive header getter helper.
 * Handles both Headers-like objects (.get() method) and plain objects.
 *
 * @param headers - Headers object or plain object to query
 * @param name - Header name to look up
 * @returns Header value or null if not found
 */
function getHeaderCaseInsensitive(headers: HeadersLike, name: string): string | null {
  if (hasGetMethod(headers)) {
    // Use .get() method - most Headers implementations are case-insensitive
    // but we try multiple casings for implementations that aren't
    const lower = headers.get(name.toLowerCase());
    if (lower !== null) return lower;

    const titleCase = name
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
      .join('-');
    const title = headers.get(titleCase);
    if (title !== null) return title;

    const upper = headers.get(name.toUpperCase());
    if (upper !== null) return upper;

    return null;
  }

  // Plain object path
  return getFromPlainObject(headers, name);
}

/**
 * Detect payment-required mode from HTTP headers.
 * Uses case-insensitive lookup and trims whitespace.
 *
 * @param headers - HTTP headers (HeadersLike interface)
 * @returns true if PAYMENT-REQUIRED header is present and non-empty
 */
export function detectPaymentRequired(headers: HeadersLike): boolean {
  const paymentRequired = getHeaderCaseInsensitive(headers, 'payment-required');
  return paymentRequired !== null && paymentRequired.trim().length > 0;
}

/**
 * Extract payment reference from HTTP headers.
 * Returns the PAYMENT-REQUIRED header value (contains payment details).
 * Uses case-insensitive lookup.
 *
 * @param headers - HTTP headers (HeadersLike interface)
 * @returns PAYMENT-REQUIRED header value, or undefined if not present/empty
 */
export function extractPaymentReference(headers: HeadersLike): string | undefined {
  const value = getHeaderCaseInsensitive(headers, 'payment-required');
  return value?.trim() || undefined;
}

/**
 * Extract payment response from success headers.
 * Uses case-insensitive lookup.
 *
 * @param headers - HTTP headers (HeadersLike interface)
 * @returns PAYMENT-RESPONSE header value, or undefined if not present/empty
 */
export function extractPaymentResponse(headers: HeadersLike): string | undefined {
  const value = getHeaderCaseInsensitive(headers, 'payment-response');
  return value?.trim() || undefined;
}
