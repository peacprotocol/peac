/**
 * @peac/402/handler - Generic HTTP 402 response generator
 * RFC 9110 compliant with RFC 9457 Problem Details
 */

import { PaymentNegotiator } from './negotiator.js';
import type { NegotiationContext, Http402Response } from './types.js';

export class Http402Handler {
  constructor(private negotiator: PaymentNegotiator) {}

  async createResponse(ctx: NegotiationContext, instance?: string): Promise<Http402Response> {
    const challenges = await this.negotiator.negotiate(ctx);

    if (challenges.length === 0) {
      throw new Error('No payment methods available');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/problem+json',
      'WWW-Authenticate': this.buildWwwAuthenticate(challenges),
      'Accept-Payment': challenges.map((c) => `${c.rail} ${c.challenge}`).join(', '),
    };

    // Add pricing headers for transparency
    const primaryChallenge = challenges[0];
    headers['X-Payment-Amount'] =
      `${primaryChallenge.amount.value} ${primaryChallenge.amount.currency}`;

    return {
      status: 402,
      headers,
      body: {
        type: 'https://www.rfc-editor.org/rfc/rfc9110.html#status.402',
        title: 'Payment Required',
        detail: `Payment required to access this resource. Amount: ${primaryChallenge.amount.value} ${primaryChallenge.amount.currency}`,
        instance,
        'accept-payment': challenges,
      },
    };
  }

  private buildWwwAuthenticate(challenges: import('./types.js').PaymentChallenge[]): string {
    // Primary challenge gets the main WWW-Authenticate header
    const primary = challenges[0];
    let auth = `Bearer realm="${primary.rail}"`;

    if (primary.challenge) {
      auth += `, challenge="${primary.challenge}"`;
    }

    if (primary.amount) {
      auth += `, amount="${primary.amount.value} ${primary.amount.currency}"`;
    }

    return auth;
  }

  parsePaymentHeader(header: string): { rail: string; evidence: string } | null {
    if (!header || !header.trim()) return null;

    // Parse: "x402 proof_abc123" or "Bearer x402 evidence_xyz"
    const bearerMatch = header.match(/^Bearer\s+(.+)$/i);
    const direct = bearerMatch ? bearerMatch[1] : header;

    const parts = direct
      .trim()
      .split(/\s+/)
      .filter((p) => p);
    if (parts.length < 1) return null;

    const [rail, ...evidenceParts] = parts;
    return {
      rail: rail.toLowerCase(),
      evidence: evidenceParts.join(' ') || rail, // Use rail as evidence if no separate evidence
    };
  }

  async verifyPayment(
    paymentHeader: string,
    originalChallenge?: string
  ): Promise<import('./types.js').PaymentEvidence | null> {
    const parsed = this.parsePaymentHeader(paymentHeader);
    if (!parsed) return null;

    const rail = parsed.rail as import('./types.js').PaymentRail;
    return this.negotiator.verify(rail, originalChallenge || '', parsed.evidence);
  }
}

// Convenience function for single-use 402 responses
export async function create402Response(
  amount: { value: string; currency: string },
  acceptPayments?: string,
  instance?: string
): Promise<Http402Response> {
  const negotiator = new PaymentNegotiator();

  // Register default mock adapters for structure validation
  const { X402MockAdapter, TempoMockAdapter, L402MockAdapter, StripeMockAdapter } = await import(
    './negotiator.js'
  );
  negotiator.register(new X402MockAdapter());
  negotiator.register(new TempoMockAdapter());
  negotiator.register(new L402MockAdapter());
  negotiator.register(new StripeMockAdapter());

  const handler = new Http402Handler(negotiator);

  const acceptedRails = negotiator.parseAcceptPayments(acceptPayments);
  return handler.createResponse({ acceptedRails, amount }, instance);
}
