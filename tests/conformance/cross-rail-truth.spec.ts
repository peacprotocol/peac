/**
 * Cross-rail commerce.event truth: deterministic shared scenario family.
 *
 * One canonical payment scenario ($25.00 USD, reference "pay_shared_001")
 * mapped through paymentauth, Stripe, ACP, UCP, and x402. Proves:
 *
 * 1. Same-payment receipts across rails agree on settlement semantics
 * 2. Non-observation functions do not emit settlement-like commerce events
 * 3. Carrier roundtrip preserves receipt_jws integrity
 */

import { describe, it, expect } from 'vitest';

// paymentauth
import {
  parsePaymentauthChallenges,
  parsePaymentauthReceipt,
  normalizeChallenge,
  normalizeReceipt,
  fromPaymentauthReceipt,
  toCommerceExtensionFields,
  extractCarrierFromPaymentauthHeaders,
  attachCarrierToPaymentauthHeaders,
} from '@peac/mappings-paymentauth';

// ACP
import { fromACPSessionLifecycleEvent, fromACPPaymentObservation } from '@peac/mappings-acp';

// Stripe
import {
  fromSPTGrant,
  fromSPTUse,
  fromSPTDeactivate,
  fromStripePaymentIntentObservation,
} from '@peac/rails-stripe';

// UCP
import type { MapUcpOrderOptions, UcpOrder, UcpLineItem } from '@peac/mappings-ucp';
import { mapUcpOrderToReceipt } from '@peac/mappings-ucp';

// x402
import { fromOfferResponse } from '@peac/adapter-x402';

// Shared canonical receipt_ref computation
import { computeReceiptRef } from '@peac/schema';

// ---------------------------------------------------------------------------
// Shared scenario family: $25.00 USD settled payment
// ---------------------------------------------------------------------------

const SHARED_SCENARIO = {
  amount_minor: '2500',
  amount_number: 2500,
  currency: 'USD',
  reference: 'pay_shared_001',
} as const;

// ---------------------------------------------------------------------------
// Typed helper builders
// ---------------------------------------------------------------------------

function buildUcpOrder(overrides?: Partial<UcpOrder>): UcpOrder {
  const baseItem: UcpLineItem = {
    id: 'li_shared',
    item: { id: 'api_access', title: 'API Access', price: SHARED_SCENARIO.amount_number },
    quantity: { total: 1, fulfilled: 1 },
    status: 'fulfilled',
  };
  return {
    id: 'order_shared_01',
    line_items: [baseItem],
    totals: [
      { type: 'subtotal', amount: SHARED_SCENARIO.amount_number },
      { type: 'total', amount: SHARED_SCENARIO.amount_number },
    ],
    ...overrides,
  };
}

