/**
 * Canonical-composed shadow validation: composition aggregator.
 *
 * INTERNAL ONLY. Composes layer validators into a single aggregated
 * result. Each layer either delegates to a canonical helper from
 * `@peac/schema` / `@peac/crypto` / `@peac/protocol` (canonical-
 * composed wrapper pattern) or mirrors a canonical inline check
 * verbatim. The canonical-vs-candidate differential test asserts
 * byte-equality of the candidate verdict with the canonical verdict
 * on every eligible fixture; any divergence indicates a defect in
 * the projection logic.
 *
 * Always-on layers (run on every input):
 *   - kernel-constraints (depth / array / keys / string / nodes)
 *   - issuer-form (canonical iss)
 *   - type-extension-mapping (warnings only)
 *   - extension-byte-budget
 *   - unknown-extension-grammar (warnings only)
 *
 * Optional-input layers (skip when their inputs are absent):
 *   - jose-header-hardening (header)
 *   - temporal occurred_at skew (evidence kind)
 *   - schema-parse (fullClaims)
 *   - jose-typ-strictness (header + strictness)
 *   - iat-not-yet-valid (maxClockSkew)
 *   - policy-binding (receiptPolicyDigest + localPolicyDigest)
 *   - type-extension-enforcement (strictness)
 *
 * Out of scope:
 *   - signature verification (the standalone `validateSignatureInternal`
 *     export is async and is not composed here; callers that need it
 *     invoke it directly with serialized + publicKey)
 *   - any control-plane behavior (issuer resolver, JWKS fetch, etc.)
 *
 * Public-facing wording for this module: "canonical-composed shadow
 * validation" or "observational equivalence harness". Never
 * "complete validator", "primary validator", or "divergent validator".
 */

