import type { PaymentRail, PaymentIntent, PaymentResult, Money } from '@peac/rails-core';
import { idempotencyKey } from '@peac/rails-core';

export class X402Rail implements PaymentRail {
  readonly name = 'x402' as const;
  readonly capabilities = new Set(['oneoff' as const]);

  private timeoutMs: number;

  constructor(options?: { timeoutMs?: number }) {
    this.timeoutMs = options?.timeoutMs ?? 30000; // 30s default
  }

  async initiate(input: { amount: Money; context: unknown }): Promise<PaymentIntent> {
    // x402: intent is lightweight; actual payment happens in confirm
    const intentId = `x402_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    return {
      id: intentId,
      rail: 'x402',
      amount: input.amount,
      meta: {
        created: new Date().toISOString(),
      },
    };
  }

  async confirm(intent: PaymentIntent, ctx?: unknown): Promise<PaymentResult> {
    // x402: for now, simulate deny-safe fallback
    // Real implementation would:
    // 1. Check if x402 payment already made
    // 2. Initiate payment flow
    // 3. Wait for confirmation (with timeout)
    // 4. Return success or retry-after

    // Simplified: return success for amounts <= $0.10, deny for higher
    const amountValue = parseFloat(intent.amount.value);

    if (amountValue <= 0.1) {
      return {
        ok: true,
        reference: intent.id,
        amount: intent.amount,
      };
    }

    return {
      ok: false,
      error: 'Payment required - x402 flow not completed',
      retryAfterSec: 60,
    };
  }

  idempotencyKey(input: { resource: string; purpose?: string; user?: string }): string {
    return idempotencyKey(input);
  }
}
