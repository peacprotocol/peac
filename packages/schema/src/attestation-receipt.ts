/**
 * PEAC Attestation Receipt Types (v0.10.8+)
 *
 * Attestation receipts are lightweight signed tokens that attest to API
 * interactions WITHOUT payment fields. This is a distinct profile from
 * full payment receipts (PEACReceiptClaims).
 *
 * Use cases:
 * - API interaction logging with evidentiary value
 * - Middleware-issued receipts for non-payment flows
 * - Audit trails for agent/tool interactions
 *
 * Claims structure:
 * - Core JWT claims: iss, aud, iat, exp
 * - PEAC claims: rid (UUIDv7 receipt ID)
 * - Optional: sub, ext (extensions including interaction binding)
 *
 * @see docs/specs/ATTESTATION-RECEIPTS.md
 */

import { z } from 'zod';

// ============================================================================
// Constants
// ============================================================================

/**
 * Attestation receipt type constant
 */
export const ATTESTATION_RECEIPT_TYPE = 'peac/attestation-receipt' as const;

/**
 * Extension key for minimal interaction binding (middleware profile)
 *
 * This is a simplified binding used by middleware packages. For full
 * interaction evidence, use INTERACTION_EXTENSION_KEY from ./interaction.ts
 */
export const MIDDLEWARE_INTERACTION_KEY = 'org.peacprotocol/middleware-interaction@0.1';

/**
 * Limits for attestation receipt fields (DoS protection)
 */
export const ATTESTATION_LIMITS = {
  /** Maximum issuer URL length */
  maxIssuerLength: 2048,
  /** Maximum audience URL length */
  maxAudienceLength: 2048,
  /** Maximum subject length */
  maxSubjectLength: 256,
  /** Maximum path length in interaction binding */
  maxPathLength: 2048,
  /** Maximum method length */
  maxMethodLength: 16,
  /** Maximum HTTP status code */
  maxStatusCode: 599,
  /** Minimum HTTP status code */
  minStatusCode: 100,
} as const;

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * HTTPS URL validation (reused from validators.ts pattern)
 */
const httpsUrl = z
  .string()
  .url()
  .max(ATTESTATION_LIMITS.maxIssuerLength)
  .refine((url) => url.startsWith('https://'), 'Must be HTTPS URL');

/**
 * UUIDv7 format validation
 */
const uuidv7 = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  'Must be UUIDv7 format'
);

/**
 * Minimal interaction binding schema (for middleware use)
 *
 * This is a simplified version of full interaction evidence.
 * Contains only: method, path, status.
 *
 * Privacy note: Query strings are excluded by default to avoid
 * leaking sensitive data (API keys, tokens, PII in parameters).
 */
export const MinimalInteractionBindingSchema = z
  .object({
    /** HTTP method (uppercase, e.g., GET, POST) */
    method: z
      .string()
      .min(1)
      .max(ATTESTATION_LIMITS.maxMethodLength)
      .transform((m) => m.toUpperCase()),
    /** Request path (no query string by default) */
    path: z.string().min(1).max(ATTESTATION_LIMITS.maxPathLength),
    /** HTTP response status code */
    status: z
      .number()
      .int()
      .min(ATTESTATION_LIMITS.minStatusCode)
      .max(ATTESTATION_LIMITS.maxStatusCode),
  })
  .strict();

/**
 * Attestation receipt extensions schema
 *
 * Allows interaction binding and other namespaced extensions.
 */
export const AttestationExtensionsSchema = z.record(z.string(), z.unknown());

/**
 * PEAC Attestation Receipt Claims schema
 *
 * This is the claims structure for attestation receipts - lightweight
 * receipts without payment fields. For full payment receipts, use
 * ReceiptClaimsSchema from ./validators.ts
 */
export const AttestationReceiptClaimsSchema = z
  .object({
    /** Issuer URL (normalized, no trailing slash) */
    iss: httpsUrl,
    /** Audience URL */
    aud: httpsUrl,
    /** Issued at (Unix seconds) */
    iat: z.number().int().nonnegative(),
    /** Expiration (Unix seconds) */
    exp: z.number().int().nonnegative(),
    /** Receipt ID (UUIDv7) */
    rid: uuidv7,
    /** Subject identifier (optional) */
    sub: z.string().max(ATTESTATION_LIMITS.maxSubjectLength).optional(),
    /** Extensions (optional) */
    ext: AttestationExtensionsSchema.optional(),
  })
  .strict();

// ============================================================================
// TypeScript Types (inferred from Zod schemas)
// ============================================================================

