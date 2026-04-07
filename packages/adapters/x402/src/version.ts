/**
 * x402 wire version detection
 *
 * Discriminates V1 and V2 flows by inspecting HTTP headers.
 *
 * V2 headers (all Base64-encoded JSON):
 *   PAYMENT-REQUIRED   (402 challenge)
 *   PAYMENT-SIGNATURE  (client payment proof)
 *   PAYMENT-RESPONSE   (server settlement result)
 *
 * V1 headers:
 *   X-PAYMENT-RESPONSE (server settlement result)
 *   X-PAYMENT          (client payment)
 *
 * Detection inspects all known headers in priority order.
 * If no V2-specific header is found, falls back to V1.
 * Ambiguous cases (mixed V1+V2 headers) resolve to V2.
 *
 * Upstream: x402-foundation/x402 specs/transports-v2/http.md
 */

import { X402_V2_HEADERS } from './raw-v2.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Wire version discriminant */
export type X402WireVersion = 1 | 2;

/**
 * Ambiguity indicator for cases where version cannot be determined
 * from transport evidence alone.
 */
export type X402WireVersionDetection =
  | { version: X402WireVersion; confident: true }
  | { version: X402WireVersion; confident: false; reason: string };

// ---------------------------------------------------------------------------
// V1 Header Constants (for detection only; V1 raw types live in raw.ts)
// ---------------------------------------------------------------------------

const X402_V1_HEADERS = {
  PAYMENT_RESPONSE: 'x-payment-response',
  PAYMENT: 'x-payment',
} as const;

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detect x402 wire version from HTTP headers.
 *
 * Inspects all known x402 headers in deterministic priority order:
 *   1. PAYMENT-REQUIRED (V2 challenge) -> V2
 *   2. PAYMENT-SIGNATURE (V2 client proof) -> V2
 *   3. PAYMENT-RESPONSE (V2 settlement) -> V2
 *   4. X-PAYMENT-RESPONSE (V1 settlement) -> V1
 *   5. X-PAYMENT (V1 client payment) -> V1
 *   6. No x402 headers found -> V1 (conservative default)
 *
 * Mixed headers (e.g., both PAYMENT-RESPONSE and X-PAYMENT-RESPONSE)
 * resolve to V2 because V2 takes priority.
 *
 * @param headers - Lowercase-keyed header map. Callers MUST normalize
 *   header names to lowercase before passing (standard HTTP/2 practice;
 *   HTTP/1.1 callers should use `.toLowerCase()` on keys).
 * @returns Detection result with version and confidence indicator
 */
export function detectX402Version(
  headers: Record<string, string | string[] | undefined>
): X402WireVersionDetection {
  // V2 indicators (any one is sufficient)
  if (headers[X402_V2_HEADERS.PAYMENT_REQUIRED] !== undefined) {
    return { version: 2, confident: true };
  }
  if (headers[X402_V2_HEADERS.PAYMENT_SIGNATURE] !== undefined) {
    return { version: 2, confident: true };
  }
  if (headers[X402_V2_HEADERS.PAYMENT_RESPONSE] !== undefined) {
    return { version: 2, confident: true };
  }

  // V1 indicators
  if (headers[X402_V1_HEADERS.PAYMENT_RESPONSE] !== undefined) {
    return { version: 1, confident: true };
  }
  if (headers[X402_V1_HEADERS.PAYMENT] !== undefined) {
    return { version: 1, confident: true };
  }

  // No x402 headers detected
  return { version: 1, confident: false, reason: 'no x402 headers found' };
}

/**
 * Detect x402 wire version from a ReceiptArtifactSource string.
 *
 * Maps carrier extraction source values to wire versions:
 * - 'x402_v2' -> 2 (confident)
 * - 'x402_v1' -> 1 (confident)
 * - 'peac' -> version from adjacent headers or 1 (not confident)
 *
 * @param source - The artifact source from extractReceiptArtifactFromHeaders()
 * @returns Detection result
 */
export function detectX402VersionFromSource(
  source: 'peac' | 'x402_v2' | 'x402_v1'
): X402WireVersionDetection {
  if (source === 'x402_v2') {
    return { version: 2, confident: true };
  }
  if (source === 'x402_v1') {
    return { version: 1, confident: true };
  }
  // PEAC receipts are version-neutral
  return { version: 1, confident: false, reason: 'peac source is version-neutral' };
}
