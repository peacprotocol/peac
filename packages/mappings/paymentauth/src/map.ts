/**
 * Paymentauth evidence mapping.
 *
 * Maps normalized paymentauth artifacts to PEAC PaymentEvidence and
 * commerce extension fields. Only populates fields backed by actual
 * upstream data; never synthesizes missing information.
 *
 * receipt_ref is computed from the raw upstream artifact (the literal
 * header value received), NOT assumed to be a JWS envelope.
 */

import type { JsonObject } from '@peac/kernel';
import type { PaymentEvidence } from '@peac/schema';

import { PAYMENTAUTH_RAIL } from './constants.js';
import type { NormalizedPaymentauthReceipt, NormalizedPaymentauthChallenge } from './types.js';

/**
 * Map a paymentauth receipt (with optional challenge context) to PEAC PaymentEvidence.
 *
 * Only populates fields that the source artifacts actually provide.
 * Amount and currency are extracted from the decoded challenge request
 * if available and object-shaped; otherwise omitted.
 *
 * @param receipt - Normalized paymentauth receipt
 * @param challenge - Optional normalized challenge that preceded this receipt
 * @returns PaymentEvidence with fields backed by upstream data
 */
export function fromPaymentauthReceipt(
  receipt: NormalizedPaymentauthReceipt,
  challenge?: NormalizedPaymentauthChallenge
): PaymentEvidence {
  // Extract amount/currency from challenge request if available
  let amount: number | undefined;
  let currency: string | undefined;
  let asset: string | undefined;

  if (challenge?.decodedRequest && typeof challenge.decodedRequest === 'object') {
    const req = challenge.decodedRequest as Record<string, unknown>;
    if (typeof req.amount === 'string' && /^[0-9]+$/.test(req.amount)) {
      amount = parseInt(req.amount, 10);
    } else if (typeof req.amount === 'number' && Number.isFinite(req.amount)) {
      amount = req.amount;
    }
    if (typeof req.currency === 'string' && req.currency.length > 0) {
      currency = req.currency.toUpperCase();
      asset = currency;
    }
  }

  // Build evidence metadata from available upstream data
  const evidenceMeta: JsonObject = {
    paymentauth_method: receipt.method,
    paymentauth_status: receipt.status,
  };
  if (receipt.timestamp) evidenceMeta.timestamp = receipt.timestamp;
  if (challenge) {
    evidenceMeta.challenge_id = challenge.id;
    evidenceMeta.challenge_intent = challenge.intent;
    evidenceMeta.challenge_realm = challenge.realm;
  }
  if (Object.keys(receipt.extras).length > 0) {
    evidenceMeta.receipt_extras = receipt.extras as JsonObject;
  }

  return {
    rail: PAYMENTAUTH_RAIL,
    reference: receipt.reference ?? receipt._raw.rawValue.substring(0, 32),
    amount: amount ?? 0,
    currency: currency ?? 'UNKNOWN',
    asset: asset ?? currency ?? 'UNKNOWN',
    env: 'live',
    evidence: evidenceMeta,
  };
}

/**
 * Extract partial commerce extension fields from paymentauth artifacts.
 *
 * Only returns fields that the source data actually provides.
 * Returns undefined if no commerce-relevant data is available.
 */
export function toCommerceExtensionFields(
  receipt: NormalizedPaymentauthReceipt,
  challenge?: NormalizedPaymentauthChallenge
):
  | Partial<{
      payment_rail: string;
      amount_minor: string;
      currency: string;
      reference: string;
      env: 'live' | 'test';
    }>
  | undefined {
  const fields: Record<string, string> = {};
  fields.payment_rail = PAYMENTAUTH_RAIL;

  if (challenge?.decodedRequest && typeof challenge.decodedRequest === 'object') {
    const req = challenge.decodedRequest as Record<string, unknown>;
    if (typeof req.amount === 'string' && /^-?[0-9]+$/.test(req.amount)) {
      fields.amount_minor = req.amount;
    }
    if (typeof req.currency === 'string' && req.currency.length > 0) {
      fields.currency = req.currency.toUpperCase();
    }
  }

  if (receipt.reference) {
    fields.reference = receipt.reference;
  }

  // Only return if we have at least rail + one other field
  if (Object.keys(fields).length <= 1) return undefined;

  return { ...fields, env: 'live' } as ReturnType<typeof toCommerceExtensionFields>;
}
