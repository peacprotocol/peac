/**
 * @peac/telemetry - Attribute constants
 *
 * Standard attribute names for PEAC telemetry.
 * Uses stable OTel semantic conventions where applicable.
 */

/**
 * PEAC-specific attribute names
 */
export const PEAC_ATTRS = {
  // Core (always emitted)
  VERSION: 'peac.version',
  EVENT: 'peac.event',
  RECEIPT_HASH: 'peac.receipt.hash',
  POLICY_HASH: 'peac.policy.hash',
  DECISION: 'peac.decision',
  REASON_CODE: 'peac.reason_code',
  ISSUER: 'peac.issuer',
  ISSUER_HASH: 'peac.issuer_hash',
  KID: 'peac.kid',
  VALID: 'peac.valid',

  // HTTP (privacy-safe, stable OTel semconv)
  HTTP_METHOD: 'http.request.method',
  HTTP_PATH: 'url.path', // No query string
  HTTP_HOST_HASH: 'peac.http.host_hash',
  HTTP_CLIENT_HASH: 'peac.http.client_hash',

  // Payment (balanced/custom mode only)
  PAYMENT_RAIL: 'peac.payment.rail',
  PAYMENT_AMOUNT: 'peac.payment.amount',
  PAYMENT_CURRENCY: 'peac.payment.currency',

  // Duration
  DURATION_MS: 'peac.duration_ms',
} as const;

/**
 * PEAC event names
 */
export const PEAC_EVENTS = {
  RECEIPT_ISSUED: 'peac.receipt.issued',
  RECEIPT_VERIFIED: 'peac.receipt.verified',
  ACCESS_DECISION: 'peac.access.decision',
} as const;

/**
 * PEAC metric names
 */
export const PEAC_METRICS = {
  // Counters
  RECEIPTS_ISSUED: 'peac.receipts.issued',
  RECEIPTS_VERIFIED: 'peac.receipts.verified',
  ACCESS_DECISIONS: 'peac.access.decisions',

  // Histograms
  ISSUE_DURATION: 'peac.issue.duration',
  VERIFY_DURATION: 'peac.verify.duration',
} as const;

/**
 * Extension keys for trace context binding
 *
 * Uses w3c/ namespace for vendor neutrality.
 * W3C owns the Trace Context spec; OTel implements it.
 */
export const TRACE_CONTEXT_EXTENSIONS = {
  TRACEPARENT: 'w3c/traceparent',
  TRACESTATE: 'w3c/tracestate',
} as const;
