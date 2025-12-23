/**
 * Razorpay payment rail adapter types
 */

/**
 * Privacy configuration for VPA handling
 */
export interface RazorpayPrivacyConfig {
  /**
   * Store raw VPA instead of hash.
   * Default: false (hash by default for privacy)
   *
   * WARNING: Setting this to true stores PII (VPA addresses) in receipts.
   * Only use if you have explicit consent and a legitimate business need.
   */
  storeRawVpa?: boolean;

  /**
   * HMAC key for VPA hashing.
   * Default: use webhookSecret
   *
   * Changing this key will change all VPA hashes, which may affect
   * audit trails and analytics continuity.
   */
  hashKey?: string;
}

/**
 * Razorpay adapter configuration
 *
 * Follows least-privilege principle:
 * - webhookSecret: Required for signature verification
 * - keyId/keySecret: Optional, only needed for API calls
 */
export interface RazorpayConfig {
  /**
   * Webhook secret for signature verification (required)
   * Found in Razorpay Dashboard > Webhooks > Secret
   */
  webhookSecret: string;

  /**
   * Razorpay Key ID for observability (optional)
   * Included in evidence for debugging, not used for verification
   */
  keyId?: string;

  /**
   * Razorpay Key Secret for API calls (optional)
   * Only needed if making Razorpay API calls; not needed for webhooks
   */
  keySecret?: string;

  /**
   * Privacy settings for handling sensitive data
   */
  privacy?: RazorpayPrivacyConfig;
}

/**
 * Razorpay payment entity (from webhook payload)
 */
export interface RazorpayPaymentEntity {
  id: string;
  entity: 'payment';
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  order_id?: string;
  invoice_id?: string;
  international: boolean;
  method: 'upi' | 'card' | 'netbanking' | 'wallet' | 'emi' | 'bank_transfer';
  amount_refunded: number;
  refund_status?: 'null' | 'partial' | 'full';
  captured: boolean;
  description?: string;
  card_id?: string;
  bank?: string;
  wallet?: string;
  vpa?: string;
  email?: string;
  contact?: string;
  customer_id?: string;
  notes?: Record<string, string>;
  fee?: number;
  tax?: number;
  error_code?: string;
  error_description?: string;
  error_source?: string;
  error_step?: string;
  error_reason?: string;
  acquirer_data?: {
    rrn?: string;
    auth_code?: string;
    bank_transaction_id?: string;
  };
  created_at: number;
  upi?: {
    vpa?: string;
    payer_account_type?: string;
  };
  card?: {
    id?: string;
    entity?: 'card';
    name?: string;
    last4?: string;
    network?:
      | 'Visa'
      | 'MasterCard'
      | 'RuPay'
      | 'Diners Club'
      | 'American Express'
      | 'Maestro'
      | string;
    type?: 'credit' | 'debit' | 'prepaid';
    issuer?: string;
    international?: boolean;
    emi?: boolean;
    token_iin?: string;
  };
}

/**
 * Razorpay webhook event payload
 */
export interface RazorpayWebhookEvent {
  entity: 'event';
  account_id: string;
  event: string;
  contains: string[];
  payload: {
    payment?: {
      entity: RazorpayPaymentEntity;
    };
  };
  created_at: number;
}

/**
 * Supported webhook event types for payment processing
 */
export type RazorpayPaymentEventType = 'payment.authorized' | 'payment.captured' | 'payment.failed';

/**
 * Environment for Razorpay (live or test)
 */
export type RazorpayEnv = 'live' | 'test';
