/**
 * @peac/402/types - HTTP 402 payment types with rail negotiation
 */

export type PaymentRail = 'x402' | 'tempo' | 'l402' | 'stripe';

export interface PaymentChallenge {
  rail: PaymentRail;
  amount: {
    value: string;
    currency: string;
  };
  challenge: string;
  expires_at?: string;
}

export interface PaymentEvidence {
  rail: PaymentRail;
  provider_ids: string[];
  amount?: {
    value: string;
    currency: string;
  };
  completed_at?: string;
}

export interface PaymentInfo {
  rail: PaymentRail;
  status: 'pending' | 'completed' | 'failed' | 'expired';
  amount: {
    value: string;
    currency: string;
  };
  evidence?: PaymentEvidence;
}

export interface NegotiationContext {
  acceptedRails: PaymentRail[];
  preferredRail?: PaymentRail;
  amount: {
    value: string;
    currency: string;
  };
  metadata?: Record<string, unknown>;
}

export interface PaymentAdapter {
  rail: PaymentRail;
  challenge(ctx: NegotiationContext): Promise<PaymentChallenge>;
  verify(challenge: string, evidence: string): Promise<PaymentEvidence | null>;
  supports(ctx: NegotiationContext): boolean;
}

export interface Http402Response {
  status: 402;
  headers: Record<string, string>;
  body: {
    type: 'https://www.rfc-editor.org/rfc/rfc9110.html#status.402';
    title: 'Payment Required';
    detail: string;
    instance?: string;
    'accept-payment': PaymentChallenge[];
  };
}