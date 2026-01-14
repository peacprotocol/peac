/**
 * @peac/audit
 *
 * Audit logging and case bundle generation for PEAC protocol (v0.9.27+).
 *
 * This package provides:
 * - JSONL audit log format (normative)
 * - Case bundle generation for dispute resolution
 * - Trace correlation for distributed system debugging
 * - Privacy-safe logging patterns
 *
 * ## Audit Log Format
 *
 * PEAC audit logs use JSONL (JSON Lines) format where each line is a
 * complete audit entry. This enables streaming, append-only logging,
 * and efficient line-by-line processing.
 *
 * ## Case Bundles
 *
 * Case bundles collect all audit entries related to a dispute,
 * organized chronologically with trace correlation data for
 * comprehensive dispute resolution.
 *
 * @example
 * ```typescript
 * import {
 *   createAuditEntry,
 *   formatJsonl,
 *   createCaseBundle,
 * } from '@peac/audit';
 *
 * // Create an audit entry
 * const entry = createAuditEntry({
 *   event_type: 'receipt_issued',
 *   actor: { type: 'system', id: 'peac-issuer' },
 *   resource: { type: 'receipt', id: 'jti:rec_abc123' },
 *   outcome: { success: true, result: 'issued' },
 * });
 *
 * // Format to JSONL
 * const jsonl = formatJsonl([entry]);
 *
 * // Create a case bundle for dispute resolution
 * const bundle = createCaseBundle({
 *   dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   generated_by: 'https://platform.example.com',
 *   entries: disputeRelatedEntries,
 * });
 * ```
 *
 * @packageDocumentation
 */

export const AUDIT_PACKAGE_VERSION = '0.9.27';

// Types
export type {
  AuditEventType,
  AuditSeverity,
  TraceContext,
  AuditActor,
  AuditResource,
  AuditOutcome,
  AuditEntry,
  CaseBundle,
  CaseBundleSummary,
  CreateAuditEntryOptions,
  CreateCaseBundleOptions,
  JsonlOptions,
  JsonlParseOptions,
} from './types.js';

// Entry creation and validation
export {
  AUDIT_VERSION,
  AUDIT_EVENT_TYPES,
  AUDIT_SEVERITIES,
  generateAuditId,
  isValidUlid,
  isValidTraceContext,
  createAuditEntry,
  validateAuditEntry,
  isValidAuditEntry,
  type ValidationResult,
} from './entry.js';

// JSONL formatting and parsing
export {
  formatJsonlLine,
  formatJsonl,
  parseJsonlLine,
  parseJsonl,
  createJsonlAppender,
  type JsonlParseLineResult,
  type JsonlParseLineError,
  type JsonlParseResult,
} from './jsonl.js';

// Case bundle generation
export {
  BUNDLE_VERSION,
  createCaseBundle,
  generateBundleSummary,
  filterByDispute,
  filterByTraceId,
  filterByTimeRange,
  filterByResource,
  correlateByTrace,
  serializeBundle,
  type TraceCorrelation,
} from './bundle.js';

// Dispute bundle (v0.9.30+, normalized in v0.10.0)
export {
  BUNDLE_VERSION as DISPUTE_BUNDLE_VERSION_v2,
  DISPUTE_BUNDLE_VERSION,
  VERIFICATION_REPORT_VERSION,
  type BundleKind,
  type BundleRef,
  type ManifestFileEntry,
  type ManifestReceiptEntry,
  type ManifestKeyEntry,
  type BundleTimeRange,
  type DisputeBundleManifest,
  type CreateDisputeBundleOptions,
  type JsonWebKeySet,
  type JsonWebKey,
  type DisputeBundleContents,
  type ReceiptVerificationResult,
  type KeyUsageEntry,
  type AuditorSummary,
  type VerificationReport,
  type VerifyBundleOptions,
  type BundleError,
  type BundleResult,
} from './dispute-bundle-types.js';

export {
  createDisputeBundle,
  readDisputeBundle,
  verifyBundleIntegrity,
  getBundleContentHash,
} from './dispute-bundle.js';

// Verification report (v0.9.30+)
export { verifyBundle, serializeReport, formatReportText } from './verification-report.js';
