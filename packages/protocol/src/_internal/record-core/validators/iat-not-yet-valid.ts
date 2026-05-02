/**
 * Bounded internal iat-not-yet-valid validator.
 *
 * INTERNAL ONLY. Parity-observed counterpart of the inline iat-not-yet-valid
 * check in `verify-local.ts` (`if (claims.iat > now + maxClockSkew) ...`).
 * Both implementations consume the same `iat`, `now`, and `maxClockSkew`
 * inputs and apply the same comparison; behavioral parity is proven
 * byte-equal by the parity tests.
 *
 * Existing canonical iat handling in `verify-local.ts` remains canonical.
 * This module is observational only; it is not re-exported from
 * `packages/protocol/src/index.ts` and is not wired into the public
 * runtime path.
 *
 * SCOPE:
 *   - Reject when `iat > now + maxClockSkew` (claim issued too far in the future).
 *   - Accept when `iat <= now + maxClockSkew`.
 *   - Never reads `Date.now()`; the caller injects `now` for determinism.
 *
 * Out of scope:
 *   - `exp` / `nbf` checks (Wire 0.2 records do not expire and have no nbf).
 *   - `occurred_at` skew (handled by `temporal.ts`).
 */

export interface IatNotYetValidResult {
  readonly accepted: boolean;
  readonly errorCode?: string;
}

const ACCEPTED: IatNotYetValidResult = { accepted: true } as const;
const REJECTED: IatNotYetValidResult = {
  accepted: false,
  errorCode: 'E_NOT_YET_VALID',
} as const;

export function validateIatNotYetValidInternal(
  iat: number,
  now: number,
  maxClockSkew: number
): IatNotYetValidResult {
  if (iat > now + maxClockSkew) return REJECTED;
  return ACCEPTED;
}
