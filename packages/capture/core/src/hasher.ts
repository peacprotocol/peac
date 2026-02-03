/**
 * @peac/capture-core - Action Hasher
 *
 * Deterministic hashing for capture pipeline.
 * Uses @peac/crypto for JCS (RFC 8785) and SHA-256.
 *
 * RUNTIME REQUIREMENT: WebCrypto (crypto.subtle) must be available.
 * Works in: Node.js 18+, Deno, Bun, modern browsers, Cloudflare Workers.
 */

import { canonicalize } from '@peac/crypto';
import type { Digest, DigestAlg } from '@peac/schema';
import type { Hasher, HasherConfig, SpoolEntry } from './types';
import { SIZE_CONSTANTS } from './types';

// =============================================================================
// Constants
// =============================================================================

/**
 * Valid truncation thresholds (only these are supported).
 * Using other values would produce digests that don't match any declared algorithm.
 */
const VALID_TRUNCATE_THRESHOLDS = [SIZE_CONSTANTS.TRUNC_64K, SIZE_CONSTANTS.TRUNC_1M] as const;
type ValidTruncateThreshold = (typeof VALID_TRUNCATE_THRESHOLDS)[number];

// =============================================================================
// WebCrypto Runtime Check
// =============================================================================

/**
 * Get WebCrypto subtle interface with explicit runtime check.
 * Prefer globalThis.crypto over bare crypto to avoid bundler ambiguity.
 *
 * @throws Error if WebCrypto is not available
 */
function getSubtle() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'WebCrypto (crypto.subtle) is required but not available. ' +
        'Ensure you are running in Node.js 18+, Deno, Bun, or a modern browser.'
    );
  }
  return subtle;
}

// =============================================================================
// SHA-256 Helper (Web Crypto API - Runtime Neutral)
// =============================================================================

/**
 * Compute SHA-256 hash of bytes using Web Crypto API.
 * Returns lowercase hex string.
 */
async function sha256Hex(data: Uint8Array): Promise<string> {
  const subtle = getSubtle();
  const hashBuffer = await subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// =============================================================================
// Action Hasher Implementation
// =============================================================================

/**
 * Default hasher implementation using JCS + SHA-256.
 *
 * Determinism guarantees:
 * - Same input bytes -> same digest
 * - Same SpoolEntry (minus entry_digest) -> same chain hash
 * - Truncation algorithm is deterministic (first N bytes)
 *
 * Supported truncation thresholds:
 * - 64k (65536 bytes) -> alg: 'sha-256:trunc-64k'
 * - 1m (1048576 bytes) -> alg: 'sha-256:trunc-1m'
 */
export class ActionHasher implements Hasher {
  private readonly truncateThreshold: ValidTruncateThreshold;

  constructor(config: HasherConfig = {}) {
    const threshold = config.truncateThreshold ?? SIZE_CONSTANTS.TRUNC_1M;

    // Validate threshold is one of the supported values
    if (!VALID_TRUNCATE_THRESHOLDS.includes(threshold as ValidTruncateThreshold)) {
      throw new RangeError(
        `truncateThreshold must be 64k (${SIZE_CONSTANTS.TRUNC_64K}) or 1m (${SIZE_CONSTANTS.TRUNC_1M}), ` +
          `got ${threshold}`
      );
    }

    this.truncateThreshold = threshold as ValidTruncateThreshold;

    // Validate WebCrypto is available at construction time
    getSubtle();
  }

  /**
   * Compute digest for payload bytes.
   * Automatically truncates if payload exceeds threshold.
   */
  async digest(payload: Uint8Array): Promise<Digest> {
    const bytes = payload.length;

    // No truncation needed - full SHA-256
    if (bytes <= this.truncateThreshold) {
      return {
        alg: 'sha-256' as DigestAlg,
        value: await sha256Hex(payload),
        bytes,
      };
    }

    // Large payload: truncate to threshold
    const truncated = payload.slice(0, this.truncateThreshold);

    // Determine algorithm label based on truncation size
    let alg: DigestAlg;
    if (this.truncateThreshold === SIZE_CONSTANTS.TRUNC_64K) {
      alg = 'sha-256:trunc-64k' as DigestAlg;
    } else {
      // SIZE_CONSTANTS.TRUNC_1M
      alg = 'sha-256:trunc-1m' as DigestAlg;
    }

    return {
      alg,
      value: await sha256Hex(truncated),
      bytes, // Original size for audit
    };
  }

  /**
   * Compute digest for a spool entry (for chaining).
   * Uses JCS (RFC 8785) for deterministic serialization.
   */
  async digestEntry(entry: Omit<SpoolEntry, 'entry_digest'>): Promise<string> {
    // JCS canonicalization ensures deterministic serialization
    const canonical = canonicalize(entry);
    const bytes = new TextEncoder().encode(canonical);
    return sha256Hex(bytes);
  }
}

/**
 * Create a default hasher instance.
 */
export function createHasher(config?: HasherConfig): Hasher {
  return new ActionHasher(config);
}
