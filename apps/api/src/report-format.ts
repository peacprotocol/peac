/**
 * Reference verifier report formatting.
 *
 * Supports three output formats via Accept header content negotiation:
 * - application/json (default): standard verification report
 * - application/peac-report+json: extended report with timing and resolution
 * - text/plain: human-readable summary
 *
 * Neutral reference verifier behavior only. No tenant model, org model,
 * account semantics, dashboard semantics, or product-only operational workflow.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { VerifierBindings } from '@peac/protocol';

/**
 * Privacy mode for the verifier report (v0.12.14).
 *
 * - 'off' (default): the report echoes claims verbatim, byte-identical
 *   to v0.12.13 behavior.
 * - 'no_raw_personal_data': the report applies a narrow redactor to
 *   caller-supplied free-text fields most likely to carry personal
 *   data. Protocol metadata (typ, alg, kid, iss, wire_version,
 *   verified outcome, three-state binding values) are unchanged.
 *
 * The mode is read from the `PEAC_NO_RAW_PERSONAL_DATA` env var at
 * module load. Operators set it to `true` (or `1`) in deployments
 * that prefer to avoid surfacing raw caller-supplied content through
 * the report path.
 */
export type PrivacyReportMode = 'off' | 'no_raw_personal_data';

const DEFAULT_PRIVACY_MODE: PrivacyReportMode = ((): PrivacyReportMode => {
  const v = typeof process !== 'undefined' ? process.env?.PEAC_NO_RAW_PERSONAL_DATA : undefined;
  return v === 'true' || v === '1' ? 'no_raw_personal_data' : 'off';
})();

/**
 * Pseudonymise a string subject identifier into a short stable
 * digest reference of the form `sha256:<16 hex>`. The verifier never
 * stores the salt; the pseudonym is deterministic per subject so
 * chain-of-thought across verifier requests is preserved without
 * leaking the raw value.
 */
function pseudonymise(value: string): string {
  const h = createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16);
  return `sha256:${h}`;
}

/**
 * Apply the no_raw_personal_data redactor to a claims object. Returns
 * a new object; the original is not mutated. Only fields most likely
 * to carry caller-supplied personal data are rewritten:
 *
 *   - `sub` → pseudonymised digest reference
 *   - `actor.id` → pseudonymised (when an actor object is present)
 *   - any top-level `extensions` value that is a free-text string
 *     longer than 16 chars → '<redacted:elided>'
 *
 * Protocol metadata (`iss`, `kid`, `typ`, `alg`, `wire_version`,
 * `kind`, `type`, `pillars`, three-state binding values) is
 * preserved.
 */
export function redactClaimsForPrivacy(
  claims: Record<string, unknown>,
  mode: PrivacyReportMode = DEFAULT_PRIVACY_MODE
): Record<string, unknown> {
  if (mode === 'off') return claims;
  const out: Record<string, unknown> = { ...claims };
  if (typeof out.sub === 'string' && out.sub.length > 0) {
    out.sub = pseudonymise(out.sub);
  }
  const actor = out.actor;
  if (actor && typeof actor === 'object' && !Array.isArray(actor)) {
    const a = actor as Record<string, unknown>;
    if (typeof a.id === 'string' && a.id.length > 0) {
      out.actor = { ...a, id: pseudonymise(a.id) };
    }
  }
  const ext = out.extensions;
  if (ext && typeof ext === 'object' && !Array.isArray(ext)) {
    const e = ext as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e)) {
      if (typeof v === 'string' && v.length > 16) {
        cleaned[k] = '<redacted:elided>';
      } else {
        cleaned[k] = v;
      }
    }
    out.extensions = cleaned;
  }
  return out;
}

export function getDefaultPrivacyMode(): PrivacyReportMode {
  return DEFAULT_PRIVACY_MODE;
}

