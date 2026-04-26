/**
 * Inert shadow-call boundary for the bounded validator foundation.
 *
 * INTERNAL ONLY. This module is the call-site placeholder that PR D
 * will wire to the bounded validator pipeline behind an internal
 * feature flag. In v0.13.1 the boundary is INERT by construction:
 *
 *   - the only declared mode is `'disabled'`
 *   - the function body is a single early return on `'disabled'`
 *   - it imports no bounded validators (zero runtime weight at
 *     verify-local.ts cold-start, even though the call site exists)
 *   - it never throws into verifyLocal()
 *   - it never mutates the input claims object
 *   - it never logs
 *   - it never reads environment variables
 *   - it never affects the canonical verify-local result
 *
 * The function returns `undefined` for every call. The call site in
 * verify-local.ts ignores the return value and never awaits any work.
 *
 * NOT re-exported from packages/protocol/src/index.ts. Public surface
 * is byte-stable. PR D may extend the input shape when wiring the
 * actual flag plumbing; that is a future-internal change, not a
 * public API change.
 */

/**
 * The only declared shadow validation mode. Adding new modes requires
 * a deliberate future change in PR D where the actual flag is wired.
 */
export type ShadowValidationMode = 'disabled';

/**
 * Input shape for the shadow-call boundary. `claims` is intentionally
 * `unknown` so callers may pass parsed Wire 0.2 claims without a
 * coupling to the schema's exported type from this internal helper.
 */
export interface ShadowValidationInput {
  readonly mode: ShadowValidationMode;
  readonly claims: unknown;
}

/**
 * Inert shadow-call hook. Always returns `undefined`. The signature
 * is stable enough for PR D to extend (e.g., adding a `header` or
 * `now` field) without breaking the disabled-default contract.
 */
export function maybeRunShadowValidation(input: ShadowValidationInput): undefined {
  if (input.mode === 'disabled') return undefined;
  return undefined;
}
