/**
 * x402 payment rail adapter
 *
 * Normalizes x402 invoices/settlements to PEAC PaymentEvidence.
 * Supports both v1 (legacy X-PAYMENT-* headers) and v2 (Payment-* headers).
 *
 * Default behavior is auto-detection with v1 fallback for backwards compatibility.
 */

import type { PaymentEvidence, PaymentSplit } from '@peac/schema';

// Re-export types and constants for consumers
export * from './constants';
export * from './types';
export * from './helpers';

import type { X402Dialect } from './constants';
import type { X402Invoice, X402Settlement, X402WebhookEvent, X402Evidence } from './types';
import {
  detectDialect,
  resolveDialectFromInvoice,
  normalizeNetworkId,
  getNetworkLabel,
} from './helpers';

/**
 * Build aggregator and splits from x402 invoice metadata
 *
 * Mapping rules:
 * - aggregator: Set when invoice has platform/aggregator in metadata
 *   - Pattern: "x402:{serviceName}" (e.g., "x402:load", "x402:tollbit")
 * - splits: Mapped from explicit split data, or single merchant split if aggregator known
 *   - If no split data and no aggregator -> undefined
 *
 * @param invoice - x402 invoice
 * @param resolvedDialect - Resolved dialect
 * @returns Object with optional aggregator and splits
 */
function buildAggregatorAndSplits(
  invoice: X402Invoice,
  resolvedDialect: 'v1' | 'v2'
): { aggregator?: string; splits?: PaymentSplit[] } {
  // Only attempt aggregator/splits for v2 (v1 has no such concept)
  if (resolvedDialect === 'v1') {
    return {};
  }

  let aggregator: string | undefined;
  let splits: PaymentSplit[] | undefined;

  // Detect aggregator from invoice metadata or known patterns
  const meta = invoice.metadata;
  if (meta?.aggregator && typeof meta.aggregator === 'string') {
    aggregator = `x402:${meta.aggregator}`;
  } else if (meta?.platform && typeof meta.platform === 'string') {
    aggregator = `x402:${meta.platform}`;
  }

  // Build splits if we have explicit split data
  if (meta?.splits && Array.isArray(meta.splits)) {
    const rawSplits = meta.splits as Array<Record<string, unknown>>;
    splits = rawSplits
      .map((s) => {
        const party = s.party as string | undefined;
        const amount = s.amount as number | undefined;
        const share = s.share as number | undefined;

        // Validate: party required, at least one of amount/share
        if (!party || (amount === undefined && share === undefined)) {
          return null;
        }

        const split: PaymentSplit = { party };
        if (amount !== undefined) split.amount = amount;
        if (share !== undefined) split.share = share;
        if (s.currency) split.currency = s.currency as string;
        if (s.rail) split.rail = s.rail as string;
        if (s.account_ref) split.account_ref = s.account_ref as string;

        return split;
      })
      .filter((s): s is PaymentSplit => s !== null);

    // If no valid splits after filtering, set to undefined
    if (splits.length === 0) {
      splits = undefined;
    }
  } else if (aggregator) {
    // Single split for merchant when aggregator is known but no explicit splits
    splits = [{ party: 'merchant', share: 1.0 }];
  }

  return { aggregator, splits };
}

/**
 * Map x402 payTo.mode to PaymentEvidence.routing
 *
 * @param payToMode - x402 payTo mode value
 * @returns Valid routing value or undefined
 */
function mapRouting(payToMode: string | undefined): 'direct' | 'callback' | 'role' | undefined {
  if (payToMode === 'direct' || payToMode === 'callback' || payToMode === 'role') {
    return payToMode;
  }
  return undefined;
}

/**
 * Normalize x402 invoice to PEAC PaymentEvidence
 *
 * Supports both v1 and v2 x402 formats. Default is auto-detection.
 *
 * @param invoice - x402 invoice object
 * @param env - Environment ('live' or 'test')
 * @param dialect - x402 dialect ('v1', 'v2', or 'auto')
 * @returns Normalized PaymentEvidence
 */
