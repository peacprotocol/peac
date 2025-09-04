/**
 * @peac/402 - Generic HTTP 402 adapter with x402-first negotiation
 * RFC 9110 compliant payment required responses with protocol neutrality
 */

export { PaymentNegotiator, X402MockAdapter, TempoMockAdapter, L402MockAdapter, StripeMockAdapter } from './negotiator.js';
export { Http402Handler, create402Response } from './handler.js';
export type { 
  PaymentRail,
  PaymentChallenge,
  PaymentEvidence,
  PaymentInfo,
  PaymentAdapter,
  NegotiationContext,
  Http402Response
} from './types.js';

export const DEFAULT_RAILS: import('./types.js').PaymentRail[] = ['x402', 'l402'];
export const DEV_RAILS: import('./types.js').PaymentRail[] = ['x402', 'tempo', 'l402'];
export const RAILS = {
  X402: 'x402' as const,
  TEMPO: 'tempo' as const,
  L402: 'l402' as const, 
  STRIPE: 'stripe' as const
} as const;