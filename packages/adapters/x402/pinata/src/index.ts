/**
 * @peac/adapter-x402-pinata
 *
 * Pinata private IPFS objects event normalizer for PEAC protocol.
 * Maps Pinata access events to PaymentEvidence using PEIP-OBJ/private@1 profile.
 */

export type {
  PinataAccessEvent,
  PinataWebhookEvent,
  PinataEvidence,
  PinataConfig,
  AdapterResult,
  AdapterErrorCode,
} from './types.js';

export {
  parseAccessEvent,
  mapToPaymentEvidence,
  fromAccessEvent,
  fromWebhookEvent,
} from './adapter.js';
