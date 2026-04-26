/**
 * Bounded observation subset: composition aggregator.
 *
 * INTERNAL ONLY. Composes the six proven layer validators introduced
 * across this PR (kernel constraints; type-extension mapping; JOSE
 * header hardening; issuer form; occurred_at temporal skew;
 * extension byte budget) into a single aggregated result. The
 * canonical-truth sanity test, layer-isolated parity tests, and
 * differential same-path proof have already established that each
 * underlying validator is byte-equal with the existing canonical
 * surface for the layer it covers.
 *
 * NOT WIRED. This module is NOT called from issue.ts, verify-local.ts,
 * or any runtime path in v0.13.1. It exists as a composition example
 * so PR D can wire the inert shadow-call hook to a real bounded
 * pipeline behind an internal feature flag without re-deriving the
 * composition shape.
 *
 * NOT FULL VALIDATION. The bounded subset deliberately EXCLUDES:
 *   - full Wire 0.2 schema parsing (parseReceiptClaims; the canonical
 *     parse continues to drive the runtime path)
 *   - signature verification and full JWS decode (decodeWire02;
 *     @peac/crypto remains canonical)
 *   - iat-not-yet-valid temporal check (lives inline at
 *     verify-local.ts:454 with no helper to import)
 *   - typ_missing strictness handling
 *   - policy binding verification
 *   - unknown_extension key grammar / plain-JSON guard / typed
 *     extension schema parse (only the byte-budget portion of
 *     validateKnownExtensions is in scope)
 *   - any control-plane behavior (issuer resolver, JWKS fetch, etc.)
 *
 * Public-facing wording for this module: "bounded observation subset",
 * never "complete validator" or "primary validator".
 */

import {
  validateExtensionBudgetInternal,
  validateIssuerFormInternal,
  validateJoseHardeningInternal,
  validateKernelConstraintsInternal,
  validateTemporalInternal,
  validateTypeExtensionMappingInternal,
  type ExtensionBudgetViolation,
  type TemporalWarning,
  type TypeExtensionMappingWarning,
} from './validators/index.js';

/** Minimal claims shape required by the bounded subset. */
export interface BoundedClaimsInput {
  readonly kind: string;
  readonly type: string;
  readonly iss: unknown;
  readonly iat: number;
  readonly occurred_at?: string;
  readonly extensions?: Record<string, unknown>;
}

/** Optional JOSE header (from the JWS protected header). */
export type BoundedHeaderInput = Record<string, unknown> | undefined;

/** Aggregated input to the bounded observation subset. */
export interface BoundedValidationInput {
  readonly claims: BoundedClaimsInput;
  readonly header?: BoundedHeaderInput;
  /** Fixed Unix-second clock for temporal evaluation; required. */
  readonly now: number;
}

/**
 * Layer tag identifies which underlying validator emitted each entry.
 * Useful for downstream filtering (e.g., a future shadow-mode reporter
 * that ignores warning-class entries from one layer but not another).
 */
export type BoundedLayer =
  | 'kernel-constraints'
  | 'type-extension-mapping'
  | 'jose-header-hardening'
  | 'issuer-form'
  | 'temporal'
  | 'extension-budget';

export interface BoundedViolation {
  readonly layer: BoundedLayer;
  readonly code: string;
  readonly path?: string;
}

export interface BoundedWarning {
  readonly layer: BoundedLayer;
  readonly code: string;
  readonly path?: string;
}

export interface BoundedValidationResult {
  /** True iff every in-scope layer accepted the input. */
  readonly accepted: boolean;
  readonly violations: readonly BoundedViolation[];
  readonly warnings: readonly BoundedWarning[];
}

/**
 * Run the bounded observation subset. Composes the six layer
 * validators in a stable order; aggregates violations and warnings
 * with explicit layer tags; never throws. Pure: same input always
 * yields the same result.
 */
export function runBoundedValidatorShadow(input: BoundedValidationInput): BoundedValidationResult {
  const violations: BoundedViolation[] = [];
  const warnings: BoundedWarning[] = [];

  // 1. Kernel constraints (depth / array / keys / string / nodes).
  const kernelRes = validateKernelConstraintsInternal(input.claims);
  if (!kernelRes.valid) {
    for (const v of kernelRes.violations) {
      violations.push({
        layer: 'kernel-constraints',
        code: v.constraint,
        path: v.path || undefined,
      });
    }
  }

  // 2. Issuer form (canonical iss).
  const issRes = validateIssuerFormInternal(input.claims.iss);
  if (!issRes.accepted) {
    violations.push({ layer: 'issuer-form', code: issRes.errorCode });
  }

  // 3. JOSE header hardening (only when a header is supplied).
  if (input.header !== undefined) {
    const joseRes = validateJoseHardeningInternal(input.header);
    if (!joseRes.accepted) {
      violations.push({ layer: 'jose-header-hardening', code: joseRes.errorCode });
    }
  }

  // 4. Type-extension mapping warnings.
  const typeExtWarnings: readonly TypeExtensionMappingWarning[] =
    validateTypeExtensionMappingInternal({
      kind: input.claims.kind,
      type: input.claims.type,
      extensions: input.claims.extensions,
    });
  for (const w of typeExtWarnings) {
    warnings.push({ layer: 'type-extension-mapping', code: w.code, path: w.pointer });
  }

  // 5. Temporal occurred_at skew (evidence-kind-only is the caller's
  // responsibility; we mirror the canonical behavior of treating
  // non-evidence kinds as a no-op by skipping the call).
  if (input.claims.kind === 'evidence') {
    const temporalRes = validateTemporalInternal(
      input.claims.occurred_at,
      input.claims.iat,
      input.now
    );
    if (!temporalRes.accepted) {
      violations.push({
        layer: 'temporal',
        code: temporalRes.errorCode,
        path: temporalRes.pointer,
      });
    } else if (temporalRes.warnings) {
      const list: readonly TemporalWarning[] = temporalRes.warnings;
      for (const w of list) {
        warnings.push({ layer: 'temporal', code: w.code, path: w.pointer });
      }
    }
  }

  // 6. Extension byte budget.
  const budgetRes = validateExtensionBudgetInternal(input.claims.extensions);
  if (!budgetRes.accepted) {
    const list: readonly ExtensionBudgetViolation[] = budgetRes.violations;
    for (const v of list) {
      violations.push({ layer: 'extension-budget', code: v.code, path: v.path });
    }
  }

  return {
    accepted: violations.length === 0,
    violations,
    warnings,
  };
}
