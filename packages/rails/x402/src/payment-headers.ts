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
 * Minimal headers interface to avoid DOM lib dependency.
 * Works with native Headers, node-fetch, undici, etc.
 *
 * Note: Header lookup must be case-insensitive in practice.
 * Native Headers.get() is case-insensitive, but plain objects may not be.
 * Implementation tries common casings to ensure compatibility.
 */
export type HeadersLike = {
  get(name: string): string | null;
};

/**
 * Case-insensitive header getter helper.
 * Tries: lowercase, Title-Case, UPPERCASE
 *
 * @param headers - Headers object to query
 * @param name - Header name to look up
 * @returns Header value or null if not found
 */
function getHeaderCaseInsensitive(headers: HeadersLike, name: string): string | null {
  // Try lowercase first (most common for custom headers)
  const lower = headers.get(name.toLowerCase());
  if (lower !== null) return lower;

  // Try Title-Case (HTTP standard format)
  const titleCase = name
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join('-');
  const title = headers.get(titleCase);
  if (title !== null) return title;

  // Try UPPERCASE (sometimes used for custom headers)
  const upper = headers.get(name.toUpperCase());
  if (upper !== null) return upper;

  // Not found
  return null;
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
