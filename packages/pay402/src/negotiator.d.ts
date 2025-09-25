/**
 * @peac/402/negotiator - Payment rail negotiation
 */
import type { PaymentRail, PaymentAdapter, NegotiationContext, PaymentChallenge } from './types.js';
export declare class PaymentNegotiator {
  private adapters;
  private defaultOrder;
  private devOrder;
  register(adapter: PaymentAdapter): void;
  setOrder(order: PaymentRail[]): void;
  unregister(rail: PaymentRail): void;
  parseAcceptPayments(header?: string, isDev?: boolean): PaymentRail[];
  negotiate(ctx: NegotiationContext): Promise<PaymentChallenge[]>;
  verify(
    rail: PaymentRail,
    challenge: string,
    evidence: string
  ): Promise<import('./types.js').PaymentEvidence | null>;
  getAvailableRails(): PaymentRail[];
  private isValidRail;
}
export declare class X402MockAdapter implements PaymentAdapter {
  rail: PaymentRail;
  supports(ctx: NegotiationContext): boolean;
  challenge(ctx: NegotiationContext): Promise<PaymentChallenge>;
  verify(challenge: string, evidence: string): Promise<import('./types.js').PaymentEvidence | null>;
}
export declare class L402MockAdapter implements PaymentAdapter {
  rail: PaymentRail;
  supports(ctx: NegotiationContext): boolean;
  challenge(ctx: NegotiationContext): Promise<PaymentChallenge>;
  verify(challenge: string, evidence: string): Promise<import('./types.js').PaymentEvidence | null>;
}
export declare class TempoMockAdapter implements PaymentAdapter {
  rail: PaymentRail;
  supports(ctx: NegotiationContext): boolean;
  challenge(ctx: NegotiationContext): Promise<PaymentChallenge>;
  verify(challenge: string, evidence: string): Promise<import('./types.js').PaymentEvidence | null>;
}
export declare class StripeMockAdapter implements PaymentAdapter {
  rail: PaymentRail;
  supports(ctx: NegotiationContext): boolean;
  challenge(ctx: NegotiationContext): Promise<PaymentChallenge>;
  verify(challenge: string, evidence: string): Promise<import('./types.js').PaymentEvidence | null>;
}
//# sourceMappingURL=negotiator.d.ts.map
