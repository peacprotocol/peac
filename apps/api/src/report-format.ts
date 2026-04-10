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

import { randomUUID } from 'node:crypto';

export interface VerifyResult {
  verified: boolean;
  receipt_ref: string;
  claims?: Record<string, unknown>;
  warnings?: Array<{ code: string; message: string; pointer?: string }>;
  policy_binding?: string;
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
  issuer?: string;
  kid?: string;
  wire_version?: string;
  key_resolution: 'provided' | 'allowlist' | 'discovery';
  failure_reasons: FailureReason[];
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
  keyResolution: 'provided' | 'allowlist' | 'discovery'
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
    ...(result.issuer && { issuer: result.issuer }),
    ...(result.kid && { kid: result.kid }),
    ...(result.wire_version && { wire_version: result.wire_version }),
    key_resolution: keyResolution,
    failure_reasons: buildFailureReasons(result),
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
