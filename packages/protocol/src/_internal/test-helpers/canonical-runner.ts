/**
 * Canonical-path runner for parity tests.
 *
 * INTERNAL TEST HELPER. Wraps the existing canonical validator path
 * (validateKernelConstraints + parseReceiptClaims for envelope; or
 * validateWire02Header for JOSE) and returns a normalized ParityVerdict.
 *
 * Used by both the canonical-truth sanity test and the differential
 * harness. Pure: same input always yields the same verdict bytes.
 */

import { validateKernelConstraints, parseReceiptClaims } from '@peac/schema';
import { canonicalize, sha256Hex, validateWire02Header } from '@peac/crypto';
import { makeVerdict, type ParityError, type ParityVerdict } from './parity-verdict.js';

/**
 * Compute the canonical claims digest used by accepted ParityVerdicts.
 *
 * Uses RFC 8785 (JCS) canonicalization from @peac/crypto so the digest
 * is byte-stable across object key-order differences, then SHA-256 +
 * "sha256:" prefix to match the canonical PEAC digest format used by
 * Wire 0.2 representation.fingerprint and policy.digest.
 *
 * Local helper for the parity test harness only; not exported beyond
 * this module.
 */
async function computeCanonicalClaimsDigest(claims: unknown): Promise<string> {
  const canonical = canonicalize(claims);
  const hex = await sha256Hex(canonical);
  return `sha256:${hex}`;
}

/** Kind of canonical runner to dispatch to. */
export type CanonicalRunnerKind = 'envelope' | 'jose';

/**
 * Run JOSE-hardening canonical path on a JOSE protected header. Returns
 * accepted=true if the header passes validateWire02Header, accepted=false
 * with the CryptoError code on rejection.
 */
export function runJoseCanonical(header: Record<string, unknown> | undefined): ParityVerdict {
  if (!header) {
    return makeVerdict(false, [{ code: 'CORPUS_MISSING_HEADER' }]);
  }
  try {
    validateWire02Header(header);
    return makeVerdict(true);
  } catch (err) {
    const errAny = err as { code?: string; name?: string };
    const code = typeof errAny.code === 'string' ? errAny.code : (errAny.name ?? 'CRYPTO_UNKNOWN');
    return makeVerdict(false, [{ code }]);
  }
}

/**
 * Run Wire 0.2 envelope canonical path on parsed claims. Layer 1 only:
 * kernel constraints (depth / total nodes / key counts) followed by Zod
 * schema parse. Type-extension warnings live at Layer 3 (verifyLocal)
 * and are intentionally out of scope for the parity foundation.
 *
 * Accepted records carry canonicalClaimsDigest computed from the parsed
 * claims via JCS + SHA-256 + "sha256:" prefix. This anchors the verdict
 * to the canonical normalized claims, not just the accept/reject bit:
 * two validators that both accept but disagree on parsed/normalized
 * claims will produce different digests and the harness will catch it.
 */
export async function runEnvelopeCanonical(
  payload: Record<string, unknown>
): Promise<ParityVerdict> {
  const errors: ParityError[] = [];

  const constraintRes = validateKernelConstraints(payload);
  if (!constraintRes.valid) {
    for (const v of constraintRes.violations) {
      errors.push({ code: v.constraint, path: v.path || undefined });
    }
    return makeVerdict(false, errors);
  }

  const parseRes = parseReceiptClaims(payload);
  if (!parseRes.ok) {
    errors.push({ code: parseRes.error.code });
    return makeVerdict(false, errors);
  }

  const digest = await computeCanonicalClaimsDigest(parseRes.claims);
  return makeVerdict(true, [], [], digest);
}

/**
 * Dispatch to the appropriate canonical runner by kind.
 *
 *   kind === 'jose'     → runJoseCanonical(input as header)   (sync)
 *   kind === 'envelope' → runEnvelopeCanonical(input as payload) (async)
 *
 * The dispatcher always returns a Promise so callers can uniformly
 * await regardless of kind.
 */
export async function runCanonicalForKind(
  kind: CanonicalRunnerKind,
  input: Record<string, unknown>
): Promise<ParityVerdict> {
  if (kind === 'jose') return runJoseCanonical(input);
  return runEnvelopeCanonical(input);
}
