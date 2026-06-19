/**
 * UCP Webhook Express Server Example
 *
 * This example demonstrates:
 * 1. Receiving UCP order webhooks
 * 2. Verifying the current UCP signing model: RFC 9421 HTTP Message Signatures
 *    (`Signature-Input` / `Signature`) with an RFC 9530 `Content-Digest` over the
 *    raw request body bytes
 * 3. Mapping UCP orders to PEAC receipts
 * 4. Issuing a signed PEAC receipt for the observed order
 *
 * PEAC can record and bind the facts of UCP signature verification. This example
 * rejects failed or absent UCP signatures before mapping the order; it does not
 * authenticate, authorize, settle, or execute the order.
 *
 * The earlier `Request-Signature` detached JWS (RFC 7797) scheme is deprecated;
 * see the "Legacy compatibility" section of the README for `verifyUcpWebhookSignature`.
 *
 * Run with: pnpm start
 */

import express from 'express';
import type { Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { verifyUcpHttpSignature, mapUcpOrderToReceipt, ErrorHttpStatus } from '@peac/mappings-ucp';
import type { UcpOrder, UcpProfile } from '@peac/mappings-ucp';
import { generateKeypair, sign } from '@peac/crypto';

/**
 * Sanitize a value for safe console logging. Webhook payloads are caller-
 * controlled, so any value emitted verbatim into a log line could let a
 * caller forge new log records by embedding CR/LF, or visually corrupt a
 * log stream by embedding ANSI escape sequences. The first sanitization
 * step is the explicit `/[\r\n]/g` removal pattern that recognized
 * static-analysis sanitizer models look for; subsequent steps strip ANSI
 * CSI escapes and other C0 controls, then cap output length.
 */
function sanitizeForLog(value: unknown): string {
  let raw: string;
  if (typeof value === 'string') {
    raw = value;
  } else {
    const json = JSON.stringify(value);
    raw = json !== undefined ? json : String(value);
  }
  // First: explicit CR/LF removal (the canonical log-injection sanitizer).
  raw = raw.replace(/[\r\n]/g, '');
  // Then: ANSI CSI escapes and remaining C0 controls.
  // eslint-disable-next-line no-control-regex
  raw = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/[\x00-\x1f\x7f]/g, '');
  return raw.length > 256 ? `${raw.slice(0, 253)}...` : raw;
}

// Configuration
const PORT = process.env.PORT || 3000;
const ISSUER = process.env.ISSUER || 'https://platform.example.com';
const CURRENCY = process.env.CURRENCY || 'USD';

/**
 * Canonical public HTTPS URL this endpoint is reachable at. UCP signs the
 * `@authority` / `@path` derived components over the canonical request URL, so
 * verification MUST use that URL, not the raw socket address. In this local demo
 * the server listens on http://localhost but is addressed as PUBLIC_URL; behind a
 * TLS-terminating proxy in production you would derive the public URL from your
 * deployment configuration (never from caller-controlled Host headers).
 */
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://platform.example.com';
const WEBHOOK_PATH = '/webhooks/ucp/orders';

/**
 * Expected signer identity profile. This is the signer's `/.well-known/ucp`
 * profile URL (distinct from PUBLIC_URL, which is the receiver endpoint). When
 * passed as `expected_profile_url`, the verifier requires a signed `UCP-Agent`
 * whose profile equals this value, binding the signature to a known signer.
 */
const SIGNER_PROFILE_URL = 'https://demo.business.example.com/.well-known/ucp';

// In production, load from secure storage
let signingKeypair: { privateKey: Uint8Array; publicKey: Uint8Array } | undefined;

// Mock UCP profile for demo (in production, this is fetched from /.well-known/ucp
// over an SSRF-safe, host-allowlisted path and passed to the verifier).
const MOCK_PROFILE: UcpProfile = {
  version: '2026-01-11',
  business_id: 'demo_business',
  signing_keys: [
    {
      kty: 'EC',
      crv: 'P-256',
      kid: 'demo-key-001',
      x: '1r5jSqODThl8JfPN0o7y6T24x3GsQvv30byrvCGR-Bs',
      y: 'tnZaWtpX8uUi511v2QFFLY8rzSPhFqGKyd-tOvJoM4k',
      alg: 'ES256',
    },
  ],
};

const app = express();

// Rate limiter for the webhook endpoint. The handler verifies signatures and
// issues receipts, so cap requests per client to blunt brute-force and abuse.
// Cast bridges a types-only skew: express-rate-limit v8 ships Express 5 core
// types, while this example pins Express 4; the middleware is runtime-compatible.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 100, // per IP per window
  standardHeaders: 'draft-7', // RateLimit-* response headers
  legacyHeaders: false,
}) as unknown as RequestHandler;

// Raw body parser for webhook signature verification
app.use('/webhooks', express.raw({ type: 'application/json' }));

// JSON body parser for other routes
app.use(express.json());

/**
 * Safely convert request body to Buffer.
 * Returns null if body type is invalid (e.g., array from malformed request).
 */
