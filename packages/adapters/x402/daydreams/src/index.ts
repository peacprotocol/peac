/**
 * @peac/adapter-x402-daydreams
 *
 * Daydreams AI inference event normalizer for PEAC protocol.
 * Maps Daydreams inference events to PaymentEvidence using PEIP-AI/inference@1 profile.
 */

export type {
  DaydreamsInferenceEvent,
  DaydreamsWebhookEvent,
  DaydreamsEvidence,
  DaydreamsConfig,
  // Re-exported from @peac/adapter-core
  Result,
  AdapterError,
  AdapterErrorCode,
  JsonObject,
} from './types.js';

export {
  parseInferenceEvent,
  mapToPaymentEvidence,
  fromInferenceEvent,
  fromWebhookEvent,
} from './adapter.js';
