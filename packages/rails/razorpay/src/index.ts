/**
 * @peac/rails-razorpay
 *
 * Razorpay payment rail adapter for PEAC protocol.
 * Supports UPI, cards, netbanking, and wallets.
 *
 * Features:
 * - Webhook signature verification (raw bytes + constant-time compare)
 * - Payment normalization to PEAC PaymentEvidence
 * - VPA privacy (HMAC hashing by default)
 * - Safe integer amount handling (no float math)
 *
 * @example
 * ```typescript
 * import {
 *   verifyWebhookSignature,
 *   normalizeRazorpayPayment,
 *   type RazorpayConfig
 * } from '@peac/rails-razorpay';
 *
 * const config: RazorpayConfig = {
 *   webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
 * };
 *
 * // In your webhook handler:
 * // 1. Get raw body (NOT parsed JSON)
 * const rawBody = req.rawBody; // Uint8Array
 * const signature = req.headers['x-razorpay-signature'];
 *
 * // 2. Verify signature
 * verifyWebhookSignature(rawBody, signature, config.webhookSecret);
 *
 * // 3. Parse and normalize (after verification)
 * const event = JSON.parse(Buffer.from(rawBody).toString('utf-8'));
 * const evidence = normalizeRazorpayPayment(event, config);
 * ```
 *
 * @packageDocumentation
 */

// Types
export type {
  RazorpayConfig,
  RazorpayPrivacyConfig,
  RazorpayPaymentEntity,
  RazorpayWebhookEvent,
  RazorpayPaymentEventType,
  RazorpayEnv,
} from './types.js';

// Errors
export {
  RazorpayError,
  type RazorpayErrorCode,
  signatureInvalidError,
  signatureMalformedError,
  signatureLengthMismatchError,
  amountOutOfRangeError,
  amountInvalidError,
  currencyInvalidError,
  eventTypeUnsupportedError,
  payloadInvalidError,
  paymentMissingError,
} from './errors.js';

// Webhook verification
export { verifyWebhookSignature, isWebhookSignatureValid } from './webhook.js';

// Normalization
export { normalizeRazorpayPayment, normalizePaymentEntity, hashVpa } from './normalize.js';
