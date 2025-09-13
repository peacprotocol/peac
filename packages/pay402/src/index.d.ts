/**
 * @peac/402 - Generic HTTP 402 adapter with x402-first negotiation
 * RFC 9110 compliant payment required responses with protocol neutrality
 */
export {
  PaymentNegotiator,
  X402MockAdapter,
  TempoMockAdapter,
  L402MockAdapter,
  StripeMockAdapter,
} from './negotiator.js';
export { Http402Handler, create402Response } from './handler.js';
export type {
  PaymentRail,
  PaymentChallenge,
  PaymentEvidence,
  PaymentInfo,
  PaymentAdapter,
  NegotiationContext,
  Http402Response,
} from './types.js';
export declare const DEFAULT_RAILS: import('./types.js').PaymentRail[];
export declare const DEV_RAILS: import('./types.js').PaymentRail[];
export declare const RAILS: {
  readonly X402: 'x402';
  readonly TEMPO: 'tempo';
  readonly L402: 'l402';
  readonly STRIPE: 'stripe';
};
//# sourceMappingURL=index.d.ts.map
