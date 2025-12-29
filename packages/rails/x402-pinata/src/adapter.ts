/**
 * x402+Pinata adapter - parse -> validate -> map
 *
 * Converts Pinata private object access events to PEAC PaymentEvidence
 * following the "never throws" invariant with Result types.
 */

import type { PaymentEvidence } from '@peac/schema';
import type {
  PinataAccessEvent,
  PinataEvidence,
  PinataConfig,
  AdapterResult,
  AdapterErrorCode,
} from './types.js';

const RAIL_ID = 'x402.pinata';

/**
 * Create an error result
 */
function err<T>(error: string, code: AdapterErrorCode): AdapterResult<T> {
  return { ok: false, error, code };
}

/**
 * Create a success result
 */
function ok<T>(value: T): AdapterResult<T> {
  return { ok: true, value };
}

/**
 * Validate required string field
 */
function validateRequiredString(
  value: unknown,
  fieldName: string
): AdapterResult<string> {
  if (typeof value !== 'string' || value.trim() === '') {
    return err(`${fieldName} is required and must be a non-empty string`, 'missing_required_field');
  }
  return ok(value);
}

/**
 * Validate IPFS CID format
 * Supports both CIDv0 (Qm...) and CIDv1 (bafy...)
 */
function validateCid(cid: unknown): AdapterResult<string> {
  if (typeof cid !== 'string' || cid.trim() === '') {
    return err('cid is required and must be a non-empty string', 'missing_required_field');
  }

  // Basic CID format validation
  // CIDv0: starts with Qm, 46 characters
  // CIDv1: starts with bafy or similar multibase prefix
  const cidv0Pattern = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
  const cidv1Pattern = /^[a-z2-7]{59,}$/; // Base32 encoded CIDv1

  if (!cidv0Pattern.test(cid) && !cidv1Pattern.test(cid) && !cid.startsWith('bafy')) {
    return err('cid must be a valid IPFS CID (CIDv0 or CIDv1)', 'invalid_cid');
  }

  return ok(cid);
}

/**
 * Validate amount (must be safe positive integer in minor units)
 */
function validateAmount(amount: unknown): AdapterResult<number> {
  if (typeof amount !== 'number') {
    return err('amount must be a number', 'invalid_amount');
  }
  if (!Number.isSafeInteger(amount)) {
    return err('amount must be a safe integer', 'invalid_amount');
  }
  if (amount < 0) {
    return err('amount must be non-negative', 'invalid_amount');
  }
  return ok(amount);
}

/**
 * Validate currency (ISO 4217, uppercase)
 */
function validateCurrency(currency: unknown): AdapterResult<string> {
  if (typeof currency !== 'string') {
    return err('currency must be a string', 'invalid_currency');
  }
  const normalized = currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    return err('currency must be a valid ISO 4217 code (3 uppercase letters)', 'invalid_currency');
  }
  return ok(normalized);
}

/**
 * Parse and validate a Pinata access event
 */
