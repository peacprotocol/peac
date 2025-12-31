/**
 * Baseline metrics for PEAC telemetry
 *
 * Metrics are emitted unconditionally when the OTel provider is enabled,
 * even without an active span. This provides immediate dashboards without
 * requiring full distributed tracing setup.
 */

import type { Meter, Counter, Histogram, Attributes } from '@opentelemetry/api';

/**
 * PEAC metrics interface
 */
export interface PeacMetrics {
  /** Total receipts issued counter */
  receiptsIssued: Counter<Attributes>;

  /** Total receipts verified counter */
  receiptsVerified: Counter<Attributes>;

  /** Total access decisions counter */
  accessDecisions: Counter<Attributes>;

  /** Receipt issuance duration histogram */
  issueDuration: Histogram<Attributes>;

  /** Receipt verification duration histogram */
  verifyDuration: Histogram<Attributes>;
}

/**
 * Metric names for PEAC
 */
export const METRIC_NAMES = {
  RECEIPTS_ISSUED: 'peac.receipts.issued',
  RECEIPTS_VERIFIED: 'peac.receipts.verified',
  ACCESS_DECISIONS: 'peac.access.decisions',
  ISSUE_DURATION: 'peac.issue.duration',
  VERIFY_DURATION: 'peac.verify.duration',
} as const;

/**
 * Create PEAC metrics from an OpenTelemetry meter
 *
 * @param meter - OpenTelemetry meter instance
 * @returns PEAC metrics object
 */
export function createMetrics(meter: Meter): PeacMetrics {
  return {
    receiptsIssued: meter.createCounter(METRIC_NAMES.RECEIPTS_ISSUED, {
      description: 'Total PEAC receipts issued',
      unit: '1',
    }),

    receiptsVerified: meter.createCounter(METRIC_NAMES.RECEIPTS_VERIFIED, {
      description: 'Total PEAC receipts verified',
      unit: '1',
    }),

    accessDecisions: meter.createCounter(METRIC_NAMES.ACCESS_DECISIONS, {
      description: 'Total PEAC access decisions by outcome',
      unit: '1',
    }),

    issueDuration: meter.createHistogram(METRIC_NAMES.ISSUE_DURATION, {
      description: 'Receipt issuance duration',
      unit: 'ms',
    }),

    verifyDuration: meter.createHistogram(METRIC_NAMES.VERIFY_DURATION, {
      description: 'Receipt verification duration',
      unit: 'ms',
    }),
  };
}

/**
 * Record a receipt issued metric
 *
 * @param metrics - PEAC metrics object
 * @param hashedIssuer - Hashed issuer identifier
 * @param durationMs - Issuance duration in milliseconds
 */
export function recordReceiptIssued(
  metrics: PeacMetrics,
  hashedIssuer?: string,
  durationMs?: number
): void {
  const attributes: Attributes = {};

  if (hashedIssuer) {
    attributes['peac.issuer_hash'] = hashedIssuer;
  }

  metrics.receiptsIssued.add(1, attributes);

  if (durationMs !== undefined) {
    metrics.issueDuration.record(durationMs, attributes);
  }
}

/**
 * Record a receipt verified metric
 *
 * @param metrics - PEAC metrics object
 * @param valid - Whether the receipt was valid
 * @param reasonCode - Reason code for the verification result
 * @param durationMs - Verification duration in milliseconds
 */
export function recordReceiptVerified(
  metrics: PeacMetrics,
  valid: boolean,
  reasonCode?: string,
  durationMs?: number
): void {
  const attributes: Attributes = {
    'peac.valid': valid,
  };

  if (reasonCode) {
    attributes['peac.reason_code'] = reasonCode;
  }

  metrics.receiptsVerified.add(1, attributes);

  if (durationMs !== undefined) {
    metrics.verifyDuration.record(durationMs, attributes);
  }
}

/**
 * Record an access decision metric
 *
 * @param metrics - PEAC metrics object
 * @param decision - The access decision (allow/deny/unknown)
 * @param reasonCode - Reason code for the decision
 */
export function recordAccessDecision(
  metrics: PeacMetrics,
  decision: 'allow' | 'deny' | 'unknown',
  reasonCode?: string
): void {
  const attributes: Attributes = {
    'peac.decision': decision,
  };

  if (reasonCode) {
    attributes['peac.reason_code'] = reasonCode;
  }

  metrics.accessDecisions.add(1, attributes);
}
