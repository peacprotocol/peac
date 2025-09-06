/**
 * @peac/402/negotiator - Test payment rail negotiation with x402-first
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { PaymentNegotiator, X402MockAdapter, TempoMockAdapter, L402MockAdapter, StripeMockAdapter } from '../dist/negotiator.js';

test('parseAcceptPayments - defaults to production order', () => {
  const negotiator = new PaymentNegotiator();
  
  const productionRails = negotiator.parseAcceptPayments();
  assert.deepStrictEqual(productionRails, ['x402', 'l402']);
  
  const devRails = negotiator.parseAcceptPayments(undefined, true);
  assert.deepStrictEqual(devRails, ['x402', 'tempo', 'l402']);
});

test('parseAcceptPayments - respects quality factors but x402 wins ties', () => {
  const negotiator = new PaymentNegotiator();
  
  const rails = negotiator.parseAcceptPayments('stripe;q=0.8, l402;q=1.0, x402;q=1.0');
  assert.deepStrictEqual(rails, ['x402', 'l402', 'stripe']);
});

test('parseAcceptPayments - allows explicit preference override', () => {
  const negotiator = new PaymentNegotiator();
  
  const rails = negotiator.parseAcceptPayments('l402;q=1.0, x402;q=0.5, stripe;q=0.3');
  assert.deepStrictEqual(rails, ['l402', 'x402', 'stripe']);
});

test('negotiate - x402 appears first in challenges', async () => {
  const negotiator = new PaymentNegotiator();
  negotiator.register(new X402MockAdapter());
  negotiator.register(new TempoMockAdapter());
  negotiator.register(new L402MockAdapter());
  negotiator.register(new StripeMockAdapter());
  
  const ctx = {
    acceptedRails: ['stripe', 'tempo', 'l402', 'x402'], // Intentionally wrong order
    amount: { value: '0.001', currency: 'USD' }
  };
  
  const challenges = await negotiator.negotiate(ctx);
  assert.strictEqual(challenges.length, 3); // x402, tempo, and stripe support USD
  assert.strictEqual(challenges[0].rail, 'x402');
});

test('verify - delegates to correct adapter', async () => {
  const negotiator = new PaymentNegotiator();
  negotiator.register(new X402MockAdapter());
  
  const evidence = await negotiator.verify('x402', 'challenge_123', 'x402_proof_abc');
  assert.strictEqual(evidence.rail, 'x402');
  assert.deepStrictEqual(evidence.provider_ids, ['x402_proof_abc']);
});

test('adapter capabilities - x402 supports USD/USDC', () => {
  const adapter = new X402MockAdapter();
  
  assert.strictEqual(adapter.supports({ acceptedRails: [], amount: { value: '1', currency: 'USD' } }), true);
  assert.strictEqual(adapter.supports({ acceptedRails: [], amount: { value: '1', currency: 'USDC' } }), true);
  assert.strictEqual(adapter.supports({ acceptedRails: [], amount: { value: '1', currency: 'BTC' } }), false);
});

test('adapter capabilities - L402 supports BTC/free', () => {
  const adapter = new L402MockAdapter();
  
  assert.strictEqual(adapter.supports({ acceptedRails: [], amount: { value: '0', currency: 'USD' } }), true);
  assert.strictEqual(adapter.supports({ acceptedRails: [], amount: { value: '1', currency: 'BTC' } }), true);
  assert.strictEqual(adapter.supports({ acceptedRails: [], amount: { value: '1', currency: 'USD' } }), false);
});

test('adapter capabilities - Tempo supports USD/USDC', () => {
  const adapter = new TempoMockAdapter();
  
  assert.strictEqual(adapter.supports({ acceptedRails: [], amount: { value: '1', currency: 'USD' } }), true);
  assert.strictEqual(adapter.supports({ acceptedRails: [], amount: { value: '1', currency: 'USDC' } }), true);
  assert.strictEqual(adapter.supports({ acceptedRails: [], amount: { value: '1', currency: 'BTC' } }), false);
});

test('rail parity - Tempo verification works like x402', async () => {
  const negotiator = new PaymentNegotiator();
  negotiator.register(new TempoMockAdapter());
  
  const evidence = await negotiator.verify('tempo', 'challenge_123', 'tempo:tx:0xabc123,tempo:chain:tempo-testnet');
  assert.strictEqual(evidence.rail, 'tempo');
  assert(evidence.provider_ids.includes('tempo:tx:0xabc123'));
  assert(evidence.provider_ids.includes('tempo:chain:tempo-testnet'));
});

test('negotiation - client can prefer Tempo over x402', () => {
  const negotiator = new PaymentNegotiator();
  
  const rails = negotiator.parseAcceptPayments('tempo;q=1.0, x402;q=0.8');
  assert.deepStrictEqual(rails, ['tempo', 'x402']);
});