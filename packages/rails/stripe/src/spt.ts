/**
 * Stripe Shared Payment Token (SPT) evidence mapping.
 *
 * SPTs are Stripe's delegated payment authorization tokens used in the
 * Agentic Commerce Suite. They are seller-scoped, time/amount-bounded
 * credentials that sellers use to create PaymentIntents.
 *
 * Semantic boundary: SPT grant/use/deactivate are DELEGATION lifecycle
 * events, not payment finality events. Commerce extension events are
 * ONLY emitted by fromStripePaymentIntentObservation() when the
 * PaymentIntent status explicitly proves payment state.
 *
 * SPT lifecycle evidence and PaymentIntent evidence are two separate
 * sources even when correlated by token_id.
 */

import type { JsonObject } from '@peac/kernel';
import type { PaymentEvidence } from '@peac/schema';

// Reuse sanitizeMetadata pattern from the main module
type MetadataPolicy = 'omit' | 'passthrough' | 'allowlist';

const METADATA_MAX_KEYS = 20;
const METADATA_MAX_KEY_LENGTH = 40;
const METADATA_MAX_VALUE_LENGTH = 500;
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

// ---------------------------------------------------------------------------
// SPT Types
// ---------------------------------------------------------------------------

/** Stripe Shared Payment Token grant */
export interface StripeSPTGrant {
  id: string;
  token_id: string;
  seller_scope: {
    merchant_id: string;
    restrictions?: Record<string, unknown>;
  };
  amount_limit: string;
  currency: string;
  expires_at?: string;
  external_id?: string;
  network_id?: string;
  metadata?: Record<string, string>;
}

/** Stripe Shared Payment Token use (presentation) */
export interface StripeSPTUse {
  id: string;
  token_id: string;
  amount: string;
  currency: string;
  merchant_id: string;
  payment_intent_id?: string;
  metadata?: Record<string, string>;
}

/** Stripe Shared Payment Token deactivation */
export interface StripeSPTDeactivate {
  id: string;
  token_id: string;
  reason?: string;
  deactivated_by?: string;
  metadata?: Record<string, string>;
}

/** PaymentIntent observation for actual payment-state evidence */
export interface StripePaymentIntentObservation {
  payment_intent_id: string;
  status:
    | 'requires_payment_method'
    | 'requires_confirmation'
    | 'requires_action'
    | 'requires_capture'
    | 'processing'
    | 'succeeded'
    | 'canceled';
  amount?: string;
  currency?: string;
  metadata?: Record<string, string>;
}

/** Options for SPT evidence mapping */
export interface SPTOptions {
  metadataPolicy?: MetadataPolicy;
  metadataAllowedKeys?: string[];
  env?: 'live' | 'test';
}

// ---------------------------------------------------------------------------
// PI status -> commerce event mapping
// ---------------------------------------------------------------------------

const PI_STATUS_TO_COMMERCE: Record<string, string | undefined> = {
  succeeded: 'settlement',
  requires_capture: 'authorization',
  // processing, canceled, and others: no commerce event
};

// ---------------------------------------------------------------------------
// SPT Grant (delegation evidence)
// ---------------------------------------------------------------------------

/**
 * Map SPT grant to PEAC evidence.
 *
 * Records as "delegated payment granted". Commerce extension event is
 * NOT set because grant is a delegation act, not a payment event.
 */
export function fromSPTGrant(grant: StripeSPTGrant, options?: SPTOptions): PaymentEvidence {
  const policy = options?.metadataPolicy ?? 'omit';
  const env = options?.env ?? 'live';

  const evidence: JsonObject = {
    spt_action: 'delegated_payment_granted',
    token_id: grant.token_id,
    seller_merchant_id: grant.seller_scope.merchant_id,
    amount_limit: grant.amount_limit,
  };

  if (grant.expires_at) evidence.expires_at = grant.expires_at;
  if (grant.external_id) evidence.external_id = grant.external_id;
  if (grant.network_id) evidence.network_id = grant.network_id;
  if (grant.seller_scope.restrictions) {
    evidence.seller_restrictions = grant.seller_scope.restrictions as JsonObject;
  }

  if (grant.metadata) {
    const sanitized = sanitizeMetadata(grant.metadata, policy, options?.metadataAllowedKeys);
    if (sanitized) evidence.metadata = sanitized as JsonObject;
  }

  return {
    rail: 'stripe',
    reference: grant.token_id,
    amount: 0,
    currency: grant.currency.toUpperCase(),
    asset: grant.currency.toUpperCase(),
    env,
    evidence,
  };
}

