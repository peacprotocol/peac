/**
 * HTTP Utilities for PEAC Protocol
 *
 * Cache safety and header management helpers for adapters and middleware.
 */

import { HEADERS } from './constants.js';

/**
 * Headers that affect response behavior and MUST be included in Vary
 * when enforcement decisions depend on them.
 */
export const VARY_HEADERS = [
  HEADERS.purpose,
  HEADERS.receipt,
] as const;

/**
 * Apply Vary header for purpose-aware caching.
 *
 * MUST be called when response behavior varies based on PEAC-Purpose header.
 * Prevents cache poisoning when different purposes get different responses.
 *
 * @example
 * ```ts
 * // In Cloudflare Worker
 * const response = new Response(body, { headers });
 * applyPurposeVary(response.headers);
 *
 * // In Express/Node
 * applyPurposeVary(res);
 * ```
 */
export function applyPurposeVary(
  headers: Headers | { setHeader: (name: string, value: string) => void } | { set: (name: string, value: string) => void }
): void {
  const purposeHeader = HEADERS.purpose;

  if ('append' in headers && typeof headers.append === 'function') {
    // Web API Headers (Cloudflare, Deno, etc.)
    const existing = headers.get('Vary') || '';
    if (!existing.toLowerCase().includes(purposeHeader.toLowerCase())) {
      headers.append('Vary', purposeHeader);
    }
  } else if ('setHeader' in headers && typeof headers.setHeader === 'function') {
    // Node.js ServerResponse
    const existing = (headers as { getHeader?: (name: string) => string | string[] | number | undefined }).getHeader?.('Vary');
    const existingStr = Array.isArray(existing) ? existing.join(', ') : String(existing || '');
    if (!existingStr.toLowerCase().includes(purposeHeader.toLowerCase())) {
      headers.setHeader('Vary', existingStr ? `${existingStr}, ${purposeHeader}` : purposeHeader);
    }
  } else if ('set' in headers && typeof headers.set === 'function') {
    // Map-like headers (Hono, etc.)
    headers.set('Vary', purposeHeader);
  }
}

/**
 * Get all PEAC-related headers that should be included in Vary
 * for complete cache safety.
 *
 * @returns Comma-separated list of headers for Vary
 */
export function getPeacVaryHeaders(): string {
  return VARY_HEADERS.join(', ');
}

/**
 * Check if a response needs Vary header based on purpose enforcement.
 *
 * @param purposeEnforced - Whether purpose was enforced for this response
 * @returns true if Vary: PEAC-Purpose should be set
 */
export function needsPurposeVary(purposeEnforced: boolean): boolean {
  return purposeEnforced;
}
