/**
 * x402 payment rail adapter
 * Normalizes x402 invoices/settlements to PEAC PaymentEvidence
 */

import { PaymentEvidence } from "@peac/schema";

/**
 * x402 Invoice (simplified)
 */
export interface X402Invoice {
  id: string;
  amount: number;
  currency: string;
  session_id?: string;
  invoice_url?: string;
  memo?: string;
  metadata?: Record<string, unknown>;
}

/**
 * x402 Settlement (simplified)
 */
export interface X402Settlement {
  id: string;
  invoice_id: string;
  amount: number;
  currency: string;
  settled_at?: string;
  metadata?: Record<string, unknown>;
}

/**
 * x402 Webhook event payload
 */
export interface X402WebhookEvent {
  type: string;
  data: {
    object: X402Invoice | X402Settlement;
  };
}

/**
 * Normalize x402 invoice to PEAC PaymentEvidence
 */
export function fromInvoice(invoice: X402Invoice, env: "live" | "test" = "live"): PaymentEvidence {
  // Validate required fields
  if (!invoice.id) {
    throw new Error("x402 invoice missing id");
  }
  if (typeof invoice.amount !== "number" || invoice.amount < 0) {
    throw new Error("x402 invoice invalid amount");
  }
  if (!invoice.currency || !/^[A-Z]{3}$/.test(invoice.currency)) {
    throw new Error("x402 invoice invalid currency (must be uppercase ISO 4217)");
  }

  // Build evidence object with x402-specific data
  const evidence: Record<string, unknown> = {
    invoice_id: invoice.id,
  };

  if (invoice.session_id) {
    evidence.session_id = invoice.session_id;
  }

  if (invoice.invoice_url) {
    evidence.invoice_url = invoice.invoice_url;
  }

  if (invoice.memo) {
    evidence.memo = invoice.memo;
  }

  // Include user metadata if present
  if (invoice.metadata) {
    evidence.metadata = invoice.metadata;
  }

  return {
    rail: "x402",
    reference: invoice.id,
    amount: invoice.amount,
    currency: invoice.currency, // Already uppercase per x402 spec
    asset: invoice.currency, // For x402, asset is typically same as currency
    env,
    network: "lightning", // x402 uses Lightning Network
    evidence,
  };
}

/**
 * Normalize x402 settlement to PEAC PaymentEvidence
 */
export function fromSettlement(settlement: X402Settlement, env: "live" | "test" = "live"): PaymentEvidence {
  // Validate required fields
  if (!settlement.id) {
    throw new Error("x402 settlement missing id");
  }
  if (!settlement.invoice_id) {
    throw new Error("x402 settlement missing invoice_id");
  }
  if (typeof settlement.amount !== "number" || settlement.amount < 0) {
    throw new Error("x402 settlement invalid amount");
  }
  if (!settlement.currency || !/^[A-Z]{3}$/.test(settlement.currency)) {
    throw new Error("x402 settlement invalid currency (must be uppercase ISO 4217)");
  }

  // Build evidence object with x402-specific settlement data
  const evidence: Record<string, unknown> = {
    settlement_id: settlement.id,
    invoice_id: settlement.invoice_id,
  };

  if (settlement.settled_at) {
    evidence.settled_at = settlement.settled_at;
  }

  // Include user metadata if present
  if (settlement.metadata) {
    evidence.metadata = settlement.metadata;
  }

  return {
    rail: "x402",
    reference: settlement.invoice_id, // Use invoice_id as reference
    amount: settlement.amount,
    currency: settlement.currency,
    asset: settlement.currency, // For x402, asset is typically same as currency
    env,
    network: "lightning", // x402 uses Lightning Network
    evidence,
  };
}

/**
 * Normalize x402 webhook event to PEAC PaymentEvidence
 *
 * Supports:
 * - invoice.paid
 * - settlement.completed
 */
export function fromWebhookEvent(event: X402WebhookEvent, env: "live" | "test" = "live"): PaymentEvidence {
  const obj = event.data.object;

  // Determine object type by presence of fields
  if ("invoice_id" in obj && "settled_at" in obj) {
    // Settlement
    return fromSettlement(obj as X402Settlement, env);
  } else if ("amount" in obj) {
    // Invoice
    return fromInvoice(obj as X402Invoice, env);
  }

  throw new Error(`Unsupported x402 webhook event type: ${event.type}`);
}
