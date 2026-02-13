/**
 * Stripe payment rail adapter
 * Normalizes Stripe webhooks/checkout sessions to PEAC PaymentEvidence
 */

import type { JsonObject } from '@peac/kernel';
import { PaymentEvidence } from '@peac/schema';

/**
 * Stripe Checkout Session (simplified)
 */
export interface StripeCheckoutSession {
  id: string;
  amount_total: number;
  currency: string;
  payment_intent?: string;
  customer?: string;
  metadata?: Record<string, string>;
}

/**
 * Stripe Payment Intent (simplified)
 */
export interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  customer?: string;
  metadata?: Record<string, string>;
}

/**
 * Stripe Crypto Payment Intent (simplified)
 *
 * Represents a Stripe payment intent settled via cryptocurrency,
 * typically through x402 machine-to-machine payment flows.
 */
export interface StripeCryptoPaymentIntent {
  id: string;
  amount: number;
  currency: string;
  /** Crypto asset ticker (e.g., "usdc", "eth") */
  asset: string;
  /** Network identifier (CAIP-2 format, e.g., "eip155:8453") */
  network: string;
  /** On-chain transaction hash */
  tx_hash?: string;
  /** Recipient wallet address */
  recipient?: string;
  customer?: string;
  metadata?: Record<string, string>;
}

/**
 * Stripe webhook event payload
 */
export interface StripeWebhookEvent {
  type: string;
  data: {
    object: StripeCheckoutSession | StripePaymentIntent;
  };
}

/**
 * Normalize Stripe Checkout Session to PEAC PaymentEvidence
 */
export function fromCheckoutSession(
  session: StripeCheckoutSession,
  env: 'live' | 'test' = 'live'
): PaymentEvidence {
  // Validate required fields
  if (!session.id) {
    throw new Error('Stripe checkout session missing id');
  }
  if (typeof session.amount_total !== 'number' || session.amount_total < 0) {
    throw new Error('Stripe checkout session invalid amount_total');
  }
  if (!session.currency || !/^[a-z]{3}$/.test(session.currency)) {
    throw new Error('Stripe checkout session invalid currency (must be lowercase ISO 4217)');
  }

  // Build evidence object with Stripe-specific data
  const evidence: JsonObject = {
    checkout_session_id: session.id,
  };

  if (session.payment_intent) {
    evidence.payment_intent_id = session.payment_intent;
  }

  if (session.customer) {
    evidence.customer_id = session.customer;
  }

  // Include user metadata if present (metadata is Record<string, string> which is JsonObject-compatible)
  if (session.metadata) {
    evidence.metadata = session.metadata;
  }

  return {
    rail: 'stripe',
    reference: session.id,
    amount: session.amount_total,
    currency: session.currency.toUpperCase(), // PEAC requires uppercase
    asset: session.currency.toUpperCase(), // For Stripe, asset is typically same as currency
    env,
    evidence,
  };
}

/**
 * Normalize Stripe Payment Intent to PEAC PaymentEvidence
 */
export function fromPaymentIntent(
  intent: StripePaymentIntent,
  env: 'live' | 'test' = 'live'
): PaymentEvidence {
  // Validate required fields
  if (!intent.id) {
    throw new Error('Stripe payment intent missing id');
  }
  if (typeof intent.amount !== 'number' || intent.amount < 0) {
    throw new Error('Stripe payment intent invalid amount');
  }
  if (!intent.currency || !/^[a-z]{3}$/.test(intent.currency)) {
    throw new Error('Stripe payment intent invalid currency (must be lowercase ISO 4217)');
  }

  // Build evidence object with Stripe-specific data
  const evidence: JsonObject = {
    payment_intent_id: intent.id,
  };

  if (intent.customer) {
    evidence.customer_id = intent.customer;
  }

  // Include user metadata if present (metadata is Record<string, string> which is JsonObject-compatible)
  if (intent.metadata) {
    evidence.metadata = intent.metadata;
  }

  return {
    rail: 'stripe',
    reference: intent.id,
    amount: intent.amount,
    currency: intent.currency.toUpperCase(), // PEAC requires uppercase
    asset: intent.currency.toUpperCase(), // For Stripe, asset is typically same as currency
    env,
    evidence,
  };
}

