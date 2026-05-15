/**
 * @peac/mappings-acp
 *
 * Agentic Commerce Protocol (ACP) integration for PEAC.
 * Maps ACP checkout events to PEAC receipts and carries evidence via HTTP headers.
 */

import type { JsonObject } from '@peac/kernel';
import { isValidAmountMinor, type PaymentEvidence } from '@peac/schema';
import { assertExplicitFinality, type StrictnessMode } from '@peac/adapter-core';
import { isValidHttpsResourceUri } from './validation.js';

export * from './budget';

// Evidence Carrier Contract (v0.11.1+ )
export type { HeaderMap, AcpMessageLike, AcpExtractResult, AcpExtractAsyncResult } from './carrier';

export {
  ACP_CARRIER_LIMITS,
  attachCarrierToACPHeaders,
  attachCarrierToACPMessage,
  extractCarrierFromACPHeaders,
  extractCarrierFromACPHeadersAsync,
  AcpCarrierAdapter,
} from './carrier';

/**
 * ACP Checkout Success Event.
 *
 * Carrier-shape input for an ACP checkout-success observation. The amount is
 * a base-10 integer string in the smallest currency unit (e.g. "9999" for
 * $99.99) to preserve precision above Number.MAX_SAFE_INTEGER. The
 * environment is asserted by upstream and never silently defaulted.
 */
