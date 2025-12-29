/**
 * @peac/rails-x402-daydreams
 *
 * x402+Daydreams AI inference router adapter for PEAC protocol.
 * Maps Daydreams inference events to PaymentEvidence using PEIP-AI/inference@1 profile.
 */

export type {
  DaydreamsInferenceEvent,
  DaydreamsWebhookEvent,
  DaydreamsEvidence,
  DaydreamsConfig,
  AdapterResult,
  AdapterErrorCode,
} from './types.js';

export {
  parseInferenceEvent,
  mapToPaymentEvidence,
  fromInferenceEvent,
  fromWebhookEvent,
} from './adapter.js';
