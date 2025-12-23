/**
 * Razorpay webhook signature verification
 *
 * SECURITY NOTES:
 * 1. Always use raw request body (Uint8Array), NOT parsed JSON
 * 2. Never parse/cast body before verification - this prevents signature bypass
 * 3. Uses constant-time comparison via crypto.timingSafeEqual
 *
 * @example Express middleware for raw body:
 * ```typescript
 * app.use('/webhook', express.raw({ type: 'application/json' }));
 * ```
 *
 * @example Fastify raw body:
 * ```typescript
 * fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
 *   done(null, body);
 * });
 * ```
 */

import { createHmac, timingSafeEqual } from 'crypto';
import {
  signatureInvalidError,
  signatureMalformedError,
  signatureLengthMismatchError,
} from './errors.js';

/**
 * Verify Razorpay webhook signature using raw bytes and constant-time compare.
 *
 * IMPORTANT: Do NOT parse/cast the webhook body before verification.
 * Use the raw request body exactly as received.
 *
 * @param rawBody - Raw webhook body as Uint8Array (NOT parsed JSON)
 * @param signatureHeader - Value of X-Razorpay-Signature header (HMAC SHA256 hex)
 * @param secret - Webhook secret from Razorpay Dashboard
 * @returns true if signature is valid
 * @throws RazorpayError if signature is malformed or verification fails
 */
export function verifyWebhookSignature(
  rawBody: Uint8Array,
  signatureHeader: string,
  secret: string
): boolean {
  // Validate signature header format (should be hex string)
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    throw signatureMalformedError('signature header is empty or not a string');
  }

  // Trim whitespace
  const signature = signatureHeader.trim();

  // Check for valid hex format (64 chars for SHA256)
  if (!/^[a-fA-F0-9]{64}$/.test(signature)) {
    if (signature.length === 0) {
      throw signatureMalformedError('signature header is empty');
    }
    if (!/^[a-fA-F0-9]+$/.test(signature)) {
      throw signatureMalformedError('signature contains non-hex characters');
    }
    throw signatureLengthMismatchError();
  }

  // Compute expected signature
  const expectedSignature = createHmac('sha256', secret).update(rawBody).digest('hex');

  // Convert both to buffers for constant-time comparison
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  // Length check before timingSafeEqual (required - they must be equal length)
  if (signatureBuffer.length !== expectedBuffer.length) {
    throw signatureLengthMismatchError();
  }

  // Constant-time comparison to prevent timing attacks
  const isValid = timingSafeEqual(signatureBuffer, expectedBuffer);

  if (!isValid) {
    throw signatureInvalidError();
  }

  return true;
}

/**
 * Verify webhook signature and return boolean (no throw)
 *
 * Use this when you want to handle invalid signatures without exceptions.
 *
 * @param rawBody - Raw webhook body as Uint8Array
 * @param signatureHeader - Value of X-Razorpay-Signature header
 * @param secret - Webhook secret from Razorpay Dashboard
 * @returns true if valid, false otherwise
 */
export function isWebhookSignatureValid(
  rawBody: Uint8Array,
  signatureHeader: string,
  secret: string
): boolean {
  try {
    return verifyWebhookSignature(rawBody, signatureHeader, secret);
  } catch {
    return false;
  }
}