export interface ACPCheckoutSuccess {
  checkout_id: string;
  resource_uri: string;
  /**
   * Amount in smallest currency unit as a base-10 integer string.
   * Validated against the shared AmountMinorStringSchema and must be
   * non-negative. Decimals, empty strings, and numeric values are rejected.
   */
  amount_minor: string;
  currency: string;
  payment_rail: string;
  payment_reference: string;
  /** Environment as asserted by upstream. Required: no silent default. */
  env: 'live' | 'test';
  customer_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Optional knobs for fromACPCheckoutSuccess. Mode controls the
 * mapper-boundary finality-synthesis guard (default `interop`).
 */
export interface ACPCheckoutSuccessOptions {
  mode?: StrictnessMode;
  warn?: (message: string) => void;
}

/**
 * Stable error codes emitted by ACP mapper validation. Callers MAY switch
 * on `code` to discriminate without parsing message text. Distinct from
 * `@peac/adapter-core` MapperBoundaryError codes (which carry the finality-
 * synthesis code only); kept local to avoid widening the adapter-core enum
 * for ACP-specific validation concerns.
 */
export type ACPMapperBoundaryErrorCode =
  | 'acp.checkout_invalid_event'
  | 'acp.checkout_missing_checkout_id'
  | 'acp.checkout_invalid_resource_uri'
  | 'acp.checkout_legacy_total_amount'
  | 'acp.checkout_invalid_amount_minor'
  | 'acp.checkout_unsafe_amount_minor'
  | 'acp.checkout_invalid_currency'
  | 'acp.checkout_missing_payment_rail'
  | 'acp.checkout_missing_payment_reference'
  | 'acp.checkout_missing_env'
  | 'acp.checkout_invalid_env';

export interface ACPMapperBoundaryErrorInit {
  code: ACPMapperBoundaryErrorCode;
  field: string;
  message: string;
}

/**
 * Structured validation error thrown by ACP mapper input checks. Carries a
 * stable `code` and `field` so callers can discriminate programmatically.
 */
export class ACPMapperBoundaryError extends Error {
  readonly code: ACPMapperBoundaryErrorCode;
  readonly field: string;
  constructor(init: ACPMapperBoundaryErrorInit) {
    super(init.message);
    this.name = 'ACPMapperBoundaryError';
    this.code = init.code;
    this.field = init.field;
  }
}

/**
 * PEAC Receipt Input (for issue())
 */
export interface PEACReceiptInput {
  subject_uri: string;
  amt: number;
  cur: string;
  payment: PaymentEvidence;
}

/**
 * Convert ACP checkout success event to PEAC receipt input.
 *
 * Observational mapping only. fromACPCheckoutSuccess does NOT synthesize
 * commerce finality: a checkout-success observation alone does not prove
 * authorization, capture, settlement, refund, void, or chargeback. The
 * mapper records checkout/payment evidence only; no `commerce_event`,
 * `settlement_state`, `capture_state`, or `authorization_state` is emitted.
 * Callers that have an explicit payment-bearing artifact should route
 * through fromACPDelegatedPaymentObservation or fromACPPaymentObservation
 * instead.
 *
 * Validation errors are thrown as ACPMapperBoundaryError with stable
 * `code` and `field` so callers can discriminate programmatically.
 *
 * @param event - ACP checkout success event
 * @param options - Optional strictness mode + warn sink
 * @returns PEAC receipt input ready for issue()
 */
export function fromACPCheckoutSuccess(
  event: ACPCheckoutSuccess,
  options: ACPCheckoutSuccessOptions = {}
): PEACReceiptInput {
  if (event === null || typeof event !== 'object') {
    throw new ACPMapperBoundaryError({
      code: 'acp.checkout_invalid_event',
      field: 'event',
      message: 'ACP checkout event must be an object',
    });
  }
  if (!event.checkout_id) {
    throw new ACPMapperBoundaryError({
      code: 'acp.checkout_missing_checkout_id',
      field: 'checkout_id',
      message: 'ACP checkout event missing checkout_id',
    });
  }
  if (!isValidHttpsResourceUri(event.resource_uri)) {
    throw new ACPMapperBoundaryError({
      code: 'acp.checkout_invalid_resource_uri',
      field: 'resource_uri',
      message:
        'ACP checkout event missing or invalid resource_uri (must be an https:// URL with a hostname and no embedded credentials)',
    });
  }
  // Reject legacy numeric total_amount with a clear migration message.
  const legacy = (event as unknown as { total_amount?: unknown }).total_amount;
  if (legacy !== undefined) {
    throw new ACPMapperBoundaryError({
      code: 'acp.checkout_legacy_total_amount',
      field: 'total_amount',
      message:
        'ACP checkout event uses legacy total_amount: number; pass amount_minor as a base-10 integer string instead (e.g. "9999")',
    });
  }
  if (!isValidAmountMinor(event.amount_minor)) {
    throw new ACPMapperBoundaryError({
      code: 'acp.checkout_invalid_amount_minor',
      field: 'amount_minor',
      message:
        'ACP checkout event invalid amount_minor (must be a base-10 integer string, e.g. "9999")',
    });
  }
  if (event.amount_minor.startsWith('-')) {
    throw new ACPMapperBoundaryError({
      code: 'acp.checkout_invalid_amount_minor',
      field: 'amount_minor',
      message: 'ACP checkout event invalid amount_minor (must be non-negative)',
    });
  }
  if (!event.currency || !/^[A-Z]{3}$/.test(event.currency)) {
    throw new ACPMapperBoundaryError({
      code: 'acp.checkout_invalid_currency',
      field: 'currency',
      message: 'ACP checkout event invalid currency (must be uppercase ISO 4217)',
    });
  }
  if (!event.payment_rail) {
    throw new ACPMapperBoundaryError({
      code: 'acp.checkout_missing_payment_rail',
      field: 'payment_rail',
      message: 'ACP checkout event missing payment_rail',
    });
  }
  if (!event.payment_reference) {
    throw new ACPMapperBoundaryError({
      code: 'acp.checkout_missing_payment_reference',
      field: 'payment_reference',
      message: 'ACP checkout event missing payment_reference',
    });
  }
  if (event.env === undefined || event.env === null) {
    throw new ACPMapperBoundaryError({
      code: 'acp.checkout_missing_env',
      field: 'env',
      message: "ACP checkout event missing env (must be 'live' or 'test')",
    });
  }
  if (event.env !== 'live' && event.env !== 'test') {
    throw new ACPMapperBoundaryError({
      code: 'acp.checkout_invalid_env',
      field: 'env',
      message: "ACP checkout event invalid env (must be 'live' or 'test')",
    });
  }

  // Safe-integer boundary for amount_minor -> Number conversion.
  //
  // PaymentEvidence.amount and PEACReceiptInput.amt carry the amount as a
  // JS `number`. AmountMinorStringSchema accepts up to 39 digits, so we
  // MUST refuse anything beyond Number.MAX_SAFE_INTEGER to avoid silently
  // losing precision on the way back to a number. Use a string-preserving
  // record profile for amounts beyond the safe-integer range, NOT this
  // checkout-success mapper.
  const amountMinorBig = BigInt(event.amount_minor);
  if (amountMinorBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ACPMapperBoundaryError({
      code: 'acp.checkout_unsafe_amount_minor',
      field: 'amount_minor',
      message: `ACP checkout event amount_minor exceeds Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER}); the legacy PEAC receipt input carries amount as a JS number and would lose precision. Use a string-preserving record profile for amounts beyond the safe-integer range.`,
    });
  }
  const amountMinor = Number(amountMinorBig);

  // Mapper-boundary finality-synthesis guard.
  //
  // fromACPCheckoutSuccess does NOT synthesize commerce finality. event is
  // intentionally undefined here so Rule 1 (the finality-synthesis check)
  // is a no-op: a checkout-success observation alone does not claim
  // authorization, capture, settlement, refund, void, or chargeback. The
  // guard call is retained to enforce Rules 2 and 3 (currency MUST be
  // upstream-asserted, env MUST be explicit). A caller with a finality-
  // bearing event must use a finality-aware mapper.
  assertExplicitFinality(
    {
      event: undefined,
      hasExplicitUpstreamArtifact: false,
      currency: event.currency,
      env: event.env,
      envExplicit: true,
    },
    {
      mode: options.mode,
      warn: options.warn,
      pointer: '/proofs/acp/checkout',
    }
  );

  const evidence: JsonObject = {};
  if (event.metadata) {
    evidence.acp_metadata = event.metadata as JsonObject;
  }
  if (event.customer_id) {
    evidence.customer_id = event.customer_id;
  }
  if (event.checkout_id) {
    evidence.checkout_id = event.checkout_id;
  }

  const payment: PaymentEvidence = {
    rail: event.payment_rail,
    reference: event.payment_reference,
    amount: amountMinor,
    currency: event.currency,
    asset: event.currency,
    env: event.env,
    evidence,
  };

  return {
    subject_uri: event.resource_uri,
    amt: amountMinor,
    cur: event.currency,
    payment,
  };
}

/**
 * Attach PEAC receipt to ACP response
 *
 * @param response - ACP response object
 * @param receiptJWS - PEAC receipt JWS
 * @returns ACP response with PEAC receipt attached
 */
export function attachReceiptToACPResponse<T extends Record<string, unknown>>(
  response: T,
  receiptJWS: string
): T & { peac_receipt: string } {
  return {
    ...response,
    peac_receipt: receiptJWS,
  };
}

/**
 * Extract PEAC receipt from ACP response
 *
 * @param response - ACP response object
 * @returns PEAC receipt JWS or null if not present
 */
export function extractReceiptFromACPResponse(response: Record<string, unknown>): string | null {
  if (typeof response.peac_receipt === 'string') {
    return response.peac_receipt;
  }
  return null;
}

// Session lifecycle evidence (DD-188, v0.12.4+)
export type {
  ACPSessionState,
  ACPSessionEvent,
  ObservedPaymentState,
  ACPPaymentArtifact,
  ACPCapabilityNegotiation,
  ACPIntervention,
  SessionReceiptInput,
} from './session.js';

export {
  fromACPSessionLifecycleEvent,
  fromACPPaymentObservation,
  fromACPCapabilitySnapshot,
  fromACPInterventionRequired,
} from './session.js';

// Delegated payment observation (v0.12.11)
export type {
  DelegatedPaymentState,
  ACPDelegatedPaymentObservation,
  ACPDelegatedPaymentOptions,
} from './session.js';

export { fromACPDelegatedPaymentObservation } from './session.js';
