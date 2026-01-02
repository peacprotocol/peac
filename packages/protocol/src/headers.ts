/**
 * HTTP header utilities for PEAC receipts and purpose
 */

import {
  PEAC_RECEIPT_HEADER,
  PEAC_PURPOSE_HEADER,
  PEAC_PURPOSE_APPLIED_HEADER,
  PEAC_PURPOSE_REASON_HEADER,
  parsePurposeHeader,
  type PurposeToken,
  type CanonicalPurpose,
  type PurposeReason,
} from '@peac/schema';

/**
 * Set PEAC-Receipt header on a response
 *
 * @param headers - Headers object (e.g., Response.headers)
 * @param receiptJws - JWS compact serialization
 */
export function setReceiptHeader(headers: Headers, receiptJws: string): void {
  headers.set(PEAC_RECEIPT_HEADER, receiptJws);
}

/**
 * Get PEAC-Receipt header from a request/response
 *
 * @param headers - Headers object
 * @returns JWS compact serialization, or null if not present
 */
export function getReceiptHeader(headers: Headers): string | null {
  return headers.get(PEAC_RECEIPT_HEADER);
}

/**
 * Set Vary: PEAC-Receipt header for caching
 *
 * @param headers - Response headers
 */
export function setVaryHeader(headers: Headers): void {
  const existing = headers.get('Vary');
  if (existing) {
    // Append to existing Vary header
    const varies = existing.split(',').map((v) => v.trim());
    if (!varies.includes(PEAC_RECEIPT_HEADER)) {
      headers.set('Vary', `${existing}, ${PEAC_RECEIPT_HEADER}`);
    }
  } else {
    headers.set('Vary', PEAC_RECEIPT_HEADER);
  }
}

// -----------------------------------------------------------------------------
// Purpose Header Utilities (v0.9.24+)
// -----------------------------------------------------------------------------

/**
 * Get PEAC-Purpose header from a request
 *
 * Parses the comma-separated purpose token list into an array.
 * Normalizes tokens (lowercase, trim whitespace), deduplicates.
 *
 * @param headers - Request headers
 * @returns Array of normalized PurposeToken values, empty if header missing
 */
export function getPurposeHeader(headers: Headers): PurposeToken[] {
  const value = headers.get(PEAC_PURPOSE_HEADER);
  if (!value) {
    return [];
  }
  return parsePurposeHeader(value);
}

/**
 * Set PEAC-Purpose-Applied header on a response
 *
 * Indicates which purpose(s) were enforced for this request.
 *
 * @param headers - Response headers
 * @param purpose - Single canonical purpose that was enforced
 */
export function setPurposeAppliedHeader(headers: Headers, purpose: CanonicalPurpose): void {
  headers.set(PEAC_PURPOSE_APPLIED_HEADER, purpose);
}

/**
 * Set PEAC-Purpose-Reason header on a response
 *
 * Explains WHY the purpose was enforced as it was (audit trail).
 *
 * @param headers - Response headers
 * @param reason - Purpose reason enum value
 */
export function setPurposeReasonHeader(headers: Headers, reason: PurposeReason): void {
  headers.set(PEAC_PURPOSE_REASON_HEADER, reason);
}

/**
 * Set Vary: PEAC-Purpose header for caching
 *
 * If response behavior varies by declared purpose, MUST set this header.
 *
 * @param headers - Response headers
 */
export function setVaryPurposeHeader(headers: Headers): void {
  const existing = headers.get('Vary');
  if (existing) {
    const varies = existing.split(',').map((v) => v.trim());
    if (!varies.includes(PEAC_PURPOSE_HEADER)) {
      headers.set('Vary', `${existing}, ${PEAC_PURPOSE_HEADER}`);
    }
  } else {
    headers.set('Vary', PEAC_PURPOSE_HEADER);
  }
}
