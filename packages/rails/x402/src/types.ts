/**
 * x402 type definitions
 *
 * Supports both v1 and v2 x402 protocol formats.
 */

/**
 * x402 payTo metadata (v2 only)
 *
 * Describes routing information for the payment.
 */
export interface X402PayTo {
  /** Routing mode: direct, callback, or role-based */
  mode?: 'direct' | 'callback' | 'role';
  /** Callback URL for payment completion (if mode === 'callback') */
  callback_url?: string;
  /** Role identifier (if mode === 'role') */
  role?: string;
}

/**
 * x402 Invoice (v1 + v2 compatible)
 *
 * v2 additions: network (CAIP-2), payTo
 */
export interface X402Invoice {
  /** Invoice identifier */
  id: string;
  /** Amount in smallest currency unit */
  amount: number;
  /** ISO 4217 currency code (uppercase) */
  currency: string;
  /** Session identifier (optional) */
  session_id?: string;
  /** Invoice URL for payment (optional) */
  invoice_url?: string;
  /** Memo/description (optional) */
  memo?: string;
  /** Additional metadata (optional) */
  metadata?: Record<string, unknown>;

  // v2 additions
  /** Network identifier: CAIP-2 for v2, "lightning" for v1 (optional) */
  network?: string;
  /** Payment routing metadata - v2 only (optional) */
  payTo?: X402PayTo;
}

/**
 * x402 Settlement (v1 + v2 compatible)
 */
export interface X402Settlement {
  /** Settlement identifier */
  id: string;
  /** Associated invoice ID */
  invoice_id: string;
  /** Amount in smallest currency unit */
  amount: number;
  /** ISO 4217 currency code (uppercase) */
  currency: string;
  /** Settlement timestamp (ISO 8601) */
  settled_at?: string;
  /** Additional metadata (optional) */
  metadata?: Record<string, unknown>;

  // v2 additions
  /** Network identifier: CAIP-2 for v2, "lightning" for v1 (optional) */
  network?: string;
}

/**
 * x402 Webhook event payload
 */
export interface X402WebhookEvent {
  /** Event type (e.g., "invoice.paid", "settlement.completed") */
  type: string;
  /** Event data */
  data: {
    object: X402Invoice | X402Settlement;
  };
}

/**
 * x402-specific evidence structure (inside PaymentEvidence.evidence)
 *
 * This is namespaced inside the opaque evidence field, not at the top level.
 */
export interface X402Evidence {
  /** Invoice ID */
  invoice_id: string;
  /** Which x402 dialect was used */
  dialect: 'v1' | 'v2';
  /** Human-readable network label (e.g., "Base", "Solana") */
  network_label?: string;
  /** x402 v2 payTo object (preserved as-is from invoice) */
  pay_to?: X402PayTo;
  /** Session ID (optional) */
  session_id?: string;
  /** Invoice URL (optional) */
  invoice_url?: string;
  /** Memo (optional) */
  memo?: string;
  /** Settlement ID (for settlements) */
  settlement_id?: string;
  /** Settled at timestamp (for settlements) */
  settled_at?: string;
  /** User-provided metadata */
  metadata?: Record<string, unknown>;
}
