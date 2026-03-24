/**
 * Tests for Stripe SPT (Shared Payment Token) evidence mapping.
 *
 * Key invariants:
 * - SPT grant/use/deactivate are delegation evidence, NOT commerce events
 * - Commerce events ONLY from fromStripePaymentIntentObservation()
 * - succeeded -> settlement, requires_capture -> authorization
 * - processing and canceled produce NO commerce event
 * - SPT and PI evidence are separate sources even when correlated
 */

import { describe, it, expect } from 'vitest';
import {
  fromSPTGrant,
  fromSPTUse,
  fromSPTDeactivate,
  fromStripePaymentIntentObservation,
} from '../src/index.js';
import type { StripeSPTGrant, StripeSPTUse, StripeSPTDeactivate } from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGrant(overrides?: Partial<StripeSPTGrant>): StripeSPTGrant {
  return {
    id: 'spt_grant_1',
    token_id: 'spt_tok_abc',
    seller_scope: { merchant_id: 'merch_xyz' },
    amount_limit: '10000',
    currency: 'usd',
    ...overrides,
  };
}

function makeUse(overrides?: Partial<StripeSPTUse>): StripeSPTUse {
  return {
    id: 'spt_use_1',
    token_id: 'spt_tok_abc',
    amount: '5000',
    currency: 'usd',
    merchant_id: 'merch_xyz',
    ...overrides,
  };
}

function makeDeactivate(overrides?: Partial<StripeSPTDeactivate>): StripeSPTDeactivate {
  return {
    id: 'spt_deact_1',
    token_id: 'spt_tok_abc',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// fromSPTGrant
// ---------------------------------------------------------------------------

describe('fromSPTGrant', () => {
  it('should produce delegation evidence, not commerce event', () => {
    const result = fromSPTGrant(makeGrant());

    expect(result.rail).toBe('stripe');
    expect(result.reference).toBe('spt_tok_abc');
    expect(result.currency).toBe('USD');

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.spt_action).toBe('delegated_payment_granted');
    expect(evidence.token_id).toBe('spt_tok_abc');
    expect(evidence.seller_merchant_id).toBe('merch_xyz');
    expect(evidence.amount_limit).toBe('10000');
    // No commerce event
    expect(evidence.commerce_event).toBeUndefined();
  });

  it('should include expiry and external references', () => {
    const result = fromSPTGrant(
      makeGrant({
        expires_at: '2025-02-01T00:00:00Z',
        external_id: 'ext_123',
        network_id: 'net_456',
      })
    );

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.expires_at).toBe('2025-02-01T00:00:00Z');
    expect(evidence.external_id).toBe('ext_123');
    expect(evidence.network_id).toBe('net_456');
  });

  it('should omit metadata by default (privacy)', () => {
    const result = fromSPTGrant(makeGrant({ metadata: { key: 'val' } }));

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.metadata).toBeUndefined();
  });

  it('should include metadata with passthrough policy', () => {
    const result = fromSPTGrant(makeGrant({ metadata: { key: 'val' } }), {
      metadataPolicy: 'passthrough',
    });

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.metadata).toEqual({ key: 'val' });
  });

  it('should respect test environment', () => {
    const result = fromSPTGrant(makeGrant(), { env: 'test' });
    expect(result.env).toBe('test');
  });
});

// ---------------------------------------------------------------------------
// fromSPTUse
// ---------------------------------------------------------------------------

describe('fromSPTUse', () => {
  it('should produce delegation evidence without payment_intent_id', () => {
    const result = fromSPTUse(makeUse());

    expect(result.rail).toBe('stripe');
    expect(result.reference).toBe('spt_tok_abc');
    expect(result.amount).toBe(5000);
    expect(result.currency).toBe('USD');

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.spt_action).toBe('delegated_payment_presented');
    expect(evidence.payment_intent_id).toBeUndefined();
    expect(evidence.commerce_event).toBeUndefined();
  });

  it('should produce delegation evidence WITH PI reference but NO commerce event', () => {
    const result = fromSPTUse(makeUse({ payment_intent_id: 'pi_xyz' }));

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.spt_action).toBe('delegated_payment_presented');
    expect(evidence.payment_intent_id).toBe('pi_xyz');
    // PI reference does NOT prove authorization
    expect(evidence.commerce_event).toBeUndefined();
  });

  it('should omit metadata by default', () => {
    const result = fromSPTUse(makeUse({ metadata: { order: '123' } }));

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.metadata).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// fromSPTDeactivate
// ---------------------------------------------------------------------------

describe('fromSPTDeactivate', () => {
  it('should produce deactivation record, not void', () => {
    const result = fromSPTDeactivate(makeDeactivate({ reason: 'expired' }));

    expect(result.rail).toBe('stripe');
    expect(result.reference).toBe('spt_tok_abc');

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.spt_action).toBe('delegated_payment_deactivated');
    expect(evidence.reason).toBe('expired');
    // No commerce event (deactivation is not void)
    expect(evidence.commerce_event).toBeUndefined();
  });

  it('should include deactivated_by when present', () => {
    const result = fromSPTDeactivate(makeDeactivate({ deactivated_by: 'seller' }));

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.deactivated_by).toBe('seller');
  });
});

