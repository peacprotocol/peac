/**
 * HTTP header utilities for PEAC receipts
 */

import { PEAC_RECEIPT_HEADER } from "@peac/schema";

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
  const existing = headers.get("Vary");
  if (existing) {
    // Append to existing Vary header
    const varies = existing.split(",").map((v) => v.trim());
    if (!varies.includes(PEAC_RECEIPT_HEADER)) {
      headers.set("Vary", `${existing}, ${PEAC_RECEIPT_HEADER}`);
    }
  } else {
    headers.set("Vary", PEAC_RECEIPT_HEADER);
  }
}
