/**
 * Normalized internal observation shape for shadow-vs-real comparison.
 *
 * @internal
 *
 * INTERNAL ONLY. Not re-exported from packages/protocol/src/index.ts.
 *
 * The shadow scheduler compares real-path and shadow-path results via
 * canonical hashes. To make that comparison meaningful (not just an
 * accept/reject boolean) and free of false positives, both sides
 * project onto the SAME stable normalized `ShadowObservation` shape
 * before the hash:
 *
 *   - `accepted`: did the validator accept the input?
 *   - `violationCodes`: sorted, deduplicated registered error codes.
 *   - `warningCodes`: sorted, deduplicated registered warning codes.
 *
 * Layer-tag metadata is intentionally NOT part of the comparable
 * shape. The bounded validator emits per-layer tags; the canonical
 * Zod path does not. Including them would cause a hash divergence
 * even on full functional agreement, masking true divergence as
 * noise.
 *
 * Issue path projection:
 *
 *   `IssueResult` does not expose warning codes; canonical issuance
 *   either succeeds (and surfaces no warnings to the caller) or
 *   throws. To prevent the bounded validator's warnings from
 *   producing false `output-byte-diff` records on a successful
 *   issuance, the issue-side comparison runs in ACCEPTED-ONLY mode:
 *   `warningCodes` is projected to `[]` on BOTH sides.
 *
 * VerifyLocal success path projection:
 *
 *   `VerifyLocalSuccess` exposes a `warnings` array of registered
 *   warning codes. The verifyLocal-side comparison includes
 *   `warningCodes` from both sides (canonical surfaces them
 *   directly; the bounded validator's warningCodes are mapped from
 *   `BoundedWarning.code`).
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
}

/**
 * Real-path observation for a successful `issue()` call. Always
 * projects to the empty accepted-only shape; canonical issuance
 * surfaces no warning codes through `IssueResult`.
 *
 * @internal
 */
export function realObservationForIssue(): ShadowObservation {
  return EMPTY_ACCEPTED;
}

/**
 * Real-path observation for a successful `verifyLocal()` call. Maps
 * the canonical `warnings: VerificationWarning[]` array onto the
 * normalized warningCodes set.
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
  };
}

/**
 * Project a `BoundedValidationResult` into the shared observation
 * shape with full warning-code parity. Use on the verifyLocal path
 * where canonical exposes warning codes through
 * `VerifyLocalSuccess.warnings`.
 *
 * @internal
 */
export function shadowObservationFromBounded(bounded: BoundedValidationResult): ShadowObservation {
  return {
    accepted: bounded.accepted,
    violationCodes: sortedDedupedCodes(bounded.violations.map((v) => v.code)),
    warningCodes: sortedDedupedCodes(bounded.warnings.map((w) => w.code)),
  };
}

/**
 * Project a `BoundedValidationResult` into the shared observation
 * shape with `warningCodes` flattened to `[]`. Use on the issue path
 * where canonical issuance does not surface warning codes through
 * `IssueResult`. Without this projection the bounded validator's
 * type-extension or temporal warnings would create false
 * `output-byte-diff` records on every otherwise-successful issuance.
 *
 * @internal
 */
export function shadowObservationFromBoundedAcceptedOnly(
  bounded: BoundedValidationResult
): ShadowObservation {
  return {
    accepted: bounded.accepted,
    violationCodes: sortedDedupedCodes(bounded.violations.map((v) => v.code)),
    warningCodes: [],
  };
}

const EMPTY_ACCEPTED: ShadowObservation = Object.freeze({
  accepted: true,
  violationCodes: Object.freeze([]) as readonly string[],
  warningCodes: Object.freeze([]) as readonly string[],
});

function sortedDedupedCodes(codes: readonly string[]): readonly string[] {
  if (codes.length === 0) return [];
  return Array.from(new Set(codes)).sort();
}
