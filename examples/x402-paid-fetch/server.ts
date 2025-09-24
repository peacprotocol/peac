import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createHash } from 'node:crypto';
import { Problems } from '@peac/core/problems';
import { createReceipt, signReceipt } from '@peac/receipts/serialize';
import { validatePaymentHeader } from '@peac/core/limits';

const app = new Hono();

// Mock facilitator responses
const mockFacilitator = {
  verify: async (paymentHeader: string) => ({
    isValid: true,
    payer: '0x1234567890123456789012345678901234567890',
    ts: new Date().toISOString(),
  }),
  settle: async () => ({
    txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    networkId: 'base-mainnet',
  }),
};

// Test keys (DO NOT use in production)
const testPrivateKey = new Uint8Array(32).fill(0x42);
const testKid = 'test-key-2025';

app.use('*', (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT');
  c.header('Access-Control-Expose-Headers', 'PEAC-Receipt, Link');
  return next();
});

app.options('*', (c) => c.text(''));

// Paid resource endpoint
app.get('/paid-content', async (c) => {
  const paymentHeader = c.req.header('X-PAYMENT');

  try {
    // Validate header size
    validatePaymentHeader(paymentHeader);

    if (!paymentHeader) {
      // Return 402 Payment Required
      const problem = Problems.paymentRequired('x402', 'base-mainnet', '1000000');
      return c.json(problem, 402, {
        'Content-Type': 'application/problem+json',
        'Retry-After': '0',
      });
    }

    // Verify payment
    const verification = await mockFacilitator.verify(paymentHeader);
    if (!verification.isValid) {
      const problem = Problems.invalidReceipt('Payment verification failed');
      return c.json(problem, 400, {
        'Content-Type': 'application/problem+json',
      });
    }

    // Settle payment
    const settlement = await mockFacilitator.settle();

    // Create content
    const content = {
      message: 'This is premium content!',
      access_tier: 'premium',
      timestamp: new Date().toISOString(),
    };

    // Create receipt
    const receipt = createReceipt({
      iss: 'https://demo.x402-server.com',
      resource_url: 'https://demo.x402-server.com/paid-content',
      resource_hash: createHash('sha256').update(JSON.stringify(content)).digest('base64url'),
      policy_href: 'https://demo.x402-server.com/.well-known/aipref.json',
      policy_hash: createHash('sha256').update('{"payment_required":true}').digest('base64url'),
      merged_policy_hash: createHash('sha256').update('{"merged":true}').digest('base64url'),
      method: 'GET',
      payment: {
        scheme: 'x402',
        network: 'base-mainnet',
        evidence: {
          header_b64url: Buffer.from(paymentHeader).toString('base64url'),
        },
        facilitator: {
          verify: verification,
          settle: settlement,
        },
      },
    });

    // Sign receipt
    const receiptJWS = await signReceipt(receipt, testPrivateKey, testKid);

    return c.json(content, 200, {
      'Content-Type': 'application/json',
      'PEAC-Receipt': receiptJWS,
      'Cache-Control': 'private, no-store',
    });
  } catch (error: any) {
    const problem = Problems.invalidReceipt(error.message);
    return c.json(problem, 400, {
      'Content-Type': 'application/problem+json',
    });
  }
});

// Policy discovery endpoint
app.get('/.well-known/aipref.json', (c) => {
  return c.json({
    version: '1.0',
    policies: {
      '/paid-content': {
        payment_required: true,
        schemes: ['x402'],
        amount: '1000000',
        currency: 'wei',
      },
    },
  });
});

// Health check
app.get('/health', (c) => c.json({ ok: true }));

console.log('Starting x402 demo server on port 8080...');
console.log('Try: curl http://localhost:8080/paid-content');
console.log('Then: curl -H "X-PAYMENT: {test_payment}" http://localhost:8080/paid-content');

serve({
  fetch: app.fetch,
  port: 8080,
});
