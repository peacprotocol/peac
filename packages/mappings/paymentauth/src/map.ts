/**
 * Paymentauth evidence mapping.
 *
 * Maps normalized paymentauth artifacts to PEAC PaymentEvidence and
 * commerce extension fields. Only populates fields backed by actual
 * upstream data; never synthesizes missing information.
 *
 * receipt_ref is computed from the raw upstream artifact (the literal
 * header value received), NOT assumed to be a JWS envelope.
 */

import type { JsonObject } from '@peac/kernel';
import type { PaymentEvidence } from '@peac/schema';
import { assertExplicitFinality, type StrictnessMode } from '@peac/adapter-core';

import { PAYMENTAUTH_RAIL } from './constants.js';
import type { NormalizedPaymentauthReceipt, NormalizedPaymentauthChallenge } from './types.js';

/**
 * Options for paymentauth mapping functions. Controls the mapper-boundary
 * finality-synthesis guard mode. Default `interop` preserves current
 * consumer behavior on silent fallbacks while emitting warnings; `strict`
 * rejects fallbacks; `legacy` is silent.
 */
export interface PaymentauthMapOptions {
  mode?: StrictnessMode;
  warn?: (message: string) => void;
}

/**
 * Map a paymentauth receipt (with optional challenge context) to PEAC PaymentEvidence.
 *
 * Only populates fields that the source artifacts actually provide.
 * Amount and currency are extracted from the decoded challenge request
 * if available and object-shaped; otherwise omitted.
 *
 * @param receipt - Normalized paymentauth receipt
 * @param challenge - Optional normalized challenge that preceded this receipt
 * @returns PaymentEvidence with fields backed by upstream data
 */
export function fromPaymentauthReceipt(
  receipt: NormalizedPaymentauthReceipt,
  challenge?: NormalizedPaymentauthChallenge,
  options: PaymentauthMapOptions = {}
): PaymentEvidence {
  // Extract amount/currency from challenge request if available
  let amount: number | undefined;
  let currency: string | undefined;
  let asset: string | undefined;

  if (challenge?.decodedRequest && typeof challenge.decodedRequest === 'object') {
    const req = challenge.decodedRequest as Record<string, unknown>;
    if (typeof req.amount === 'string' && /^[0-9]+$/.test(req.amount)) {
      amount = parseInt(req.amount, 10);
    } else if (typeof req.amount === 'number' && Number.isFinite(req.amount)) {
      amount = req.amount;
    }
    if (typeof req.currency === 'string' && req.currency.length > 0) {
      currency = req.currency.toUpperCase();
      asset = currency;
    }
  }

  // Build evidence metadata from available upstream data
  const evidenceMeta: JsonObject = {
    paymentauth_method: receipt.method,
    paymentauth_status: receipt.status,
  };
  if (receipt.timestamp) evidenceMeta.timestamp = receipt.timestamp;
  if (challenge) {
    evidenceMeta.challenge_id = challenge.id;
    evidenceMeta.challenge_intent = challenge.intent;
    evidenceMeta.challenge_realm = challenge.realm;
  }
  if (Object.keys(receipt.extras).length > 0) {
    evidenceMeta.receipt_extras = receipt.extras as JsonObject;
  }

  // Mapper-boundary finality-synthesis guard: rejects silent fallbacks under
  // strict mode; warns under interop (default); silent under legacy.
  // Does not reject the call when no commerce.event is being emitted, which
  // matches paymentauth/receipt mapping (event is set by callers downstream).
  assertExplicitFinality(
    {
      event: undefined,
      hasExplicitUpstreamArtifact: true,
      currency,
      env: 'live',
      envExplicit: false,
    },
    { mode: options.mode, warn: options.warn, pointer: '/payment/paymentauth/receipt' }
  );

  return {
    rail: PAYMENTAUTH_RAIL,
    reference: receipt.reference ?? receipt._raw.rawValue.substring(0, 32),
    amount: amount ?? 0,
    currency: currency ?? 'UNKNOWN',
    asset: asset ?? currency ?? 'UNKNOWN',
    env: 'live',
    evidence: evidenceMeta,
  };
}

/**
 * Extract partial commerce extension fields from paymentauth artifacts.
 *
 * Only returns fields that the source data actually provides.
 * Returns undefined if no commerce-relevant data is available.
 */
