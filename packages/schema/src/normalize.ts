/**
 * Schema Normalization
 *
 * Functions to normalize receipt claims to a canonical form for comparison.
 * Produces byte-identical JCS output regardless of how the receipt was created.
 */

import type { PEACReceiptClaims, Subject } from './types.js';
import type { PaymentEvidence } from './evidence.js';
import type { ControlBlock, ControlStep } from './control.js';
import type { AttestationReceiptClaims } from './attestation-receipt.js';
import type { ParseSuccess } from './receipt-parser.js';

/**
 * Normalized core claims for comparison.
 *
 * This is the minimal set of fields that represent the semantic meaning
 * of a receipt. All optional fields that are undefined are omitted.
 */
export interface CoreClaims {
  /** Issuer URL */
  iss: string;
  /** Audience / resource URL */
  aud: string;
  /** Receipt ID */
  rid: string;
  /** Issued at timestamp */
  iat: number;
  /** Expiry timestamp (omitted if not present) */
  exp?: number;
  /** Amount in smallest currency unit (commerce receipts) */
  amt?: number;
  /** Currency code (ISO 4217, commerce receipts) */
  cur?: string;
  /** Normalized payment evidence (commerce receipts) */
  payment?: NormalizedPayment;
  /** Subject (omitted if not present) */
  subject?: Subject;
  /** Control block (omitted if not present) */
  control?: NormalizedControl;
}

/**
 * Normalized payment evidence for comparison.
 *
 * Only includes the semantic fields, not rail-specific evidence.
 */
export interface NormalizedPayment {
  rail: string;
  reference: string;
  amount: number;
  currency: string;
  asset: string;
  env: 'live' | 'test';
  network?: string;
  aggregator?: string;
  routing?: 'direct' | 'callback' | 'role';
}

/**
 * Normalized control block for comparison.
 */
export interface NormalizedControl {
  chain: NormalizedControlStep[];
}

/**
 * Normalized control step for comparison.
 */
export interface NormalizedControlStep {
  engine: string;
  result: string;
}

/**
 * Normalize a payment evidence object.
 *
 * Extracts only the semantic fields, omitting rail-specific evidence
 * and optional fields that are undefined.
 */
function normalizePayment(payment: PaymentEvidence): NormalizedPayment {
  const result: NormalizedPayment = {
    rail: payment.rail,
    reference: payment.reference,
    amount: payment.amount,
    currency: payment.currency,
    asset: payment.asset,
    env: payment.env,
  };

  // Only include optional fields if defined
  if (payment.network !== undefined) {
    result.network = payment.network;
  }
  if (payment.aggregator !== undefined) {
    result.aggregator = payment.aggregator;
  }
  if (payment.routing !== undefined) {
    result.routing = payment.routing;
  }

  return result;
}

/**
 * Normalize a control step.
 */
function normalizeControlStep(step: ControlStep): NormalizedControlStep {
  return {
    engine: step.engine,
    result: step.result,
  };
}

/**
 * Normalize a control block.
 */
function normalizeControl(control: ControlBlock): NormalizedControl {
  return {
    chain: control.chain.map(normalizeControlStep),
  };
}

/**
 * Extract core claims from a receipt for comparison.
 *
 * Supports both commerce and attestation receipts. Accepts either a
 * ParseSuccess result from parseReceiptClaims() (preferred) or bare
 * PEACReceiptClaims (backward compat).
 *
 * For attestation receipts, maps sub -> subject.uri (normative mapping
 * per PEAC attestation profile -- sub is a URI identifying the
 * interaction target).
 *
 * The output:
 * - Contains only semantically meaningful fields
 * - Omits undefined optional fields (not null, not empty string)
 * - Uses consistent field ordering (JCS handles this)
 * - Strips rail-specific evidence details
 *
 * @param input - Parsed receipt result or bare commerce claims
 * @returns Normalized core claims
 *
 * @example
 * ```ts
 * import { parseReceiptClaims, toCoreClaims } from '@peac/schema';
 *
 * const parsed = parseReceiptClaims(decodedPayload);
 * if (parsed.ok) {
 *   const core = toCoreClaims(parsed);
 * }
 * ```
 */
export function toCoreClaims(parsed: ParseSuccess): CoreClaims;
export function toCoreClaims(claims: PEACReceiptClaims): CoreClaims;
export function toCoreClaims(input: ParseSuccess | PEACReceiptClaims): CoreClaims {
  // Detect ParseSuccess shape
  if ('ok' in input && input.ok === true && 'variant' in input) {
    const parsed = input as ParseSuccess;
    if (parsed.variant === 'commerce') {
      return commerceCoreClaims(parsed.claims as PEACReceiptClaims);
    }
    return attestationCoreClaims(parsed.claims as AttestationReceiptClaims);
  }
  // Legacy: bare PEACReceiptClaims (backward compat)
  return commerceCoreClaims(input as PEACReceiptClaims);
}

function commerceCoreClaims(claims: PEACReceiptClaims): CoreClaims {
  const result: CoreClaims = {
    iss: claims.iss,
    aud: claims.aud,
    rid: claims.rid,
    iat: claims.iat,
    ...(claims.amt !== undefined && { amt: claims.amt }),
    ...(claims.cur !== undefined && { cur: claims.cur }),
    ...(claims.payment !== undefined && { payment: normalizePayment(claims.payment) }),
  };

  if (claims.exp !== undefined) {
    result.exp = claims.exp;
  }

  if (claims.subject !== undefined) {
    result.subject = { uri: claims.subject.uri };
  }

  if (claims.ext?.control !== undefined) {
    result.control = normalizeControl(claims.ext.control);
  }

  return result;
}

function attestationCoreClaims(claims: AttestationReceiptClaims): CoreClaims {
  const result: CoreClaims = {
    iss: claims.iss,
    aud: claims.aud,
    rid: claims.rid,
    iat: claims.iat,
  };

  if (claims.exp !== undefined) {
    result.exp = claims.exp;
  }

  // sub -> subject.uri mapping: attestation profile uses sub (string)
  // as the interaction target URI, equivalent to commerce subject.uri
  if (claims.sub !== undefined) {
    result.subject = { uri: claims.sub };
  }

  return result;
}
