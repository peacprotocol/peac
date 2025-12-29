/**
 * x402+Daydreams adapter - parse -> validate -> map
 *
 * Converts Daydreams AI inference events to PEAC PaymentEvidence
 * following the "never throws" invariant with Result types.
 */

import type { PaymentEvidence } from '@peac/schema';
import type {
  DaydreamsInferenceEvent,
  DaydreamsWebhookEvent,
  DaydreamsEvidence,
  DaydreamsConfig,
  AdapterResult,
  AdapterErrorCode,
} from './types.js';

const RAIL_ID = 'x402.daydreams';

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
 * Parse and validate a Daydreams inference event
 */
export function parseInferenceEvent(
  event: unknown,
  config?: DaydreamsConfig
): AdapterResult<DaydreamsInferenceEvent> {
  if (!event || typeof event !== 'object') {
    return err('event must be an object', 'parse_error');
  }

  const e = event as Record<string, unknown>;

  // Validate required fields
  const eventIdResult = validateRequiredString(e.eventId, 'eventId');
  if (!eventIdResult.ok) return eventIdResult as AdapterResult<DaydreamsInferenceEvent>;

  const modelIdResult = validateRequiredString(e.modelId, 'modelId');
  if (!modelIdResult.ok) return modelIdResult as AdapterResult<DaydreamsInferenceEvent>;

  const providerResult = validateRequiredString(e.provider, 'provider');
  if (!providerResult.ok) return providerResult as AdapterResult<DaydreamsInferenceEvent>;

  const amountResult = validateAmount(e.amount);
  if (!amountResult.ok) return amountResult as AdapterResult<DaydreamsInferenceEvent>;

  const currencyResult = validateCurrency(e.currency);
  if (!currencyResult.ok) return currencyResult as AdapterResult<DaydreamsInferenceEvent>;

  // Validate against config if provided
  if (config?.allowedProviders && !config.allowedProviders.includes(providerResult.value)) {
    return err(`provider '${providerResult.value}' is not in allowed list`, 'invalid_provider');
  }

  if (config?.allowedModels && !config.allowedModels.includes(modelIdResult.value)) {
    return err(`model '${modelIdResult.value}' is not in allowed list`, 'invalid_model_id');
  }

  // Build validated event
  const validated: DaydreamsInferenceEvent = {
    eventId: eventIdResult.value,
    modelId: modelIdResult.value,
    provider: providerResult.value,
    amount: amountResult.value,
    currency: currencyResult.value,
  };

  // Optional fields
  if (e.inputClass && typeof e.inputClass === 'string') {
    validated.inputClass = e.inputClass as DaydreamsInferenceEvent['inputClass'];
  }
  if (e.outputType && typeof e.outputType === 'string') {
    validated.outputType = e.outputType as DaydreamsInferenceEvent['outputType'];
  }
  if (e.tokens && typeof e.tokens === 'object') {
    validated.tokens = e.tokens as DaydreamsInferenceEvent['tokens'];
  }
  if (e.sessionId && typeof e.sessionId === 'string') {
    validated.sessionId = e.sessionId;
  }
  if (e.userId && typeof e.userId === 'string') {
    validated.userId = e.userId;
  }
  if (e.env && (e.env === 'live' || e.env === 'test')) {
    validated.env = e.env;
  }
  if (e.timestamp && typeof e.timestamp === 'string') {
    validated.timestamp = e.timestamp;
  }
  if (e.metadata && typeof e.metadata === 'object') {
    validated.metadata = e.metadata as Record<string, unknown>;
  }

  return ok(validated);
}

/**
 * Map a validated inference event to PaymentEvidence
 */
export function mapToPaymentEvidence(
  event: DaydreamsInferenceEvent,
  config?: DaydreamsConfig
): PaymentEvidence {
  const evidence: DaydreamsEvidence = {
    event_id: event.eventId,
    model_id: event.modelId,
    provider: event.provider,
    profile: 'PEIP-AI/inference@1',
  };

  // Optional evidence fields
  if (event.inputClass) evidence.input_class = event.inputClass;
  if (event.outputType) evidence.output_type = event.outputType;
  if (event.tokens) evidence.tokens = event.tokens;
  if (event.sessionId) evidence.session_id = event.sessionId;
  if (event.userId) evidence.user_id = event.userId;
  if (event.timestamp) evidence.timestamp = event.timestamp;

  return {
    rail: RAIL_ID,
    reference: event.eventId,
    amount: event.amount,
    currency: event.currency.toUpperCase(),
    asset: event.currency.toUpperCase(),
    env: event.env ?? config?.defaultEnv ?? 'live',
    evidence,
  };
}

/**
 * Parse, validate, and map an inference event to PaymentEvidence
 * Main entry point - follows parse -> validate -> map pattern
 */
export function fromInferenceEvent(
  event: unknown,
  config?: DaydreamsConfig
): AdapterResult<PaymentEvidence> {
  const parseResult = parseInferenceEvent(event, config);
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
  config?: DaydreamsConfig
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

  // Only process completed inference events
  if (w.type !== 'inference.completed' && w.type !== 'payment.captured') {
    return err(`unsupported webhook event type: ${w.type}`, 'validation_error');
  }

  return fromInferenceEvent(w.data, config);
}