export function parseAccessEvent(
  event: unknown,
  config?: PinataConfig
): AdapterResult<PinataAccessEvent> {
  if (!event || typeof event !== 'object') {
    return err('event must be an object', 'parse_error');
  }

  const e = event as Record<string, unknown>;

  // Validate required fields
  const accessIdResult = validateRequiredString(e.accessId, 'accessId');
  if (!accessIdResult.ok) return accessIdResult as AdapterResult<PinataAccessEvent>;

  const cidResult = validateCid(e.cid);
  if (!cidResult.ok) return cidResult as AdapterResult<PinataAccessEvent>;

  const amountResult = validateAmount(e.amount);
  if (!amountResult.ok) return amountResult as AdapterResult<PinataAccessEvent>;

  const currencyResult = validateCurrency(e.currency);
  if (!currencyResult.ok) return currencyResult as AdapterResult<PinataAccessEvent>;

  // Validate visibility if provided
  if (e.visibility !== undefined && e.visibility !== 'private' && e.visibility !== 'public') {
    return err('visibility must be "private" or "public"', 'invalid_visibility');
  }

  // Validate against config if provided
  if (config?.allowedGateways && e.gateway && typeof e.gateway === 'string') {
    if (!config.allowedGateways.includes(e.gateway)) {
      return err(`gateway '${e.gateway}' is not in allowed list`, 'validation_error');
    }
  }

  // Build validated event
  const validated: PinataAccessEvent = {
    accessId: accessIdResult.value,
    cid: cidResult.value,
    amount: amountResult.value,
    currency: currencyResult.value,
  };

  // Optional fields
  if (e.visibility === 'private' || e.visibility === 'public') {
    validated.visibility = e.visibility;
  }
  if (e.gateway && typeof e.gateway === 'string') {
    validated.gateway = e.gateway;
  }
  if (e.userId && typeof e.userId === 'string') {
    validated.userId = e.userId;
  }
  if (e.contentType && typeof e.contentType === 'string') {
    validated.contentType = e.contentType;
  }
  if (typeof e.contentSize === 'number') {
    validated.contentSize = e.contentSize;
  }
  if (e.expiresAt && typeof e.expiresAt === 'string') {
    validated.expiresAt = e.expiresAt;
  }
  if (typeof e.ttl === 'number') {
    validated.ttl = e.ttl;
  }
  if (e.env && (e.env === 'live' || e.env === 'test')) {
    validated.env = e.env;
  }
  if (e.timestamp && typeof e.timestamp === 'string') {
    validated.timestamp = e.timestamp;
  }
  if (e.pinMetadata && typeof e.pinMetadata === 'object') {
    validated.pinMetadata = e.pinMetadata as Record<string, unknown>;
  }
  if (e.metadata && typeof e.metadata === 'object') {
    validated.metadata = e.metadata as Record<string, unknown>;
  }

  return ok(validated);
}

/**
 * Map a validated access event to PaymentEvidence
 */
export function mapToPaymentEvidence(
  event: PinataAccessEvent,
  config?: PinataConfig
): PaymentEvidence {
  const visibility = event.visibility ?? config?.defaultVisibility ?? 'private';

  const evidence: PinataEvidence = {
    access_id: event.accessId,
    cid: event.cid,
    store: 'ipfs',
    object_id: event.cid, // CID is the object identifier
    visibility,
    profile: 'PEIP-OBJ/private@1',
  };

  // Optional evidence fields
  if (event.gateway) evidence.gateway = event.gateway;
  if (event.userId) evidence.user_id = event.userId;
  if (event.contentType) evidence.content_type = event.contentType;
  if (event.contentSize !== undefined) evidence.content_size = event.contentSize;
  if (event.expiresAt) evidence.expires_at = event.expiresAt;
  if (event.ttl !== undefined) evidence.ttl = event.ttl;
  if (event.timestamp) evidence.timestamp = event.timestamp;

  return {
    rail: RAIL_ID,
    reference: event.accessId,
    amount: event.amount,
    currency: event.currency.toUpperCase(),
    asset: event.currency.toUpperCase(),
    env: event.env ?? config?.defaultEnv ?? 'live',
    evidence,
  };
}

/**
 * Parse, validate, and map an access event to PaymentEvidence
 * Main entry point - follows parse -> validate -> map pattern
 */
export function fromAccessEvent(
  event: unknown,
  config?: PinataConfig
): AdapterResult<PaymentEvidence> {
  const parseResult = parseAccessEvent(event, config);
  if (!parseResult.ok) {
    return parseResult as AdapterResult<PaymentEvidence>;
  }

  const paymentEvidence = mapToPaymentEvidence(parseResult.value, config);
  return ok(paymentEvidence);
}

/**
 * Parse and process a webhook event
 */
export function fromWebhookEvent(
  webhookEvent: unknown,
  config?: PinataConfig
): AdapterResult<PaymentEvidence> {
  if (!webhookEvent || typeof webhookEvent !== 'object') {
    return err('webhook event must be an object', 'parse_error');
  }

  const w = webhookEvent as Record<string, unknown>;

  if (!w.type || typeof w.type !== 'string') {
    return err('webhook event type is required', 'missing_required_field');
  }

  if (!w.data || typeof w.data !== 'object') {
    return err('webhook event data is required', 'missing_required_field');
  }

  // Only process granted access events
  if (w.type !== 'access.granted' && w.type !== 'payment.captured') {
    return err(`unsupported webhook event type: ${w.type}`, 'validation_error');
  }

  return fromAccessEvent(w.data, config);
}
