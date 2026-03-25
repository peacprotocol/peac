/**
 * ACP session lifecycle evidence example.
 *
 * Demonstrates the semantic boundary: session states produce access
 * evidence; commerce evidence only from explicit payment artifacts.
 *
 * Run: npx tsx examples/acp-session-lifecycle/demo.ts
 */

import {
  fromACPSessionLifecycleEvent,
  fromACPPaymentObservation,
  fromACPCapabilitySnapshot,
} from '@peac/mappings-acp';

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

console.log('=== ACP Session Lifecycle Evidence Demo ===\n');

// 1. Session completed WITHOUT payment artifact (access evidence only)
console.log('--- Session completed (no payment artifact) ---');
const sessionEvidence = fromACPSessionLifecycleEvent({
  session_id: 'sess_demo_001',
  state: 'completed',
  resource_uri: 'https://shop.example.com/checkout/demo001',
  delegated_payment_ref: 'spt_tok_demo',
  created_at: '2025-06-01T12:00:00Z',
  updated_at: '2025-06-01T12:05:00Z',
});

console.log('Rail:', sessionEvidence.payment.rail);
console.log('Amount:', sessionEvidence.amt, '(0 = no payment claim)');
console.log('Currency:', sessionEvidence.cur, '(NONE = no payment claim)');
const sessEv = sessionEvidence.payment.evidence as Record<string, unknown>;
console.log('Session state:', sessEv.acp_session_state);
console.log('Commerce event:', sessEv.commerce_event ?? '(none)');
console.log();

// 2. Session completed WITH payment artifact (commerce evidence)
console.log('--- Session completed (with payment artifact) ---');
const paymentEvidence = fromACPPaymentObservation(
  {
    session_id: 'sess_demo_001',
    state: 'completed',
    resource_uri: 'https://shop.example.com/checkout/demo001',
  },
  {
    rail: 'stripe',
    reference: 'pi_demo_settled',
    amount: 2500,
    currency: 'USD',
    observed_payment_state: 'settled',
  }
);

console.log('Rail:', paymentEvidence.payment.rail);
console.log('Amount:', paymentEvidence.amt);
console.log('Currency:', paymentEvidence.cur);
const payEv = paymentEvidence.payment.evidence as Record<string, unknown>;
console.log('Session state:', payEv.acp_session_state);
console.log('Commerce event:', payEv.commerce_event);
console.log('Observed payment state:', payEv.observed_payment_state);
console.log();

// 3. Capability snapshot for audit
console.log('--- Capability snapshot ---');
const snapshot = fromACPCapabilitySnapshot({
  session_id: 'sess_demo_001',
  seller_capabilities: { shipping: true, returns: true },
  buyer_capabilities: { payment_methods: ['card', 'spt'] },
  negotiated: { shipping: true },
});
console.log('Snapshot:', JSON.stringify(snapshot, null, 2));
console.log();

console.log('=== Done ===');
