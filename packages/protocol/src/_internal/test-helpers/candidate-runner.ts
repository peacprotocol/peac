/**
 * Canonical-composed candidate-runner for parity tests.
 *
 * INTERNAL TEST HELPER. Wraps `runBoundedValidatorShadow` (the
 * canonical-composed candidate validator) and projects its
 * `BoundedValidationResult` into the same `ParityVerdict` shape that
 * `canonical-runner` emits. The candidate-runner is the LEFT input to
 * the canonical-vs-candidate differential test; the canonical-runner
 * is the RIGHT input. Both produce verdicts; the differential test
 * asserts byte-equality (or, where applicable, error-class
 * equivalence).
 *
 * The candidate is canonical-composed by construction: every layer
 * either delegates to a canonical helper from `@peac/schema` /
 * `@peac/crypto` / `@peac/protocol`, or mirrors a canonical inline
 * check verbatim. Divergence between canonical and candidate
 * therefore indicates a defect in the bounded validator's projection
 * logic, not a "different implementation disagreed."
 *
 * Pure: same input always yields the same verdict bytes.
 */

import { canonicalize, sha256Hex } from '@peac/crypto';
import { runBoundedValidatorShadow } from '../record-core/bounded-validator.js';
import { validateSchemaParseInternal } from '../record-core/validators/index.js';
import { makeVerdict, type ParityError, type ParityVerdict } from './parity-verdict.js';
import type { CanonicalRunnerKind } from './canonical-runner.js';

/**
 * Compute the same canonical claims digest the canonical-runner emits
 * for accepted records. Local helper duplicating the canonical-runner's
 * private digest computation; both must use the same JCS + SHA-256 +
 * "sha256:" formula or the differential will surface a digest-only
 * divergence on every accepted fixture.
 */
async function computeCanonicalClaimsDigest(claims: unknown): Promise<string> {
  const canonical = canonicalize(claims);
  const hex = await sha256Hex(canonical);
  return `sha256:${hex}`;
}

/**
 * Run the canonical-composed candidate path on a Wire 0.2 envelope
 * payload. Mirrors `runEnvelopeCanonical` shape-for-shape:
 *
 *   1. Kernel-constraints check via `runBoundedValidatorShadow`
 *      (composes the parallel `validateKernelConstraintsInternal`).
 *   2. Schema-parse projection (delegates to canonical
 *      `parseReceiptClaims`).
 *   3. Canonical claims digest on accepted records.
 *
 * Errors from bounded-validator are projected onto `ParityError`
 * entries so the verdict shape is comparable byte-for-byte against
 * `runEnvelopeCanonical`.
 */
export async function runEnvelopeCandidate(
  payload: Record<string, unknown>
): Promise<ParityVerdict> {
  const errors: ParityError[] = [];

  // Kernel-constraints first (matches canonical-runner ordering).
  const bounded = runBoundedValidatorShadow({
    claims: {
      kind: typeof payload.kind === 'string' ? payload.kind : '',
      type: typeof payload.type === 'string' ? payload.type : '',
      iss: payload.iss,
      iat: typeof payload.iat === 'number' ? payload.iat : 0,
      occurred_at: typeof payload.occurred_at === 'string' ? payload.occurred_at : undefined,
      extensions:
        typeof payload.extensions === 'object' && payload.extensions !== null
          ? (payload.extensions as Record<string, unknown>)
          : undefined,
    },
    now: typeof payload.iat === 'number' ? payload.iat : 0,
  });

  for (const v of bounded.violations) {
    if (v.layer === 'kernel-constraints') {
      errors.push({ code: v.code, path: v.path });
    }
  }
  if (errors.length > 0) {
    return makeVerdict(false, errors);
  }

  // Schema-parse on the full payload (matches canonical-runner's
  // `parseReceiptClaims` step).
  const parseRes = validateSchemaParseInternal(payload);
  if (!parseRes.accepted) {
    errors.push({ code: parseRes.errorCode ?? 'E_INVALID_FORMAT' });
    return makeVerdict(false, errors);
  }

  const digest = await computeCanonicalClaimsDigest(parseRes.claims);
  return makeVerdict(true, [], [], digest);
}

/**
 * Run the canonical-composed candidate JOSE-hardening path on a
 * protected header. The bounded `validateJoseHardeningInternal`
 * mirrors `validateWire02Header` from `@peac/crypto`; the candidate
 * runner surfaces the same first-violation error code projected into
 * the parity verdict shape.
 */
export function runJoseCandidate(header: Record<string, unknown> | undefined): ParityVerdict {
  if (!header) {
    return makeVerdict(false, [{ code: 'CORPUS_MISSING_HEADER' }]);
  }
  const bounded = runBoundedValidatorShadow({
    claims: { kind: '', type: '', iss: '', iat: 0 },
    header,
    now: 0,
  });
  const joseViolation = bounded.violations.find((v) => v.layer === 'jose-header-hardening');
  if (joseViolation) {
    return makeVerdict(false, [{ code: joseViolation.code }]);
  }
  return makeVerdict(true);
}

/**
 * Dispatch to the appropriate candidate runner by kind. Mirrors
 * `runCanonicalForKind`. Always async so callers can uniformly await.
 */
export async function runCandidateForKind(
  kind: CanonicalRunnerKind,
  input: Record<string, unknown>
): Promise<ParityVerdict> {
  if (kind === 'jose') return runJoseCandidate(input);
  return runEnvelopeCandidate(input);
}
