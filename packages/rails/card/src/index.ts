/**
 * Card Payment Rail Adapter
 *
 * Maps card-based billing events (Flowglad, Stripe Billing, Lago)
 * to PEAC PaymentEvidence with billing_snapshot.
 *
 * Rail ID format: card.<processor>.<provider>
 * Examples:
 * - card.stripe.flowglad
 * - card.stripe.direct
 * - card.lago
 *
 * The billing_snapshot is evidentiary only. The billing system
 * remains the source of truth for balances.
 */

// Types
export type {
  CardBillingProvider,
  Entitlement,
  BillingSnapshot,
  CardBillingEvent,
  FlowgladChargeEvent,
  StripeInvoicePaidEvent,
  LagoInvoiceEvent,
  ParseResult,
  CardRailId,
} from './types.js';

// Parsers
export { parseFlowgladEvent, parseStripeInvoicePaid, parseLagoInvoice } from './parsers.js';

// Adapter
export { buildCardRailId, toPaymentEvidence, validateBillingSnapshot } from './adapter.js';
