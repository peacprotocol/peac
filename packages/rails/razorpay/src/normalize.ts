/**
 * Razorpay payment normalization to PEAC PaymentEvidence
 *
 * Amount handling:
 * - Razorpay amounts are in smallest currency sub-unit (paise for INR)
 * - We keep them as-is (integer minor units) - NO division by 100
 * - Enforces Number.isSafeInteger; throws on overflow
 *
 * Privacy:
 * - VPA addresses are hashed by default using HMAC-SHA256
 * - UNSAFE opt-in available via privacy.storeRawVpa: true
 */

import { createHmac } from 'crypto';
import type { JsonObject } from '@peac/kernel';
import type { PaymentEvidence } from '@peac/schema';
import type {
  RazorpayConfig,
  RazorpayWebhookEvent,
  RazorpayPaymentEntity,
  RazorpayEnv,
} from './types.js';
import {
  amountOutOfRangeError,
  amountInvalidError,
  currencyInvalidError,
  eventTypeUnsupportedError,
  payloadInvalidError,
  paymentMissingError,
} from './errors.js';

/**
 * Supported payment event types for normalization
 */
const SUPPORTED_EVENTS = new Set(['payment.authorized', 'payment.captured', 'payment.failed']);

/**
 * Hash a VPA address using HMAC-SHA256
 *
 * Uses HMAC instead of plain SHA256 to prevent dictionary attacks
 * against common VPA patterns (e.g., name@bank).
 *
 * @param vpa - VPA address to hash
 * @param key - HMAC key (defaults to webhookSecret)
 * @returns Hex-encoded HMAC-SHA256 hash
 */
export function hashVpa(vpa: string, key: string): string {
  return createHmac('sha256', key).update(vpa.toLowerCase()).digest('hex');
}

/**
 * Validate and extract payment entity from webhook event
 */
function extractPaymentEntity(event: unknown): RazorpayPaymentEntity {
  if (!event || typeof event !== 'object') {
    throw payloadInvalidError('event is not an object');
  }

  const e = event as RazorpayWebhookEvent;

  if (e.entity !== 'event') {
    throw payloadInvalidError('not a Razorpay event');
  }

  if (!e.event || typeof e.event !== 'string') {
    throw payloadInvalidError('missing event type');
  }

  if (!SUPPORTED_EVENTS.has(e.event)) {
    throw eventTypeUnsupportedError(e.event);
  }

  if (!e.payload?.payment?.entity) {
    throw paymentMissingError();
  }

  return e.payload.payment.entity;
}

/**
 * Validate amount is a safe integer in minor units
 */
function validateAmount(amount: unknown): number {
  if (typeof amount !== 'number') {
    throw amountInvalidError('amount is not a number');
  }

  if (!Number.isInteger(amount)) {
    throw amountInvalidError('amount is not an integer (must be minor units)');
  }

  if (amount < 0) {
    throw amountInvalidError('amount is negative');
  }

  if (!Number.isSafeInteger(amount)) {
    throw amountOutOfRangeError(amount);
  }

  return amount;
}

/**
 * Validate currency is uppercase ISO 4217
 */
function validateCurrency(currency: unknown): string {
  if (typeof currency !== 'string') {
    throw currencyInvalidError(String(currency));
  }

  // Razorpay uses uppercase (INR, USD, etc.)
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw currencyInvalidError(currency);
  }

  return currency;
}

/**
 * Build evidence object from payment entity
 */