/** Metadata inclusion policy for crypto payment evidence */
export type MetadataPolicy = 'omit' | 'passthrough' | 'allowlist';

/** Maximum metadata entries when included */
const METADATA_MAX_KEYS = 20;
/** Maximum metadata key length */
const METADATA_MAX_KEY_LENGTH = 40;
/** Maximum metadata value length */
const METADATA_MAX_VALUE_LENGTH = 500;

/** Regex matching invisible Unicode characters (zero-width, direction overrides, BOM) */
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;

function stripInvisible(s: string): string {
  return s.replace(INVISIBLE_RE, '');
}

function sanitizeMetadata(
  raw: Record<string, string>,
  policy: MetadataPolicy,
  allowedKeys?: string[]
): Record<string, string> | undefined {
  if (policy === 'omit') return undefined;

  let entries = Object.entries(raw);

  if (policy === 'allowlist') {
    const allowed = new Set(allowedKeys ?? []);
    entries = entries.filter(([key]) => allowed.has(key));
  }

  // Enforce max entries
  entries = entries.slice(0, METADATA_MAX_KEYS);

  const result: Record<string, string> = {};
  for (const [key, value] of entries) {
    const cleanKey = stripInvisible(key).slice(0, METADATA_MAX_KEY_LENGTH);
    const cleanValue = stripInvisible(String(value)).slice(0, METADATA_MAX_VALUE_LENGTH);
    if (cleanKey.length > 0) {
      result[cleanKey] = cleanValue;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Options for crypto payment intent normalization
 */
export interface CryptoPaymentOptions {
  /** Environment: live or test (default: 'live') */
  env?: 'live' | 'test';
  /** Include Stripe customer ID in evidence (default: false -- privacy) */
  includeCustomerId?: boolean;
  /**
   * Include Stripe metadata in evidence (default: false -- privacy).
   * When true, equivalent to metadataPolicy: 'passthrough'.
   */
  includeMetadata?: boolean;
  /**
   * Metadata inclusion policy (default: 'omit').
   * - 'omit': no metadata in evidence (default)
   * - 'passthrough': include all metadata with bounds enforcement
   * - 'allowlist': include only keys listed in metadataAllowedKeys
   * Takes precedence over includeMetadata when set.
   */
  metadataPolicy?: MetadataPolicy;
  /**
   * Allowed metadata keys when metadataPolicy is 'allowlist'.
   * Keys not in this list are silently dropped.
   */
  metadataAllowedKeys?: string[];
}

/**
 * Normalize Stripe crypto payment intent to PEAC PaymentEvidence
 *
 * Used for x402 machine-to-machine crypto payments settled through Stripe.
 * Unlike fromPaymentIntent(), the asset field is the crypto token (USDC, ETH)
 * and the network field is populated with a CAIP-2 identifier.
 *
 * Privacy: customer_id and metadata are excluded by default. Pass
 * `includeCustomerId: true` or configure `metadataPolicy` to opt in.
 * When metadata is included, values are bounded (key/value length, entry
 * count) and invisible Unicode characters are stripped.
 *
 * Verification meaning: a PEAC receipt containing this evidence is an
 * issuer attestation. Offline verification confirms the receipt's integrity
 * and origin (Ed25519 signature), not on-chain settlement.
 */
export function fromCryptoPaymentIntent(
  intent: StripeCryptoPaymentIntent,
  options?: CryptoPaymentOptions
): PaymentEvidence {
  const env = options?.env ?? 'live';
  const includeCustomerId = options?.includeCustomerId ?? false;
  const includeMetadata = options?.includeMetadata ?? false;
  // Validate required fields
  if (!intent.id) {
    throw new Error('Stripe crypto payment intent missing id');
  }
  if (typeof intent.amount !== 'number' || intent.amount < 0) {
    throw new Error('Stripe crypto payment intent invalid amount');
  }
  if (!intent.currency || !/^[a-z]{3}$/.test(intent.currency)) {
    throw new Error('Stripe crypto payment intent invalid currency (must be lowercase ISO 4217)');
  }
  if (!intent.asset || typeof intent.asset !== 'string') {
    throw new Error('Stripe crypto payment intent missing asset');
  }
  if (!intent.network || typeof intent.network !== 'string') {
    throw new Error('Stripe crypto payment intent missing network');
  }

  // Validate CAIP-2 format: namespace:reference (e.g., "eip155:1", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")
  if (!/^[a-z][a-z0-9-]{2,31}:[a-zA-Z0-9]{1,64}$/.test(intent.network)) {
    throw new Error(
      'Stripe crypto payment intent invalid network (must be CAIP-2 format: namespace:reference)'
    );
  }

  // Validate tx_hash shape if present (opaque hex string, 0x-prefixed for EVM chains)
  if (intent.tx_hash !== undefined) {
    if (typeof intent.tx_hash !== 'string' || intent.tx_hash.length === 0) {
      throw new Error('Stripe crypto payment intent invalid tx_hash (must be non-empty string)');
    }
  }

  // Validate recipient shape if present (opaque address string)
  if (intent.recipient !== undefined) {
    if (typeof intent.recipient !== 'string' || intent.recipient.length === 0) {
      throw new Error('Stripe crypto payment intent invalid recipient (must be non-empty string)');
    }
  }

  // Build evidence object with crypto-specific data
  const evidence: JsonObject = {
    payment_intent_id: intent.id,
    asset: intent.asset.toUpperCase(),
    network: intent.network,
  };

  if (intent.tx_hash) {
    evidence.tx_hash = intent.tx_hash;
  }

  if (intent.recipient) {
    evidence.recipient = intent.recipient;
  }

  if (includeCustomerId && intent.customer) {
    evidence.customer_id = intent.customer;
  }

  // Resolve effective metadata policy
  // metadataPolicy takes precedence over includeMetadata boolean
  let effectivePolicy: MetadataPolicy;
  if (options?.metadataPolicy !== undefined) {
    effectivePolicy = options.metadataPolicy;
  } else if (includeMetadata) {
    effectivePolicy = 'passthrough';
  } else {
    effectivePolicy = 'omit';
  }

  if (effectivePolicy !== 'omit' && intent.metadata) {
    const sanitized = sanitizeMetadata(
      intent.metadata,
      effectivePolicy,
      options?.metadataAllowedKeys
    );
    if (sanitized) {
      evidence.metadata = sanitized;
    }
  }

  return {
    rail: 'stripe',
    reference: intent.id,
    amount: intent.amount,
    currency: intent.currency.toUpperCase(),
    asset: intent.asset.toUpperCase(),
    env,
    network: intent.network,
    evidence,
  };
}

/**
 * Normalize Stripe webhook event to PEAC PaymentEvidence
 *
 * Supports:
 * - checkout.session.completed
 * - payment_intent.succeeded
 */
export function fromWebhookEvent(
  event: StripeWebhookEvent,
  env: 'live' | 'test' = 'live'
): PaymentEvidence {
  const obj = event.data.object;

  // Determine object type by presence of fields
  if ('amount_total' in obj) {
    // Checkout session
    return fromCheckoutSession(obj as StripeCheckoutSession, env);
  } else if ('amount' in obj) {
    // Payment intent
    return fromPaymentIntent(obj as StripePaymentIntent, env);
  }

  throw new Error(`Unsupported Stripe webhook event type: ${event.type}`);
}
