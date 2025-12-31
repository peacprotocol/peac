/**
 * OpenTelemetry adapter for PEAC telemetry
 *
 * Creates a TelemetryProvider that bridges PEAC events to OpenTelemetry
 * spans, events, and metrics.
 */

import { trace, metrics, type Span, type Attributes } from '@opentelemetry/api';
import type {
  TelemetryProvider,
  TelemetryConfig,
  ReceiptIssuedInput,
  ReceiptVerifiedInput,
  AccessDecisionInput,
} from '@peac/telemetry';
import { PEAC_ATTRS, PEAC_EVENTS } from '@peac/telemetry';
import { hashIssuer, hashKid } from './privacy.js';
import {
  createMetrics,
  recordReceiptIssued,
  recordReceiptVerified,
  recordAccessDecision,
  type PeacMetrics,
} from './metrics.js';

/**
 * OTel provider options
 */
export interface OtelProviderOptions extends TelemetryConfig {
  /**
   * Tracer name (defaults to @peac/telemetry-otel)
   */
  tracerName?: string;

  /**
   * Meter name (defaults to @peac/telemetry-otel)
   */
  meterName?: string;

  /**
   * Version for tracer/meter (defaults to 0.9.22)
   */
  version?: string;
}

/**
 * PEAC telemetry version
 */
const TELEMETRY_VERSION = '0.9.22';

/**
 * Default tracer/meter name
 */
const DEFAULT_INSTRUMENTATION_NAME = '@peac/telemetry-otel';

/**
 * Create an OpenTelemetry-backed telemetry provider
 *
 * This provider:
 * - Emits span events when an active span exists
 * - Always emits metrics (counters, histograms)
 * - Applies privacy mode filtering
 * - Never throws (errors are swallowed silently)
 *
 * @param options - Provider configuration
 * @returns TelemetryProvider implementation
 */
export function createOtelProvider(options: OtelProviderOptions): TelemetryProvider {
  const tracerName = options.tracerName ?? DEFAULT_INSTRUMENTATION_NAME;
  const meterName = options.meterName ?? DEFAULT_INSTRUMENTATION_NAME;
  const version = options.version ?? TELEMETRY_VERSION;
  const privacyMode = options.privacyMode ?? 'strict';
  const salt = options.hashSalt ?? 'peac-telemetry';

  // Get tracer and meter
  const tracer = trace.getTracer(tracerName, version);
  const meter = metrics.getMeter(meterName, version);

  // Create baseline metrics
  const peacMetrics = createMetrics(meter);

  return {
    onReceiptIssued(input: ReceiptIssuedInput): void {
      try {
        // Always record metrics
        const hashedIssuer = hashIssuer(input.issuer, salt);
        recordReceiptIssued(peacMetrics, hashedIssuer, input.durationMs);

        // Add span event if active span exists
        const span = trace.getActiveSpan();
        if (span) {
          const attrs = buildReceiptIssuedAttributes(input, privacyMode, salt);
          span.addEvent(PEAC_EVENTS.RECEIPT_ISSUED, attrs);
        }
      } catch {
        // Telemetry MUST NOT break core flow - swallow silently
      }
    },

    onReceiptVerified(input: ReceiptVerifiedInput): void {
      try {
        // Always record metrics
        recordReceiptVerified(peacMetrics, input.valid, input.reasonCode, input.durationMs);

        // Add span event if active span exists
        const span = trace.getActiveSpan();
        if (span) {
          const attrs = buildReceiptVerifiedAttributes(input, privacyMode, salt);
          span.addEvent(PEAC_EVENTS.RECEIPT_VERIFIED, attrs);
        }
      } catch {
        // Telemetry MUST NOT break core flow - swallow silently
      }
    },

    onAccessDecision(input: AccessDecisionInput): void {
      try {
        // Always record metrics
        recordAccessDecision(peacMetrics, input.decision, input.reasonCode);

        // Add span event if active span exists
        const span = trace.getActiveSpan();
        if (span) {
          const attrs = buildAccessDecisionAttributes(input, privacyMode, salt);
          span.addEvent(PEAC_EVENTS.ACCESS_DECISION, attrs);
        }
      } catch {
        // Telemetry MUST NOT break core flow - swallow silently
      }
    },
  };
}

/**
 * Build attributes for receipt issued event
 */
