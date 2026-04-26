/**
 * Bounded internal temporal validator (occurred_at skew only).
 *
 * INTERNAL ONLY. This is the parity-observed counterpart of
 * @peac/schema.checkOccurredAtSkew (referenced by verify-local.ts when
 * claims.kind === 'evidence'). Both implementations consume the same
 * OCCURRED_AT_TOLERANCE_SECONDS constant from @peac/kernel and apply
 * the same skew classification rules in the same order; behavioral
 * parity is proven byte-equal by the parity tests, not by code copy.
 *
 * Existing canonical checkOccurredAtSkew in @peac/schema remains
 * canonical. This module is observational only; it is NOT re-exported
 * from packages/protocol/src/index.ts and is NOT wired into runtime
 * paths (issue.ts, verify-local.ts) in v0.13.1.
 *
 * SCOPE (deliberately narrow):
 *   - occurred_at canonical skew classification ONLY
 *   - the iat-not-yet-valid check (`iat > now + maxClockSkew`) lives
 *     inline at verify-local.ts:454 with no helper to import; wrapping
 *     it would make LEFT and RIGHT identical 1-line predicates that
 *     prove nothing, so it is explicitly deferred to a later step
 *     (extraction first, parity second)
 *
 * Rules (must mirror checkOccurredAtSkew exactly; evidence-kind-only
 * is the caller's responsibility):
 *   1. occurredAt undefined -> accepted, no warning
 *   2. parse occurredAt as ISO/RFC 3339; if NaN -> accepted, no warning
 *      (the parse failure surfaces from schema validation elsewhere)
 *   3. ts > now + tolerance -> rejected with E_OCCURRED_AT_FUTURE
 *   4. ts > iat (within tolerance) -> accepted with occurred_at_skew
 *      warning at pointer /occurred_at
 *   5. ts <= iat -> accepted, no warning
 *
 * The injected `now` parameter is required; this module never reads
 * Date.now() so tests are deterministic.
 */

import { OCCURRED_AT_TOLERANCE_SECONDS } from '@peac/kernel';

export interface TemporalWarning {
  readonly code: string;
  readonly pointer?: string;
}

export type TemporalResult =
  | { readonly accepted: true; readonly warnings?: readonly TemporalWarning[] }
  | { readonly accepted: false; readonly errorCode: string; readonly pointer?: string };

const ACCEPTED: TemporalResult = { accepted: true } as const;

export function validateTemporalInternal(
  occurredAt: string | undefined,
  iat: number,
  now: number,
  tolerance: number = OCCURRED_AT_TOLERANCE_SECONDS
): TemporalResult {
  if (occurredAt === undefined) return ACCEPTED;

  const ts = Date.parse(occurredAt) / 1000;
  if (isNaN(ts)) return ACCEPTED;

  if (ts > now + tolerance) {
    return {
      accepted: false,
      errorCode: 'E_OCCURRED_AT_FUTURE',
      pointer: '/occurred_at',
    };
  }

  if (ts > iat) {
    return {
      accepted: true,
      warnings: [{ code: 'occurred_at_skew', pointer: '/occurred_at' }],
    };
  }

  return ACCEPTED;
}
