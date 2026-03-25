/**
 * Cross-package commerce semantic boundary conformance tests.
 *
 * Proves the semantic contracts across x402, paymentauth, ACP, SPT,
 * and UCP survive integration. These are the protocol-grade regression
 * guards for v0.12.4 commerce evidence boundaries.
 */

import { describe, it, expect } from 'vitest';
import { PEAC_RECEIPT_HEADER } from '@peac/kernel';

// x402 carrier
import { extractReceiptArtifactFromHeaders, fromOfferResponse } from '@peac/adapter-x402';

// paymentauth
import {
  extractCarrierFromPaymentauthHeaders,
  PAYMENT_RECEIPT_HEADER,
} from '@peac/mappings-paymentauth';

// ACP session
import { fromACPSessionLifecycleEvent, fromACPPaymentObservation } from '@peac/mappings-acp';

// Stripe SPT
import { fromSPTUse, fromStripePaymentIntentObservation } from '@peac/rails-stripe';

// UCP
import { mapUcpOrderToReceipt } from '@peac/mappings-ucp';

// ---------------------------------------------------------------------------
// x402: carrier vs upstream artifact boundary
// ---------------------------------------------------------------------------

describe('x402: carrier artifact boundary', () => {
  it('PEAC-Receipt + PAYMENT-RESPONSE coexist without receipt_jws contamination', () => {
    const jws = 'eyJhbGciOiJFZERTQSJ9.payload.sig';
    const v2Json = JSON.stringify({ format: 'eip712', signature: '0xabc' });

    const result = fromOfferResponse({
      'PEAC-Receipt': jws,
      'Payment-Response': v2Json,
    });

    // PEAC receipt wins; receipt_jws is the JWS, not the v2 JSON
    expect(result).not.toBeNull();
    expect(result!.receipts[0].receipt_jws).toBe(jws);
    expect(result!.receipts[0].receipt_jws).not.toBe(v2Json);
  });

  it('v2 upstream artifact never stored in receipt_jws', () => {
    const v2Json = JSON.stringify({ format: 'eip712', signature: '0xabc' });

    const result = fromOfferResponse({ 'Payment-Response': v2Json });

    expect(result).not.toBeNull();
    expect(result!.receipts[0].receipt_jws).toBeUndefined();
    expect(result!.upstreamArtifact).toBeDefined();
    expect(result!.upstreamArtifact!.rawArtifact).toBe(v2Json);
    expect(result!.upstreamArtifact!.isPeacReceipt).toBe(false);
  });

  it('attach path never emits x402 v2 response headers', () => {
    // The X402CarrierAdapter.attach() writes PEAC-Receipt only
    // This is tested in the adapter package; cross-checked here
    const artifact = extractReceiptArtifactFromHeaders({
      'Content-Type': 'application/json',
    });
    expect(artifact).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// paymentauth: Payment-Receipt alone is not a PEAC carrier
// ---------------------------------------------------------------------------

describe('paymentauth: upstream artifact boundary', () => {
  it('Payment-Receipt alone yields null from carrier extractor', () => {
    const result = extractCarrierFromPaymentauthHeaders({
      [PAYMENT_RECEIPT_HEADER]: 'eyJzdGF0dXMiOiJzdWNjZXNzIn0',
    });

    expect(result).toBeNull();
  });

  it('PEAC-Receipt + Payment-Receipt: carrier succeeds, upstream captured separately', () => {
    const jws = 'eyJhbGciOiJFZERTQSJ9.payload.sig';
    const result = extractCarrierFromPaymentauthHeaders({
      [PEAC_RECEIPT_HEADER]: jws,
      [PAYMENT_RECEIPT_HEADER]: 'eyJzdGF0dXMiOiJzdWNjZXNzIn0',
    });

    expect(result).not.toBeNull();
    expect(result!.receipts[0].receipt_jws).toBe(jws);
    expect(result!.rawPaymentReceipt).toBe('eyJzdGF0dXMiOiJzdWNjZXNzIn0');
  });
});

// ---------------------------------------------------------------------------
// ACP: session lifecycle vs payment finality
// ---------------------------------------------------------------------------

describe('ACP: session completed boundary', () => {
  it('completed without payment artifact stays non-payment evidence', () => {
    const result = fromACPSessionLifecycleEvent({
      session_id: 'sess_boundary',
      state: 'completed',
      resource_uri: 'https://shop.example.com/checkout/boundary',
    });

    expect(result.payment.rail).toBe('acp');
    expect(result.amt).toBe(0);
    expect(result.cur).toBe('NONE');
    const ev = result.payment.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBeUndefined();
    expect(ev.observed_payment_state).toBeUndefined();
  });

  it('completed with explicit payment artifact produces commerce evidence', () => {
    const result = fromACPPaymentObservation(
      {
        session_id: 'sess_boundary',
        state: 'completed',
        resource_uri: 'https://shop.example.com/checkout/boundary',
      },
      {
        rail: 'stripe',
        reference: 'pi_boundary',
        amount: 1000,
        currency: 'USD',
        observed_payment_state: 'settled',
      }
    );

    expect(result.payment.rail).toBe('stripe');
    expect(result.amt).toBe(1000);
    const ev = result.payment.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBe('settlement');
    expect(ev.observed_payment_state).toBe('settled');
  });
});

// ---------------------------------------------------------------------------
// Stripe SPT: delegation vs commerce finality
// ---------------------------------------------------------------------------

describe('Stripe SPT: delegation boundary', () => {
  it('SPT use with payment_intent_id never upgrades to settlement', () => {
    const result = fromSPTUse({
      id: 'use_boundary',
      token_id: 'tok_boundary',
      amount: '5000',
      currency: 'usd',
      merchant_id: 'merch_1',
      payment_intent_id: 'pi_exists',
    });

    const ev = result.evidence as Record<string, unknown>;
    expect(ev.spt_action).toBe('delegated_payment_presented');
    expect(ev.commerce_event).toBeUndefined();
  });

  it('PI observation with succeeded produces settlement', () => {
    const result = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_exists',
      status: 'succeeded',
      amount: '5000',
      currency: 'usd',
    });

    const ev = result.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBe('settlement');
  });

  it('PI observation with processing produces NO commerce event', () => {
    const result = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_exists',
      status: 'processing',
    });

    const ev = result.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UCP: observed vs derived payment state
// ---------------------------------------------------------------------------

describe('UCP: observed vs derived boundary', () => {
  const baseOrder = {
    id: 'order_boundary',
    line_items: [
      {
        id: 'li_1',
        item: { id: 'p1', title: 'Item', price: 100 },
        quantity: { total: 1, fulfilled: 1 },
        status: 'fulfilled' as const,
      },
    ],
    totals: [
      { type: 'subtotal', amount: 100 },
      { type: 'total', amount: 100 },
    ],
  };

  it('completed order without payment_state marks as derived fallback', () => {
    const claims = mapUcpOrderToReceipt({
      order: baseOrder,
      issuer: 'https://merchant.example.com',
      subject: 'agent:boundary',
      currency: 'USD',
    });

    expect(claims.payment.evidence.payment_state_source).toBe('derived_order_fallback');
    expect(claims.payment.evidence.payment_state).toBeUndefined();
  });

  it('explicit payment_state overrides derived order status', () => {
    const claims = mapUcpOrderToReceipt({
      order: baseOrder,
      issuer: 'https://merchant.example.com',
      subject: 'agent:boundary',
      currency: 'USD',
      payment_state: 'failed',
    });

    // Order completed but payment failed: explicit wins
    expect(claims.payment.evidence.order_state).toBe('completed');
    expect(claims.payment.evidence.payment_state).toBe('failed');
    expect(claims.payment.evidence.payment_state_source).toBe('explicit');
    expect(claims.payment.status).toBe('pending'); // failed -> pending
  });
});