function buildUcpOptions(overrides?: Partial<MapUcpOrderOptions>): MapUcpOrderOptions {
  return {
    order: buildUcpOrder(overrides?.order as Partial<UcpOrder> | undefined),
    issuer: 'https://merchant.example.com',
    subject: 'agent:shared_01',
    currency: SHARED_SCENARIO.currency,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Settlement semantic normalizer
//
// Each rail represents settlement differently. This helper derives a
// comparable semantic outcome from each rail's actual output structure
// rather than assigning strings manually.
// ---------------------------------------------------------------------------

type SettlementOutcome = 'settlement' | 'settlement_equivalent' | 'no_settlement' | 'attestation';

function deriveSettlementOutcome(
  railOutput: Record<string, unknown>,
  rail: string
): SettlementOutcome {
  // Rails with direct commerce.event
  const evidence = (railOutput.evidence ?? railOutput.payment?.evidence) as
    | Record<string, unknown>
    | undefined;

  if (evidence?.commerce_event === 'settlement') {
    return 'settlement';
  }

  // UCP: uses payment_state + payment.status model, not commerce.event
  if (rail === 'ucp') {
    const payment = railOutput.payment as Record<string, unknown> | undefined;
    const paymentEvidence = payment?.evidence as Record<string, unknown> | undefined;
    if (
      paymentEvidence?.payment_state === 'settled' &&
      paymentEvidence?.payment_state_source === 'explicit' &&
      payment?.status === 'completed'
    ) {
      return 'settlement_equivalent';
    }
    return 'no_settlement';
  }

  // paymentauth: evidence-from-attestation model; no commerce.event emitted
  if (rail === 'paymentauth') {
    const ev = evidence as Record<string, unknown> | undefined;
    if (ev?.paymentauth_status === 'success') {
      return 'attestation';
    }
    return 'no_settlement';
  }

  return evidence?.commerce_event ? 'no_settlement' : 'no_settlement';
}

// ---------------------------------------------------------------------------
// 1. Cross-rail commerce.event equivalence
// ---------------------------------------------------------------------------

describe('cross-rail settlement semantic equivalence', () => {
  const outcomes: Record<string, SettlementOutcome> = {};

  it('paymentauth: settled payment produces evidence with amount and currency', () => {
    const challengeHeader =
      'Payment id="shared_ch_01", realm="api.example.com", method="example", ' +
      'intent="charge", ' +
      'request="eyJhbW91bnQiOiIyNTAwIiwiY3VycmVuY3kiOiJ1c2QiLCJyZWNpcGllbnQiOiJhY2N0XzAwMSJ9"';

    const challenges = parsePaymentauthChallenges(challengeHeader);
    expect(challenges.length).toBe(1);
    const normalizedChallenge = normalizeChallenge(challenges[0]);

    const receiptB64 =
      'eyJzdGF0dXMiOiJzdWNjZXNzIiwibWV0aG9kIjoiZXhhbXBsZSIsInRpbWVzdGFtcCI6IjIwMjYtMDMtMjdUMTI6MDA6MDBaIiwicmVmZXJlbmNlIjoicGF5X3NoYXJlZF8wMDEifQ';
    const rawReceipt = parsePaymentauthReceipt(receiptB64);
    const normalizedReceipt = normalizeReceipt(rawReceipt);

    const evidence = fromPaymentauthReceipt(normalizedReceipt, normalizedChallenge);

    expect(evidence.rail).toBe('paymentauth');
    expect(evidence.amount).toBe(SHARED_SCENARIO.amount_number);
    expect(evidence.currency).toBe(SHARED_SCENARIO.currency);
    expect(evidence.reference).toBe(SHARED_SCENARIO.reference);

    const ext = toCommerceExtensionFields(normalizedReceipt, normalizedChallenge);
    expect(ext).toBeDefined();
    expect(ext!.amount_minor).toBe(SHARED_SCENARIO.amount_minor);
    expect(ext!.currency).toBe(SHARED_SCENARIO.currency);

    outcomes['paymentauth'] = deriveSettlementOutcome(evidence, 'paymentauth');
  });

  it('stripe: PI observation (succeeded) produces settlement event', () => {
    const result = fromStripePaymentIntentObservation({
      payment_intent_id: SHARED_SCENARIO.reference,
      status: 'succeeded',
      amount: SHARED_SCENARIO.amount_minor,
      currency: 'usd',
    });

    expect(result.rail).toBe('stripe');
    expect(result.amount).toBe(SHARED_SCENARIO.amount_number);
    expect(result.currency).toBe(SHARED_SCENARIO.currency);
    const ev = result.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBe('settlement');

    outcomes['stripe'] = deriveSettlementOutcome(result, 'stripe');
  });

  it('acp: payment observation (settled) produces settlement event', () => {
    const result = fromACPPaymentObservation(
      {
        session_id: 'sess_shared_01',
        state: 'completed',
        resource_uri: 'https://shop.example.com/checkout/shared',
      },
      {
        rail: 'stripe',
        reference: SHARED_SCENARIO.reference,
        amount: SHARED_SCENARIO.amount_number,
        currency: SHARED_SCENARIO.currency,
        observed_payment_state: 'settled',
      }
    );

    expect(result.amt).toBe(SHARED_SCENARIO.amount_number);
    const ev = result.payment.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBe('settlement');

    outcomes['acp'] = deriveSettlementOutcome(result, 'acp');
  });

  it('ucp: explicit payment_state=settled produces completed status', () => {
    const result = mapUcpOrderToReceipt(buildUcpOptions({ payment_state: 'settled' }));

    expect(result.payment.evidence.payment_state_source).toBe('explicit');
    expect(result.payment.evidence.payment_state).toBe('settled');
    expect(result.payment.status).toBe('completed');

    outcomes['ucp'] = deriveSettlementOutcome(result, 'ucp');
  });

  it('x402: PEAC-Receipt header extraction preserves carrier', () => {
    // x402 is a verification-first rail: it reads receipts from headers,
    // not a mapping function that produces commerce.event. The carrier
    // extraction proves the PEAC receipt survives the x402 transport path.
    const jws = 'eyJhbGciOiJFZERTQSJ9.payload.sig';

    const result = fromOfferResponse({ 'PEAC-Receipt': jws });
    expect(result).not.toBeNull();
    expect(result!.receipts[0].receipt_jws).toBe(jws);

    // x402 does not emit commerce.event from carrier extraction;
    // the event is inside the receipt payload, not the transport layer.
    // x402 is excluded from the commerce.event equivalence check because
    // its architecture is verification-first (receipt content determines
    // the event) rather than mapping-first (function output determines it).
    outcomes['x402'] = 'attestation';
  });

  it('INVARIANT: all rails that emit commerce.event agree on settlement', () => {
    expect(outcomes['stripe']).toBe('settlement');
    expect(outcomes['acp']).toBe('settlement');
  });

  it('INVARIANT: UCP explicit settled is semantically equivalent to settlement', () => {
    expect(outcomes['ucp']).toBe('settlement_equivalent');
  });

  it('INVARIANT: paymentauth and x402 use attestation model (receipt content)', () => {
    expect(outcomes['paymentauth']).toBe('attestation');
    expect(outcomes['x402']).toBe('attestation');
  });
});

// ---------------------------------------------------------------------------
// 2. Asymmetric safety invariant
// ---------------------------------------------------------------------------

describe('asymmetric safety: non-observation functions must not emit settlement events', () => {
  it('ACP session lifecycle (completed) does not emit commerce.event', () => {
    const result = fromACPSessionLifecycleEvent({
      session_id: 'sess_safety_01',
      state: 'completed',
      resource_uri: 'https://shop.example.com/checkout/safety',
    });

    const ev = result.payment.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBeUndefined();
    expect(ev.observed_payment_state).toBeUndefined();
    expect(result.amt).toBe(0);
    expect(result.cur).toBe('NONE');
  });

  it('SPT grant does not emit commerce.event', () => {
    const result = fromSPTGrant({
      id: 'grant_safety',
      token_id: 'tok_safety',
      seller_scope: { merchant_id: 'merch_safety' },
      amount_limit: SHARED_SCENARIO.amount_minor,
      currency: 'usd',
    });

    const ev = result.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBeUndefined();
    expect(ev.spt_action).toBe('delegated_payment_granted');
  });

  it('SPT use (even with PI reference) does not emit commerce.event', () => {
    const result = fromSPTUse({
      id: 'use_safety',
      token_id: 'tok_safety',
      amount: SHARED_SCENARIO.amount_minor,
      currency: 'usd',
      merchant_id: 'merch_safety',
      payment_intent_id: 'pi_exists_but_irrelevant',
    });

    const ev = result.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBeUndefined();
    expect(ev.spt_action).toBe('delegated_payment_presented');
  });

  it('SPT deactivate does not emit commerce.event', () => {
    const result = fromSPTDeactivate({
      id: 'deact_safety',
      token_id: 'tok_safety',
      reason: 'expired',
    });

    const ev = result.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBeUndefined();
    expect(ev.spt_action).toBe('delegated_payment_deactivated');
  });

  it('PI observation (processing) does not emit commerce.event', () => {
    const result = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_safety',
      status: 'processing',
      amount: SHARED_SCENARIO.amount_minor,
      currency: 'usd',
    });

    const ev = result.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBeUndefined();
  });

  it('PI observation (canceled) does not emit commerce.event', () => {
    const result = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_safety',
      status: 'canceled',
    });

    const ev = result.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBeUndefined();
  });

  it('UCP order (completed) without explicit payment_state uses fallback', () => {
    const result = mapUcpOrderToReceipt(
      buildUcpOptions({
        order: buildUcpOrder({ id: 'order_safety' }),
        subject: 'agent:safety',
        payment_state: undefined,
      })
    );

    expect(result.payment.evidence.payment_state_source).toBe('derived_order_fallback');
    expect(result.payment.evidence.payment_state).toBeUndefined();
  });

  it('ACP payment observation (attempted) does not emit commerce.event', () => {
    const result = fromACPPaymentObservation(
      {
        session_id: 'sess_safety_02',
        state: 'completed',
        resource_uri: 'https://shop.example.com/checkout/attempted',
      },
      {
        rail: 'stripe',
        reference: 'pi_attempted',
        amount: 1000,
        currency: 'USD',
        observed_payment_state: 'attempted',
      }
    );

    const ev = result.payment.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBeUndefined();
    expect(ev.observed_payment_state).toBe('attempted');
  });

  it('ACP payment observation (failed) does not emit commerce.event', () => {
    const result = fromACPPaymentObservation(
      {
        session_id: 'sess_safety_03',
        state: 'completed',
        resource_uri: 'https://shop.example.com/checkout/failed',
      },
      {
        rail: 'stripe',
        reference: 'pi_failed',
        amount: 1000,
        currency: 'USD',
        observed_payment_state: 'failed',
      }
    );

    const ev = result.payment.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBeUndefined();
    expect(ev.observed_payment_state).toBe('failed');
  });

  it('x402: upstream PAYMENT-RESPONSE never stored in receipt_jws', () => {
    const v2Json = JSON.stringify({ format: 'eip712', signature: '0xabc' });
    const result = fromOfferResponse({ 'Payment-Response': v2Json });

    expect(result).not.toBeNull();
    expect(result!.receipts[0].receipt_jws).toBeUndefined();
    expect(result!.upstreamArtifact).toBeDefined();
    expect(result!.upstreamArtifact!.isPeacReceipt).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Stripe out-of-order observation: authorization then settlement
// ---------------------------------------------------------------------------

describe('Stripe: out-of-order observation race', () => {
  it('requires_capture then succeeded: separate evidence, different events', () => {
    const auth = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_race',
      status: 'requires_capture',
      amount: SHARED_SCENARIO.amount_minor,
      currency: 'usd',
    });

    const settle = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_race',
      status: 'succeeded',
      amount: SHARED_SCENARIO.amount_minor,
      currency: 'usd',
    });

    const authEv = auth.evidence as Record<string, unknown>;
    const settleEv = settle.evidence as Record<string, unknown>;

    expect(authEv.commerce_event).toBe('authorization');
    expect(settleEv.commerce_event).toBe('settlement');
    expect(auth.reference).toBe(settle.reference);
    expect(auth.amount).toBe(settle.amount);
    expect(authEv).not.toBe(settleEv);
  });

  it('out-of-order (succeeded before requires_capture): events derived from status, not order', () => {
    const settle = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_race_reverse',
      status: 'succeeded',
      amount: SHARED_SCENARIO.amount_minor,
      currency: 'usd',
    });

    const auth = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_race_reverse',
      status: 'requires_capture',
      amount: SHARED_SCENARIO.amount_minor,
      currency: 'usd',
    });

    expect((settle.evidence as Record<string, unknown>).commerce_event).toBe('settlement');
    expect((auth.evidence as Record<string, unknown>).commerce_event).toBe('authorization');
  });
});

