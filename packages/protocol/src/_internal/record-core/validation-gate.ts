/**
 * Production-facing bounded validation gate.
 *
 * INTERNAL ONLY. Not re-exported from `packages/protocol/src/index.ts`.
 *
 * The gate is the only production wrapper for the bounded validation
 * path. The pre-existing `runBoundedValidatorShadow` from
 * `bounded-validator.ts` remains the entry point for shadow / corpus
 * / parity-harness consumers and is not the primary admission path
 * for the protocol entry points; the production-wrapper boundary is
 * enforced by `tests/tooling/production-gate-boundary.test.ts`.
 *
 * The gate is entrypoint-aware: callers identify themselves with a
 * `surface` discriminator, and the gate applies a per-surface
 * production projection allowlist. Layers in the bounded validator's
 * broader composition that fall outside the allowlist for a given
 * surface stay available to shadow / parity tests through
 * `runBoundedValidatorShadow` but are not surfaced as production
 * failure or production warning here.
 *
 * Allowlist for surface 'issueWire02':
 *   - schema-parse only.
 *
 * Allowlist for surface 'verifyLocal':
 *   - kernel-constraints (via canonical `validateKernelConstraints`).
 *   - schema-parse (via the extended `validateSchemaParseInternal`).
 *
 * Out of scope here (kept inline-canonical on both branches by the
 * caller): caller-option-bearing checks (issuer mismatch, subjectUri
 * mismatch, policyDigest format), strictness routing for missing typ,
 * iat-not-yet-valid, occurred_at temporal, type-extension warnings,
 * type-extension enforcement, policy-binding compute, bindings
 * construction, sortWarnings.
 *
 * The canonical materializer (claim encoding, JWS signing, JWS
 * decoding, result-shape construction) is shared between the
 * bounded-default and rollback branches and is not touched by the
 * gate.
 */

import { validateKernelConstraints } from '@peac/schema';
import type { VerificationWarning } from '@peac/kernel';
import type { Wire02Claims } from '@peac/schema';
import { validateSchemaParseInternal } from './validators/schema-parse.js';

/**
 * Discriminator identifying which protocol entry point invoked the
 * gate. Drives the production projection allowlist. Adding a third
 * surface requires a deliberate plan amendment, not an unannounced
 * source change.
 */
export type GateSurface = 'issueWire02' | 'verifyLocal';

/** Sanitized parse-issue projection surfaced on rejection. */
export interface SanitizedParseIssue {
  readonly path: string;
  readonly message: string;
}

/** Parsed-claims projection surfaced on `verifyLocal` acceptance. */
export interface ValidationGateParsed {
  readonly wireVersion: '0.2';
  readonly claims: Wire02Claims;
  readonly parserWarnings: readonly VerificationWarning[];
}

/** Failure-detail projection. Smaller than the bounded layer set. */
export interface ValidationGateFailureDetails {
  readonly parse_code?: string;
  readonly issues?: readonly SanitizedParseIssue[];
}

/** Successful gate result. */
export interface ValidationGateSuccess {
  readonly ok: true;
  readonly parsed?: ValidationGateParsed;
}

/** Failed gate result. */
export interface ValidationGateFailure {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
  readonly details?: ValidationGateFailureDetails;
}

export type ValidationGateResult = ValidationGateSuccess | ValidationGateFailure;

/** Inputs to the gate. Only `surface` and `payload` are required. */
export interface ValidationGateInput {
  readonly surface: GateSurface;
  /**
   * Full claims object. For surface 'issueWire02' this is the just-
   * constructed `Wire02Claims` cast to a plain record (the same
   * object that today flows through `Wire02ClaimsSchema.safeParse`).
   * For surface 'verifyLocal' this is the decoded JWS payload (the
   * same object that today flows through `validateKernelConstraints`
   * and `parseReceiptClaims`).
   */
  readonly payload: unknown;
}

/** Maximum sanitized-issue list length surfaced to a verifier report. */
const MAX_SANITIZED_ISSUES = 25;

