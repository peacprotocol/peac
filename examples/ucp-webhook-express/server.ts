/**
 * UCP Webhook Express Server Example
 *
 * This example demonstrates:
 * 1. Receiving UCP order webhooks
 * 2. Verifying webhook signatures (raw-first, JCS fallback)
 * 3. Mapping UCP orders to PEAC receipts
 * 4. Creating dispute evidence for offline verification
 *
 * Run with: pnpm start
 */

import express from 'express';
import type { Request, Response } from 'express';
import {
  verifyUcpWebhookSignature,
  mapUcpOrderToReceipt,
  createUcpDisputeEvidence,
  parseWebhookEvent,
  determineReceiptRelationship,
  ErrorHttpStatus,
} from '@peac/mappings-ucp';
import type { UcpOrder, UcpProfile } from '@peac/mappings-ucp';
import { generateKeypair, sign } from '@peac/crypto';

// Configuration
const PORT = process.env.PORT || 3000;
const ISSUER = process.env.ISSUER || 'https://platform.example.com';
const CURRENCY = process.env.CURRENCY || 'USD';

// In production, load from secure storage
let signingKeypair: { privateKey: Uint8Array; publicKey: Uint8Array } | undefined;

// Mock UCP profile for demo (in production, this is fetched from /.well-known/ucp)
const MOCK_PROFILE: UcpProfile = {
  version: '2026-01-11',
  business_id: 'demo_business',
  signing_keys: [
    {
      kty: 'EC',
      crv: 'P-256',
      kid: 'demo-key-001',
      x: 'WbbYvAT6hxoZn-zSA7h3JXQlTFGPMCx2MxZ2SjCNrYo',
      y: 'JWYUg4z0JJyIOl2lKN3JCB6HWBGtS-31X7WQWFZ7OTI',
      alg: 'ES256',
    },
  ],
};

const app = express();

// Raw body parser for webhook signature verification
app.use('/webhooks', express.raw({ type: 'application/json' }));

// JSON body parser for other routes
app.use(express.json());

/**
 * UCP Order Webhook Endpoint
 *
 * Receives order events from UCP-compliant businesses.
 * Verifies the signature and issues a PEAC receipt.
 */
app.post('/webhooks/ucp/orders', async (req: Request, res: Response) => {
  // Handle header that may be string or array (if sent multiple times)
  const rawSignatureHeader = req.headers['request-signature'];
  let signatureHeader: string | undefined;
  if (Array.isArray(rawSignatureHeader)) {
    signatureHeader = rawSignatureHeader[0];
  } else if (typeof rawSignatureHeader === 'string') {
    signatureHeader = rawSignatureHeader;
  } else {
    signatureHeader = undefined;
  }

  // Body is a Buffer from express.raw() middleware
  const bodyBytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);

  // Safely get content length for logging
  const contentLength = bodyBytes.length;

  console.log('Received UCP webhook');
  console.log('  Content-Length:', contentLength);
  console.log('  Request-Signature:', signatureHeader ? 'present' : 'missing');

  // Check for signature header
  if (!signatureHeader) {
    console.log('  Error: Missing Request-Signature header');
    return res.status(400).json({
      error: 'E_UCP_SIGNATURE_MISSING',
      message: 'Request-Signature header is required',
    });
  }

  const receivedAt = new Date().toISOString();
  const profileFetchedAt = receivedAt; // In production, track actual fetch time

  try {
    // Create dispute evidence (includes signature verification)
    const evidence = await createUcpDisputeEvidence({
      signature_header: signatureHeader,
      body_bytes: new Uint8Array(bodyBytes),
      method: 'POST',
      path: '/webhooks/ucp/orders',
      received_at: receivedAt,
      profile_url: 'https://demo.business.example.com/.well-known/ucp',
      profile_fetched_at: profileFetchedAt,
      profile: MOCK_PROFILE, // In production, fetch from profile_url
    });

    console.log('  Signature verification:', evidence.signature_valid ? 'PASSED' : 'FAILED');
    console.log('  Verification mode:', evidence.verification.mode_used || 'none');

    if (!evidence.signature_valid) {
      console.log('  Error:', evidence.verification.error_code);
      console.log('  Attempts:', evidence.verification.attempts);

      const httpStatus = evidence.verification.error_code
        ? ErrorHttpStatus[evidence.verification.error_code as keyof typeof ErrorHttpStatus] || 401
        : 401;

      return res.status(httpStatus).json({
        error: evidence.verification.error_code,
        message: evidence.verification.error_message,
        attempts: evidence.verification.attempts,
      });
    }

    // Parse the webhook payload
    const payload = JSON.parse(bodyBytes.toString()) as {
      event_type: string;
      order: UcpOrder;
    };

    console.log('  Event type:', payload.event_type);
    console.log('  Order ID:', payload.order.id);

    // Map UCP order to PEAC receipt claims
    const claims = mapUcpOrderToReceipt({
      order: payload.order,
      issuer: ISSUER,
      subject: `buyer:${payload.order.checkout_id || 'unknown'}`,
      currency: CURRENCY,
      issued_at: receivedAt,
    });

    console.log('  Receipt claims mapped');
    console.log('    Amount:', claims.payment.amount, claims.payment.currency);
    console.log('    Status:', claims.payment.status);

    // Sign the receipt (in production, use secure key storage)
    if (!signingKeypair) {
      signingKeypair = await generateKeypair();
    }

    const receiptJws = await sign(claims, signingKeypair.privateKey, 'platform-key-001');

    console.log('  Receipt issued:', claims.jti);

    // Store evidence for potential disputes (in production, persist to database)
    console.log('  Evidence YAML stored for dispute bundle');
    // evidence.evidence_yaml can be passed to createDisputeBundle()

    // Respond with receipt info
    res.status(200).json({
      status: 'processed',
      receipt_id: claims.jti,
      receipt_jws: receiptJws,
      event_type: payload.event_type,
      order_id: payload.order.id,
    });
  } catch (error) {
    console.error('  Error processing webhook:', error);
    res.status(500).json({
      error: 'E_INTERNAL',
      message: 'Failed to process webhook',
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'ucp-webhook-example' });
});

/**
 * Profile endpoint (mock - in production this would be the business's profile)
 */
app.get('/.well-known/ucp', (_req: Request, res: Response) => {
  res.json(MOCK_PROFILE);
});

// Start server
app.listen(PORT, () => {
  console.log(`UCP Webhook Example Server running on port ${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  POST http://localhost:${PORT}/webhooks/ucp/orders - Receive UCP order webhooks`);
  console.log(`  GET  http://localhost:${PORT}/health - Health check`);
  console.log(`  GET  http://localhost:${PORT}/.well-known/ucp - Mock UCP profile`);
  console.log('');
  console.log('To test, run: pnpm demo');
});
