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

import type { PEACReceiptInput } from './index.js';

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
export function fromACPSessionLifecycleEvent(event: ACPSessionEvent): PEACReceiptInput {
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
): PEACReceiptInput {
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
export function fromACPInterventionRequired(intervention: ACPIntervention): PEACReceiptInput {
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