export type MinimalInteractionBinding = z.infer<typeof MinimalInteractionBindingSchema>;
export type AttestationExtensions = z.infer<typeof AttestationExtensionsSchema>;
export type AttestationReceiptClaims = z.infer<typeof AttestationReceiptClaimsSchema>;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validation result type
 */
export interface AttestationValidationResult {
  valid: boolean;
  error_code?: string;
  error_message?: string;
}

/**
 * Validate attestation receipt claims
 *
 * @param input - Raw input to validate
 * @returns Validation result
 */
export function validateAttestationReceiptClaims(input: unknown): AttestationValidationResult {
  const result = AttestationReceiptClaimsSchema.safeParse(input);
  if (result.success) {
    return { valid: true };
  }
  const firstIssue = result.error.issues[0];
  return {
    valid: false,
    error_code: 'E_ATTESTATION_INVALID_CLAIMS',
    error_message: firstIssue?.message || 'Invalid attestation receipt claims',
  };
}

/**
 * Check if an object is valid attestation receipt claims (non-throwing)
 *
 * @param claims - Object to check
 * @returns True if valid AttestationReceiptClaims
 */
export function isAttestationReceiptClaims(claims: unknown): claims is AttestationReceiptClaims {
  return AttestationReceiptClaimsSchema.safeParse(claims).success;
}

/**
 * Validate minimal interaction binding
 *
 * @param input - Raw input to validate
 * @returns Validation result
 */
export function validateMinimalInteractionBinding(input: unknown): AttestationValidationResult {
  const result = MinimalInteractionBindingSchema.safeParse(input);
  if (result.success) {
    return { valid: true };
  }
  const firstIssue = result.error.issues[0];
  return {
    valid: false,
    error_code: 'E_ATTESTATION_INVALID_INTERACTION',
    error_message: firstIssue?.message || 'Invalid interaction binding',
  };
}

/**
 * Check if an object is valid minimal interaction binding (non-throwing)
 *
 * @param binding - Object to check
 * @returns True if valid MinimalInteractionBinding
 */
export function isMinimalInteractionBinding(binding: unknown): binding is MinimalInteractionBinding {
  return MinimalInteractionBindingSchema.safeParse(binding).success;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Parameters for creating attestation receipt claims
 */
export interface CreateAttestationReceiptParams {
  /** Issuer URL (will be normalized) */
  issuer: string;
  /** Audience URL */
  audience: string;
  /** Receipt ID (UUIDv7) */
  rid: string;
  /** Subject identifier (optional) */
  sub?: string;
  /** Interaction binding (optional) */
  interaction?: MinimalInteractionBinding;
  /** Additional extensions (optional) */
  extensions?: Record<string, unknown>;
  /** Expiration in seconds from now (default: 300) */
  expiresIn?: number;
}

/**
 * Create validated attestation receipt claims
 *
 * @param params - Attestation receipt parameters
 * @returns Validated AttestationReceiptClaims
 * @throws ZodError if validation fails
 */
export function createAttestationReceiptClaims(
  params: CreateAttestationReceiptParams
): AttestationReceiptClaims {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = params.expiresIn ?? 300;

  // Normalize issuer (remove trailing slashes)
  const normalizedIssuer = params.issuer.replace(/\/+$/, '');

  // Build extensions
  const ext: Record<string, unknown> = { ...params.extensions };
  if (params.interaction) {
    ext[MIDDLEWARE_INTERACTION_KEY] = params.interaction;
  }

  const claims: AttestationReceiptClaims = {
    iss: normalizedIssuer,
    aud: params.audience,
    iat: now,
    exp: now + expiresIn,
    rid: params.rid,
    ...(params.sub && { sub: params.sub }),
    ...(Object.keys(ext).length > 0 && { ext }),
  };

  return AttestationReceiptClaimsSchema.parse(claims);
}

// ============================================================================
// Type Guard for Receipt Profile Discrimination
// ============================================================================

/**
 * Check if claims are attestation-only (no payment fields)
 *
 * This helps discriminate between attestation receipts and
 * full payment receipts at runtime.
 *
 * @param claims - Receipt claims to check
 * @returns True if claims lack payment fields (amt, cur, payment)
 */
export function isAttestationOnly(claims: Record<string, unknown>): boolean {
  return !('amt' in claims) && !('cur' in claims) && !('payment' in claims);
}

/**
 * Check if claims are payment receipt (has payment fields)
 *
 * @param claims - Receipt claims to check
 * @returns True if claims have payment fields
 */
export function isPaymentReceipt(claims: Record<string, unknown>): boolean {
  return 'amt' in claims && 'cur' in claims && 'payment' in claims;
}
