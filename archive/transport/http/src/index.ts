/**
 * PEAC HTTP Transport Layer
 * Headers, middleware, DPoP L3/L4 (implementation deferred to v0.9.16)
 *
 * @packageDocumentation
 */

import { HEADERS } from '@peac/kernel';

/**
 * HTTP header utilities
 */
export { HEADERS };

/**
 * Extract PEAC receipt from HTTP headers
 */
export function extractReceiptHeader(headers: Record<string, string | undefined>): string | null {
  const receipt = headers[HEADERS.receipt] ?? headers[HEADERS.receipt.toLowerCase()];
  return receipt && typeof receipt === 'string' ? receipt : null;
}

/**
 * Add PEAC receipt to HTTP headers
 */
export function addReceiptHeader(headers: Record<string, string>, receiptJWS: string): void {
  headers[HEADERS.receipt] = receiptJWS;
}

// DPoP L3/L4, middleware, and advanced HTTP features will be added in v0.9.16
