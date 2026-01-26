/**
 * Evidence Utilities for @peac/net-node
 *
 * This module contains shared utilities used by both the main entry (index.ts)
 * and internal modules (internal.ts). Breaking these out prevents circular
 * dependencies and makes the module graph simpler.
 *
 * @internal
 * @module @peac/net-node/evidence-utils
 */

import { createHash } from 'crypto';

// Import constants from single source of truth
import { MAX_PENDING_AUDIT_EVENTS } from './constants.js';

// Re-export for backwards compatibility
export { MAX_PENDING_AUDIT_EVENTS };

// -----------------------------------------------------------------------------
// JCS Canonicalization (RFC 8785)
// -----------------------------------------------------------------------------

/**
 * Canonicalize a value according to RFC 8785 (JSON Canonicalization Scheme)
 *
 * Key ordering is lexicographic by Unicode code point (UTF-16 code units).
 * This matches JavaScript's default string comparison.
 *
 * IMPORTANT: This function produces deterministic output suitable for
 * cryptographic hashing. The output is cross-platform consistent.
 *
 * @param value - Any JSON-serializable value
 * @returns Canonical JSON string
 */
export function jcsCanonicalizeValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    // Handle special cases per ES2015 spec
    if (Object.is(value, -0)) return '0';
    if (!Number.isFinite(value)) {
      throw new Error('JCS does not support Infinity or NaN');
    }
    return String(value);
  }
  if (typeof value === 'string') {
    // Use JSON.stringify for proper escaping
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const elements = value.map(jcsCanonicalizeValue);
    return '[' + elements.join(',') + ']';
  }
  if (typeof value === 'object' && value !== null) {
    // Sort keys lexicographically (Unicode code point order)
    const keys = Object.keys(value).sort();
    const pairs = keys
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map(
        (k) => JSON.stringify(k) + ':' + jcsCanonicalizeValue((value as Record<string, unknown>)[k])
      );
    return '{' + pairs.join(',') + '}';
  }
  throw new Error(`Cannot canonicalize value of type ${typeof value}`);
}

// -----------------------------------------------------------------------------
// Evidence Canonicalization and Digest
// -----------------------------------------------------------------------------

/**
 * Canonicalize evidence object using RFC 8785 JCS
 *
 * This is the first step in computing an evidence digest.
 * The output is a deterministic JSON string.
 *
 * @param evidence - Evidence object (SafeFetchEvidence or SafeFetchEvidenceCore)
 * @returns Canonical JSON string
 */
export function canonicalizeEvidence(evidence: Record<string, unknown>): string {
  return jcsCanonicalizeValue(evidence);
}

/**
 * Compute SHA-256 digest of evidence using JCS canonicalization
 *
 * Returns a 0x-prefixed lowercase hex string, consistent with other
 * PEAC cryptographic identifiers (EAS anchors, IP hashes).
 *
 * Self-omission rule: If the evidence includes digest fields, they are
 * stripped before computing the digest to avoid circularity.
 *
 * @param evidence - Evidence object with optional digest fields
 * @returns 0x-prefixed SHA-256 hex digest
 */
export function computeEvidenceDigest(evidence: Record<string, unknown>): string {
  // Strip digest fields if present (self-omission rule)
  const { evidence_digest, evidence_alg, canonicalization, ...core } = evidence;
  const canonical = canonicalizeEvidence(core);
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `0x${hash}`;
}
