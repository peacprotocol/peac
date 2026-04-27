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
 * - 'no_raw_personal_data': the report applies a minimization redactor
 *   that rewrites caller-supplied free-text across the claims subtree.
 *   Protocol metadata (typ, alg, kid, iss, wire_version, verified
 *   outcome, three-state binding values, kind, type, pillars) is
 *   preserved. Short identifiers that look structured (ASCII, no
 *   whitespace, <= 16 chars) are preserved inside `extensions` so
 *   useful operational fields like `payment_rail` or `currency`
 *   continue to surface.
 *
 * This mode is a minimization posture, not a legal guarantee that
 * all personal data has been removed. Deployments with broader claim
 * payloads, nested operator-specific schemas, or regulated data MUST
 * add their own redaction layer; PEAC cannot know which fields carry
 * personal data in an arbitrary operator-defined extension.
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
 * Pseudonymise a string subject identifier into a stable digest
 * reference of the form `sha256:<32 hex>` (128 bits of visible
 * digest; low collision risk for long-lived report correlation
 * across large datasets). The verifier never stores the salt; the
 * pseudonym is deterministic per subject so chain-of-thought across
 * verifier requests is preserved without leaking the raw value.
 */
function pseudonymise(value: string): string {
  const h = createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 32);
  return `sha256:${h}`;
}

/**
 * Top-level claim keys whose values are protocol metadata that the
 * redactor MUST preserve verbatim. This set is conservative and
 * reflects PEAC Wire surface.
 */
const PROTOCOL_METADATA_KEYS = new Set([
  'iss',
  'iat',
  'exp',
  'nbf',
  'jti',
  'kind',
  'type',
  'typ',
  'alg',
  'kid',
  'cty',
  'pillars',
  'wire_version',
  'version',
  'policy', // object: { digest, uri?, version? }
  'policy_binding',
  'bindings',
]);

/**
 * Common actor subfield names that clearly carry caller-supplied
 * personal data (email, display name) and should pseudonymise when
 * present. This list is intentionally short; any operator-specific
 * actor subfield that is a free-text string also gets elided by the
 * generic string-leaf walker.
 */
const ACTOR_PSEUDONYM_FIELDS = new Set(['id', 'email', 'name', 'display_name', 'handle', 'sub']);

/**
 * Structured-looking short identifier: ASCII printable, no
 * whitespace, <= 16 chars. The redactor preserves these when it
 * finds them as extension string leaves, so useful operational
 * values like `payment_rail: x402`, `currency: USD`,
 * `network: eip155:8453` still appear in the report. Long,
 * whitespace-bearing, or non-ASCII strings are treated as free
 * text and elided.
 */
function isStructuredShortIdentifier(s: string): boolean {
  if (s.length === 0 || s.length > 16) return false;
  return /^[\x21-\x7e]+$/.test(s);
}

const ELIDED = '<redacted:elided>';

function redactExtensionValue(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    return isStructuredShortIdentifier(value) ? value : ELIDED;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactExtensionValue(v));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactExtensionValue(v);
    }
    return out;
  }
  return value;
}

/**
 * Apply the no_raw_personal_data redactor to a claims object.
 * Returns a new object; the original is not mutated.
 *
 * Behavior:
 *   - `sub` is pseudonymised.
 *   - `actor`: `id` / `email` / `name` / `display_name` / `handle` /
 *     `sub` are pseudonymised when present as strings; any other
 *     string actor field is elided; protocol metadata inside `actor`
 *     (unusual but possible) passes through if not a string.
 *   - `extensions` is walked recursively: every string leaf that is
 *     not a short structured identifier (ASCII, no whitespace,
 *     <= 16 chars) is elided; numbers, booleans, null, and nested
 *     object/array structure pass through.
 *   - Top-level claim keys in `PROTOCOL_METADATA_KEYS` are preserved
 *     verbatim.
 *   - Any other top-level claim that is a non-metadata string is
 *     elided, mirroring the extensions policy.
 *
 * This is a minimization posture, not a legal guarantee; the
 * JSDoc on `PrivacyReportMode` carries the full caveat text.
 */
export function redactClaimsForPrivacy(
  claims: Record<string, unknown>,
  mode: PrivacyReportMode = DEFAULT_PRIVACY_MODE
): Record<string, unknown> {
  if (mode === 'off') return claims;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(claims)) {
    if (key === 'sub' && typeof value === 'string' && value.length > 0) {
      out.sub = pseudonymise(value);
      continue;
    }
    if (key === 'actor' && value && typeof value === 'object' && !Array.isArray(value)) {
      const a = value as Record<string, unknown>;
      const cleanedActor: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(a)) {
        if (ACTOR_PSEUDONYM_FIELDS.has(k) && typeof v === 'string' && v.length > 0) {
          cleanedActor[k] = pseudonymise(v);
        } else if (typeof v === 'string') {
          cleanedActor[k] = isStructuredShortIdentifier(v) ? v : ELIDED;
        } else {
          cleanedActor[k] = redactExtensionValue(v);
        }
      }
      out.actor = cleanedActor;
      continue;
    }
    if (key === 'extensions' && value && typeof value === 'object' && !Array.isArray(value)) {
      out.extensions = redactExtensionValue(value);
      continue;
    }
    if (PROTOCOL_METADATA_KEYS.has(key)) {
      out[key] = value;
      continue;
    }
    // Unknown top-level claim: elide if it's a free-text string, else
    // pass through. Numbers and booleans are not personal data.
    if (typeof value === 'string' && !isStructuredShortIdentifier(value)) {
      out[key] = ELIDED;
    } else {
      out[key] = value;
    }
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
