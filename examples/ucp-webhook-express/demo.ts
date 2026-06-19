/**
 * UCP Webhook Demo Script
 *
 * Sends a mock UCP order webhook to the local server, signed with the current UCP
 * signing model: an RFC 9421 HTTP Message Signature (`Signature-Input` /
 * `Signature`) plus an RFC 9530 `Content-Digest` over the raw body bytes.
 * Demonstrates signature verification and receipt issuance, then a tamper case.
 *
 * Prerequisites:
 * 1. Start the server: pnpm start
 * 2. Run this demo: pnpm demo
 *
 * The signature base is built with `@peac/http-signatures` (the same RFC 9421
 * mechanics the verifier uses), so the signer and verifier cannot drift. PEAC
 * verifies the result with `verifyUcpHttpSignature`.
 */

import * as crypto from 'node:crypto';
import {
  buildSignatureBase,
  signatureBaseToBytes,
  type ParsedSignatureParams,
  type SignatureRequest,
} from '@peac/http-signatures';

// Transport address of the local server (HTTP). The signature is computed over
// the canonical PUBLIC_URL below, matching what the server verifies against.
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://platform.example.com';
const WEBHOOK_PATH = '/webhooks/ucp/orders';

const KID = 'demo-key-001';
const IDEMPOTENCY_KEY = 'demo-idem-001';
// Signer identity profile, bound by the verifier via expected_profile_url.
const SIGNER_PROFILE_URL = 'https://demo.business.example.com/.well-known/ucp';
const UCP_AGENT = `profile="${SIGNER_PROFILE_URL}"`;

// Demo EC keypair (P-256 curve for ES256). In production this is the signer's key,
// published as a JWK in their /.well-known/ucp profile (public x/y only).
// Demo-only keypair. Do not reuse this private key outside this example.
const DEMO_PRIVATE_KEY = crypto.createPrivateKey({
  key: {
    kty: 'EC',
    crv: 'P-256',
    x: '1r5jSqODThl8JfPN0o7y6T24x3GsQvv30byrvCGR-Bs',
    y: 'tnZaWtpX8uUi511v2QFFLY8rzSPhFqGKyd-tOvJoM4k',
    d: 'QdOJRxCr_fsTKG2fno__oWWOIuXQnFyPMz4XiHoYMUw',
  },
  format: 'jwk',
});

// Covered components for a UCP request POST with a body. Order is significant: it
// is the order serialized into Signature-Input and reflected in the signature base.
const COVERED_COMPONENTS = [
  '@method',
  '@authority',
  '@path',
  'content-digest',
  'content-type',
  'idempotency-key',
  'ucp-agent',
] as const;

/**
 * Compute an RFC 9530 Content-Digest header value over raw bytes (sha-256).
 */
function contentDigest(body: Buffer): string {
  const digest = crypto.createHash('sha256').update(body).digest('base64');
  return `sha-256=:${digest}:`;
}

/**
 * Sign a UCP request with an RFC 9421 HTTP Message Signature. Returns the headers
 * to send alongside the body: Signature-Input, Signature, and Content-Digest.
 *
 * The signature base is built with `@peac/http-signatures` buildSignatureBase
 * (preferSerializedParams), the exact mechanics the verifier uses, so the signed
 * value cannot drift from what is verified. UCP omits `alg`/`created`.
 */
function signUcpRequest(body: Buffer): Record<string, string> {
  const digest = contentDigest(body);
  const request: SignatureRequest = {
    method: 'POST',
    url: `${PUBLIC_URL}${WEBHOOK_PATH}`,
    headers: {
      'content-digest': digest,
      'content-type': 'application/json',
      'idempotency-key': IDEMPOTENCY_KEY,
      'ucp-agent': UCP_AGENT,
    },
  };

  // Serialized Signature-Input value (inner list + parameters; UCP omits alg/created).
  const innerList = COVERED_COMPONENTS.map((c) => `"${c}"`).join(' ');
  const signatureParamsValue = `(${innerList});keyid="${KID}"`;

  const params: ParsedSignatureParams = {
    keyid: KID,
    coveredComponents: [...COVERED_COMPONENTS],
    signatureParamsValue,
  };

  const base = buildSignatureBase(request, params, { preferSerializedParams: true });

  // ES256 raw (r||s, IEEE P1363) signature, base64 byte-sequence per RFC 8941.
  const signatureBytes = crypto.sign('sha256', signatureBaseToBytes(base), {
    key: DEMO_PRIVATE_KEY,
    dsaEncoding: 'ieee-p1363',
  });

  return {
    'Content-Type': 'application/json',
    'Content-Digest': digest,
    'Idempotency-Key': IDEMPOTENCY_KEY,
    'UCP-Agent': UCP_AGENT,
    'Signature-Input': `sig1=${signatureParamsValue}`,
    Signature: `sig1=:${signatureBytes.toString('base64')}:`,
  };
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

  // Sign the payload (RFC 9421 HTTP Message Signature + RFC 9530 Content-Digest)
  console.log('2. Signing request with ES256 (RFC 9421 HTTP Message Signature)');
  const signedHeaders = signUcpRequest(payloadBytes);
  console.log('   Content-Digest:', signedHeaders['Content-Digest']);
  console.log('   Signature-Input:', signedHeaders['Signature-Input']);
  console.log('');

  // Send webhook
  console.log('3. Sending signed webhook to server');
  console.log('   URL:', `${SERVER_URL}${WEBHOOK_PATH}`);
  console.log('');

  try {
    const response = await fetch(`${SERVER_URL}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: signedHeaders,
      body: payloadJson,
    });

    const result = await response.json();

    console.log('4. Server response');
    console.log('   Status:', response.status);
    console.log('   Body:', JSON.stringify(result, null, 2));
    console.log('');

    if (response.ok) {
      console.log('SUCCESS: Webhook verified and PEAC receipt issued');
      console.log('');
      console.log('Receipt details:');
      console.log('  ID:', result.receipt_id);
      console.log('  Order:', result.order_id);
      console.log('  Event:', result.event_type);
    } else {
      console.log('ERROR: Webhook processing failed');
      console.log('  Code:', result.error);
      console.log('  Message:', result.message);
      return;
    }
  } catch (error) {
    console.error('ERROR: Failed to send webhook');
    console.error(error);
    console.log('');
    console.log('Make sure the server is running: pnpm start');
    return;
  }

  // Tamper case: reuse the valid signature/digest but mutate the body. The
  // Content-Digest no longer matches the raw bytes, so the server rejects it.
  console.log('');
  console.log('5. Tamper check: resending with a mutated body and the same signature');
  const tamperedPayload = payloadJson.replace('order_demo_12345', 'order_TAMPERED');
  try {
    const signedHeaders = signUcpRequest(payloadBytes); // signature/digest of the ORIGINAL body
    const response = await fetch(`${SERVER_URL}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: signedHeaders,
      body: tamperedPayload,
    });
    const result = await response.json();
    console.log('   Status:', response.status);
    console.log('   Code:', result.error);
    if (!response.ok) {
      console.log('EXPECTED: tampered body rejected (Content-Digest binds the raw bytes)');
    } else {
      console.log('UNEXPECTED: tampered body was accepted');
    }
  } catch (error) {
    console.error('ERROR: Failed to send tamper request');
    console.error(error);
  }
}

main().catch(console.error);