export function toCommerceExtensionFields(
  receipt: NormalizedPaymentauthReceipt,
  challenge?: NormalizedPaymentauthChallenge,
  options: PaymentauthMapOptions = {}
):
  | Partial<{
      payment_rail: string;
      amount_minor: string;
      currency: string;
      reference: string;
      env: 'live' | 'test';
    }>
  | undefined {
  const fields: Record<string, string> = {};
  fields.payment_rail = PAYMENTAUTH_RAIL;

  if (challenge?.decodedRequest && typeof challenge.decodedRequest === 'object') {
    const req = challenge.decodedRequest as Record<string, unknown>;
    if (typeof req.amount === 'string' && /^-?[0-9]+$/.test(req.amount)) {
      fields.amount_minor = req.amount;
    }
    if (typeof req.currency === 'string' && req.currency.length > 0) {
      fields.currency = req.currency.toUpperCase();
    }
  }

  if (receipt.reference) {
    fields.reference = receipt.reference;
  }

  // Only return if we have at least rail + one other field
  if (Object.keys(fields).length <= 1) return undefined;

  // Mapper-boundary finality-synthesis guard: same posture as
  // fromPaymentauthReceipt. No event is emitted here, so the guard checks
  // currency and env defaults only. Defaulted env: 'live' is the historical
  // behavior; strict mode rejects, interop (default) warns.
  assertExplicitFinality(
    {
      event: undefined,
      hasExplicitUpstreamArtifact: true,
      currency: fields.currency,
      env: 'live',
      envExplicit: false,
    },
    { mode: options.mode, warn: options.warn, pointer: '/payment/paymentauth/commerce-extension' }
  );

  return { ...fields, env: 'live' } as ReturnType<typeof toCommerceExtensionFields>;
}

// ---------------------------------------------------------------------------
// MPP / paymentauth payment-attempt and settlement evidence (v0.12.11)
// ---------------------------------------------------------------------------

/**
 * Closed enum of paymentauth artifact kinds. Mirrors the pattern used by
 * the ACP delegated-payment mapper so that a settlement-bearing artifact
 * is never confused with an authorization-bearing artifact.
 */
export type PaymentauthArtifactKind = 'authorization' | 'settlement';

/**
 * Input for fromMPPPaymentAttempt.
 *
 * Models an upstream payment-attempt artifact in the paymentauth /
 * draft-ryan-httpauth-payment-01 family. Observation only: PEAC does not
 * verify payment tokens, bind facilitators, or reason about settlement
 * guarantees. Token material is NEVER carried; only an opaque token
 * reference is preserved.
 */
export interface MPPPaymentAttemptInput {
  /** Upstream attempt identifier. */
  attempt_id: string;
  /** Currency code as supplied by upstream. Required in strict mode. */
  currency: string;
  /** Amount in minor units (smallest currency unit) as a base-10 string. */
  amount_minor: string;
  /** Environment as supplied by upstream. */
  env: 'live' | 'test';
  /** Opaque payment-token reference. NEVER token material. */
  payment_token_ref: string;
  /**
   * Discriminator naming what the upstream artifact attests. MUST be
   * 'authorization' for fromMPPPaymentAttempt.
   */
  artifact_kind: PaymentauthArtifactKind;
  /**
   * Optional facilitator attestation, preserved verbatim under
   * proofs.paymentauth.attempt.facilitator_attestation when present.
   */
  facilitator_attestation?: unknown;
  /**
   * Raw upstream attempt artifact, preserved verbatim under
   * proofs.paymentauth.attempt.upstream_artifact. Opaque to PEAC.
   */
  upstream_artifact: unknown;
  /** Optional correlation reference (e.g. challenge id from preceding 402). */
  challenge_id?: string;
}

/**
 * Input for fromMPPSettlement.
 *
 * Models an upstream settlement attestation. The artifact_kind MUST be
 * 'settlement'; absent or 'authorization' is rejected by the mapper-
 * boundary finality-synthesis guard in all strictness modes.
 */
export interface MPPSettlementInput {
  /** Settlement identifier from upstream. */
  settlement_id: string;
  /** Originating attempt id (correlates with fromMPPPaymentAttempt). */
  attempt_id?: string;
  /** Currency code as supplied by upstream. Required in strict mode. */
  currency: string;
  /** Settled amount in minor units (smallest currency unit). */
  amount_minor: string;
  /** Environment as supplied by upstream. */
  env: 'live' | 'test';
  /**
   * Discriminator naming what the upstream artifact attests. MUST be
   * 'settlement' for fromMPPSettlement.
   */
  artifact_kind: PaymentauthArtifactKind;
  /** Optional facilitator-signed settlement statement. */
  facilitator_attestation?: unknown;
  /**
   * Raw upstream settlement artifact, preserved verbatim under
   * proofs.paymentauth.settlement.upstream_artifact. Opaque to PEAC.
   */
  upstream_artifact: unknown;
}

