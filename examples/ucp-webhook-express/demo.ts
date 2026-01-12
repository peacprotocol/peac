/**
 * UCP Webhook Demo Script
 *
 * Sends a mock UCP order webhook to the local server.
 * Demonstrates signature verification and receipt issuance.
 *
 * Prerequisites:
 * 1. Start the server: pnpm start
 * 2. Run this demo: pnpm demo
 */

import * as crypto from 'node:crypto';

// Server configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

// Demo EC keypair (P-256 curve for ES256)
// In production, this would be the business's signing key
const DEMO_PRIVATE_KEY = crypto.createPrivateKey({
  key: {
    kty: 'EC',
    crv: 'P-256',
    x: 'WbbYvAT6hxoZn-zSA7h3JXQlTFGPMCx2MxZ2SjCNrYo',
    y: 'JWYUg4z0JJyIOl2lKN3JCB6HWBGtS-31X7WQWFZ7OTI',
    d: 'uFZ3pQlcyf4oCK2I9qZm9r3vJ9hCfTX2_F3yVl5QYQI',
  },
  format: 'jwk',
});

/**
 * Create a detached JWS signature for UCP webhook
 */
function signDetachedJws(payload: Buffer, kid: string): string {
  // Create protected header
  const header = {
    alg: 'ES256',
    kid,
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = payload.toString('base64url');

  // Create signing input
  const signingInput = `${headerB64}.${payloadB64}`;

  // Sign with ES256
  // IMPORTANT: Use 'ieee-p1363' dsaEncoding for JWS-compatible signatures
  // Default is 'der' which produces DER-encoded signatures, but JWS ES256/384/512
  // requires raw R||S concatenation (IEEE P1363 format)
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: DEMO_PRIVATE_KEY,
    dsaEncoding: 'ieee-p1363',
  });
  const signatureB64 = signature.toString('base64url');

  // Return detached JWS (empty payload section)
  return `${headerB64}..${signatureB64}`;
}

/**
 * Mock UCP order data
 */
const mockOrder = {
  id: 'order_demo_12345',
  checkout_id: 'checkout_demo_67890',
  permalink_url: 'https://demo.business.example.com/orders/demo_12345',
  line_items: [
    {
      id: 'li_product_001',
      item: {
        id: 'prod_running_shoes',
        title: 'Running Shoes - Size 10',
        price: 9999, // $99.99 in cents
      },
      quantity: {
        total: 1,
        fulfilled: 0,
      },
      status: 'processing',
    },
    {
      id: 'li_product_002',
      item: {
        id: 'prod_sports_socks',
        title: 'Sports Socks - 3 Pack',
        price: 1499, // $14.99 in cents
      },
      quantity: {
        total: 2,
        fulfilled: 0,
      },
      status: 'processing',
    },
  ],
  totals: [
    { type: 'subtotal', amount: 12497 }, // $124.97
    { type: 'shipping', amount: 799 }, // $7.99
    { type: 'tax', amount: 1000 }, // $10.00
    { type: 'total', amount: 14296 }, // $142.96
  ],
};

/**
 * Mock UCP webhook payload
 */
const webhookPayload = {
  event_type: 'order.created',
  timestamp: new Date().toISOString(),
  order: mockOrder,
};

async function main() {
  console.log('UCP Webhook Demo');
  console.log('================');
  console.log('');

  // Serialize payload
  const payloadJson = JSON.stringify(webhookPayload);
  const payloadBytes = Buffer.from(payloadJson);

  console.log('1. Creating mock order webhook payload');
  console.log('   Event type:', webhookPayload.event_type);
  console.log('   Order ID:', mockOrder.id);
  console.log(
    '   Total amount:',
    mockOrder.totals.find((t) => t.type === 'total')?.amount,
    'cents'
  );
  console.log('');

  // Sign the payload
  console.log('2. Signing payload with ES256 (detached JWS)');
  const signature = signDetachedJws(payloadBytes, 'demo-key-001');
  console.log('   Request-Signature:', signature.substring(0, 50) + '...');
  console.log('');

  // Send webhook
  console.log('3. Sending webhook to server');
  console.log('   URL:', `${SERVER_URL}/webhooks/ucp/orders`);
  console.log('');

  try {
    const response = await fetch(`${SERVER_URL}/webhooks/ucp/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Request-Signature': signature,
      },
      body: payloadJson,
    });

    const result = await response.json();

    console.log('4. Server response');
    console.log('   Status:', response.status);
    console.log('   Body:', JSON.stringify(result, null, 2));
    console.log('');

    if (response.ok) {
      console.log('SUCCESS: Webhook processed and PEAC receipt issued');
      console.log('');
      console.log('Receipt details:');
      console.log('  ID:', result.receipt_id);
      console.log('  Order:', result.order_id);
      console.log('  Event:', result.event_type);
    } else {
      console.log('ERROR: Webhook processing failed');
      console.log('  Code:', result.error);
      console.log('  Message:', result.message);
    }
  } catch (error) {
    console.error('ERROR: Failed to send webhook');
    console.error(error);
    console.log('');
    console.log('Make sure the server is running: pnpm start');
  }
}

main().catch(console.error);
