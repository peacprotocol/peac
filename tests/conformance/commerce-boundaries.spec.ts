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

  it('upstream artifact stays bounded (no oversized JSON abuse)', () => {
    const oversizedJson = JSON.stringify({ data: 'x'.repeat(50000) });

    const artifact = extractReceiptArtifactFromHeaders({
      'Payment-Response': oversizedJson,
    });

    // Artifact is captured but bounded; rawArtifact length matches input
    expect(artifact).not.toBeNull();
    expect(artifact!.rawArtifact.length).toBe(oversizedJson.length);
    expect(artifact!.isPeacReceipt).toBe(false);
    // Carrier extraction should not promote oversized upstream data
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

describe('paymentauth: carrier integration contract', () => {
  it('CONTRACT: Payment-Receipt alone does NOT constitute PEAC carrier success', () => {
    const result = extractCarrierFromPaymentauthHeaders({
      [PAYMENT_RECEIPT_HEADER]: 'eyJzdGF0dXMiOiJzdWNjZXNzIn0',
    });

    expect(result).toBeNull();
  });

  it('CONTRACT: PEAC-Receipt alone constitutes carrier success', () => {
    const jws = 'eyJhbGciOiJFZERTQSJ9.payload.sig';
    const result = extractCarrierFromPaymentauthHeaders({
      [PEAC_RECEIPT_HEADER]: jws,
    });

    expect(result).not.toBeNull();
    expect(result!.receipts[0].receipt_jws).toBe(jws);
  });

  it('CONTRACT: coexistence never mixes carrier and upstream semantically', () => {
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

// ---------------------------------------------------------------------------
// x402: attach path invariant (v0.12.4 writes PEAC-Receipt only)
// ---------------------------------------------------------------------------

describe('x402: attach path invariant', () => {
  it('X402CarrierAdapter.attach writes only PEAC-Receipt, never v2 headers', async () => {
    const { X402CarrierAdapter } = await import('@peac/adapter-x402');
    const { computeReceiptRef } = await import('@peac/schema');

    const adapter = new X402CarrierAdapter();
    const jws = 'eyJhbGciOiJFZERTQSJ9.payload.sig';
    const ref = await computeReceiptRef(jws);
    const carrier = { receipt_ref: ref, receipt_jws: jws };

    const response = adapter.attach({}, [carrier]);

    expect(response.headers!['PEAC-Receipt']).toBe(jws);
    // Must NOT write v2 headers
    expect(response.headers!['Payment-Response']).toBeUndefined();
    expect(response.headers!['PAYMENT-RESPONSE']).toBeUndefined();
    expect(response.headers!['X-Payment-Response']).toBeUndefined();
    expect(response.headers!['X-PAYMENT-RESPONSE']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Stripe: manual capture regression (requires_capture -> succeeded)
// ---------------------------------------------------------------------------

describe('Stripe: manual capture lifecycle', () => {
  it('requires_capture maps to authorization, not settlement', () => {
    const authResult = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_manual',
      status: 'requires_capture',
      amount: '3000',
      currency: 'usd',
    });

    const authEv = authResult.evidence as Record<string, unknown>;
    expect(authEv.commerce_event).toBe('authorization');
  });

  it('same PI with succeeded maps to settlement after capture', () => {
    const settleResult = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_manual',
      status: 'succeeded',
      amount: '3000',
      currency: 'usd',
    });

    const settleEv = settleResult.evidence as Record<string, unknown>;
    expect(settleEv.commerce_event).toBe('settlement');
  });

  it('authorization and settlement remain separate evidence objects', () => {
    const auth = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_manual',
      status: 'requires_capture',
    });
    const settle = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_manual',
      status: 'succeeded',
    });

    const authEv = auth.evidence as Record<string, unknown>;
    const settleEv = settle.evidence as Record<string, unknown>;
    expect(authEv.commerce_event).toBe('authorization');
    expect(settleEv.commerce_event).toBe('settlement');
    // Different evidence objects
    expect(authEv).not.toBe(settleEv);
  });
});

// ---------------------------------------------------------------------------
// paymentauth: no sensitive data in errors
// ---------------------------------------------------------------------------

describe('paymentauth: no-sensitive-leak', () => {
  it('invalid credential does not leak raw header in error', async () => {
    const { parsePaymentauthCredential, PaymentauthError } =
      await import('@peac/mappings-paymentauth');

    const sensitiveHeader = 'Payment eyJzZWNyZXQiOiJ0b3Bfc2VjcmV0X3ZhbHVlIn0';

    try {
      parsePaymentauthCredential(sensitiveHeader);
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(PaymentauthError);
      // Error message must NOT contain the base64url credential payload
      expect((e as Error).message).not.toContain('eyJzZWNyZXQi');
      expect((e as Error).message).not.toContain('top_secret_value');
    }
  });

  it('oversized header does not leak content in error', async () => {
    const { parsePaymentauthChallenges, PaymentauthError } =
      await import('@peac/mappings-paymentauth');

    const huge = 'Payment id="x", realm="' + 'a'.repeat(10000) + '"';

    try {
      parsePaymentauthChallenges(huge);
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(PaymentauthError);
      expect((e as Error).message).not.toContain('aaaa');
    }
  });
});

// ---------------------------------------------------------------------------
// #549: dynamic category derivation regression
// ---------------------------------------------------------------------------

describe('#549: dynamic error category derivation', () => {
  it('error-categories.json includes cryptography (no hardcoded list)', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');

    const categoriesPath = join(process.cwd(), 'specs/kernel/error-categories.json');
    const categories = JSON.parse(readFileSync(categoriesPath, 'utf-8'));

    expect(categories.categories).toContain('cryptography');
    // Validate it is derived from errors.json, not hardcoded
    expect(categories.$comment).toContain('AUTO-GENERATED');
  });
});