function buildReceiptIssuedAttributes(
  input: ReceiptIssuedInput,
  privacyMode: 'strict' | 'balanced' | 'custom',
  salt: string
): Attributes {
  const attrs: Attributes = {
    [PEAC_ATTRS.VERSION]: TELEMETRY_VERSION,
    [PEAC_ATTRS.RECEIPT_HASH]: input.receiptHash,
  };

  if (input.policyHash) {
    attrs[PEAC_ATTRS.POLICY_HASH] = input.policyHash;
  }

  // Hash issuer based on privacy mode
  if (input.issuer) {
    if (privacyMode === 'strict') {
      attrs[PEAC_ATTRS.ISSUER_HASH] = hashIssuer(input.issuer, salt);
    } else {
      attrs[PEAC_ATTRS.ISSUER] = input.issuer;
    }
  }

  // Hash kid based on privacy mode
  if (input.kid) {
    if (privacyMode === 'strict') {
      attrs['peac.kid_hash'] = hashKid(input.kid, salt);
    } else {
      attrs[PEAC_ATTRS.KID] = input.kid;
    }
  }

  // HTTP attributes
  if (input.http) {
    if (input.http.method) {
      attrs[PEAC_ATTRS.HTTP_METHOD] = input.http.method;
    }
    if (input.http.path) {
      attrs[PEAC_ATTRS.HTTP_PATH] = input.http.path;
    }
  }

  // Duration
  if (input.durationMs !== undefined) {
    attrs[PEAC_ATTRS.DURATION_MS] = input.durationMs;
  }

  return attrs;
}

/**
 * Build attributes for receipt verified event
 */
function buildReceiptVerifiedAttributes(
  input: ReceiptVerifiedInput,
  privacyMode: 'strict' | 'balanced' | 'custom',
  salt: string
): Attributes {
  const attrs: Attributes = {
    [PEAC_ATTRS.VERSION]: TELEMETRY_VERSION,
    [PEAC_ATTRS.RECEIPT_HASH]: input.receiptHash,
    [PEAC_ATTRS.VALID]: input.valid,
  };

  if (input.reasonCode) {
    attrs[PEAC_ATTRS.REASON_CODE] = input.reasonCode;
  }

  // Hash issuer based on privacy mode
  if (input.issuer) {
    if (privacyMode === 'strict') {
      attrs[PEAC_ATTRS.ISSUER_HASH] = hashIssuer(input.issuer, salt);
    } else {
      attrs[PEAC_ATTRS.ISSUER] = input.issuer;
    }
  }

  // Hash kid based on privacy mode
  if (input.kid) {
    if (privacyMode === 'strict') {
      attrs['peac.kid_hash'] = hashKid(input.kid, salt);
    } else {
      attrs[PEAC_ATTRS.KID] = input.kid;
    }
  }

  // HTTP attributes
  if (input.http) {
    if (input.http.method) {
      attrs[PEAC_ATTRS.HTTP_METHOD] = input.http.method;
    }
    if (input.http.path) {
      attrs[PEAC_ATTRS.HTTP_PATH] = input.http.path;
    }
  }

  // Duration
  if (input.durationMs !== undefined) {
    attrs[PEAC_ATTRS.DURATION_MS] = input.durationMs;
  }

  return attrs;
}

/**
 * Build attributes for access decision event
 */
function buildAccessDecisionAttributes(
  input: AccessDecisionInput,
  privacyMode: 'strict' | 'balanced' | 'custom',
  salt: string
): Attributes {
  const attrs: Attributes = {
    [PEAC_ATTRS.VERSION]: TELEMETRY_VERSION,
    [PEAC_ATTRS.DECISION]: input.decision,
  };

  if (input.receiptHash) {
    attrs[PEAC_ATTRS.RECEIPT_HASH] = input.receiptHash;
  }

  if (input.policyHash) {
    attrs[PEAC_ATTRS.POLICY_HASH] = input.policyHash;
  }

  if (input.reasonCode) {
    attrs[PEAC_ATTRS.REASON_CODE] = input.reasonCode;
  }

  // Payment attributes (balanced/custom mode only)
  if (input.payment && privacyMode !== 'strict') {
    if (input.payment.rail) {
      attrs[PEAC_ATTRS.PAYMENT_RAIL] = input.payment.rail;
    }
    if (input.payment.amount !== undefined) {
      attrs[PEAC_ATTRS.PAYMENT_AMOUNT] = input.payment.amount;
    }
    if (input.payment.currency) {
      attrs[PEAC_ATTRS.PAYMENT_CURRENCY] = input.payment.currency;
    }
  }

  // HTTP attributes
  if (input.http) {
    if (input.http.method) {
      attrs[PEAC_ATTRS.HTTP_METHOD] = input.http.method;
    }
    if (input.http.path) {
      attrs[PEAC_ATTRS.HTTP_PATH] = input.http.path;
    }
  }

  return attrs;
}

/**
 * Expose metrics for testing
 */
export function createMetricsForTesting(meter: import('@opentelemetry/api').Meter): PeacMetrics {
  return createMetrics(meter);
}