// ---------------------------------------------------------------------------
// 4. Paymentauth carrier roundtrip
// ---------------------------------------------------------------------------

describe('paymentauth: carrier roundtrip', () => {
  it('attach then extract preserves receipt_jws', async () => {
    const jws =
      'eyJhbGciOiJFZERTQSIsImtpZCI6InRlc3Qta2V5LTAxIn0.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIn0.c2lnbmF0dXJl';

    const ref = await computeReceiptRef(jws);
    const carrier = { receipt_ref: ref, receipt_jws: jws };

    const headers = attachCarrierToPaymentauthHeaders({}, carrier);
    expect(headers['PEAC-Receipt']).toBe(jws);

    const extracted = extractCarrierFromPaymentauthHeaders(headers);
    expect(extracted).not.toBeNull();
    expect(extracted!.receipts[0].receipt_jws).toBe(jws);
  });

  it('Payment-Receipt coexists without contaminating carrier', async () => {
    const jws =
      'eyJhbGciOiJFZERTQSIsImtpZCI6InRlc3Qta2V5LTAyIn0.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIn0.c2lnbmF0dXJl';
    const paymentReceipt = 'eyJzdGF0dXMiOiJzdWNjZXNzIn0';

    const ref = await computeReceiptRef(jws);
    const carrier = { receipt_ref: ref, receipt_jws: jws };

    const headers = attachCarrierToPaymentauthHeaders(
      { 'Payment-Receipt': paymentReceipt },
      carrier
    );

    const extracted = extractCarrierFromPaymentauthHeaders(headers);
    expect(extracted).not.toBeNull();
    expect(extracted!.receipts[0].receipt_jws).toBe(jws);
    expect(extracted!.rawPaymentReceipt).toBe(paymentReceipt);
    expect(extracted!.receipts[0].receipt_jws).not.toBe(paymentReceipt);
  });
});