function toBuffer(body: unknown): Buffer | null {
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (typeof body === 'string') {
    return Buffer.from(body, 'utf8');
  }
  if (body === undefined || body === null) {
    return Buffer.alloc(0);
  }
  // Reject arrays and objects - not valid for raw webhook payloads
  return null;
}

/**
 * Read the first value of a possibly-repeated header.
 */
function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * UCP Order Webhook Endpoint
 *
 * Receives order events from UCP-compliant businesses and verifies them with the
 * current UCP signing model (RFC 9421 HTTP Message Signatures), then issues a
 * PEAC receipt for the observed order.
 */
app.post(WEBHOOK_PATH, webhookLimiter, async (req: Request, res: Response) => {
  // Convert body to Buffer using helper (breaks taint tracking)
  const bodyBytes = toBuffer(req.body);
  if (bodyBytes === null) {
    return res.status(400).json({
      error: 'E_UCP_INVALID_BODY',
      message: 'Invalid request body format',
    });
  }

  console.log('Received UCP webhook');
  console.log('  Content-Length:', sanitizeForLog(bodyBytes.byteLength));
  console.log(
    '  Signature-Input:',
    firstHeader(req.headers['signature-input']) ? 'present' : 'missing'
  );

  // Collect the signed request components the verifier needs (case-insensitive).
  const headers: Record<string, string> = {};
  for (const name of ['content-type', 'content-digest', 'idempotency-key', 'ucp-agent']) {
    const value = firstHeader(req.headers[name]);
    if (value !== undefined) {
      headers[name] = value;
    }
  }

  try {
    // Verify the RFC 9421 signature. The profile is supplied here (no network
    // I/O happens inside the verifier); `url` is the canonical public URL the
    // signer signed over, not the raw socket address.
    const result = await verifyUcpHttpSignature({
      signature_input: firstHeader(req.headers['signature-input']) ?? '',
      signature: firstHeader(req.headers['signature']) ?? '',
      method: 'POST',
      url: `${PUBLIC_URL}${WEBHOOK_PATH}`,
      headers,
      body_bytes: new Uint8Array(bodyBytes),
      profile: MOCK_PROFILE, // In production, resolve from the signer's /.well-known/ucp
      expected_profile_url: SIGNER_PROFILE_URL, // bind the signed UCP-Agent to a known signer
    });

    console.log('  Signature verification:', result.valid ? 'PASSED' : 'FAILED');

    if (!result.valid) {
      console.log('  Error:', result.error_code);

      const httpStatus = result.error_code
        ? ErrorHttpStatus[result.error_code as keyof typeof ErrorHttpStatus] || 401
        : 401;

      return res.status(httpStatus).json({
        error: result.error_code,
        message: result.error_message,
      });
    }

    console.log('  Algorithm:', result.alg);
    console.log('  Content-Digest verified:', result.content_digest_verified ? 'yes' : 'n/a');
    if (result.signer_profile_url) {
      console.log('  Signer profile:', sanitizeForLog(result.signer_profile_url));
    }

    // Parse the webhook payload. The body is signature- and digest-verified at
    // this point, so a parse failure means malformed JSON (client error -> 400).
    let payload: { event_type: string; order: UcpOrder };
    try {
      payload = JSON.parse(bodyBytes.toString());
    } catch {
      return res.status(400).json({
        error: 'E_UCP_PAYLOAD_NOT_JSON',
        message: 'Request body is not valid JSON',
      });
    }

    console.log('  Event type:', sanitizeForLog(payload.event_type));
    console.log('  Order ID:', sanitizeForLog(payload.order.id));

    // Map UCP order to PEAC receipt claims
    const claims = mapUcpOrderToReceipt({
      order: payload.order,
      issuer: ISSUER,
      subject: `buyer:${payload.order.checkout_id || 'unknown'}`,
      currency: CURRENCY,
      issued_at: new Date().toISOString(),
    });

    console.log('  Receipt claims mapped');
    console.log(
      '    Amount:',
      sanitizeForLog(claims.payment.amount),
      sanitizeForLog(claims.payment.currency)
    );
    console.log('    Status:', claims.payment.status);

    // Sign the receipt (in production, use secure key storage)
    if (!signingKeypair) {
      signingKeypair = await generateKeypair();
    }

    const receiptJws = await sign(claims, signingKeypair.privateKey, 'platform-key-001');

    console.log('  Receipt issued:', claims.jti);

    // Respond with receipt info
    res.status(200).json({
      status: 'processed',
      receipt_id: claims.jti,
      receipt_jws: receiptJws,
      event_type: payload.event_type,
      order_id: payload.order.id,
    });
  } catch (error) {
    console.error(
      '  Error processing webhook:',
      sanitizeForLog(error instanceof Error ? error.message : 'unknown error')
    );
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
  console.log(`  POST http://localhost:${PORT}${WEBHOOK_PATH} - Receive UCP order webhooks`);
  console.log(`  GET  http://localhost:${PORT}/health - Health check`);
  console.log(`  GET  http://localhost:${PORT}/.well-known/ucp - Mock UCP profile`);
  console.log('');
  console.log('To test, run: pnpm demo');
});
