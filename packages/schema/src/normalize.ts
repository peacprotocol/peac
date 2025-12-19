/**
 * Schema Normalization
 *
 * Functions to normalize receipt claims to a canonical form for comparison.
 * Produces byte-identical JCS output regardless of how the receipt was created.
 */

import type { PEACReceiptClaims, Subject } from './types.js';
import type { PaymentEvidence } from './evidence.js';
import type { ControlBlock, ControlStep } from './control.js';

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
  /** Amount in smallest currency unit */
  amt: number;
  /** Currency code (ISO 4217) */
  cur: string;
  /** Normalized payment evidence */
  payment: NormalizedPayment;
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
 * This function produces a normalized object that can be JCS-canonicalized
 * to produce byte-identical output regardless of how the receipt was created
 * (via x402, TAP, RSL, ACP, or direct issuance).
 *
 * The output:
 * - Contains only semantically meaningful fields
 * - Omits undefined optional fields (not null, not empty string)
 * - Uses consistent field ordering (JCS handles this)
 * - Strips rail-specific evidence details
 *
 * @param claims - Receipt claims to normalize
 * @returns Normalized core claims
 *
 * @example
 * ```ts
 * import { toCoreClaims } from '@peac/schema';
 * import { canonicalize } from '@peac/crypto';
 *
 * const core = toCoreClaims(receiptClaims);
 * const canonical = canonicalize(core);
 * // canonical is byte-identical regardless of source
 * ```
 */
export function toCoreClaims(claims: PEACReceiptClaims): CoreClaims {
  const result: CoreClaims = {
    iss: claims.iss,
    aud: claims.aud,
    rid: claims.rid,
    iat: claims.iat,
    amt: claims.amt,
    cur: claims.cur,
    payment: normalizePayment(claims.payment),
  };

  // Only include optional fields if defined
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

/**
 * Check if two receipts have equivalent core claims.
 *
 * This is a convenience function that compares the JCS-canonicalized
 * core claims of two receipts.
 *
 * @param a - First receipt claims
 * @param b - Second receipt claims
 * @returns True if core claims are equivalent
 */
export function coreClaimsEqual(a: PEACReceiptClaims, b: PEACReceiptClaims): boolean {
  const coreA = toCoreClaims(a);
  const coreB = toCoreClaims(b);

  // Use JSON.stringify with sorted keys for comparison
  // (JCS canonicalization would be more correct but this is sufficient for equality)
  return JSON.stringify(sortObject(coreA)) === JSON.stringify(sortObject(coreB));
}

/**
 * Recursively sort object keys for deterministic comparison.
 */
function sortObject(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = sortObject((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}
