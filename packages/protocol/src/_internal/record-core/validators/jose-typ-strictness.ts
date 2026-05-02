/**
 * Bounded internal JOSE typ-strictness validator.
 *
 * INTERNAL ONLY. Parity-observed counterpart of the typ-strictness
 * routing in `verify-local.ts` (the block that rejects a missing typ
 * under `'strict'` mode and surfaces a `typ_missing` warning under
 * `'interop'` mode). Both implementations consume the same protected-
 * header `typ` value plus a `strictness` parameter and apply the same
 * accept/reject/warning rules.
 *
 * Existing canonical strictness routing in `verify-local.ts` remains
 * canonical. This module is observational only; not re-exported and
 * not wired into the public runtime path.
 *
 * SCOPE:
 *   - typ present (any string) -> accepted, no warning.
 *   - typ absent (undefined or non-string) and strictness === 'strict'
 *     -> rejected with E_INVALID_FORMAT.
 *   - typ absent and strictness === 'interop' -> accepted with
 *     typ_missing warning.
 *
 * Out of scope:
 *   - typ value validation (`'interaction-record+jwt'` enforcement lives
 *     in `@peac/crypto.validateWire02Header` / the JOSE-hardening layer).
 *   - alg / kid / crit / b64 / zip checks (handled by `jose-hardening.ts`).
 */

export type Strictness = 'strict' | 'interop';

export interface JoseTypStrictnessWarning {
  readonly code: string;
}

export type JoseTypStrictnessResult =
  | { readonly accepted: true; readonly warnings?: readonly JoseTypStrictnessWarning[] }
  | { readonly accepted: false; readonly errorCode: string };

const ACCEPTED_NO_WARN: JoseTypStrictnessResult = { accepted: true } as const;
const ACCEPTED_TYP_MISSING: JoseTypStrictnessResult = {
  accepted: true,
  warnings: [{ code: 'typ_missing' }],
} as const;
const REJECTED_INVALID_FORMAT: JoseTypStrictnessResult = {
  accepted: false,
  errorCode: 'E_INVALID_FORMAT',
} as const;

export function validateJoseTypStrictnessInternal(
  typ: unknown,
  strictness: Strictness
): JoseTypStrictnessResult {
  const present = typeof typ === 'string' && typ.length > 0;
  if (present) return ACCEPTED_NO_WARN;
  if (strictness === 'strict') return REJECTED_INVALID_FORMAT;
  return ACCEPTED_TYP_MISSING;
}
