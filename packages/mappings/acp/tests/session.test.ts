/**
 * Tests for ACP session lifecycle evidence mapping (DD-188).
 *
 * Key invariant: session states NEVER directly map to commerce events.
 * Commerce evidence requires an explicit payment artifact with observed state.
 */

import { describe, it, expect } from 'vitest';
import {
  fromACPSessionLifecycleEvent,
  fromACPPaymentObservation,
  fromACPCapabilitySnapshot,
  fromACPInterventionRequired,
  fromACPCheckoutSuccess,
} from '../src/index.js';
import type { ACPSessionEvent, ACPPaymentArtifact } from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSessionEvent(
  state: ACPSessionEvent['state'],
  overrides?: Partial<ACPSessionEvent>
): ACPSessionEvent {
  return {
    session_id: 'sess_abc123',
    state,
    resource_uri: 'https://shop.example.com/checkout/abc123',
    ...overrides,
  };
}

function makePaymentArtifact(overrides?: Partial<ACPPaymentArtifact>): ACPPaymentArtifact {
  return {
    rail: 'stripe',
    reference: 'pi_xyz789',
    amount: 1000,
    currency: 'USD',
    observed_payment_state: 'settled',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// fromACPSessionLifecycleEvent
// ---------------------------------------------------------------------------

describe('fromACPSessionLifecycleEvent', () => {
  const ALL_STATES: ACPSessionEvent['state'][] = [
    'created',
    'updated',
    'ready_for_payment',
    'in_progress',
    'completed',
    'canceled',
    'not_ready_for_payment',
  ];

  it('should produce valid evidence for all 7 session states', () => {
    for (const state of ALL_STATES) {
      const event = makeSessionEvent(state);
      const result = fromACPSessionLifecycleEvent(event);

      expect(result.subject_uri).toBe('https://shop.example.com/checkout/abc123');
      expect(result.payment.rail).toBe('acp');
      expect(result.payment.reference).toBe('sess_abc123');
      expect(result.payment.evidence).toBeDefined();

      const evidence = result.payment.evidence as Record<string, unknown>;
      expect(evidence.acp_session_state).toBe(state);
    }
  });

  it('should produce access evidence, NOT commerce evidence for "completed"', () => {
    const event = makeSessionEvent('completed');
    const result = fromACPSessionLifecycleEvent(event);

    // Access evidence: rail is 'acp', amount is 0, currency is 'NONE'
    expect(result.payment.rail).toBe('acp');
    expect(result.amt).toBe(0);
    expect(result.cur).toBe('NONE');

    // No commerce event in evidence
    const evidence = result.payment.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBeUndefined();
  });

  it('should produce access evidence, NOT commerce evidence for "canceled"', () => {
    const event = makeSessionEvent('canceled');
    const result = fromACPSessionLifecycleEvent(event);

    expect(result.payment.rail).toBe('acp');
    expect(result.amt).toBe(0);
    const evidence = result.payment.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBeUndefined();
  });

  it('should include delegated_payment_ref when present', () => {
    const event = makeSessionEvent('ready_for_payment', {
      delegated_payment_ref: 'spt_tok_abc',
    });
    const result = fromACPSessionLifecycleEvent(event);

    const evidence = result.payment.evidence as Record<string, unknown>;
    expect(evidence.delegated_payment_ref).toBe('spt_tok_abc');
  });

  it('should include timestamps when present', () => {
    const event = makeSessionEvent('created', {
      created_at: '2025-01-15T12:00:00Z',
    });
    const result = fromACPSessionLifecycleEvent(event);

    const evidence = result.payment.evidence as Record<string, unknown>;
    expect(evidence.created_at).toBe('2025-01-15T12:00:00Z');
  });

  it('should reject missing session_id', () => {
    const event = makeSessionEvent('created', { session_id: '' });
    expect(() => fromACPSessionLifecycleEvent(event)).toThrow(/session_id/);
  });

  it('should reject invalid resource_uri', () => {
    const event = makeSessionEvent('created', { resource_uri: 'http://insecure.com' });
    expect(() => fromACPSessionLifecycleEvent(event)).toThrow(/resource_uri/);
  });
});

// ---------------------------------------------------------------------------
// A/B Regression Pair: session completed with/without payment artifact
// ---------------------------------------------------------------------------

describe('session completed: A/B semantic boundary', () => {
  it('A: session completed WITHOUT payment artifact remains access/session evidence', () => {
    const event = makeSessionEvent('completed');
    const result = fromACPSessionLifecycleEvent(event);

    expect(result.payment.rail).toBe('acp');
    expect(result.amt).toBe(0);
    expect(result.cur).toBe('NONE');
    const evidence = result.payment.evidence as Record<string, unknown>;
    expect(evidence.acp_session_state).toBe('completed');
    expect(evidence.commerce_event).toBeUndefined();
    expect(evidence.observed_payment_state).toBeUndefined();
  });

  it('B: session completed WITH payment artifact produces commerce evidence from observed_payment_state', () => {
    const event = makeSessionEvent('completed');
    const artifact = makePaymentArtifact({ observed_payment_state: 'settled' });
    const result = fromACPPaymentObservation(event, artifact);

    expect(result.payment.rail).toBe('stripe');
    expect(result.amt).toBe(1000);
    expect(result.cur).toBe('USD');
    const evidence = result.payment.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBe('settlement');
    expect(evidence.observed_payment_state).toBe('settled');
    expect(evidence.acp_session_state).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// fromACPPaymentObservation
// ---------------------------------------------------------------------------

describe('fromACPPaymentObservation', () => {
  it('should produce commerce evidence for "settled" payment', () => {
    const event = makeSessionEvent('completed');
    const artifact = makePaymentArtifact({ observed_payment_state: 'settled' });

    const result = fromACPPaymentObservation(event, artifact);

    expect(result.payment.rail).toBe('stripe');
    expect(result.payment.reference).toBe('pi_xyz789');
    expect(result.amt).toBe(1000);
    expect(result.cur).toBe('USD');

    const evidence = result.payment.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBe('settlement');
    expect(evidence.observed_payment_state).toBe('settled');
  });

  it('should produce commerce "authorization" for "authorized" payment', () => {
    const event = makeSessionEvent('in_progress');
    const artifact = makePaymentArtifact({ observed_payment_state: 'authorized' });

    const result = fromACPPaymentObservation(event, artifact);

    const evidence = result.payment.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBe('authorization');
  });

  it('should produce commerce "capture" for "captured" payment', () => {
    const event = makeSessionEvent('in_progress');
    const artifact = makePaymentArtifact({ observed_payment_state: 'captured' });

    const result = fromACPPaymentObservation(event, artifact);

    const evidence = result.payment.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBe('capture');
  });

  it('should produce commerce "refund" for "refunded" payment', () => {
    const event = makeSessionEvent('completed');
    const artifact = makePaymentArtifact({ observed_payment_state: 'refunded' });

    const result = fromACPPaymentObservation(event, artifact);

    const evidence = result.payment.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBe('refund');
  });

  it('should NOT produce commerce event for "attempted" payment', () => {
    const event = makeSessionEvent('in_progress');
    const artifact = makePaymentArtifact({ observed_payment_state: 'attempted' });

    const result = fromACPPaymentObservation(event, artifact);

    const evidence = result.payment.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBeUndefined();
    expect(evidence.observed_payment_state).toBe('attempted');
  });

  it('should NOT produce commerce event for "failed" payment', () => {
    const event = makeSessionEvent('canceled');
    const artifact = makePaymentArtifact({ observed_payment_state: 'failed' });

    const result = fromACPPaymentObservation(event, artifact);

    const evidence = result.payment.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBeUndefined();
    expect(evidence.observed_payment_state).toBe('failed');
  });

  it('should derive commerce event from payment state, NOT session state', () => {
    // Session is "created" (early state) but payment artifact says "settled"
    const event = makeSessionEvent('created');
    const artifact = makePaymentArtifact({ observed_payment_state: 'settled' });

    const result = fromACPPaymentObservation(event, artifact);

    const evidence = result.payment.evidence as Record<string, unknown>;
    expect(evidence.commerce_event).toBe('settlement');
    expect(evidence.acp_session_state).toBe('created');
  });

  it('should reject missing payment artifact rail', () => {
    const event = makeSessionEvent('completed');
    const artifact = makePaymentArtifact({ rail: '' });

    expect(() => fromACPPaymentObservation(event, artifact)).toThrow(/rail/);
  });

  it('should reject missing observed_payment_state', () => {
    const event = makeSessionEvent('completed');
    const artifact = { ...makePaymentArtifact(), observed_payment_state: '' as never };

    expect(() => fromACPPaymentObservation(event, artifact)).toThrow(/observed_payment_state/);
  });
});

// ---------------------------------------------------------------------------
// fromACPCapabilitySnapshot
// ---------------------------------------------------------------------------

describe('fromACPCapabilitySnapshot', () => {
  it('should create an audit snapshot', () => {
    const snapshot = fromACPCapabilitySnapshot({
      session_id: 'sess_abc',
      seller_capabilities: { shipping: true },
      buyer_capabilities: { payment_methods: ['card'] },
      negotiated: { shipping: true },
    });

    expect(snapshot.session_id).toBe('sess_abc');
    expect(snapshot.seller_capabilities).toEqual({ shipping: true });
    expect(snapshot.buyer_capabilities).toEqual({ payment_methods: ['card'] });
    expect(snapshot.negotiated).toEqual({ shipping: true });
    expect(snapshot.snapshot_at).toBeTruthy();
  });

  it('should use null for missing capabilities', () => {
    const snapshot = fromACPCapabilitySnapshot({ session_id: 'sess_abc' });

    expect(snapshot.seller_capabilities).toBeNull();
    expect(snapshot.buyer_capabilities).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fromACPInterventionRequired
// ---------------------------------------------------------------------------

describe('fromACPInterventionRequired', () => {
  it('should produce challenge-kind evidence', () => {
    const result = fromACPInterventionRequired({
      session_id: 'sess_abc',
      resource_uri: 'https://shop.example.com/checkout/abc',
      type: 'identity_verification',
      reason: 'Age verification required',
    });

    expect(result.subject_uri).toBe('https://shop.example.com/checkout/abc');
    expect(result.payment.rail).toBe('acp');

    const evidence = result.payment.evidence as Record<string, unknown>;
    expect(evidence.intervention_type).toBe('identity_verification');
    expect(evidence.reason).toBe('Age verification required');
  });

  it('should reject missing session_id', () => {
    expect(() =>
      fromACPInterventionRequired({
        session_id: '',
        resource_uri: 'https://shop.example.com/x',
        type: 'test',
      })
    ).toThrow(/session_id/);
  });
});

// ---------------------------------------------------------------------------
// fromACPCheckoutSuccess regression on the amount_minor + env contract
// ---------------------------------------------------------------------------

describe('fromACPCheckoutSuccess (regression)', () => {
  it('should accept the canonical amount_minor + env shape', () => {
    const result = fromACPCheckoutSuccess({
      checkout_id: 'chk_123',
      resource_uri: 'https://shop.example.com/order/123',
      amount_minor: '2500',
      currency: 'USD',
      payment_rail: 'stripe',
      payment_reference: 'pi_abc',
      env: 'live',
    });

    expect(result.subject_uri).toBe('https://shop.example.com/order/123');
    expect(result.amt).toBe(2500);
    expect(result.cur).toBe('USD');
    expect(result.payment.rail).toBe('stripe');
    expect(result.payment.reference).toBe('pi_abc');
    expect(result.payment.env).toBe('live');
  });
});

// ---------------------------------------------------------------------------
// Hardened resource_uri validation across all session paths
// ---------------------------------------------------------------------------

describe('resource_uri hardening: fromACPSessionLifecycleEvent', () => {
  it('accepts a well-formed https URL', () => {
    expect(() =>
      fromACPSessionLifecycleEvent(
        makeSessionEvent('created', { resource_uri: 'https://example.com/resource' })
      )
    ).not.toThrow();
  });

  it('rejects http://', () => {
    expect(() =>
      fromACPSessionLifecycleEvent(
        makeSessionEvent('created', { resource_uri: 'http://example.com/resource' })
      )
    ).toThrow(/resource_uri/);
  });

  it('rejects "https://" with no hostname', () => {
    expect(() =>
      fromACPSessionLifecycleEvent(makeSessionEvent('created', { resource_uri: 'https://' }))
    ).toThrow(/resource_uri/);
  });

  it('rejects opaque-path "https:example.com"', () => {
    expect(() =>
      fromACPSessionLifecycleEvent(
        makeSessionEvent('created', { resource_uri: 'https:example.com' })
      )
    ).toThrow(/resource_uri/);
  });

  it('rejects credential-bearing https URL (user:pass@)', () => {
    expect(() =>
      fromACPSessionLifecycleEvent(
        makeSessionEvent('created', { resource_uri: 'https://user:pass@example.com/resource' })
      )
    ).toThrow(/resource_uri/);
  });

  it('rejects username-only credential https URL (user@)', () => {
    expect(() =>
      fromACPSessionLifecycleEvent(
        makeSessionEvent('created', { resource_uri: 'https://user@example.com/resource' })
      )
    ).toThrow(/resource_uri/);
  });
});

describe('resource_uri hardening: fromACPPaymentObservation', () => {
  it('accepts a well-formed https URL', () => {
    const event = makeSessionEvent('completed', { resource_uri: 'https://example.com/order/1' });
    expect(() => fromACPPaymentObservation(event, makePaymentArtifact())).not.toThrow();
  });

  it('rejects http://', () => {
    const event = makeSessionEvent('completed', { resource_uri: 'http://example.com/order/1' });
    expect(() => fromACPPaymentObservation(event, makePaymentArtifact())).toThrow(/resource_uri/);
  });

  it('rejects "https://" with no hostname', () => {
    const event = makeSessionEvent('completed', { resource_uri: 'https://' });
    expect(() => fromACPPaymentObservation(event, makePaymentArtifact())).toThrow(/resource_uri/);
  });

  it('rejects opaque-path "https:example.com"', () => {
    const event = makeSessionEvent('completed', { resource_uri: 'https:example.com' });
    expect(() => fromACPPaymentObservation(event, makePaymentArtifact())).toThrow(/resource_uri/);
  });

  it('rejects credential-bearing https URL (user:pass@)', () => {
    const event = makeSessionEvent('completed', {
      resource_uri: 'https://user:pass@example.com/order/1',
    });
    expect(() => fromACPPaymentObservation(event, makePaymentArtifact())).toThrow(/resource_uri/);
  });

  it('rejects username-only credential https URL (user@)', () => {
    const event = makeSessionEvent('completed', {
      resource_uri: 'https://user@example.com/order/1',
    });
    expect(() => fromACPPaymentObservation(event, makePaymentArtifact())).toThrow(/resource_uri/);
  });
});

describe('resource_uri hardening: fromACPInterventionRequired', () => {
  const base = {
    session_id: 'sess_abc',
    type: 'identity_verification',
  };

  it('accepts a well-formed https URL', () => {
    expect(() =>
      fromACPInterventionRequired({ ...base, resource_uri: 'https://example.com/resource' })
    ).not.toThrow();
  });

  it('rejects http://', () => {
    expect(() =>
      fromACPInterventionRequired({ ...base, resource_uri: 'http://example.com/resource' })
    ).toThrow(/resource_uri/);
  });

  it('rejects "https://" with no hostname', () => {
    expect(() => fromACPInterventionRequired({ ...base, resource_uri: 'https://' })).toThrow(
      /resource_uri/
    );
  });

  it('rejects opaque-path "https:example.com"', () => {
    expect(() =>
      fromACPInterventionRequired({ ...base, resource_uri: 'https:example.com' })
    ).toThrow(/resource_uri/);
  });

  it('rejects credential-bearing https URL (user:pass@)', () => {
    expect(() =>
      fromACPInterventionRequired({
        ...base,
        resource_uri: 'https://user:pass@example.com/resource',
      })
    ).toThrow(/resource_uri/);
  });

  it('rejects username-only credential https URL (user@)', () => {
    expect(() =>
      fromACPInterventionRequired({ ...base, resource_uri: 'https://user@example.com/resource' })
    ).toThrow(/resource_uri/);
  });
});

// ---------------------------------------------------------------------------
// paymentArtifact.amount safe-integer guard (fromACPPaymentObservation)
// ---------------------------------------------------------------------------

describe('fromACPPaymentObservation: paymentArtifact.amount safe-integer guard', () => {
  it('accepts 1000', () => {
    const event = makeSessionEvent('completed');
    const artifact = makePaymentArtifact({ amount: 1000 });
    expect(() => fromACPPaymentObservation(event, artifact)).not.toThrow();
  });

  it('accepts Number.MAX_SAFE_INTEGER', () => {
    const event = makeSessionEvent('completed');
    const artifact = makePaymentArtifact({ amount: Number.MAX_SAFE_INTEGER });
    expect(() => fromACPPaymentObservation(event, artifact)).not.toThrow();
  });

  it('accepts 0', () => {
    const event = makeSessionEvent('completed');
    const artifact = makePaymentArtifact({ amount: 0 });
    expect(() => fromACPPaymentObservation(event, artifact)).not.toThrow();
  });

  it('rejects 12.34 (non-integer)', () => {
    const event = makeSessionEvent('completed');
    const artifact = makePaymentArtifact({ amount: 12.34 });
    expect(() => fromACPPaymentObservation(event, artifact)).toThrow(/safe integer/);
  });

  it('rejects Number.MAX_SAFE_INTEGER + 1', () => {
    const event = makeSessionEvent('completed');
    const artifact = makePaymentArtifact({ amount: Number.MAX_SAFE_INTEGER + 1 });
    expect(() => fromACPPaymentObservation(event, artifact)).toThrow(/safe integer/);
  });

  it('rejects Infinity', () => {
    const event = makeSessionEvent('completed');
    const artifact = makePaymentArtifact({ amount: Infinity });
    expect(() => fromACPPaymentObservation(event, artifact)).toThrow(/safe integer/);
  });

  it('rejects -Infinity', () => {
    const event = makeSessionEvent('completed');
    const artifact = makePaymentArtifact({ amount: -Infinity });
    expect(() => fromACPPaymentObservation(event, artifact)).toThrow(/safe integer/);
  });

  it('rejects NaN', () => {
    const event = makeSessionEvent('completed');
    const artifact = makePaymentArtifact({ amount: NaN });
    expect(() => fromACPPaymentObservation(event, artifact)).toThrow(/safe integer/);
  });
});
