/**
 * Billing event parsers for card rails
 *
 * Parse provider-specific events into unified CardBillingEvent format.
 */

import type {
  CardBillingEvent,
  FlowgladChargeEvent,
  StripeInvoicePaidEvent,
  LagoInvoiceEvent,
  BillingSnapshot,
  Entitlement,
  ParseResult,
} from './types.js';

/**
 * Parse Flowglad charge event
 */
export function parseFlowgladEvent(event: FlowgladChargeEvent): ParseResult<CardBillingEvent> {
  if (!event.id || event.type !== 'charge.succeeded') {
    return { ok: false, error: 'Invalid Flowglad event type', code: 'UNKNOWN_EVENT' };
  }

  const data = event.data;
  if (!data.chargeId || !data.customerId || !data.planId) {
    return { ok: false, error: 'Missing required fields in Flowglad event', code: 'MISSING_FIELD' };
  }

  if (typeof data.amount !== 'number' || data.amount < 0) {
    return { ok: false, error: 'Invalid amount in Flowglad event', code: 'INVALID_FORMAT' };
  }

  const entitlements: Entitlement[] = (data.features || []).map((f) => ({
    feature: f.name,
    limit: f.limit ?? null,
  }));

  const billingSnapshot: BillingSnapshot = {
    provider: 'flowglad',
    customerExternalId: data.customerId,
    planSlug: data.planId,
    entitlements,
    capturedAt: new Date().toISOString(),
    subscriptionId: data.subscriptionId,
    invoiceId: data.invoiceId,
  };

  return {
    ok: true,
    value: {
      eventId: event.id,
      eventType: event.type,
      payload: event,
      billingSnapshot,
      amountMinorUnits: data.amount,
      currency: data.currency.toUpperCase(),
      env: data.livemode ? 'live' : 'test',
    },
  };
}

/**
 * Parse Stripe invoice.paid event
 */
export function parseStripeInvoicePaid(
  event: StripeInvoicePaidEvent
): ParseResult<CardBillingEvent> {
  if (!event.id || event.type !== 'invoice.paid') {
    return { ok: false, error: 'Invalid Stripe event type', code: 'UNKNOWN_EVENT' };
  }

  const invoice = event.data.object;
  if (!invoice.id || !invoice.customer) {
    return { ok: false, error: 'Missing required fields in Stripe event', code: 'MISSING_FIELD' };
  }

  if (typeof invoice.amount_paid !== 'number' || invoice.amount_paid < 0) {
    return { ok: false, error: 'Invalid amount in Stripe event', code: 'INVALID_FORMAT' };
  }

  // Extract product IDs as entitlements
  const entitlements: Entitlement[] = (invoice.lines?.data || [])
    .filter((line) => line.price?.product)
    .map((line) => ({
      feature: String(line.price!.product),
    }));

  const billingSnapshot: BillingSnapshot = {
    provider: 'stripe',
    customerExternalId: invoice.customer,
    planSlug: entitlements[0]?.feature || 'unknown',
    entitlements,
    capturedAt: new Date().toISOString(),
    subscriptionId: invoice.subscription,
    invoiceId: invoice.id,
  };

  return {
    ok: true,
    value: {
      eventId: event.id,
      eventType: event.type,
      payload: event,
      billingSnapshot,
      amountMinorUnits: invoice.amount_paid,
      currency: invoice.currency.toUpperCase(),
      env: event.livemode ? 'live' : 'test',
    },
  };
}

/**
 * Parse Lago invoice event
 */
export function parseLagoInvoice(event: LagoInvoiceEvent): ParseResult<CardBillingEvent> {
  if (event.webhook_type !== 'invoice.payment_status_updated') {
    return { ok: false, error: 'Invalid Lago event type', code: 'UNKNOWN_EVENT' };
  }

  const invoice = event.invoice;
  if (!invoice.lago_id || !invoice.external_customer_id) {
    return { ok: false, error: 'Missing required fields in Lago event', code: 'MISSING_FIELD' };
  }

  if (invoice.status !== 'succeeded') {
    return { ok: false, error: 'Invoice not succeeded', code: 'UNKNOWN_EVENT' };
  }

  if (typeof invoice.amount_cents !== 'number' || invoice.amount_cents < 0) {
    return { ok: false, error: 'Invalid amount in Lago event', code: 'INVALID_FORMAT' };
  }

  // Extract charges as entitlements
  const entitlements: Entitlement[] = (invoice.charges || []).map((c) => ({
    feature: c.billable_metric_code,
    limit: c.units ?? null,
  }));

  const billingSnapshot: BillingSnapshot = {
    provider: 'lago',
    customerExternalId: invoice.external_customer_id,
    planSlug: invoice.plan_code,
    entitlements,
    capturedAt: new Date().toISOString(),
    subscriptionId: invoice.subscription_id,
    invoiceId: invoice.lago_id,
  };

  return {
    ok: true,
    value: {
      eventId: invoice.lago_id,
      eventType: 'invoice.payment_status_updated',
      payload: event,
      billingSnapshot,
      amountMinorUnits: invoice.amount_cents,
      currency: invoice.currency.toUpperCase(),
      env: 'live', // Lago doesn't have livemode in event
    },
  };
}
