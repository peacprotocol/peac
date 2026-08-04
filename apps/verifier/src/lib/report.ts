/**
 * Deterministic report core.
 *
 * The report is DETERMINISTIC but UNSIGNED. Its hash makes it reproducible and tamper-evident
 * relative to a retained reference; it does NOT establish who generated it. It is not a PEAC
 * record, receipt, proof, attestation or evidence receipt.
 */
import { canonicalize, sha256Hex } from '@peac/crypto';
import type { VerificationReportCoreV1 } from './verifier-types.js';

export type ReportCoreDraft = Omit<VerificationReportCoreV1, 'reportSha256'>;

/** Drop undefined members so JCS never sees them and the shape stays schema-exact. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export async function buildReportCore(draft: ReportCoreDraft): Promise<VerificationReportCoreV1> {
  const core = compact({
    ...draft,
    warningCodes: [...new Set(draft.warningCodes)].sort(),
    limitationCodes: [...new Set(draft.limitationCodes)].sort(),
  });
  const reportSha256 = `sha256:${await sha256Hex(canonicalize(core))}`;
  return { ...core, reportSha256 };
}

/** Stable limitation codes. Never localized prose; the UI maps codes to copy. */
export const LIMITATION = {
  CLAIM_TRUTH_NOT_EVALUATED: 'CLAIM_TRUTH_NOT_EVALUATED',
  KEY_NOT_INDEPENDENTLY_TRUSTED: 'KEY_NOT_INDEPENDENTLY_TRUSTED',
  ISSUER_CONSTRAINT_NOT_PROVIDED: 'ISSUER_CONSTRAINT_NOT_PROVIDED',
  KID_CONSTRAINT_NOT_PROVIDED: 'KID_CONSTRAINT_NOT_PROVIDED',
  RECORD_TYPE_CONSTRAINT_NOT_PROVIDED: 'RECORD_TYPE_CONSTRAINT_NOT_PROVIDED',
  REPORT_IS_UNSIGNED: 'REPORT_IS_UNSIGNED',
} as const;
