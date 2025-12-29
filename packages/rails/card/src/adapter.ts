/**
 * Card rail adapter
 *
 * Converts card billing events to PEAC PaymentEvidence.
 */

import type { PaymentEvidence } from '@peac/schema';
import type { CardBillingEvent, BillingSnapshot, CardRailId } from './types.js';

/**
 * Build card rail identifier
 *
 * Format: card.<processor>.<provider>
 * Examples:
 * - card.stripe.flowglad (Flowglad uses Stripe as processor)
 * - card.stripe.direct (direct Stripe Billing)
 * - card.lago (Lago can use various processors)
 */
export function buildCardRailId(
  provider: BillingSnapshot['provider'],
  processor?: string
): CardRailId {
  if (processor) {
    return `card.${processor}.${provider}`;
  }

  // Default processors by provider
  switch (provider) {
    case 'flowglad':
      return 'card.stripe.flowglad';
    case 'stripe':
      return 'card.stripe.direct';
    case 'lago':
      return 'card.lago';
    default:
      return `card.${provider}`;
  }
}

/**
 * Convert card billing event to PEAC PaymentEvidence
 */
export function toPaymentEvidence(event: CardBillingEvent, processor?: string): PaymentEvidence {
  const railId = buildCardRailId(event.billingSnapshot.provider, processor);

  return {
    rail: railId,
    reference: event.eventId,
    amount: event.amountMinorUnits,
    currency: event.currency,
    asset: event.currency, // For card payments, asset is the currency
    env: event.env,
    evidence: {
      billing_snapshot: {
        provider: event.billingSnapshot.provider,
        customer_external_id: event.billingSnapshot.customerExternalId,
        plan_slug: event.billingSnapshot.planSlug,
        entitlements: event.billingSnapshot.entitlements.map((e) => ({
          feature: e.feature,
          limit: e.limit,
          meter_id: e.meterId,
        })),
        captured_at: event.billingSnapshot.capturedAt,
        subscription_id: event.billingSnapshot.subscriptionId,
        invoice_id: event.billingSnapshot.invoiceId,
      },
    },
  };
}

/**
 * Validate billing snapshot has required fields
 */
export function validateBillingSnapshot(snapshot: BillingSnapshot): string[] {
  const errors: string[] = [];

  if (!snapshot.provider) {
    errors.push('provider is required');
  }

  if (!snapshot.customerExternalId) {
    errors.push('customerExternalId is required');
  }

  if (!snapshot.planSlug) {
    errors.push('planSlug is required');
  }

  if (!snapshot.capturedAt) {
    errors.push('capturedAt is required');
  }

  if (!Array.isArray(snapshot.entitlements)) {
    errors.push('entitlements must be an array');
  }

  return errors;
}