function buildEvidence(payment: RazorpayPaymentEntity, config: RazorpayConfig): JsonObject {
  const evidence: JsonObject = {
    payment_id: payment.id,
    status: payment.status,
    method: payment.method,
  };

  // Add order/invoice references if present
  if (payment.order_id) {
    evidence.order_id = payment.order_id;
  }
  if (payment.invoice_id) {
    evidence.invoice_id = payment.invoice_id;
  }

  // Add method-specific details
  switch (payment.method) {
    case 'upi': {
      // VPA handling - hash by default for privacy
      const vpa = payment.vpa || payment.upi?.vpa;
      if (vpa) {
        if (config.privacy?.storeRawVpa) {
          // UNSAFE: Store raw VPA (requires explicit opt-in)
          evidence.vpa = vpa;
        } else {
          // Default: Hash VPA using HMAC-SHA256
          const hashKey = config.privacy?.hashKey || config.webhookSecret;
          evidence.vpa_hash = hashVpa(vpa, hashKey);
        }
      }
      if (payment.upi?.payer_account_type) {
        evidence.payer_account_type = payment.upi.payer_account_type;
      }
      break;
    }
    case 'card': {
      // Card details - only include non-sensitive info
      if (payment.card) {
        const cardInfo: JsonObject = {};
        if (payment.card.network) cardInfo.network = payment.card.network;
        if (payment.card.type) cardInfo.type = payment.card.type;
        if (payment.card.last4) cardInfo.last4 = payment.card.last4;
        if (payment.card.international !== undefined)
          cardInfo.international = payment.card.international;
        evidence.card = cardInfo;
      }
      break;
    }
    case 'netbanking': {
      if (payment.bank) {
        evidence.bank = payment.bank;
      }
      break;
    }
    case 'wallet': {
      if (payment.wallet) {
        evidence.wallet = payment.wallet;
      }
      break;
    }
  }

  // Add acquirer data if present (useful for reconciliation)
  if (payment.acquirer_data) {
    const acq: JsonObject = {};
    if (payment.acquirer_data.rrn) {
      acq.rrn = payment.acquirer_data.rrn;
    }
    if (payment.acquirer_data.auth_code) {
      acq.auth_code = payment.acquirer_data.auth_code;
    }
    if (payment.acquirer_data.bank_transaction_id) {
      acq.bank_transaction_id = payment.acquirer_data.bank_transaction_id;
    }
    if (Object.keys(acq).length > 0) {
      evidence.acquirer_data = acq;
    }
  }

  // Add key ID for observability if provided
  if (config.keyId) {
    evidence.key_id = config.keyId;
  }

  return evidence;
}

/**
 * Detect environment from payment ID prefix
 * Razorpay test payments start with 'pay_' in test mode
 * but we detect based on account type in production
 */
function detectEnv(payment: RazorpayPaymentEntity): RazorpayEnv {
  // Razorpay test mode payments are marked by the account
  // For now, default to 'live' - caller can override if needed
  return 'live';
}

/**
 * Normalize Razorpay webhook event to PEAC PaymentEvidence
 *
 * Amount handling:
 * - Razorpay amounts are in smallest currency sub-unit (paise for INR)
 * - We keep them as-is (integer minor units) - NO division by 100
 * - Enforces Number.isSafeInteger; throws on overflow
 *
 * @param event - Razorpay webhook event (parsed from JSON)
 * @param config - Razorpay adapter configuration
 * @param env - Optional environment override (defaults to 'live')
 * @returns PEAC PaymentEvidence
 * @throws RazorpayError on validation failure
 */
export function normalizeRazorpayPayment(
  event: unknown,
  config: RazorpayConfig,
  env?: RazorpayEnv
): PaymentEvidence {
  // Extract and validate payment entity
  const payment = extractPaymentEntity(event);

  // Validate amount (minor units, safe integer)
  const amount = validateAmount(payment.amount);

  // Validate currency
  const currency = validateCurrency(payment.currency);

  // Build evidence
  const evidence = buildEvidence(payment, config);

  // Determine environment
  const environment = env ?? detectEnv(payment);

  return {
    rail: 'razorpay',
    reference: payment.id,
    amount,
    currency,
    asset: currency, // For fiat, asset equals currency
    env: environment,
    evidence,
  };
}

/**
 * Normalize payment entity directly (when you already have the entity)
 *
 * Use this when you have already parsed and validated the webhook event
 * and just need to convert the payment to PaymentEvidence.
 *
 * @param payment - Razorpay payment entity
 * @param config - Razorpay adapter configuration
 * @param env - Optional environment override (defaults to 'live')
 * @returns PEAC PaymentEvidence
 */
export function normalizePaymentEntity(
  payment: RazorpayPaymentEntity,
  config: RazorpayConfig,
  env?: RazorpayEnv
): PaymentEvidence {
  const amount = validateAmount(payment.amount);
  const currency = validateCurrency(payment.currency);
  const evidence = buildEvidence(payment, config);
  const environment = env ?? detectEnv(payment);

  return {
    rail: 'razorpay',
    reference: payment.id,
    amount,
    currency,
    asset: currency,
    env: environment,
    evidence,
  };
}
