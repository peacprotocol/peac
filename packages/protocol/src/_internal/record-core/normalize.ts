/**
 * Record-claim normalization (INERT in v0.13.1).
 *
 * @internal
 *
 * v0.13.1 contract: this function MUST be a no-op identity passthrough.
 * It returns the SAME object reference passed in. Tests assert this via
 * `expect(normalize(claims)).toBe(claims)` (Vitest `toBe` uses
 * `Object.is` - referential identity, NOT deep equality).
 *
 * Do NOT add default expansion, key reordering, wire-version tagging, or
 * any claim mutation in v0.13.1. The live issue() / verifyLocal() path
 * does not route through normalize() in this release; the function exists
 * as a named hook future releases can wire into the live path AFTER the
 * byte-identical parity corpus proves zero divergence.
 */

import type { Wire02Claims } from '@peac/schema';

/**
 * INERT identity passthrough. Returns the same object reference.
 *
 * @internal
 */
export function normalize(claims: Wire02Claims): Wire02Claims {
  return claims;
}