// ---------------------------------------------------------------------------
// fromStripePaymentIntentObservation
// ---------------------------------------------------------------------------

describe('fromStripePaymentIntentObservation', () => {
  it('should produce commerce settlement for succeeded', () => {
    const result = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_123',
      status: 'succeeded',
      amount: '1000',
      currency: 'usd',
    });

    expect(result.rail).toBe('stripe');
    expect(result.reference).toBe('pi_123');
    expect(result.amount).toBe(1000);
    expect(result.currency).toBe('USD');

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBe('settlement');
    expect(evidence.payment_intent_status).toBe('succeeded');
  });

  it('should produce commerce authorization for requires_capture', () => {
    const result = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_123',
      status: 'requires_capture',
      amount: '2000',
      currency: 'eur',
    });

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBe('authorization');
    expect(evidence.payment_intent_status).toBe('requires_capture');
  });

  it('should produce observation metadata only for processing (NO commerce event)', () => {
    const result = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_123',
      status: 'processing',
    });

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBeUndefined();
    expect(evidence.payment_intent_status).toBe('processing');
  });

  it('should produce observation metadata only for canceled (NO commerce event)', () => {
    const result = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_123',
      status: 'canceled',
    });

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBeUndefined();
    expect(evidence.payment_intent_status).toBe('canceled');
  });

  it('should produce NO commerce event for requires_payment_method', () => {
    const result = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_123',
      status: 'requires_payment_method',
    });

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBeUndefined();
  });

  it('should produce NO commerce event for requires_confirmation', () => {
    const result = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_123',
      status: 'requires_confirmation',
    });

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBeUndefined();
  });

  it('should produce NO commerce event for requires_action', () => {
    const result = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_123',
      status: 'requires_action',
    });

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBeUndefined();
  });

  it('should omit metadata by default', () => {
    const result = fromStripePaymentIntentObservation(
      { payment_intent_id: 'pi_123', status: 'succeeded', metadata: { key: 'val' } },
      { metadataPolicy: 'omit' }
    );

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.metadata).toBeUndefined();
  });

  it('should include metadata with passthrough', () => {
    const result = fromStripePaymentIntentObservation(
      { payment_intent_id: 'pi_123', status: 'succeeded', metadata: { key: 'val' } },
      { metadataPolicy: 'passthrough' }
    );

    const evidence = result.evidence as Record<string, unknown>;
    expect(evidence.metadata).toEqual({ key: 'val' });
  });
});

// ---------------------------------------------------------------------------
// SPT and PI evidence are separate sources
// ---------------------------------------------------------------------------

describe('SPT + PI evidence separation', () => {
  it('should produce independent evidence for SPT use and PI observation', () => {
    const sptEvidence = fromSPTUse(makeUse({ payment_intent_id: 'pi_abc' }));
    const piEvidence = fromStripePaymentIntentObservation({
      payment_intent_id: 'pi_abc',
      status: 'succeeded',
      amount: '5000',
      currency: 'usd',
    });

    // SPT evidence: delegation, no commerce event
    const sptMeta = sptEvidence.evidence as Record<string, unknown>;
    expect(sptMeta.spt_action).toBe('delegated_payment_presented');
    expect(sptMeta.commerce_event).toBeUndefined();
    expect(sptEvidence.reference).toBe('spt_tok_abc');

    // PI evidence: commerce settlement
    const piMeta = piEvidence.evidence as Record<string, unknown>;
    expect(piMeta.commerce_event).toBe('settlement');
    expect(piMeta.spt_action).toBeUndefined();
    expect(piEvidence.reference).toBe('pi_abc');

    // Different references: SPT uses token_id, PI uses payment_intent_id
    expect(sptEvidence.reference).not.toBe(piEvidence.reference);
  });
});
