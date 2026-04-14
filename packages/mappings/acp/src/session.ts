/**
 * ACP session lifecycle evidence mapping (DD-188).
 *
 * Maps ACP session states to PEAC evidence WITHOUT synthesizing
 * payment finality from session states. An ACP session "completed"
 * does NOT prove payment settlement. Payment evidence is only
 * produced when an explicit payment-bearing artifact with a known
 * observed payment state is provided by the caller.
 *
 * Two separate functions enforce this boundary:
 * - fromACPSessionLifecycleEvent(): session/access evidence only
 * - fromACPPaymentObservation(): commerce evidence only with explicit payment artifact
 */

import type { JsonObject } from '@peac/kernel';
import type { PaymentEvidence } from '@peac/schema';
import { assertExplicitFinality, type StrictnessMode } from '@peac/adapter-core';

/**
 * PEAC Receipt Input (for issue()).
 * Locally defined to avoid circular import with index.ts.
 * Structurally identical to PEACReceiptInput in index.ts.
 */
export interface SessionReceiptInput {
  subject_uri: string;
  amt: number;
  cur: string;
  payment: PaymentEvidence;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** ACP session states per ACP spec 2026-01-30 */
export type ACPSessionState =
  | 'created'
  | 'updated'
  | 'ready_for_payment'
  | 'in_progress'
  | 'completed'
  | 'canceled'
  | 'not_ready_for_payment';

/** ACP session lifecycle event */
export interface ACPSessionEvent {
  session_id: string;
  state: ACPSessionState;
  resource_uri: string;
  capabilities?: Record<string, unknown>;
  intervention_requirements?: Record<string, unknown>;
  delegated_payment_ref?: string;
  created_at?: string;
  updated_at?: string;
}

/** Observed payment state from an explicit payment-bearing artifact */
export type ObservedPaymentState =
  | 'attempted'
  | 'authorized'
  | 'captured'
  | 'settled'
  | 'failed'
  | 'refunded';

/** Payment artifact with observed state */
export interface ACPPaymentArtifact {
  rail: string;
  reference: string;
  amount: number;
  currency: string;
  observed_payment_state: ObservedPaymentState;
}

/** ACP capability negotiation snapshot */
export interface ACPCapabilityNegotiation {
  session_id: string;
  seller_capabilities?: Record<string, unknown>;
  buyer_capabilities?: Record<string, unknown>;
  negotiated?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

/** ACP intervention requirement */
export interface ACPIntervention {
  session_id: string;
  resource_uri: string;
  type: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Commerce event mapping (payment state -> commerce extension event)
// ---------------------------------------------------------------------------

const PAYMENT_STATE_TO_COMMERCE_EVENT: Record<string, string | undefined> = {
  authorized: 'authorization',
  captured: 'capture',
  settled: 'settlement',
  refunded: 'refund',
  // 'attempted' and 'failed' do NOT map to commerce events
};

// ---------------------------------------------------------------------------
// Session Lifecycle Evidence (access-kind, never commerce)
// ---------------------------------------------------------------------------

/**
 * Map an ACP session lifecycle event to PEAC evidence.
 *
 * Produces session/access evidence ONLY. Never produces commerce evidence.
 * "completed" means "checkout session completed", NOT "payment settled".
 * "canceled" means "session canceled", NOT "payment voided".
 */
export function fromACPSessionLifecycleEvent(event: ACPSessionEvent): SessionReceiptInput {
  if (!event.session_id) {
    throw new Error('ACP session event missing session_id');
  }
  if (!event.resource_uri || !event.resource_uri.startsWith('https://')) {
    throw new Error('ACP session event missing or invalid resource_uri (must be https://)');
  }

  const evidence: JsonObject = {
    acp_session_id: event.session_id,
    acp_session_state: event.state,
  };

  if (event.delegated_payment_ref) {
    evidence.delegated_payment_ref = event.delegated_payment_ref;
  }
  if (event.created_at) evidence.created_at = event.created_at;
  if (event.updated_at) evidence.updated_at = event.updated_at;

  // Access-kind evidence: no commerce extension, no payment rail
  const payment: PaymentEvidence = {
    rail: 'acp',
    reference: event.session_id,
    amount: 0,
    currency: 'NONE',
    asset: 'NONE',
    env: 'live',
    evidence,
  };

  return {
    subject_uri: event.resource_uri,
    amt: 0,
    cur: 'NONE',
    payment,
  };
}

// ---------------------------------------------------------------------------
// Payment Observation (commerce-kind, requires explicit payment artifact)
// ---------------------------------------------------------------------------

/**
 * Map an ACP session event with explicit payment artifact to PEAC commerce evidence.
 *
 * Only called when an explicit payment-bearing artifact with a known
 * observed payment state is present alongside the session event.
 * Commerce extension event is derived from observed_payment_state,
 * NOT from the ACP session state.
 *
 * 'attempted' and 'failed' produce access evidence only (no commerce event).
 */
export function fromACPPaymentObservation(
  event: ACPSessionEvent,
  paymentArtifact: ACPPaymentArtifact
): SessionReceiptInput {
  if (!event.session_id) {
    throw new Error('ACP session event missing session_id');
  }
  if (!event.resource_uri || !event.resource_uri.startsWith('https://')) {
    throw new Error('ACP session event missing or invalid resource_uri (must be https://)');
  }
  if (!paymentArtifact.rail) {
    throw new Error('Payment artifact missing rail');
  }
  if (!paymentArtifact.reference) {
    throw new Error('Payment artifact missing reference');
  }
  if (!paymentArtifact.observed_payment_state) {
    throw new Error('Payment artifact missing observed_payment_state');
  }

  const commerceEvent = PAYMENT_STATE_TO_COMMERCE_EVENT[paymentArtifact.observed_payment_state];

  const evidence: JsonObject = {
    acp_session_id: event.session_id,
    acp_session_state: event.state,
    observed_payment_state: paymentArtifact.observed_payment_state,
  };

  if (commerceEvent) {
    evidence.commerce_event = commerceEvent;
  }
  if (event.delegated_payment_ref) {
    evidence.delegated_payment_ref = event.delegated_payment_ref;
  }

  const payment: PaymentEvidence = {
    rail: paymentArtifact.rail,
    reference: paymentArtifact.reference,
    amount: paymentArtifact.amount,
    currency: paymentArtifact.currency.toUpperCase(),
    asset: paymentArtifact.currency.toUpperCase(),
    env: 'live',
    evidence,
  };

  return {
    subject_uri: event.resource_uri,
    amt: paymentArtifact.amount,
    cur: paymentArtifact.currency.toUpperCase(),
    payment,
  };
}

// ---------------------------------------------------------------------------
// Capability Snapshot (audit metadata)
// ---------------------------------------------------------------------------

/**
 * Create an audit-friendly snapshot of ACP capability negotiation.
 */
export function fromACPCapabilitySnapshot(
  negotiation: ACPCapabilityNegotiation
): Record<string, unknown> {
  return {
    session_id: negotiation.session_id,
    seller_capabilities: negotiation.seller_capabilities ?? null,
    buyer_capabilities: negotiation.buyer_capabilities ?? null,
    negotiated: negotiation.negotiated ?? null,
    extensions: negotiation.extensions ?? null,
    snapshot_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Intervention Required (challenge-kind)
// ---------------------------------------------------------------------------

/**
 * Map an ACP intervention requirement to PEAC challenge-kind evidence.
 */
export function fromACPInterventionRequired(intervention: ACPIntervention): SessionReceiptInput {
  if (!intervention.session_id) {
    throw new Error('ACP intervention missing session_id');
  }
  if (!intervention.resource_uri || !intervention.resource_uri.startsWith('https://')) {
    throw new Error('ACP intervention missing or invalid resource_uri (must be https://)');
  }

  const evidence: JsonObject = {
    acp_session_id: intervention.session_id,
    intervention_type: intervention.type,
  };
  if (intervention.reason) evidence.reason = intervention.reason;
  if (intervention.metadata) {
    evidence.intervention_metadata = intervention.metadata as JsonObject;
  }

  const payment: PaymentEvidence = {
    rail: 'acp',
    reference: intervention.session_id,
    amount: 0,
    currency: 'NONE',
    asset: 'NONE',
    env: 'live',
    evidence,
  };

  return {
    subject_uri: intervention.resource_uri,
    amt: 0,
    cur: 'NONE',
    payment,
  };
}

// ---------------------------------------------------------------------------
// Delegated Payment Observation (v0.12.11)
// ---------------------------------------------------------------------------

/**
 * Closed enum of observed delegated-payment states at the ACP mapper boundary.
 * Mirrors upstream ACP delegated-payment lifecycle states. Documented but not
 * wire-frozen.
 */
export type DelegatedPaymentState = 'authorized' | 'settled' | 'pending' | 'failed' | 'revoked';

/**
 * ACP delegated-payment observation input.
 *
 * The observation captures what an upstream ACP-aware payment surface
 * attested. It does NOT enforce ACP lifecycle, checkout policy, or token
 * verification. Token material (the actual delegated-payment token) is
 * NEVER carried; only an opaque reference is.
 */
export interface ACPDelegatedPaymentObservation {
  /** Delegation identifier from upstream. */
  delegation_id: string;
  /** Resource URI the delegation grants action on; MUST be https://. */
  resource_uri: string;
  /** Principal who authorized the delegation. */
  principal: string;
  /** Delegate that may act on the principal's behalf. */
  delegate: string;
  /**
   * Opaque reference to the payment-method token. NEVER the token material
   * itself.
   */
  payment_method_token_ref: string;
  /**
   * Authorized amount as a base-10 integer string (RFC 8785 compatible).
   * Smallest currency unit. Required.
   */
  authorized_amount_minor: string;
  /** Currency code as supplied by upstream. Required in strict mode. */
  currency: string;
  /** Environment as supplied by upstream. Required in strict mode. */
  env: 'live' | 'test';
  /** Observed delegated-payment state from the upstream artifact. */
  observed_payment_state: DelegatedPaymentState;
  /**
   * Raw upstream artifact, preserved verbatim under
   * `proofs.acp.delegated_payment.upstream_artifact`. Opaque.
   */
  upstream_artifact: unknown;
  /** Optional session correlation. */
  session_id?: string;
}

export interface ACPDelegatedPaymentOptions {
  mode?: StrictnessMode;
  warn?: (message: string) => void;
}

const DELEGATED_STATE_TO_COMMERCE_EVENT: Record<DelegatedPaymentState, string | undefined> = {
  authorized: 'authorization',
  settled: 'settlement',
  pending: undefined,
  failed: undefined,
  revoked: undefined,
};

/**
 * Map an ACP delegated-payment observation to PEAC evidence.
 *
 * Observational mapping only. Does NOT enforce ACP lifecycle, checkout
 * policy, or payment-method-token verification. Routes through the shared
 * mapper-boundary finality-synthesis guard so that:
 *
 *  - `pending`, `failed`, `revoked` produce evidence with NO commerce event.
 *  - `authorized` and `settled` produce a commerce event only when the
 *    upstream artifact is present (which it always is for this function;
 *    the guard rejects otherwise).
 *  - Strict mode rejects missing or upstream-unknown currency and any
 *    env value outside the closed `live` | `test` enum.
 *
 * The raw upstream artifact is preserved verbatim under
 * `proofs.acp.delegated_payment.upstream_artifact`.
 */
export function fromACPDelegatedPaymentObservation(
  observation: ACPDelegatedPaymentObservation,
  options: ACPDelegatedPaymentOptions = {}
): SessionReceiptInput {
  if (!observation.delegation_id) {
    throw new Error('ACP delegated-payment observation missing delegation_id');
  }
  if (!observation.resource_uri || !observation.resource_uri.startsWith('https://')) {
    throw new Error(
      'ACP delegated-payment observation missing or invalid resource_uri (must be https://)'
    );
  }
  if (!observation.principal) {
    throw new Error('ACP delegated-payment observation missing principal');
  }
  if (!observation.delegate) {
    throw new Error('ACP delegated-payment observation missing delegate');
  }
  if (!observation.payment_method_token_ref) {
    throw new Error('ACP delegated-payment observation missing payment_method_token_ref');
  }
  if (!observation.observed_payment_state) {
    throw new Error('ACP delegated-payment observation missing observed_payment_state');
  }
  if (!/^-?[0-9]+$/.test(observation.authorized_amount_minor)) {
    throw new Error(
      'ACP delegated-payment observation authorized_amount_minor must be a base-10 integer string'
    );
  }

  const commerceEvent = DELEGATED_STATE_TO_COMMERCE_EVENT[observation.observed_payment_state];
  // The upstream artifact is required by the input contract, so it is always
  // explicit when this mapper is called. The guard still runs to reject
  // synthesis when callers misuse the function and to enforce strict-mode
  // rules on currency and env.
  assertExplicitFinality(
    {
      event: commerceEvent,
      hasExplicitUpstreamArtifact: observation.upstream_artifact !== undefined,
      currency: observation.currency,
      env: observation.env,
      envExplicit: observation.env === 'live' || observation.env === 'test',
    },
    {
      mode: options.mode,
      warn: options.warn,
      pointer: '/proofs/acp/delegated_payment',
    }
  );

  const evidence: JsonObject = {
    acp_delegation_id: observation.delegation_id,
    acp_principal: observation.principal,
    acp_delegate: observation.delegate,
    acp_payment_method_token_ref: observation.payment_method_token_ref,
    observed_payment_state: observation.observed_payment_state,
    proofs: {
      acp: {
        delegated_payment: {
          upstream_artifact: observation.upstream_artifact as JsonObject,
        },
      },
    } as JsonObject,
  };
  if (commerceEvent) {
    evidence.commerce_event = commerceEvent;
  }
  if (observation.session_id) {
    evidence.acp_session_id = observation.session_id;
  }

  // Amount in major units derived from authorized_amount_minor for the
  // PaymentEvidence.amount surface. Mappings preserve the canonical minor
  // string under evidence; PaymentEvidence carries the major projection.
  const amountMinor = parseInt(observation.authorized_amount_minor, 10);

  const payment: PaymentEvidence = {
    rail: 'acp-delegated-payment',
    reference: observation.delegation_id,
    amount: amountMinor,
    currency: observation.currency.toUpperCase(),
    asset: observation.currency.toUpperCase(),
    env: observation.env,
    evidence,
  };

  return {
    subject_uri: observation.resource_uri,
    amt: amountMinor,
    cur: observation.currency.toUpperCase(),
    payment,
  };
}
