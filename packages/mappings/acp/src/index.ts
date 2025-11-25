/**
 * Agentic Commerce Protocol (ACP) integration
 * Maps ACP checkout events to PEAC receipts
 */

import type { PaymentEvidence } from '@peac/schema';

/**
 * ACP Checkout Success Event
 */
export interface ACPCheckoutSuccess {
  checkout_id: string;
  resource_uri: string;
  total_amount: number;
  currency: string;
  payment_rail: string;
  payment_reference: string;
  customer_id?: string;
  metadata?: Record<string, unknown>;
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
 * Convert ACP checkout success event to PEAC receipt input
 *
 * @param event - ACP checkout success event
 * @returns PEAC receipt input ready for issue()
 */
export function fromACPCheckoutSuccess(event: ACPCheckoutSuccess): PEACReceiptInput {
  // Validate ACP event
  if (!event.checkout_id) {
    throw new Error('ACP checkout event missing checkout_id');
  }
  if (!event.resource_uri || !event.resource_uri.startsWith('https://')) {
    throw new Error('ACP checkout event missing or invalid resource_uri (must be https://)');
  }
  if (typeof event.total_amount !== 'number' || event.total_amount < 0) {
    throw new Error('ACP checkout event invalid total_amount');
  }
  if (!event.currency || !/^[A-Z]{3}$/.test(event.currency)) {
    throw new Error('ACP checkout event invalid currency (must be uppercase ISO 4217)');
  }
  if (!event.payment_rail) {
    throw new Error('ACP checkout event missing payment_rail');
  }
  if (!event.payment_reference) {
    throw new Error('ACP checkout event missing payment_reference');
  }

  // Build payment evidence from ACP event
  const evidence: Record<string, unknown> = {};

  // Include ACP metadata in evidence
  if (event.metadata) {
    evidence.acp_metadata = event.metadata;
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
    amount: event.total_amount,
    currency: event.currency,
    asset: event.currency, // For ACP, asset is typically same as currency
    env: 'live', // Default to live; ACP events should indicate if test
    evidence,
  };

  return {
    subject_uri: event.resource_uri,
    amt: event.total_amount,
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
