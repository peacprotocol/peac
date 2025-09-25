/**
 * @peac/402/handler - Generic HTTP 402 response generator
 * RFC 9110 compliant with RFC 9457 Problem Details
 */
import { PaymentNegotiator } from './negotiator';
import type { NegotiationContext, Http402Response } from './types';
export declare class Http402Handler {
  private negotiator;
  constructor(negotiator: PaymentNegotiator);
  createResponse(ctx: NegotiationContext, instance?: string): Promise<Http402Response>;
  private buildWwwAuthenticate;
  parsePaymentHeader(header: string): {
    rail: string;
    evidence: string;
  } | null;
  verifyPayment(
    paymentHeader: string,
    originalChallenge?: string
  ): Promise<import('./types').PaymentEvidence | null>;
}
export declare function create402Response(
  amount: {
    value: string;
    currency: string;
  },
  acceptPayments?: string,
  instance?: string
): Promise<Http402Response>;
//# sourceMappingURL=handler.d.ts.map
