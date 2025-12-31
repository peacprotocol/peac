/**
 * Telemetry utilities for protocol package
 */

import { createHash } from 'node:crypto';

/**
 * Compute a SHA-256 hash of a receipt JWS
 *
 * Returns format: sha256:{hex prefix}
 * Uses first 16 chars of hex for brevity in logs/spans.
 */
export function hashReceipt(jws: string): string {
  const hash = createHash('sha256').update(jws).digest('hex');
  return `sha256:${hash.slice(0, 16)}`;
}
