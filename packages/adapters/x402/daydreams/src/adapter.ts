/**
 * x402+Daydreams adapter - parse -> validate -> map
 *
 * Converts Daydreams AI inference events to PEAC PaymentEvidence
 * following the "never throws" invariant with Result types.
 */

import type { PaymentEvidence } from '@peac/schema';
import {
  ok,
  adapterErr,
  isErr,
  requireString,
  requireAmount,
  requireCurrency,
  requireObject,
  type Result,
  type AdapterError,
  type JsonObject,
} from '@peac/adapter-core';
import type {
  DaydreamsInferenceEvent,
  DaydreamsConfig,
} from './types.js';

const RAIL_ID = 'x402';
const FACILITATOR = 'daydreams';

/**
 * Parse and validate a Daydreams inference event
 */
export function parseInferenceEvent(
  event: unknown,
  config?: DaydreamsConfig
): Result<DaydreamsInferenceEvent, AdapterError> {
  const objResult = requireObject(event, 'event');
  if (isErr(objResult)) return objResult;
  const e = objResult.value;

  // Validate required fields
  const eventIdResult = requireString(e.eventId, 'eventId');
  if (isErr(eventIdResult)) return eventIdResult;

  const modelIdResult = requireString(e.modelId, 'modelId');
  if (isErr(modelIdResult)) return modelIdResult;

  const providerResult = requireString(e.provider, 'provider');
  if (isErr(providerResult)) return providerResult;

  const amountResult = requireAmount(e.amount);
  if (isErr(amountResult)) return amountResult;

  const currencyResult = requireCurrency(e.currency);
  if (isErr(currencyResult)) return currencyResult;

  // Validate against config if provided
  if (config?.allowedProviders && !config.allowedProviders.includes(providerResult.value)) {
    return adapterErr(`provider '${providerResult.value}' is not in allowed list`, 'validation_error', 'provider');
  }

  if (config?.allowedModels && !config.allowedModels.includes(modelIdResult.value)) {
    return adapterErr(`model '${modelIdResult.value}' is not in allowed list`, 'validation_error', 'modelId');
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
  if (e.metadata && typeof e.metadata === 'object' && !Array.isArray(e.metadata)) {
    validated.metadata = e.metadata as JsonObject;
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
  // Build evidence as JsonObject (typed internally as DaydreamsEvidence)
  const evidence: JsonObject = {
    event_id: event.eventId,
    model_id: event.modelId,
    provider: event.provider,
    profile: 'PEIP-AI/inference@1',
  };

  // Optional evidence fields
  if (event.inputClass) evidence.input_class = event.inputClass;
  if (event.outputType) evidence.output_type = event.outputType;
  if (event.tokens) {
    evidence.tokens = {
      ...(event.tokens.input !== undefined && { input: event.tokens.input }),
      ...(event.tokens.output !== undefined && { output: event.tokens.output }),
    };
  }
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
    facilitator: FACILITATOR,
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
): Result<PaymentEvidence, AdapterError> {
  const parseResult = parseInferenceEvent(event, config);
  if (isErr(parseResult)) {
    return parseResult;
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
): Result<PaymentEvidence, AdapterError> {
  const objResult = requireObject(webhookEvent, 'webhookEvent');
  if (isErr(objResult)) return objResult;
  const w = objResult.value;

  const typeResult = requireString(w.type, 'type');
  if (isErr(typeResult)) return typeResult;

  if (!w.data || typeof w.data !== 'object') {
    return adapterErr('webhook event data is required', 'missing_required_field', 'data');
  }

  // Only process completed inference events
  if (typeResult.value !== 'inference.completed' && typeResult.value !== 'payment.captured') {
    return adapterErr(`unsupported webhook event type: ${typeResult.value}`, 'validation_error', 'type');
  }

  return fromInferenceEvent(w.data, config);
}
