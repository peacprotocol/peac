/**
 * Card payment rail types
 *
 * Supports billing events from:
 * - Flowglad (card billing platform)
 * - Stripe Billing (subscriptions)
 * - Lago (open-source billing)
 */

/**
 * Supported card billing providers
 */
export type CardBillingProvider = 'flowglad' | 'stripe' | 'lago';

/**
 * Entitlement granted by a subscription/plan
 */
export interface Entitlement {
  /** Feature ID or name */
  feature: string;
  /** Quantity or limit (null = unlimited) */
  limit?: number | null;
  /** Usage-based meter ID if applicable */
  meterId?: string;
}

/**
 * Billing snapshot at time of charge
 *
 * Evidentiary data about the billing state when payment was captured.
 * The billing system remains the source of truth for balances.
 */
export interface BillingSnapshot {
  /** Billing provider (flowglad, stripe, lago) */
  provider: CardBillingProvider;
  /** External customer ID in your system */
  customerExternalId: string;
  /** Plan or product slug */
  planSlug: string;
  /** Entitlements active at capture time */
  entitlements: Entitlement[];
  /** ISO 8601 timestamp when payment was captured */
  capturedAt: string;
  /** Optional subscription ID */
  subscriptionId?: string;
  /** Optional invoice ID */
  invoiceId?: string;
}

/**
 * Generic card billing event
 *
 * Unified interface for billing events from any supported provider.
 */
export interface CardBillingEvent {
  /** Event ID (unique) */
  eventId: string;
  /** Event type (e.g., "invoice.paid", "subscription.charged") */
  eventType: string;
  /** Provider-specific event object */
  payload: unknown;
  /** Billing snapshot at time of charge */
  billingSnapshot: BillingSnapshot;
  /** Amount in minor units (cents, paise, etc.) */
  amountMinorUnits: number;
  /** Currency code (ISO 4217, uppercase) */
  currency: string;
  /** Environment */
  env: 'live' | 'test';
}

/**
 * Flowglad-specific event
 */
export interface FlowgladChargeEvent {
  id: string;
  type: 'charge.succeeded';
  data: {
    chargeId: string;
    amount: number;
    currency: string;
    customerId: string;
    subscriptionId?: string;
    invoiceId?: string;
    planId: string;
    features: Array<{
      name: string;
      limit?: number;
    }>;
    livemode: boolean;
  };
}

/**
 * Stripe Invoice Paid event (simplified)
 */
export interface StripeInvoicePaidEvent {
  id: string;
  type: 'invoice.paid';
  data: {
    object: {
      id: string;
      customer: string;
      subscription?: string;
      amount_paid: number;
      currency: string;
      lines: {
        data: Array<{
          price?: {
            product?: string;
          };
        }>;
      };
    };
  };
  livemode: boolean;
}

/**
 * Lago Invoice event (simplified)
 */
export interface LagoInvoiceEvent {
  webhook_type: 'invoice.payment_status_updated';
  invoice: {
    lago_id: string;
    external_customer_id: string;
    subscription_id?: string;
    amount_cents: number;
    currency: string;
    status: 'succeeded' | 'failed' | 'pending';
    plan_code: string;
    charges: Array<{
      billable_metric_code: string;
      units?: number;
    }>;
  };
}

/**
 * Result of parsing a card billing event
 */
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code: 'INVALID_FORMAT' | 'MISSING_FIELD' | 'UNKNOWN_EVENT' };

/**
 * Card rail identifier format: card.<processor>.<provider>
 * Examples:
 * - card.stripe.flowglad
 * - card.stripe.direct
 * - card.lago
 */
export type CardRailId = `card.${string}`;