export interface VerifyResult {
  verified: boolean;
  receipt_ref: string;
  claims?: Record<string, unknown>;
  warnings?: Array<{ code: string; message: string; pointer?: string }>;
  policy_binding?: string;
  /**
   * Top-level bindings object (v0.12.14). Present only when caller
   * supplied `bindings.terms` or `bindings.documents` to verifyLocal.
   * `bindings.policy` (when present) mirrors `policy_binding` byte-stable.
   */
  bindings?: VerifierBindings;
  issuer?: string;
  kid?: string;
  wire_version?: string;
  error_code?: string;
  error_message?: string;
}

export interface FailureReason {
  code: string;
  detail: string;
}

export interface ExtendedReport {
  report_id: string;
  verified: boolean;
  verified_at: string;
  duration_ms: number;
  receipt_ref: string;
  claims?: Record<string, unknown>;
  warnings?: Array<{ code: string; message: string; pointer?: string }>;
  policy_binding?: string;
  /**
   * Top-level bindings object (v0.12.14). Present only when caller
   * supplied terms or documents bindings to verifyLocal. Otherwise
   * absent so the extended report stays byte-stable with v0.12.13.
   */
  bindings?: VerifierBindings;
  issuer?: string;
  kid?: string;
  wire_version?: string;
  key_resolution: 'provided' | 'allowlist' | 'discovery';
  failure_reasons: FailureReason[];
  /** Recognized record profile, if the receipt type matches a known adapter prefix. */
  record_profile?: { profile: string; family: string };
}

export function generateReportId(): string {
  return randomUUID();
}

export function buildFailureReasons(result: VerifyResult): FailureReason[] {
  if (result.verified) return [];
  if (!result.error_code) return [];
  return [
    {
      code: result.error_code,
      detail: result.error_message ?? 'Verification failed',
    },
  ];
}

export function buildExtendedReport(
  result: VerifyResult,
  reportId: string,
  durationMs: number,
  keyResolution: 'provided' | 'allowlist' | 'discovery',
  recordProfile?: { profile: string; family: string }
): ExtendedReport {
  return {
    report_id: reportId,
    verified: result.verified,
    verified_at: new Date().toISOString(),
    duration_ms: Math.round(durationMs * 100) / 100,
    receipt_ref: result.receipt_ref,
    ...(result.claims && { claims: result.claims }),
    ...(result.warnings && { warnings: result.warnings }),
    ...(result.policy_binding && { policy_binding: result.policy_binding }),
    ...(result.bindings &&
      (result.bindings.terms !== undefined ||
        (result.bindings.documents !== undefined && result.bindings.documents.length > 0)) && {
        bindings: result.bindings,
      }),
    ...(result.issuer && { issuer: result.issuer }),
    ...(result.kid && { kid: result.kid }),
    ...(result.wire_version && { wire_version: result.wire_version }),
    key_resolution: keyResolution,
    failure_reasons: buildFailureReasons(result),
    ...(recordProfile && { record_profile: recordProfile }),
  };
}

export function formatPlainText(report: ExtendedReport): string {
  const lines = [
    'PEAC Verification Report',
    '========================',
    `Report ID:  ${report.report_id}`,
    `Verified:   ${report.verified}`,
    `Receipt:    ${report.receipt_ref}`,
    ...(report.issuer ? [`Issuer:     ${report.issuer}`] : []),
    ...(report.kid ? [`Key ID:     ${report.kid}`] : []),
    ...(report.wire_version ? [`Wire:       ${report.wire_version}`] : []),
    `Checked at: ${report.verified_at}`,
    `Duration:   ${report.duration_ms}ms`,
    `Warnings:   ${report.warnings?.length ? report.warnings.map((w) => w.code).join(', ') : 'none'}`,
    ...(report.failure_reasons.length
      ? [`Failures:   ${report.failure_reasons.map((r) => r.code).join(', ')}`]
      : []),
  ];
  return lines.join('\n') + '\n';
}

export type AcceptFormat = 'json' | 'extended' | 'plain';

export function negotiateFormat(accept: string | undefined): AcceptFormat {
  if (!accept) return 'json';
  if (accept.includes('application/peac-report+json')) return 'extended';
  if (accept.includes('text/plain')) return 'plain';
  return 'json';
}