import {
  validateExtensionBudgetInternal,
  validateIatNotYetValidInternal,
  validateIssuerFormInternal,
  validateJoseHardeningInternal,
  validateJoseTypStrictnessInternal,
  validateKernelConstraintsInternal,
  validatePolicyBindingInternal,
  validateSchemaParseInternal,
  validateTemporalInternal,
  validateTypeExtensionEnforcementInternal,
  validateTypeExtensionMappingInternal,
  validateUnknownExtensionGrammarInternal,
  type ExtensionBudgetViolation,
  type Strictness,
  type TemporalWarning,
  type TypeExtensionEnforcementWarning,
  type TypeExtensionMappingWarning,
  type UnknownExtensionWarning,
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
  /**
   * Strictness profile for layers that promote warnings to errors
   * under `'strict'` mode. When omitted, layers that consume
   * strictness skip (they do not run). Mirrors the canonical
   * `verifyLocal({ strictness })` option.
   */
  readonly strictness?: Strictness;
  /**
   * Maximum permitted clock skew in seconds for the iat-not-yet-valid
   * check. When omitted, the iat layer skips. Mirrors
   * `verifyLocal({ maxClockSkew })`; canonical default is 300.
   */
  readonly maxClockSkew?: number;
  /**
   * Receipt-side policy digest (`claims.policy.digest`). Used together
   * with `localPolicyDigest` by the policy-binding layer. Either
   * absent skips the layer.
   */
  readonly receiptPolicyDigest?: string;
  /**
   * Caller-supplied policy digest. Used together with
   * `receiptPolicyDigest`. Either absent skips the layer.
   */
  readonly localPolicyDigest?: string;
  /**
   * Full receipt-claims object for the schema-parse layer. When
   * omitted, the schema-parse layer falls back to running on the
   * minimal `BoundedClaimsInput` projection (which may not surface
   * field-level parse errors that depend on optional fields outside
   * the bounded subset).
   */
  readonly fullClaims?: Record<string, unknown>;
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
  | 'extension-budget'
  | 'schema-parse'
  | 'jose-typ-strictness'
  | 'iat-not-yet-valid'
  | 'policy-binding'
  | 'unknown-extension-grammar'
  | 'type-extension-enforcement';

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

  // 7. Schema-parse projection (canonical-composed; delegates to
  // parseReceiptClaims). Skips when `fullClaims` is not supplied;
  // `BoundedClaimsInput` is a 6-field subset and would never satisfy
  // the canonical Wire 0.2 schema. Callers that want the schema-parse
  // layer to fire MUST pass the full claims object via `fullClaims`.
  if (input.fullClaims !== undefined) {
    const schemaRes = validateSchemaParseInternal(input.fullClaims);
    if (!schemaRes.accepted && schemaRes.errorCode !== undefined) {
      violations.push({ layer: 'schema-parse', code: schemaRes.errorCode });
    }
  }

  // 8. JOSE typ-strictness (canonical-composed; mirrors verify-local
  // strictness routing). Skip when no header or no strictness
  // supplied; canonical surface only routes typ-missing under a
  // declared strictness.
  if (input.header !== undefined && input.strictness !== undefined) {
    const typRes = validateJoseTypStrictnessInternal(input.header.typ, input.strictness);
    if (!typRes.accepted) {
      violations.push({ layer: 'jose-typ-strictness', code: typRes.errorCode });
    } else if (typRes.warnings) {
      for (const w of typRes.warnings) {
        warnings.push({ layer: 'jose-typ-strictness', code: w.code });
      }
    }
  }

  // 9. iat-not-yet-valid (mirrors the inline verify-local check).
  // Skip when no maxClockSkew supplied; canonical surface only runs
  // this check inside verifyLocal where maxClockSkew is bound.
  if (input.maxClockSkew !== undefined) {
    const iatRes = validateIatNotYetValidInternal(input.claims.iat, input.now, input.maxClockSkew);
    if (!iatRes.accepted && iatRes.errorCode !== undefined) {
      violations.push({ layer: 'iat-not-yet-valid', code: iatRes.errorCode });
    }
  }

  // 10. Policy-binding (canonical-composed; delegates to
  // verifyPolicyBinding). The `unavailable` projection (either
  // digest absent) is accepted with no surfacing; only `failed`
  // produces a violation.
  if (input.receiptPolicyDigest !== undefined && input.localPolicyDigest !== undefined) {
    const policyRes = validatePolicyBindingInternal(
      input.receiptPolicyDigest,
      input.localPolicyDigest
    );
    if (!policyRes.accepted && policyRes.errorCode !== undefined) {
      violations.push({ layer: 'policy-binding', code: policyRes.errorCode });
    }
  }

  // 11. Unknown-extension grammar (canonical-composed; warnings only).
  const unknownExtRes = validateUnknownExtensionGrammarInternal(input.claims.extensions);
  for (const w of unknownExtRes.warnings as readonly UnknownExtensionWarning[]) {
    warnings.push({
      layer: 'unknown-extension-grammar',
      code: w.code,
      path: w.pointer,
    });
  }

  // 12. Type-extension enforcement (canonical-composed; promotes
  // missing/mismatch to errors under strict mode, surfaces them as
  // warnings under interop). Skip when no strictness supplied.
  if (input.strictness !== undefined) {
    const enforceRes = validateTypeExtensionEnforcementInternal(
      input.claims.kind,
      input.claims.type,
      input.claims.extensions,
      input.strictness
    );
    if (!enforceRes.accepted) {
      violations.push({
        layer: 'type-extension-enforcement',
        code: enforceRes.errorCode,
        path: enforceRes.pointer,
      });
    } else if (enforceRes.warnings) {
      for (const w of enforceRes.warnings as readonly TypeExtensionEnforcementWarning[]) {
        warnings.push({
          layer: 'type-extension-enforcement',
          code: w.code,
          path: w.pointer,
        });
      }
    }
  }

  return {
    accepted: violations.length === 0,
    violations,
    warnings,
  };
}
