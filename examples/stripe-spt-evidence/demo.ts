/**
 * Stripe SPT delegation evidence example.
 *
 * Demonstrates delegation-specific vocabulary: SPT grant/use/deactivate
 * are delegation events, not payment finality. Only PaymentIntent
 * observation produces commerce events.
 *
 * Run: npx tsx examples/stripe-spt-evidence/demo.ts
 */

import {
  fromSPTGrant,
  fromSPTUse,
  fromSPTDeactivate,
  fromStripePaymentIntentObservation,
} from '@peac/rails-stripe';

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

console.log('=== Stripe SPT Delegation Evidence Demo ===\n');

// 1. SPT Grant (delegation, no commerce event)
console.log('--- SPT Grant ---');
const grantEvidence = fromSPTGrant({
  id: 'spt_grant_demo',
  token_id: 'spt_tok_demo',
  seller_scope: { merchant_id: 'merch_demo' },
  amount_limit: '10000',
  currency: 'usd',
  expires_at: '2025-06-02T00:00:00Z',
});
const grantMeta = grantEvidence.evidence as Record<string, unknown>;
console.log('Action:', grantMeta.spt_action);
console.log('Rail:', grantEvidence.rail);
console.log('Commerce event:', grantMeta.commerce_event ?? '(none - delegation act)');
console.log();

// 2. SPT Use (delegation, no commerce event even with PI ref)
console.log('--- SPT Use (with PaymentIntent reference) ---');
const useEvidence = fromSPTUse({
  id: 'spt_use_demo',
  token_id: 'spt_tok_demo',
  amount: '5000',
  currency: 'usd',
  merchant_id: 'merch_demo',
  payment_intent_id: 'pi_demo_abc',
});
const useMeta = useEvidence.evidence as Record<string, unknown>;
console.log('Action:', useMeta.spt_action);
console.log('PI reference:', useMeta.payment_intent_id);
console.log('Commerce event:', useMeta.commerce_event ?? '(none - PI ref != authorization)');
console.log();

// 3. PaymentIntent Observation (commerce event: settlement)
console.log('--- PaymentIntent Observation (succeeded) ---');
const piEvidence = fromStripePaymentIntentObservation({
  payment_intent_id: 'pi_demo_abc',
  status: 'succeeded',
  amount: '5000',
  currency: 'usd',
});
const piMeta = piEvidence.evidence as Record<string, unknown>;
console.log('PI status:', piMeta.payment_intent_status);
console.log('Commerce event:', piMeta.commerce_event, '(only from PI observation)');
console.log('Amount:', piEvidence.amount);
console.log();

// 4. SPT Deactivate (delegation, not void)
console.log('--- SPT Deactivate ---');
const deactEvidence = fromSPTDeactivate({
  id: 'spt_deact_demo',
  token_id: 'spt_tok_demo',
  reason: 'expired',
});
const deactMeta = deactEvidence.evidence as Record<string, unknown>;
console.log('Action:', deactMeta.spt_action);
console.log('Commerce event:', deactMeta.commerce_event ?? '(none - not a void)');
console.log();

console.log('=== Done ===');