export function fromInvoice(
  invoice: X402Invoice,
  env: 'live' | 'test' = 'live',
  dialect: X402Dialect = 'auto'
): PaymentEvidence {
  // Validate required fields
  if (!invoice.id) {
    throw new Error('x402 invoice missing id');
  }
  if (typeof invoice.amount !== 'number' || invoice.amount < 0) {
    throw new Error('x402 invoice invalid amount');
  }
  if (!invoice.currency || !/^[A-Z]{3}$/.test(invoice.currency)) {
    throw new Error('x402 invoice invalid currency (must be uppercase ISO 4217)');
  }

  // Resolve dialect
  const resolvedDialect = resolveDialectFromInvoice(invoice, dialect);

  // Normalize network (canonical ID, not label)
  const network = normalizeNetworkId(invoice.network);

  // Build x402-specific evidence (namespaced, not top-level)
  const evidence: X402Evidence = {
    invoice_id: invoice.id,
    dialect: resolvedDialect,
  };

  // Add network label for human readability
  const networkLabel = getNetworkLabel(network);
  if (networkLabel) {
    evidence.network_label = networkLabel;
  }

  // Add optional fields
  if (invoice.session_id) {
    evidence.session_id = invoice.session_id;
  }
  if (invoice.invoice_url) {
    evidence.invoice_url = invoice.invoice_url;
  }
  if (invoice.memo) {
    evidence.memo = invoice.memo;
  }
  if (invoice.metadata) {
    evidence.metadata = invoice.metadata;
  }

  // v2: Add payTo if present
  if (invoice.payTo) {
    evidence.pay_to = invoice.payTo;
  }

  // Build aggregator and splits (v2 only)
  const { aggregator, splits } = buildAggregatorAndSplits(invoice, resolvedDialect);

  // Map routing from payTo.mode
  const routing = mapRouting(invoice.payTo?.mode);

  // Build PaymentEvidence
  const result: PaymentEvidence = {
    rail: 'x402',
    reference: invoice.id,
    amount: invoice.amount,
    currency: invoice.currency,
    asset: invoice.currency,
    env,
    network,
    evidence,
  };

  // Add optional top-level fields
  if (aggregator) {
    result.aggregator = aggregator;
  }
  if (splits) {
    result.splits = splits;
  }
  if (routing) {
    result.routing = routing;
  }

  return result;
}

/**
 * Normalize x402 settlement to PEAC PaymentEvidence
 *
 * @param settlement - x402 settlement object
 * @param env - Environment ('live' or 'test')
 * @param dialect - x402 dialect ('v1', 'v2', or 'auto')
 * @returns Normalized PaymentEvidence
 */
export function fromSettlement(
  settlement: X402Settlement,
  env: 'live' | 'test' = 'live',
  dialect: X402Dialect = 'auto'
): PaymentEvidence {
  // Validate required fields
  if (!settlement.id) {
    throw new Error('x402 settlement missing id');
  }
  if (!settlement.invoice_id) {
    throw new Error('x402 settlement missing invoice_id');
  }
  if (typeof settlement.amount !== 'number' || settlement.amount < 0) {
    throw new Error('x402 settlement invalid amount');
  }
  if (!settlement.currency || !/^[A-Z]{3}$/.test(settlement.currency)) {
    throw new Error('x402 settlement invalid currency (must be uppercase ISO 4217)');
  }

  // Resolve dialect (simplified for settlements - check network field)
  const resolvedDialect =
    dialect !== 'auto' ? dialect : settlement.network?.includes(':') ? 'v2' : 'v1';

  // Normalize network
  const network = normalizeNetworkId(settlement.network);

  // Build x402-specific evidence
  const evidence: X402Evidence = {
    invoice_id: settlement.invoice_id,
    settlement_id: settlement.id,
    dialect: resolvedDialect,
  };

  // Add network label
  const networkLabel = getNetworkLabel(network);
  if (networkLabel) {
    evidence.network_label = networkLabel;
  }

  // Add optional fields
  if (settlement.settled_at) {
    evidence.settled_at = settlement.settled_at;
  }
  if (settlement.metadata) {
    evidence.metadata = settlement.metadata;
  }

  return {
    rail: 'x402',
    reference: settlement.invoice_id,
    amount: settlement.amount,
    currency: settlement.currency,
    asset: settlement.currency,
    env,
    network,
    evidence,
  };
}

/**
 * Normalize x402 webhook event to PEAC PaymentEvidence
 *
 * Supports:
 * - invoice.paid
 * - settlement.completed
 *
 * Dialect is auto-detected from headers if provided.
 *
 * @param event - x402 webhook event
 * @param env - Environment ('live' or 'test')
 * @param headers - HTTP response headers (optional, for dialect detection)
 * @returns Normalized PaymentEvidence
 */
export function fromWebhookEvent(
  event: X402WebhookEvent,
  env: 'live' | 'test' = 'live',
  headers?: Record<string, string>
): PaymentEvidence {
  const obj = event.data.object;

  // Detect dialect from headers if provided
  const dialect: X402Dialect = headers ? detectDialect(headers) : 'auto';

  // Determine object type by presence of fields
  if ('invoice_id' in obj && ('settled_at' in obj || 'settlement_id' in (obj as X402Settlement))) {
    // Settlement
    return fromSettlement(obj as X402Settlement, env, dialect);
  } else if ('amount' in obj && 'id' in obj) {
    // Invoice
    return fromInvoice(obj as X402Invoice, env, dialect);
  }

  throw new Error(`Unsupported x402 webhook event type: ${event.type}`);
}
