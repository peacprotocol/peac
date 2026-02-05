/**
 * PEAC Verification Report Builder
 *
 * Constructs deterministic verification reports per VERIFICATION-REPORT-FORMAT.md.
 * Reports are designed to be portable, deterministic, safe, and policy-aware.
 *
 * @packageDocumentation
 */

import { sha256Hex } from '@peac/crypto';
import { VERIFICATION_REPORT_VERSION, WIRE_TYPE } from '@peac/kernel';
import type {
  CheckId,
  CheckResult,
  CheckStatus,
  DigestObject,
  ReasonCode,
  VerificationArtifacts,
  VerificationInput,
  VerificationMeta,
  VerificationReport,
  VerificationResult,
  VerifierPolicy,
} from './verifier-types.js';
import {
  CHECK_IDS,
  createDigest,
  NON_DETERMINISTIC_ARTIFACT_KEYS,
  reasonCodeToErrorCode,
  reasonCodeToSeverity,
} from './verifier-types.js';

/**
 * Report builder state
 */
interface ReportBuilderState {
  input?: VerificationInput;
  receiptDigestHex?: string;
  policy: VerifierPolicy;
  checks: Map<CheckId, CheckResult>;
  result?: VerificationResult;
  artifacts?: Record<string, unknown>;
  meta?: VerificationMeta;
  shortCircuited: boolean;
  failedAtCheck?: CheckId;
}

/**
 * Verification Report Builder
 *
 * Builds verification reports with proper check ordering and short-circuit behavior.
 * Ensures reports conform to VERIFICATION-REPORT-FORMAT.md requirements.
 *
 * Shape-stable: Always emits all checks with pass/fail/skip status.
 */
export class VerificationReportBuilder {
  private state: ReportBuilderState;

  constructor(policy: VerifierPolicy) {
    this.state = {
      policy,
      checks: new Map(),
      shortCircuited: false,
    };
  }

  /**
   * Set the input descriptor with pre-computed digest
   *
   * Use this when you've already computed the SHA-256 hash.
   *
   * @param digestHex - SHA-256 digest as lowercase hex (64 chars)
   * @param type - Input type
   */
  setInputWithDigest(
    digestHex: string,
    type: 'receipt_jws' | 'bundle_entry' = 'receipt_jws'
  ): this {
    this.state.receiptDigestHex = digestHex;
    this.state.input = {
      type,
      receipt_digest: createDigest(digestHex),
    };
    return this;
  }

  /**
   * Set the input descriptor (async - computes SHA-256)
   *
   * @param receiptBytes - Raw receipt bytes
   * @param type - Input type
   */
  async setInputAsync(
    receiptBytes: Uint8Array,
    type: 'receipt_jws' | 'bundle_entry' = 'receipt_jws'
  ): Promise<this> {
    const digestHex = await sha256Hex(receiptBytes);
    return this.setInputWithDigest(digestHex, type);
  }

  /**
   * Add a check result
   *
   * Checks can be added in any order; they will be sorted in build().
   * If a previous check failed, subsequent checks should be marked as skip.
   */
  addCheck(
    id: CheckId,
    status: CheckStatus,
    detail?: Record<string, unknown>,
    errorCode?: string
  ): this {
    const check: CheckResult = { id, status };
    if (detail && Object.keys(detail).length > 0) {
      check.detail = detail;
    }
    if (errorCode) {
      check.error_code = errorCode;
    }

    this.state.checks.set(id, check);

    // Track short-circuit on failure
    if (status === 'fail' && !this.state.shortCircuited) {
      this.state.shortCircuited = true;
      this.state.failedAtCheck = id;
    }

    return this;
  }

  /**
   * Add a passing check
   */
  pass(id: CheckId, detail?: Record<string, unknown>): this {
    return this.addCheck(id, 'pass', detail);
  }

  /**
   * Add a failing check
   */
  fail(id: CheckId, errorCode: string, detail?: Record<string, unknown>): this {
    return this.addCheck(id, 'fail', detail, errorCode);
  }

  /**
   * Add a skipped check
   */
  skip(id: CheckId, detail?: Record<string, unknown>): this {
    return this.addCheck(id, 'skip', detail);
  }

