/**
 * Internal utilities for @peac/net-node
 *
 * This module contains ONLY the finalizeEvidence function, which must be
 * kept out of the main entry point's type definitions per API surface requirements.
 *
 * IMPORTANT: This module is NOT listed in package.json exports, so it cannot be
 * directly imported by consumers. Only the testing subpath re-exports from here.
 *
 * @internal
 * @module @peac/net-node/internal
 */

// Import types from index.ts (type-only imports are safe for circular deps)
import type {
  SafeFetchEvidence,
  SafeFetchEvidenceCore,
  RequestAuditContext,
} from './index.js';

// Import from evidence-utils.ts to break the circular dependency
// These were previously imported from index.ts, creating a cycle
import {
  MAX_PENDING_AUDIT_EVENTS,
  computeEvidenceDigest,
} from './evidence-utils.js';

// -----------------------------------------------------------------------------
// Evidence Finalization (INTERNAL-ONLY)
// -----------------------------------------------------------------------------

/**
 * Finalize evidence by computing and embedding the digest.
 *
 * INTERNAL ONLY - NOT exported from main package entry.
 * Access via `_internals.finalizeEvidence` from the testing subpath only.
 *
 * CONTRACT:
 * - If `ctx` has drops: audit_stats included, audit_truncated = true
 * - If `ctx` has no drops: no audit_truncated field
 * - If `ctx` omitted: no audit_truncated field (for re-finalize)
 *
 * @internal
 */
export function finalizeEvidence(
  core: SafeFetchEvidenceCore,
  ctx?: RequestAuditContext,
): SafeFetchEvidence {
  const hasDrops = ctx && ctx.dropped > 0;

  let coreWithStats: SafeFetchEvidenceCore;
  if (hasDrops && ctx) {
    coreWithStats = {
      ...core,
      audit_stats: {
        pending: ctx.pending,
        dropped: ctx.dropped,
        max_pending: MAX_PENDING_AUDIT_EVENTS,
        hook_errors: ctx.hookErrors,
        hook_suppressed: ctx.hookSuppressed,
      },
      audit_truncated: true,
    };
  } else {
    coreWithStats = { ...core };
  }

  const digest = computeEvidenceDigest(coreWithStats);
  return {
    ...coreWithStats,
    evidence_digest: digest,
    evidence_alg: 'sha-256',
    canonicalization: 'RFC8785-JCS',
  };
}
