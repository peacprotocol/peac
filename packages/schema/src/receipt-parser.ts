/**
 * Unified Receipt Parser
 *
 * Single entry point for classifying and validating receipt claims.
 * Supports Wire 0.1 (commerce and attestation) and Wire 0.2 receipts.
 *
 * Wire 0.1 classification uses key presence ('amt' in obj), NOT truthy values.
 * If any of amt|cur|payment are present, the receipt is classified as commerce.
 * If commerce validation fails, it returns a commerce error -- never falls
 * through to attestation.
 *
 * Wire 0.2 detection uses the peac_version field (value '0.2').
 */

import { ZodError } from 'zod';
import type { VerificationWarning } from '@peac/kernel';
import { ReceiptClaimsSchema, type ReceiptClaimsType } from './validators.js';
import {
  AttestationReceiptClaimsSchema,
  type AttestationReceiptClaims,
} from './attestation-receipt.js';
import { Wire02ClaimsSchema, type Wire02Claims } from './wire-02-envelope.js';

/**
 * Receipt variant discriminator for Wire 0.1
 */
export type ReceiptVariant = 'commerce' | 'attestation' | 'wire-02';

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
 * Successful parse result (v0.12.0-preview.1: adds wireVersion and warnings)
 */
export interface ParseSuccess {
  ok: true;
  variant: ReceiptVariant;
  /** Wire version of the parsed receipt */
  wireVersion: '0.1' | '0.2';
  /** Verification warnings collected during parsing (Wire 0.1: always []) */
  warnings: VerificationWarning[];
  claims: ReceiptClaimsType | AttestationReceiptClaims | Wire02Claims;
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
 * Options for parseReceiptClaims
 */
export interface ParseReceiptOptions {
  /** Wire version hint; if provided, skips auto-detection */
  wireVersion?: string;
}

// ---------------------------------------------------------------------------
// Wire version detection
// ---------------------------------------------------------------------------

/**
 * Detect the wire version of a receipt payload.
 *
 * Wire 0.2 receipts contain a `peac_version: '0.2'` field.
 * Wire 0.1 receipts have no `peac_version` field.
 *
 * @param obj - Raw claims object
 * @returns '0.2' if Wire 0.2, '0.1' if Wire 0.1, null if indeterminate
 */
export function detectWireVersion(obj: unknown): '0.1' | '0.2' | null {
  if (obj === null || obj === undefined || typeof obj !== 'object' || Array.isArray(obj)) {
    return null;
  }
  const record = obj as Record<string, unknown>;
  if (record.peac_version === '0.2') return '0.2';
  if ('peac_version' in record) return null; // peac_version present but not '0.2'
  return '0.1';
}

// ---------------------------------------------------------------------------
// Wire 0.1 helpers
// ---------------------------------------------------------------------------

/**
 * Classify a Wire 0.1 claims object as commerce or attestation.
 *
 * Uses key presence (not truthiness). If ANY of amt, cur, payment
 * are present as keys, the receipt is classified as commerce.
 */
function classifyWire01Receipt(obj: Record<string, unknown>): 'commerce' | 'attestation' {
  if ('amt' in obj || 'cur' in obj || 'payment' in obj) {
    return 'commerce';
  }
  return 'attestation';
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse and validate receipt claims.
 *
 * Unified entry point for Wire 0.1 (commerce + attestation) and Wire 0.2
 * receipt validation. Wire version is auto-detected from the `peac_version`
 * field unless `opts.wireVersion` overrides it.
 *
 * Wire 0.1 classification is strict: if any commerce key (amt, cur, payment)
 * is present, the receipt MUST validate as commerce. There is no fallback to
 * attestation for Wire 0.1.
 *
 * @param input - Raw claims object (typically decoded from JWS payload)
 * @param opts - Optional parse options
 * @returns Parse result with variant discrimination, wireVersion, warnings, and validated claims
 */
export function parseReceiptClaims(input: unknown, opts?: ParseReceiptOptions): ParseReceiptResult {
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

  // Determine wire version
  const wireVersion =
    opts?.wireVersion === '0.2' || opts?.wireVersion === '0.1'
      ? opts.wireVersion
      : detectWireVersion(obj);

  if (wireVersion === null) {
    return {
      ok: false,
      error: {
        code: 'E_UNSUPPORTED_WIRE_VERSION',
        message: `Unsupported or unrecognized peac_version: ${JSON.stringify(obj['peac_version'])}`,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Wire 0.2 path
  // ---------------------------------------------------------------------------
  if (wireVersion === '0.2') {
    const result = Wire02ClaimsSchema.safeParse(obj);
    if (!result.success) {
      return {
        ok: false,
        error: {
          code: 'E_INVALID_FORMAT',
          message: `Wire 0.2 receipt validation failed: ${result.error.issues.map((i) => i.message).join('; ')}`,
          issues: result.error.issues,
        },
      };
    }
    return {
      ok: true,
      variant: 'wire-02',
      wireVersion: '0.2',
      warnings: [],
      claims: result.data,
    };
  }

  // ---------------------------------------------------------------------------
  // Wire 0.1 path (existing logic unchanged)
  // ---------------------------------------------------------------------------
  const variant = classifyWire01Receipt(obj);

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
      wireVersion: '0.1',
      warnings: [],
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
    wireVersion: '0.1',
    warnings: [],
    claims: result.data,
  };
}