  /**
   * Set the final result
   */
  setResult(
    valid: boolean,
    reason: ReasonCode,
    options?: {
      issuer?: string;
      kid?: string;
      receiptType?: string;
    }
  ): this {
    this.state.result = {
      valid,
      reason,
      severity: reasonCodeToSeverity(reason),
      receipt_type: options?.receiptType ?? WIRE_TYPE,
      ...(options?.issuer && { issuer: options.issuer }),
      ...(options?.kid && { kid: options.kid }),
    };
    return this;
  }

  /**
   * Set success result
   */
  success(issuer: string, kid: string): this {
    return this.setResult(true, 'ok', { issuer, kid });
  }

  /**
   * Set failure result
   */
  failure(reason: ReasonCode, issuer?: string, kid?: string): this {
    return this.setResult(false, reason, { issuer, kid });
  }

  /**
   * Add artifacts
   */
  addArtifact(key: string, value: unknown): this {
    if (!this.state.artifacts) {
      this.state.artifacts = {};
    }
    this.state.artifacts[key] = value;
    return this;
  }

  /**
   * Set metadata (non-deterministic fields)
   */
  setMeta(meta: VerificationMeta): this {
    this.state.meta = meta;
    return this;
  }

  /**
   * Add current timestamp to meta
   */
  addTimestamp(): this {
    if (!this.state.meta) {
      this.state.meta = {};
    }
    this.state.meta.generated_at = new Date().toISOString();
    return this;
  }

  /**
   * Build the final report
   *
   * Ensures all checks are present (shape-stable).
   * Missing checks after a failure are marked as 'skip'.
   * Missing checks before a failure (or in success) are marked as 'pass'.
   */
  build(): VerificationReport {
    // Validate required fields
    if (!this.state.input) {
      throw new Error('Input is required. Call setInputWithDigest() or setInputAsync() first.');
    }
    if (!this.state.result) {
      throw new Error('Result is required. Call setResult() or success()/failure() first.');
    }

    // Build shape-stable checks array
    const checks: CheckResult[] = [];
    const failedIndex = this.state.failedAtCheck ? CHECK_IDS.indexOf(this.state.failedAtCheck) : -1;

    for (let i = 0; i < CHECK_IDS.length; i++) {
      const checkId = CHECK_IDS[i];
      const existing = this.state.checks.get(checkId);

      if (existing) {
        checks.push(existing);
      } else if (this.state.shortCircuited && i > failedIndex) {
        // After failure, missing checks are skipped
        checks.push({ id: checkId, status: 'skip', detail: { reason: 'short_circuit' } });
      } else {
        // Before failure or in success, missing checks get default status
        // For optional checks like transport.profile_binding, mark as skip
        if (checkId === 'transport.profile_binding') {
          checks.push({ id: checkId, status: 'skip', detail: { reason: 'not_applicable' } });
        } else {
          // This shouldn't happen in well-formed builds - indicates a bug
          checks.push({ id: checkId, status: 'skip', detail: { reason: 'not_executed' } });
        }
      }
    }

    const report: VerificationReport = {
      report_version: VERIFICATION_REPORT_VERSION,
      input: this.state.input,
      policy: this.state.policy,
      result: this.state.result,
      checks,
    };

    if (this.state.artifacts && Object.keys(this.state.artifacts).length > 0) {
      report.artifacts = this.state.artifacts as VerificationReport['artifacts'];
    }

    if (this.state.meta) {
      report.meta = this.state.meta;
    }

    return report;
  }

  /**
   * Build in deterministic mode (excludes meta and non-deterministic artifacts)
   *
   * Deterministic mode ensures that the same inputs and policy always produce
   * the same report output, regardless of cache state or timing.
   *
   * Excludes:
   * - `meta`: Contains timestamps and verifier info
   * - Non-deterministic artifacts: `issuer_jwks_digest` (depends on cache state)
   *
   * @returns Report without meta and with only deterministic artifacts
   */
  buildDeterministic(): Omit<VerificationReport, 'meta'> {
    const report = this.build();
    const { meta: _meta, ...deterministic } = report;

    // Filter out non-deterministic artifacts
    if (deterministic.artifacts) {
      const filteredArtifacts: Partial<VerificationArtifacts> = { ...deterministic.artifacts };
      for (const key of NON_DETERMINISTIC_ARTIFACT_KEYS) {
        delete filteredArtifacts[key];
      }

      // Remove artifacts object if empty after filtering
      if (Object.keys(filteredArtifacts).length === 0) {
        delete deterministic.artifacts;
      } else {
        deterministic.artifacts = filteredArtifacts as VerificationArtifacts;
      }
    }

    return deterministic;
  }
}