/**
 * Map an MPP / paymentauth payment-attempt artifact to PEAC commerce
 * evidence with commerce.event = 'authorization'. Routes through the
 * mapper-boundary finality-synthesis guard.
 *
 * Observational mapping only. PEAC does not verify payment tokens or bind
 * facilitators. Strict mode rejects missing or UNKNOWN currency, env
 * outside the closed live|test enum, missing or mismatched artifact_kind,
 * or non-integer amount_minor. Interop emits a deprecation warning on
 * silent fallbacks; legacy is silent. Rule 1 (artifact_kind mismatch)
 * rejects in all modes.
 */
export function fromMPPPaymentAttempt(
  input: MPPPaymentAttemptInput,
  options: PaymentauthMapOptions = {}
): PaymentEvidence {
  if (!input.attempt_id) {
    throw new Error('MPP payment-attempt missing attempt_id');
  }
  if (!input.payment_token_ref) {
    throw new Error('MPP payment-attempt missing payment_token_ref');
  }
  if (!/^-?[0-9]+$/.test(input.amount_minor)) {
    throw new Error('MPP payment-attempt amount_minor must be a base-10 integer string');
  }

  const hasExplicitUpstreamArtifact =
    input.upstream_artifact !== undefined && input.artifact_kind === 'authorization';

  assertExplicitFinality(
    {
      event: 'authorization',
      hasExplicitUpstreamArtifact,
      currency: input.currency,
      env: input.env,
      envExplicit: input.env === 'live' || input.env === 'test',
    },
    {
      mode: options.mode,
      warn: options.warn,
      pointer: '/proofs/paymentauth/attempt',
    }
  );

  const evidence: JsonObject = {
    paymentauth_method: 'paymentauth',
    paymentauth_attempt_id: input.attempt_id,
    payment_token_ref: input.payment_token_ref,
    commerce_event: 'authorization',
    proofs: {
      paymentauth: {
        attempt: {
          upstream_artifact: input.upstream_artifact as JsonObject,
          artifact_kind: input.artifact_kind,
          ...(input.facilitator_attestation !== undefined
            ? { facilitator_attestation: input.facilitator_attestation as JsonObject }
            : {}),
        },
      },
    } as JsonObject,
  };
  if (input.challenge_id) {
    evidence.challenge_id = input.challenge_id;
  }

  const amount = parseInt(input.amount_minor, 10);
  return {
    rail: PAYMENTAUTH_RAIL,
    reference: input.attempt_id,
    amount,
    currency: input.currency.toUpperCase(),
    asset: input.currency.toUpperCase(),
    env: input.env,
    evidence,
  };
}

/**
 * Map an MPP / paymentauth settlement attestation to PEAC commerce
 * evidence with commerce.event = 'settlement'. Routes through the
 * mapper-boundary finality-synthesis guard. Settlement requires an
 * artifact_kind = 'settlement' discriminator; mismatch or absence is a
 * finality-rule violation rejected in all strictness modes.
 */
export function fromMPPSettlement(
  input: MPPSettlementInput,
  options: PaymentauthMapOptions = {}
): PaymentEvidence {
  if (!input.settlement_id) {
    throw new Error('MPP settlement missing settlement_id');
  }
  if (!/^-?[0-9]+$/.test(input.amount_minor)) {
    throw new Error('MPP settlement amount_minor must be a base-10 integer string');
  }

  const hasExplicitUpstreamArtifact =
    input.upstream_artifact !== undefined && input.artifact_kind === 'settlement';

  assertExplicitFinality(
    {
      event: 'settlement',
      hasExplicitUpstreamArtifact,
      currency: input.currency,
      env: input.env,
      envExplicit: input.env === 'live' || input.env === 'test',
    },
    {
      mode: options.mode,
      warn: options.warn,
      pointer: '/proofs/paymentauth/settlement',
    }
  );

  const evidence: JsonObject = {
    paymentauth_method: 'paymentauth',
    paymentauth_settlement_id: input.settlement_id,
    commerce_event: 'settlement',
    proofs: {
      paymentauth: {
        settlement: {
          upstream_artifact: input.upstream_artifact as JsonObject,
          artifact_kind: input.artifact_kind,
          ...(input.facilitator_attestation !== undefined
            ? { facilitator_attestation: input.facilitator_attestation as JsonObject }
            : {}),
        },
      },
    } as JsonObject,
  };
  if (input.attempt_id) {
    evidence.paymentauth_attempt_id = input.attempt_id;
  }

  const amount = parseInt(input.amount_minor, 10);
  return {
    rail: PAYMENTAUTH_RAIL,
    reference: input.settlement_id,
    amount,
    currency: input.currency.toUpperCase(),
    asset: input.currency.toUpperCase(),
    env: input.env,
    evidence,
  };
}
