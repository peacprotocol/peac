/**
 * Stripe payment rail adapter
 * Normalizes Stripe webhooks/checkout sessions to PEAC PaymentEvidence
 */

import { PaymentEvidence } from "@peac/schema";

/**
 * Stripe Checkout Session (simplified)
 */
export interface StripeCheckoutSession {
  id: string;
  amount_total: number;
  currency: string;
  payment_intent?: string;
  customer?: string;
  metadata?: Record<string, string>;
}

/**
 * Stripe Payment Intent (simplified)
 */
export interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  customer?: string;
  metadata?: Record<string, string>;
}

/**
 * Stripe webhook event payload
 */
export interface StripeWebhookEvent {
  type: string;
  data: {
    object: StripeCheckoutSession | StripePaymentIntent;
  };
}

/**
 * Normalize Stripe Checkout Session to PEAC PaymentEvidence
 */
export function fromCheckoutSession(session: StripeCheckoutSession, env: "live" | "test" = "live"): PaymentEvidence {
  // Validate required fields
  if (!session.id) {
    throw new Error("Stripe checkout session missing id");
  }
  if (typeof session.amount_total !== "number" || session.amount_total < 0) {
    throw new Error("Stripe checkout session invalid amount_total");
  }
  if (!session.currency || !/^[a-z]{3}$/.test(session.currency)) {
    throw new Error("Stripe checkout session invalid currency (must be lowercase ISO 4217)");
  }

  // Build evidence object with Stripe-specific data
  const evidence: Record<string, unknown> = {
    checkout_session_id: session.id,
  };

  if (session.payment_intent) {
    evidence.payment_intent_id = session.payment_intent;
  }

  if (session.customer) {
    evidence.customer_id = session.customer;
  }

  // Include user metadata if present
  if (session.metadata) {
    evidence.metadata = session.metadata;
  }

  return {
    rail: "stripe",
    reference: session.id,
    amount: session.amount_total,
    currency: session.currency.toUpperCase(), // PEAC requires uppercase
    asset: session.currency.toUpperCase(), // For Stripe, asset is typically same as currency
    env,
    evidence,
  };
}

/**
 * Normalize Stripe Payment Intent to PEAC PaymentEvidence
 */
export function fromPaymentIntent(intent: StripePaymentIntent, env: "live" | "test" = "live"): PaymentEvidence {
  // Validate required fields
  if (!intent.id) {
    throw new Error("Stripe payment intent missing id");
  }
  if (typeof intent.amount !== "number" || intent.amount < 0) {
    throw new Error("Stripe payment intent invalid amount");
  }
  if (!intent.currency || !/^[a-z]{3}$/.test(intent.currency)) {
    throw new Error("Stripe payment intent invalid currency (must be lowercase ISO 4217)");
  }

  // Build evidence object with Stripe-specific data
  const evidence: Record<string, unknown> = {
    payment_intent_id: intent.id,
  };

  if (intent.customer) {
    evidence.customer_id = intent.customer;
  }

  // Include user metadata if present
  if (intent.metadata) {
    evidence.metadata = intent.metadata;
  }

  return {
    rail: "stripe",
    reference: intent.id,
    amount: intent.amount,
    currency: intent.currency.toUpperCase(), // PEAC requires uppercase
    asset: intent.currency.toUpperCase(), // For Stripe, asset is typically same as currency
    env,
    evidence,
  };
}

/**
 * Normalize Stripe webhook event to PEAC PaymentEvidence
 *
 * Supports:
 * - checkout.session.completed
 * - payment_intent.succeeded
 */
export function fromWebhookEvent(event: StripeWebhookEvent, env: "live" | "test" = "live"): PaymentEvidence {
  const obj = event.data.object;

  // Determine object type by presence of fields
  if ("amount_total" in obj) {
    // Checkout session
    return fromCheckoutSession(obj as StripeCheckoutSession, env);
  } else if ("amount" in obj) {
    // Payment intent
    return fromPaymentIntent(obj as StripePaymentIntent, env);
  }

  throw new Error(`Unsupported Stripe webhook event type: ${event.type}`);
}
