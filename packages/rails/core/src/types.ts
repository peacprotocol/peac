/**
 * @peac/rails-core
 * Payment rail interface and registry for unified settlement
 */

export interface Money {
  value: string; // Decimal string (e.g., "0.10")
  currency: string; // ISO 4217 code (e.g., "USD")
}

export interface PaymentIntent {
  id: string; // Rail-specific intent ID
  rail: 'x402' | 'stripe' | 'acp-credits';
  amount: Money;
  meta?: Record<string, unknown>; // Rail-specific metadata
}

export interface PaymentResult {
  ok: boolean;
  reference?: string; // Transaction/charge ID (redacted in logs)
  amount?: Money;
  retryAfterSec?: number; // Retry-After hint for 402 responses
  error?: string; // Human-readable error message
}

export type RailCapability = 'oneoff' | 'refund' | 'webhook';

export interface PaymentRail {
  readonly name: 'x402' | 'stripe' | 'acp-credits';
  readonly capabilities: Set<RailCapability>;

  /**
   * Initiate a payment intent
   */
  initiate(input: { amount: Money; context: unknown }): Promise<PaymentIntent>;

  /**
   * Confirm and settle a payment intent
   */
  confirm(intent: PaymentIntent, ctx?: unknown): Promise<PaymentResult>;

  /**
   * Refund a settled payment (optional)
   */
  refund?(reference: string, amount?: Money): Promise<{ ok: boolean }>;

  /**
   * Generate idempotency key for resource+purpose+user
   */
  idempotencyKey(input: { resource: string; purpose?: string; user?: string }): string;
}
