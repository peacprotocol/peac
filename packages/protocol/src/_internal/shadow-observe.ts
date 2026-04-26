/**
 * Normalized internal observation shape for shadow-vs-real comparison.
 *
 * @internal
 *
 * INTERNAL ONLY. Not re-exported from packages/protocol/src/index.ts.
 *
 * The shadow scheduler compares real-path and shadow-path results via
 * canonical hashes. To make that comparison meaningful (not just an
 * accept/reject boolean), both sides project onto a stable normalized
 * `ShadowObservation` shape:
 *
 *   - `accepted`: did the validator accept the input?
 *   - `violationCodes`: sorted, deduplicated registered error codes.
 *   - `warningCodes`: sorted, deduplicated registered warning codes.
 *   - `layerTags`: sorted layer identifiers, present on the shadow
 *     side (the bounded validator emits per-layer tags); empty on the
 *     real side because the canonical path does not surface that
 *     dimension.
 *
 * Comparison happens via `canonicalHashOf(observation)` so two
 * observations are equal iff their JCS-canonical JSON forms are
 * byte-equal. Object key order, undefined fields, raw exception
 * messages, and stack traces are all eliminated by construction.
 */

import type { BoundedValidationResult } from './record-core/bounded-validator.js';

/**
 * Canonical observation projected from either the real path or the
 * shadow path.
 *
 * @internal
 */
export interface ShadowObservation {
  readonly accepted: boolean;
  /** Registered error codes, sorted, deduplicated. */
  readonly violationCodes: readonly string[];
  /** Registered warning codes, sorted, deduplicated. */
  readonly warningCodes: readonly string[];
  /**
   * Sorted layer identifiers contributing to violations or warnings.
   * Present on the shadow projection (per-layer tagging is the
   * bounded validator's design); empty on the real projection so the
   * comparator does not flag asymmetric layer-tag presence.
   */
  readonly layerTags: readonly string[];
}

/**
 * Real-path observation for a successful `issue()` call.
 *
 * The canonical issuance path validates kernel constraints + Zod
 * schema before signing; if the function returns a JWS, the canonical
 * verdict is unconditionally accepted with no surfaced warnings or
 * codes. Surfaced warnings on the issuance path would need a future
 * shape change to `IssueResult`.
 *
 * @internal
 */
export function realObservationForIssue(): ShadowObservation {
  return EMPTY_ACCEPTED;
}

/**
 * Real-path observation for a successful `verifyLocal()` call. Maps
 * the canonical `warnings: VerificationWarning[]` array onto the
 * normalized warningCodes set; canonical violations are absent on a
 * successful verification.
 *
 * @internal
 */
export function realObservationForVerifyLocalSuccess(
  warnings: readonly { code: string }[] | undefined
): ShadowObservation {
  if (!warnings || warnings.length === 0) return EMPTY_ACCEPTED;
  return {
    accepted: true,
    violationCodes: [],
    warningCodes: sortedDedupedCodes(warnings.map((w) => w.code)),
    layerTags: [],
  };
}

/**
 * Project a `BoundedValidationResult` (PR-C-shipped composition over
 * the six layer validators) into the shared observation shape.
 *
 * @internal
 */
export function shadowObservationFromBounded(bounded: BoundedValidationResult): ShadowObservation {
  return {
    accepted: bounded.accepted,
    violationCodes: sortedDedupedCodes(bounded.violations.map((v) => v.code)),
    warningCodes: sortedDedupedCodes(bounded.warnings.map((w) => w.code)),
    layerTags: sortedDedupedCodes(
      bounded.violations.map((v) => v.layer).concat(bounded.warnings.map((w) => w.layer))
    ),
  };
}

const EMPTY_ACCEPTED: ShadowObservation = Object.freeze({
  accepted: true,
  violationCodes: Object.freeze([]) as readonly string[],
  warningCodes: Object.freeze([]) as readonly string[],
  layerTags: Object.freeze([]) as readonly string[],
});

function sortedDedupedCodes(codes: readonly string[]): readonly string[] {
  if (codes.length === 0) return [];
  return Array.from(new Set(codes)).sort();
}
