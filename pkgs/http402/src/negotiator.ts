/**
 * @peac/402/negotiator - Payment rail negotiation with x402-first strategy
 * Maintains protocol neutrality while giving x402 prominence
 */

import type { PaymentRail, PaymentAdapter, NegotiationContext, PaymentChallenge } from './types.js';

export class PaymentNegotiator {
  private adapters: Map<PaymentRail, PaymentAdapter> = new Map();
  private defaultOrder: PaymentRail[] = ['x402', 'l402'];
  private devOrder: PaymentRail[] = ['x402', 'tempo', 'l402'];

  register(adapter: PaymentAdapter): void {
    this.adapters.set(adapter.rail, adapter);
  }

  setOrder(order: PaymentRail[]): void {
    this.defaultOrder = order;
  }

  unregister(rail: PaymentRail): void {
    this.adapters.delete(rail);
  }

  parseAcceptPayments(header?: string, isDev = false): PaymentRail[] {
    const baseOrder = isDev ? this.devOrder : this.defaultOrder;
    if (!header) return baseOrder;

    // Parse Accept-Payments header: "x402, l402;q=0.8, stripe;q=0.5"
    const tokens = header.split(',').map((t) => t.trim());
    const parsed: Array<{ rail: PaymentRail; q: number }> = [];

    for (const token of tokens) {
      const [rail, qPart] = token.split(';');
      const railTrimmed = rail.trim() as PaymentRail;

      if (!this.isValidRail(railTrimmed)) continue;

      const q = qPart?.includes('q=') ? parseFloat(qPart.split('q=')[1]) || 1.0 : 1.0;

      parsed.push({ rail: railTrimmed, q });
    }

    parsed.sort((a, b) => {
      if (a.q !== b.q) return b.q - a.q;
      if (a.rail === 'x402') return -1;
      if (b.rail === 'x402') return 1;
      return 0;
    });

    return parsed.map((p) => p.rail);
  }

  async negotiate(ctx: NegotiationContext): Promise<PaymentChallenge[]> {
    const challenges: PaymentChallenge[] = [];

    for (const rail of ctx.acceptedRails) {
      const adapter = this.adapters.get(rail);
      if (!adapter || !adapter.supports(ctx)) continue;

      try {
        const challenge = await adapter.challenge(ctx);
        challenges.push(challenge);
      } catch (error) {
        console.warn(`Payment adapter ${rail} failed:`, error);
      }
    }

    challenges.sort((a, b) => {
      if (a.rail === 'x402') return -1;
      if (b.rail === 'x402') return 1;
      return 0;
    });

    return challenges;
  }

  async verify(
    rail: PaymentRail,
    challenge: string,
    evidence: string
  ): Promise<import('./types.js').PaymentEvidence | null> {
    const adapter = this.adapters.get(rail);
    if (!adapter) {
      throw new Error(`Unknown payment rail: ${rail}`);
    }

    return adapter.verify(challenge, evidence);
  }

  getAvailableRails(): PaymentRail[] {
    return Array.from(this.adapters.keys());
  }

  private isValidRail(rail: string): rail is PaymentRail {
    return ['x402', 'tempo', 'l402', 'stripe'].includes(rail);
  }
}

// Mock adapters for testing and structure validation
export class X402MockAdapter implements PaymentAdapter {
  rail: PaymentRail = 'x402';

  supports(ctx: NegotiationContext): boolean {
    return ctx.amount.currency === 'USD' || ctx.amount.currency === 'USDC';
  }

  async challenge(ctx: NegotiationContext): Promise<PaymentChallenge> {
    return {
      rail: 'x402',
      amount: ctx.amount,
      challenge: `x402_challenge_${Date.now()}`,
      expires_at: new Date(Date.now() + 300000).toISOString(),
    };
  }

  async verify(
    challenge: string,
    evidence: string
  ): Promise<import('./types.js').PaymentEvidence | null> {
    if (!evidence.startsWith('x402_proof_')) return null;

    return {
      rail: 'x402',
      provider_ids: [evidence],
      completed_at: new Date().toISOString(),
    };
  }
}

export class L402MockAdapter implements PaymentAdapter {
  rail: PaymentRail = 'l402';

  supports(ctx: NegotiationContext): boolean {
    return ctx.amount.currency === 'BTC' || ctx.amount.value === '0';
  }

  async challenge(ctx: NegotiationContext): Promise<PaymentChallenge> {
    return {
      rail: 'l402',
      amount: ctx.amount,
      challenge: `lsat_macaroon_${Date.now()}`,
      expires_at: new Date(Date.now() + 600000).toISOString(),
    };
  }

  async verify(
    challenge: string,
    evidence: string
  ): Promise<import('./types.js').PaymentEvidence | null> {
    if (!evidence.includes('lsat_preimage_')) return null;

    return {
      rail: 'l402',
      provider_ids: [evidence],
    };
  }
}

export class TempoMockAdapter implements PaymentAdapter {
  rail: PaymentRail = 'tempo';

  supports(ctx: NegotiationContext): boolean {
    return ctx.amount.currency === 'USD' || ctx.amount.currency === 'USDC';
  }

  async challenge(ctx: NegotiationContext): Promise<PaymentChallenge> {
    return {
      rail: 'tempo',
      amount: ctx.amount,
      challenge: `tempo_network=${(globalThis as any).process?.env?.TEMPO_NET || 'tempo-testnet'}`,
      expires_at: new Date(Date.now() + 600000).toISOString(),
    };
  }

  async verify(
    challenge: string,
    evidence: string
  ): Promise<import('./types.js').PaymentEvidence | null> {
    if (!evidence.includes('tempo:tx:') || evidence.length < 32) return null;

    const evidenceParts = evidence.split(',').map((s) => s.trim());
    const providerIds = evidenceParts.filter(
      (part) =>
        part.startsWith('tempo:tx:') ||
        part.startsWith('tempo:chain:') ||
        part.startsWith('tempo:memo:')
    );

    return {
      rail: 'tempo',
      provider_ids: providerIds,
      completed_at: new Date().toISOString(),
    };
  }
}

export class StripeMockAdapter implements PaymentAdapter {
  rail: PaymentRail = 'stripe';

  supports(ctx: NegotiationContext): boolean {
    return ['USD', 'EUR', 'GBP'].includes(ctx.amount.currency);
  }

  async challenge(ctx: NegotiationContext): Promise<PaymentChallenge> {
    return {
      rail: 'stripe',
      amount: ctx.amount,
      challenge: `pi_${Date.now()}_secret_test`,
      expires_at: new Date(Date.now() + 1800000).toISOString(),
    };
  }

  async verify(
    challenge: string,
    evidence: string
  ): Promise<import('./types.js').PaymentEvidence | null> {
    if (!evidence.startsWith('pi_') || !evidence.includes('succeeded')) return null;

    return {
      rail: 'stripe',
      provider_ids: [evidence.split('_')[1]],
    };
  }
}