function sanitizeIssues(issues: unknown): readonly SanitizedParseIssue[] | undefined {
  if (!Array.isArray(issues)) return undefined;
  return issues.slice(0, MAX_SANITIZED_ISSUES).map((issue) => {
    const candidate = issue as { path?: unknown; message?: unknown };
    const path = Array.isArray(candidate.path)
      ? candidate.path
          .map((segment) =>
            typeof segment === 'string' || typeof segment === 'number' ? String(segment) : ''
          )
          .join('.')
      : '';
    const message =
      typeof candidate.message === 'string'
        ? candidate.message
        : String(candidate.message ?? issue);
    return { path, message };
  });
}

/**
 * Run the production projection of the bounded validation path.
 *
 * Behavior is byte-equivalent to the inline canonical sequences at
 * `issue.ts` and `verify-local.ts` for every input on the covered
 * runtime matrix. Any cross-branch divergence on JWS bytes, result
 * shape, error code, warning order, thrown error class, success /
 * failure classification, or observable default behavior is a
 * validation-equivalence regression.
 */
export function runBoundedValidationGate(input: ValidationGateInput): ValidationGateResult {
  if (input.surface === 'issueWire02') {
    return runIssueWire02(input.payload);
  }
  return runVerifyLocal(input.payload);
}

function runIssueWire02(payload: unknown): ValidationGateResult {
  // Issuance projection mirrors `issue.ts` Wire02ClaimsSchema.safeParse.
  // Today's canonical issuance reports the first Zod issue message in
  // the IssueError details. The gate reproduces that surface here.
  const schemaRes = validateSchemaParseInternal(payload);
  if (!schemaRes.accepted) {
    const firstIssueMessage = schemaRes.errorIssues?.[0]?.message;
    return {
      ok: false,
      code: 'E_INVALID_FORMAT',
      message: `Wire 0.2 claims schema validation failed: ${firstIssueMessage ?? 'unknown'}`,
    };
  }
  return { ok: true };
}

function runVerifyLocal(payload: unknown): ValidationGateResult {
  // Kernel constraints first (canonical-helper delegation preserves
  // the existing `Kernel constraint violated: <constraint>
  // (actual: <actual>, limit: <limit>)` message byte-equally).
  const kernelRes = validateKernelConstraints(payload);
  if (!kernelRes.valid) {
    const v = kernelRes.violations[0];
    return {
      ok: false,
      code: 'E_CONSTRAINT_VIOLATION',
      message: `Kernel constraint violated: ${v.constraint} (actual: ${v.actual}, limit: ${v.limit})`,
    };
  }

  // Schema parse next. Surface the canonical
  // `Receipt schema validation failed: <message>` shape with
  // `details: { parse_code, issues }` byte-equally.
  //
  // Wire 0.1 payloads parse successfully under the canonical parser
  // but are rejected at the bounded layer with errorCode
  // 'E_UNSUPPORTED_WIRE_VERSION'. The verify-local canonical surface
  // routes Wire 0.1 to a distinct error code (not E_INVALID_FORMAT)
  // and a distinct message; preserve that branch here.
  const schemaRes = validateSchemaParseInternal(payload);
  if (!schemaRes.accepted) {
    if (schemaRes.errorCode === 'E_UNSUPPORTED_WIRE_VERSION') {
      return {
        ok: false,
        code: 'E_UNSUPPORTED_WIRE_VERSION',
        message: 'Wire 0.1 receipts are not supported. Re-issue as Wire 0.2 using issue().',
      };
    }
    const sanitized = sanitizeIssues(schemaRes.errorIssues);
    const details: ValidationGateFailureDetails = {};
    if (schemaRes.errorCode !== undefined) {
      Object.assign(details, { parse_code: schemaRes.errorCode });
    }
    if (sanitized !== undefined) {
      Object.assign(details, { issues: sanitized });
    }
    return {
      ok: false,
      code: 'E_INVALID_FORMAT',
      message: `Receipt schema validation failed: ${schemaRes.errorMessage ?? 'unknown'}`,
      ...(Object.keys(details).length > 0 && { details }),
    };
  }

  if (schemaRes.wireVersion !== '0.2' || schemaRes.claims === undefined) {
    return {
      ok: false,
      code: 'E_UNSUPPORTED_WIRE_VERSION',
      message: 'Wire 0.1 receipts are not supported. Re-issue as Wire 0.2 using issue().',
    };
  }

  return {
    ok: true,
    parsed: {
      wireVersion: '0.2',
      claims: schemaRes.claims,
      parserWarnings: schemaRes.warnings ?? [],
    },
  };
}