/**
 * Create a new report builder
 */
export function createReportBuilder(policy: VerifierPolicy): VerificationReportBuilder {
  return new VerificationReportBuilder(policy);
}

/**
 * Compute receipt digest for report input
 *
 * @param receiptBytes - Raw receipt bytes (JWS string as UTF-8)
 * @returns SHA-256 digest as lowercase hex (64 chars)
 */
export async function computeReceiptDigest(receiptBytes: Uint8Array | string): Promise<string> {
  const bytes =
    typeof receiptBytes === 'string' ? new TextEncoder().encode(receiptBytes) : receiptBytes;
  return sha256Hex(bytes);
}

/**
 * Build a quick failure report without going through all checks
 *
 * Useful for early failures like receipt_too_large or malformed_receipt
 * where most checks are skipped.
 */
export async function buildFailureReport(
  policy: VerifierPolicy,
  receiptBytes: Uint8Array | string,
  reason: ReasonCode,
  failedCheckId: CheckId,
  errorCode?: string,
  detail?: Record<string, unknown>,
  options?: {
    issuer?: string;
    kid?: string;
    meta?: VerificationMeta;
  }
): Promise<VerificationReport> {
  const bytes =
    typeof receiptBytes === 'string' ? new TextEncoder().encode(receiptBytes) : receiptBytes;
  const digestHex = await sha256Hex(bytes);

  const builder = createReportBuilder(policy)
    .setInputWithDigest(digestHex)
    .failure(reason, options?.issuer, options?.kid);

  // Add passing checks up to the failure point
  const failedIndex = CHECK_IDS.indexOf(failedCheckId);
  for (let i = 0; i < CHECK_IDS.length; i++) {
    const checkId = CHECK_IDS[i];
    if (i < failedIndex) {
      builder.pass(checkId);
    } else if (i === failedIndex) {
      builder.fail(checkId, errorCode ?? reasonCodeToErrorCode(reason), detail);
    }
    // Remaining checks will be auto-skipped by build()
  }

  if (options?.meta) {
    builder.setMeta(options.meta);
  }

  return builder.build();
}

/**
 * Build a success report
 */
export async function buildSuccessReport(
  policy: VerifierPolicy,
  receiptBytes: Uint8Array | string,
  issuer: string,
  kid: string,
  checkDetails?: Partial<Record<CheckId, Record<string, unknown>>>,
  options?: {
    artifacts?: VerificationReport['artifacts'];
    meta?: VerificationMeta;
  }
): Promise<VerificationReport> {
  const bytes =
    typeof receiptBytes === 'string' ? new TextEncoder().encode(receiptBytes) : receiptBytes;
  const digestHex = await sha256Hex(bytes);

  const builder = createReportBuilder(policy).setInputWithDigest(digestHex).success(issuer, kid);

  // Add all checks as passing (except optional ones)
  for (const checkId of CHECK_IDS) {
    // Skip issuer.discovery for offline mode
    if (checkId === 'issuer.discovery' && policy.mode === 'offline_only') {
      builder.skip(checkId, { reason: 'offline_mode' });
      continue;
    }

    // transport.profile_binding is optional
    if (checkId === 'transport.profile_binding') {
      if (checkDetails?.[checkId]) {
        builder.pass(checkId, checkDetails[checkId]);
      }
      // Will be marked as skip by build() if not added
      continue;
    }

    builder.pass(checkId, checkDetails?.[checkId]);
  }

  if (options?.artifacts) {
    for (const [key, value] of Object.entries(options.artifacts)) {
      builder.addArtifact(key, value);
    }
  }

  if (options?.meta) {
    builder.setMeta(options.meta);
  }

  return builder.build();
}
