/**
 * @peac/402/handler - Test HTTP 402 response generation
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { create402Response, Http402Handler } from '../dist/handler.js';
import { PaymentNegotiator, X402MockAdapter } from '../dist/negotiator.js';

test('create402Response - generates RFC 9457 compliant response', async () => {
  const response = await create402Response(
    { value: '0.001', currency: 'USD' },
    'x402, stripe',
    '/api/resource/123',
  );

  assert.strictEqual(response.status, 402);
  assert.strictEqual(response.headers['Content-Type'], 'application/problem+json');
  assert.strictEqual(response.body.type, 'https://www.rfc-editor.org/rfc/rfc9110.html#status.402');
  assert.strictEqual(response.body.title, 'Payment Required');
  assert.strictEqual(response.body.instance, '/api/resource/123');
  assert(response.body.detail.includes('0.001 USD'));
});

test('create402Response - includes payment challenges', async () => {
  const response = await create402Response({ value: '0.001', currency: 'USD' });

  assert(Array.isArray(response.body['accept-payment']));
  assert(response.body['accept-payment'].length > 0);

  const x402Challenge = response.body['accept-payment'].find((c) => c.rail === 'x402');
  assert(x402Challenge);
  assert.strictEqual(x402Challenge.amount.value, '0.001');
  assert.strictEqual(x402Challenge.amount.currency, 'USD');
});

test('create402Response - sets payment headers', async () => {
  const response = await create402Response({ value: '0.05', currency: 'USD' });

  assert(response.headers['WWW-Authenticate'].includes('Bearer'));
  assert(response.headers['Accept-Payment'].includes('x402'));
  assert.strictEqual(response.headers['X-Payment-Amount'], '0.05 USD');
});

test('Http402Handler - parsePaymentHeader', async () => {
  const negotiator = new PaymentNegotiator();
  const handler = new Http402Handler(negotiator);

  const parsed1 = handler.parsePaymentHeader('x402 proof_abc123');
  assert.deepStrictEqual(parsed1, { rail: 'x402', evidence: 'proof_abc123' });

  const parsed2 = handler.parsePaymentHeader('Bearer x402 evidence_xyz');
  assert.deepStrictEqual(parsed2, { rail: 'x402', evidence: 'evidence_xyz' });

  const parsed3 = handler.parsePaymentHeader('x402_standalone_token');
  assert.deepStrictEqual(parsed3, {
    rail: 'x402_standalone_token',
    evidence: 'x402_standalone_token',
  });

  const parsed4 = handler.parsePaymentHeader('');
  assert.strictEqual(parsed4, null);
});

test('Http402Handler - verifyPayment integration', async () => {
  const negotiator = new PaymentNegotiator();
  negotiator.register(new X402MockAdapter());

  const handler = new Http402Handler(negotiator);

  const evidence = await handler.verifyPayment('x402 x402_proof_valid');
  assert.strictEqual(evidence.rail, 'x402');
  assert.deepStrictEqual(evidence.provider_ids, ['x402_proof_valid']);

  const invalid = await handler.verifyPayment('x402 invalid_proof');
  assert.strictEqual(invalid, null);
});
