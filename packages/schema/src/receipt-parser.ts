/**
 * Unified Receipt Parser
 *
 * Single entry point for classifying and validating receipt claims.
 * Supports both commerce (payment) and attestation receipt profiles.
 *
 * Classification uses key presence ('amt' in obj), NOT truthy values.
 * If any of amt|cur|payment are present, the receipt is classified as commerce.
 * If commerce validation fails, it returns a commerce error -- never falls
 * through to attestation.
 */

import { ZodError } from 'zod';
import { ReceiptClaimsSchema, type ReceiptClaimsType } from './validators.js';
import {
  AttestationReceiptClaimsSchema,
  type AttestationReceiptClaims,
} from './attestation-receipt.js';

/**
 * Receipt variant discriminator
 */
export type ReceiptVariant = 'commerce' | 'attestation';

/**
 * Parse error with canonical error code
 */
export interface PEACParseError {
  /** Canonical error code from specs/kernel/errors.json */
  code: string;
  /** Human-readable message */
  message: string;
  /** Zod issues (if schema validation failed) */
  issues?: ZodError['issues'];
}

/**
 * Successful parse result
 */
export interface ParseSuccess {
  ok: true;
  variant: ReceiptVariant;
  claims: ReceiptClaimsType | AttestationReceiptClaims;
}

/**
 * Failed parse result
 */
export interface ParseFailure {
  ok: false;
  error: PEACParseError;
}

/**
 * Parse result type
 */
export type ParseReceiptResult = ParseSuccess | ParseFailure;

/**
 * Options for parseReceiptClaims (extensible for future wire versions)
 */
export interface ParseReceiptOptions {
  /** Reserved for future use (wire version discrimination in v0.12.0+) */
  wireVersion?: string;
}

/**
 * Classify a claims object as commerce or attestation.
 *
 * Uses key presence (not truthiness). If ANY of amt, cur, payment
 * are present as keys, the receipt is classified as commerce.
 */
function classifyReceipt(obj: Record<string, unknown>): ReceiptVariant {
  if ('amt' in obj || 'cur' in obj || 'payment' in obj) {
    return 'commerce';
  }
  return 'attestation';
}

/**
 * Parse and validate receipt claims.
 *
 * Unified entry point for both commerce and attestation receipt validation.
 * Classification is strict: if any commerce key (amt, cur, payment) is present,
 * the receipt MUST validate as commerce. There is no fallback to attestation.
 *
 * @param input - Raw claims object (typically decoded from JWS payload)
 * @param _opts - Reserved for future use
 * @returns Parse result with variant discrimination and validated claims, or error
 */
export function parseReceiptClaims(
  input: unknown,
  _opts?: ParseReceiptOptions
): ParseReceiptResult {
  // Guard: input must be a non-null object
  if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      error: {
        code: 'E_PARSE_INVALID_INPUT',
        message: 'Input must be a non-null object',
      },
    };
  }

  const obj = input as Record<string, unknown>;
  const variant = classifyReceipt(obj);

  if (variant === 'commerce') {
    const result = ReceiptClaimsSchema.safeParse(obj);
    if (!result.success) {
      return {
        ok: false,
        error: {
          code: 'E_PARSE_COMMERCE_INVALID',
          message: `Commerce receipt validation failed: ${result.error.issues.map((i) => i.message).join('; ')}`,
          issues: result.error.issues,
        },
      };
    }
    return {
      ok: true,
      variant: 'commerce',
      claims: result.data,
    };
  }

  // Attestation path
  const result = AttestationReceiptClaimsSchema.safeParse(obj);
  if (!result.success) {
    return {
      ok: false,
      error: {
        code: 'E_PARSE_ATTESTATION_INVALID',
        message: `Attestation receipt validation failed: ${result.error.issues.map((i) => i.message).join('; ')}`,
        issues: result.error.issues,
      },
    };
  }
  return {
    ok: true,
    variant: 'attestation',
    claims: result.data,
  };
}