// ---------------------------------------------------------------------------
// SPT Use (delegation evidence)
// ---------------------------------------------------------------------------

/**
 * Map SPT use to PEAC evidence.
 *
 * Records as "delegated payment presented". Commerce extension event is
 * NEVER set from SPT use alone, even with payment_intent_id. A PI
 * reference proves a payment object exists, not that authorization
 * succeeded. Use fromStripePaymentIntentObservation() for actual
 * payment-state evidence.
 */
export function fromSPTUse(use: StripeSPTUse, options?: SPTOptions): PaymentEvidence {
  const policy = options?.metadataPolicy ?? 'omit';
  const env = options?.env ?? 'live';

  const evidence: JsonObject = {
    spt_action: 'delegated_payment_presented',
    token_id: use.token_id,
    merchant_id: use.merchant_id,
  };

  if (use.payment_intent_id) {
    evidence.payment_intent_id = use.payment_intent_id;
  }

  if (use.metadata) {
    const sanitized = sanitizeMetadata(use.metadata, policy, options?.metadataAllowedKeys);
    if (sanitized) evidence.metadata = sanitized as JsonObject;
  }

  const amount = /^[0-9]+$/.test(use.amount) ? parseInt(use.amount, 10) : 0;

  return {
    rail: 'stripe',
    reference: use.token_id,
    amount,
    currency: use.currency.toUpperCase(),
    asset: use.currency.toUpperCase(),
    env,
    evidence,
  };
}

// ---------------------------------------------------------------------------
// SPT Deactivate (delegation evidence)
// ---------------------------------------------------------------------------

/**
 * Map SPT deactivation to PEAC evidence.
 *
 * Records as "delegated payment deactivated". Commerce extension event
 * is NOT set because deactivation is a lifecycle act, not a payment reversal.
 */
export function fromSPTDeactivate(
  deactivate: StripeSPTDeactivate,
  options?: SPTOptions
): PaymentEvidence {
  const env = options?.env ?? 'live';

  const evidence: JsonObject = {
    spt_action: 'delegated_payment_deactivated',
    token_id: deactivate.token_id,
  };

  if (deactivate.reason) evidence.reason = deactivate.reason;
  if (deactivate.deactivated_by) evidence.deactivated_by = deactivate.deactivated_by;

  return {
    rail: 'stripe',
    reference: deactivate.token_id,
    amount: 0,
    currency: 'NONE',
    asset: 'NONE',
    env,
    evidence,
  };
}

// ---------------------------------------------------------------------------
// PaymentIntent Observation (commerce evidence)
// ---------------------------------------------------------------------------

/**
 * Map a Stripe PaymentIntent observation to PEAC evidence.
 *
 * ONLY this function may emit commerce extension events for SPT flows.
 *
 * - succeeded: commerce settlement (payment completed)
 * - requires_capture: commerce authorization (manual capture pending)
 * - processing: observation metadata only (transient, no authorization proof)
 * - canceled: observation metadata only (lifecycle, not void)
 * - others: no commerce event
 */
export function fromStripePaymentIntentObservation(
  observation: StripePaymentIntentObservation,
  options?: SPTOptions
): PaymentEvidence {
  const policy = options?.metadataPolicy ?? 'omit';
  const env = options?.env ?? 'live';

  const commerceEvent = PI_STATUS_TO_COMMERCE[observation.status];

  const evidence: JsonObject = {
    payment_intent_id: observation.payment_intent_id,
    payment_intent_status: observation.status,
  };

  if (commerceEvent) {
    evidence.commerce_event = commerceEvent;
  }

  if (observation.metadata) {
    const sanitized = sanitizeMetadata(observation.metadata, policy, options?.metadataAllowedKeys);
    if (sanitized) evidence.metadata = sanitized as JsonObject;
  }

  const amount =
    observation.amount && /^[0-9]+$/.test(observation.amount)
      ? parseInt(observation.amount, 10)
      : 0;
  const currency = observation.currency?.toUpperCase() ?? 'UNKNOWN';

  return {
    rail: 'stripe',
    reference: observation.payment_intent_id,
    amount,
    currency,
    asset: currency,
    env,
    evidence,
  };
}
