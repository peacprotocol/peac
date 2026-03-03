/**
 * Wire 0.2 Typed Extension Group Schemas and Accessors (DD-153 revised)
 *
 * This file contains:
 *   - EXTENSION_LIMITS: centralized bounds for extension field lengths
 *   - isValidExtensionKey(): grammar validator for reverse-DNS extension keys
 *   - 5 extension group Zod schemas (.strict()):
 *       CommerceExtensionSchema, AccessExtensionSchema, ChallengeExtensionSchema,
 *       IdentityExtensionSchema, CorrelationExtensionSchema
 *   - 5 extension key constants (org.peacprotocol/*)
 *   - 5 typed accessor helpers (getCommerceExtension, etc.)
 *   - validateKnownExtensions(): superRefine helper for Wire02ClaimsSchema
 *
 * Schema validates known extension groups against their Zod schemas and rejects
 * malformed extension key grammar with hard Zod issues. Schema does NOT emit
 * warnings; the unknown_extension_preserved warning belongs in
 * @peac/protocol.verifyLocal() (Layer 3).
 *
 * All 5 group schemas use .strict() (reject unknown keys). The RFC 9457
 * problem nested object uses .passthrough() per RFC 9457 Section 6.2.
 *
 * Layer 1 (@peac/schema): pure Zod validation, zero I/O (DD-141).
 */

import { z } from 'zod';
import { createPEACError, ERROR_CODES } from './errors.js';

// ---------------------------------------------------------------------------
// EXTENSION_LIMITS (P1-9: centralized bounds)
// ---------------------------------------------------------------------------

/**
 * Normative bounds for Wire 0.2 extension group fields.
 *
 * Centralised to prevent magic numbers and allow external reference.
 * Follows repo _LIMITS convention.
 */
export const EXTENSION_LIMITS = {
  // Extension key grammar
  maxExtensionKeyLength: 512,
  maxDnsLabelLength: 63,
  maxDnsDomainLength: 253,
  // Commerce
  maxPaymentRailLength: 128,
  maxCurrencyLength: 16,
  maxAmountMinorLength: 64,
  maxReferenceLength: 256,
  maxAssetLength: 256,
  // Access
  maxResourceLength: 2048,
  maxActionLength: 256,
  // Challenge
  maxProblemTypeLength: 2048,
  maxProblemTitleLength: 256,
  maxProblemDetailLength: 4096,
  maxProblemInstanceLength: 2048,
  // Identity
  maxProofRefLength: 256,
  // Correlation
  maxTraceIdLength: 32,
  maxSpanIdLength: 16,
  maxWorkflowIdLength: 256,
  maxParentJtiLength: 256,
  maxDependsOnLength: 64,
} as const;

// ---------------------------------------------------------------------------
// Extension key grammar (P0-4)
// ---------------------------------------------------------------------------

/**
 * DNS label pattern: lowercase alphanumeric, may contain hyphens but not at
 * start or end. Single-char labels are valid (e.g., "a").
 */
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Segment pattern: lowercase alphanumeric start, may contain lowercase
 * alphanumeric, underscores, and hyphens.
 */
const SEGMENT_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * Validate that an extension key conforms to the Wire 0.2 extension key
 * grammar: `<domain>/<segment>`.
 *
 * Domain rules:
 *   - At least one dot (distinguishes from single-label paths)
 *   - Each label matches [a-z0-9]([a-z0-9-]*[a-z0-9])? (lowercase only)
 *   - No uppercase letters anywhere in the domain
 *
 * Segment rules:
 *   - Matches [a-z0-9][a-z0-9_-]* (lowercase only)
 *   - Underscores are permitted (for extension names like credential_event)
 *
 * @param key - Extension key to validate
 * @returns true if valid extension key grammar; false otherwise
 */
export function isValidExtensionKey(key: string): boolean {
  // Overall key length bound (DoS protection)
  if (key.length === 0 || key.length > EXTENSION_LIMITS.maxExtensionKeyLength) return false;

  const slashIdx = key.indexOf('/');
  if (slashIdx <= 0) return false;

  const domain = key.slice(0, slashIdx);
  const segment = key.slice(slashIdx + 1);

  // Domain: must have at least one dot, max 253 chars (RFC 1035)
  if (!domain.includes('.')) return false;
  if (domain.length > EXTENSION_LIMITS.maxDnsDomainLength) return false;

  // Segment must be non-empty and match pattern
  if (segment.length === 0) return false;
  if (!SEGMENT_PATTERN.test(segment)) return false;

  // Each DNS label must be valid and max 63 chars (RFC 1035)
  const labels = domain.split('.');
  for (const label of labels) {
    if (label.length === 0 || label.length > EXTENSION_LIMITS.maxDnsLabelLength) return false;
    if (!DNS_LABEL.test(label)) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Extension key constants
// ---------------------------------------------------------------------------

export const COMMERCE_EXTENSION_KEY = 'org.peacprotocol/commerce' as const;
export const ACCESS_EXTENSION_KEY = 'org.peacprotocol/access' as const;
export const CHALLENGE_EXTENSION_KEY = 'org.peacprotocol/challenge' as const;
export const IDENTITY_EXTENSION_KEY = 'org.peacprotocol/identity' as const;
export const CORRELATION_EXTENSION_KEY = 'org.peacprotocol/correlation' as const;
// ---------------------------------------------------------------------------
// RFC 6901 pointer helpers (P0-3)
// ---------------------------------------------------------------------------

/**
 * Escape a single path segment per RFC 6901.
 * '~' -> '~0', '/' -> '~1'
 */
function escapePointerSegment(s: string): string {
  return s.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Build a leaf-precise RFC 6901 JSON Pointer from a group key and Zod
 * issue path.
 *
 * @param groupKey - Extension group key (e.g., 'org.peacprotocol/commerce')
 * @param zodPath - Path array from the first Zod issue
 * @returns RFC 6901 pointer string
 */
function zodPathToPointer(groupKey: string, zodPath: readonly PropertyKey[]): string {
  const escaped = escapePointerSegment(groupKey);
  const segments = zodPath.map((s) => escapePointerSegment(String(s)));
  return `/extensions/${escaped}` + (segments.length > 0 ? '/' + segments.join('/') : '');
}

// ---------------------------------------------------------------------------
// Commerce extension (org.peacprotocol/commerce)
// ---------------------------------------------------------------------------

/** Base-10 integer string: optional leading minus, one or more digits */
const AMOUNT_MINOR_PATTERN = /^-?[0-9]+$/;

export const CommerceExtensionSchema = z
  .object({
    /** Payment rail identifier (e.g., 'stripe', 'x402', 'lightning') */
    payment_rail: z.string().min(1).max(EXTENSION_LIMITS.maxPaymentRailLength),
    /**
     * Amount in smallest currency unit as a string for arbitrary precision.
     * Base-10 integer: optional leading minus, one or more digits.
     * Decimals and empty strings are rejected.
     */
    amount_minor: z
      .string()
      .min(1)
      .max(EXTENSION_LIMITS.maxAmountMinorLength)
      .regex(
        AMOUNT_MINOR_PATTERN,
        'amount_minor must be a base-10 integer string (e.g., "1000", "-50")'
      ),
    /** ISO 4217 currency code or asset identifier */
    currency: z.string().min(1).max(EXTENSION_LIMITS.maxCurrencyLength),
    /** Caller-assigned payment reference */
    reference: z.string().max(EXTENSION_LIMITS.maxReferenceLength).optional(),
    /** Asset identifier for non-fiat (e.g., token address) */
    asset: z.string().max(EXTENSION_LIMITS.maxAssetLength).optional(),
    /** Environment discriminant */
    env: z.enum(['live', 'test']).optional(),
  })
  .strict();

export type CommerceExtension = z.infer<typeof CommerceExtensionSchema>;

// ---------------------------------------------------------------------------
// Access extension (org.peacprotocol/access)
// ---------------------------------------------------------------------------

export const AccessExtensionSchema = z
  .object({
    /** Resource being accessed (URI or identifier) */
    resource: z.string().min(1).max(EXTENSION_LIMITS.maxResourceLength),
    /** Action performed on the resource */
    action: z.string().min(1).max(EXTENSION_LIMITS.maxActionLength),
    /** Access decision */
    decision: z.enum(['allow', 'deny', 'review']),
  })
  .strict();

export type AccessExtension = z.infer<typeof AccessExtensionSchema>;

// ---------------------------------------------------------------------------
// Challenge extension (org.peacprotocol/challenge)
// ---------------------------------------------------------------------------

/**
 * Challenge type values (7 total, P0-6).
 * Includes purpose_disallowed (reviewer fix: 7 not 6).
 */
export const CHALLENGE_TYPES = [
  'payment_required',
  'identity_required',
  'consent_required',
  'attestation_required',
  'rate_limited',
  'purpose_disallowed',
  'custom',
] as const;

export const ChallengeTypeSchema = z.enum(CHALLENGE_TYPES);
export type ChallengeType = z.infer<typeof ChallengeTypeSchema>;

/**
 * RFC 9457 Problem Details schema (P0-5).
 *
 * Uses .passthrough() for extension members per RFC 9457 Section 6.2.
 * Required fields: status (HTTP status code), type (problem type URI).
 * Optional fields: title, detail, instance.
 */
export const ProblemDetailsSchema = z
  .object({
    /** HTTP status code (100-599) */
    status: z.number().int().min(100).max(599),
    /** Problem type URI */
    type: z.string().min(1).max(EXTENSION_LIMITS.maxProblemTypeLength).url(),
    /** Short human-readable summary */
    title: z.string().max(EXTENSION_LIMITS.maxProblemTitleLength).optional(),
    /** Human-readable explanation specific to this occurrence */
    detail: z.string().max(EXTENSION_LIMITS.maxProblemDetailLength).optional(),
    /** URI reference identifying the specific occurrence */
    instance: z.string().max(EXTENSION_LIMITS.maxProblemInstanceLength).optional(),
  })
  .passthrough();

export const ChallengeExtensionSchema = z
  .object({
    /** Challenge type (7 values) */
    challenge_type: ChallengeTypeSchema,
    /** RFC 9457 Problem Details */
    problem: ProblemDetailsSchema,
    /** Resource that triggered the challenge */
    resource: z.string().max(EXTENSION_LIMITS.maxResourceLength).optional(),
    /** Action that triggered the challenge */
    action: z.string().max(EXTENSION_LIMITS.maxActionLength).optional(),
    /** Caller-defined requirements for resolving the challenge */
    requirements: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ChallengeExtension = z.infer<typeof ChallengeExtensionSchema>;

// ---------------------------------------------------------------------------
// Identity extension (org.peacprotocol/identity)
// ---------------------------------------------------------------------------

export const IdentityExtensionSchema = z
  .object({
    /** Proof reference (opaque string; no actor_binding: top-level actor is sole location) */
    proof_ref: z.string().max(EXTENSION_LIMITS.maxProofRefLength).optional(),
  })
  .strict();

export type IdentityExtension = z.infer<typeof IdentityExtensionSchema>;

// ---------------------------------------------------------------------------
// Correlation extension (org.peacprotocol/correlation)
// ---------------------------------------------------------------------------

/** OpenTelemetry trace ID: exactly 32 lowercase hex chars */
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;

/** OpenTelemetry span ID: exactly 16 lowercase hex chars */
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/;

export const CorrelationExtensionSchema = z
  .object({
    /** OpenTelemetry-compatible trace ID (32 lowercase hex chars) */
    trace_id: z
      .string()
      .length(EXTENSION_LIMITS.maxTraceIdLength)
      .regex(TRACE_ID_PATTERN, 'trace_id must be 32 lowercase hex characters')
      .optional(),
    /** OpenTelemetry-compatible span ID (16 lowercase hex chars) */
    span_id: z
      .string()
      .length(EXTENSION_LIMITS.maxSpanIdLength)
      .regex(SPAN_ID_PATTERN, 'span_id must be 16 lowercase hex characters')
      .optional(),
    /** Workflow identifier */
    workflow_id: z.string().min(1).max(EXTENSION_LIMITS.maxWorkflowIdLength).optional(),
    /** Parent receipt JTI for causal chains */
    parent_jti: z.string().min(1).max(EXTENSION_LIMITS.maxParentJtiLength).optional(),
    /** JTIs this receipt depends on */
    depends_on: z
      .array(z.string().min(1).max(EXTENSION_LIMITS.maxParentJtiLength))
      .max(EXTENSION_LIMITS.maxDependsOnLength)
      .optional(),
  })
  .strict();

export type CorrelationExtension = z.infer<typeof CorrelationExtensionSchema>;

// ---------------------------------------------------------------------------
// Schema lookup map (for superRefine validation)
// ---------------------------------------------------------------------------

/** Map from known extension key to its Zod schema */
const EXTENSION_SCHEMA_MAP = new Map<string, z.ZodTypeAny>();
EXTENSION_SCHEMA_MAP.set(COMMERCE_EXTENSION_KEY, CommerceExtensionSchema);
EXTENSION_SCHEMA_MAP.set(ACCESS_EXTENSION_KEY, AccessExtensionSchema);
EXTENSION_SCHEMA_MAP.set(CHALLENGE_EXTENSION_KEY, ChallengeExtensionSchema);
EXTENSION_SCHEMA_MAP.set(IDENTITY_EXTENSION_KEY, IdentityExtensionSchema);
EXTENSION_SCHEMA_MAP.set(CORRELATION_EXTENSION_KEY, CorrelationExtensionSchema);

// ---------------------------------------------------------------------------
// Typed accessor helpers (P0-2, P0-3)
// ---------------------------------------------------------------------------

/**
 * Internal helper: extract and validate a known extension group.
 *
 * Returns undefined if the key is absent from extensions.
 * Throws PEACError with leaf-precise RFC 6901 pointer if key is present
 * but value fails schema validation.
 */
function getExtension<T>(
  extensions: Record<string, unknown> | undefined,
  key: string,
  schema: z.ZodType<T>
): T | undefined {
  if (extensions === undefined) return undefined;
  if (!Object.prototype.hasOwnProperty.call(extensions, key)) return undefined;

  const value = extensions[key];
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  // Build leaf-precise pointer from first Zod issue path (P0-3)
  const firstIssue = result.error.issues[0];
  const pointer = zodPathToPointer(key, firstIssue?.path ?? []);

  throw createPEACError(ERROR_CODES.E_INVALID_ENVELOPE, 'validation', 'error', false, {
    http_status: 400,
    pointer,
    remediation: `Fix the ${key} extension group value`,
    details: {
      message: firstIssue?.message ?? 'Invalid extension value',
      issues: result.error.issues,
    },
  });
}

/**
 * Get the commerce extension group from a Wire 0.2 receipt's extensions.
 *
 * @param extensions - Wire 0.2 extensions record (or undefined)
 * @returns Parsed CommerceExtension, or undefined if key absent
 * @throws PEACError with RFC 6901 pointer if present but invalid
 */
export function getCommerceExtension(
  extensions?: Record<string, unknown>
): CommerceExtension | undefined {
  return getExtension(extensions, COMMERCE_EXTENSION_KEY, CommerceExtensionSchema);
}

/**
 * Get the access extension group from a Wire 0.2 receipt's extensions.
 *
 * @param extensions - Wire 0.2 extensions record (or undefined)
 * @returns Parsed AccessExtension, or undefined if key absent
 * @throws PEACError with RFC 6901 pointer if present but invalid
 */
export function getAccessExtension(
  extensions?: Record<string, unknown>
): AccessExtension | undefined {
  return getExtension(extensions, ACCESS_EXTENSION_KEY, AccessExtensionSchema);
}

/**
 * Get the challenge extension group from a Wire 0.2 receipt's extensions.
 *
 * @param extensions - Wire 0.2 extensions record (or undefined)
 * @returns Parsed ChallengeExtension, or undefined if key absent
 * @throws PEACError with RFC 6901 pointer if present but invalid
 */
export function getChallengeExtension(
  extensions?: Record<string, unknown>
): ChallengeExtension | undefined {
  return getExtension(extensions, CHALLENGE_EXTENSION_KEY, ChallengeExtensionSchema);
}

/**
 * Get the identity extension group from a Wire 0.2 receipt's extensions.
 *
 * @param extensions - Wire 0.2 extensions record (or undefined)
 * @returns Parsed IdentityExtension, or undefined if key absent
 * @throws PEACError with RFC 6901 pointer if present but invalid
 */
export function getIdentityExtension(
  extensions?: Record<string, unknown>
): IdentityExtension | undefined {
  return getExtension(extensions, IDENTITY_EXTENSION_KEY, IdentityExtensionSchema);
}

/**
 * Get the correlation extension group from a Wire 0.2 receipt's extensions.
 *
 * @param extensions - Wire 0.2 extensions record (or undefined)
 * @returns Parsed CorrelationExtension, or undefined if key absent
 * @throws PEACError with RFC 6901 pointer if present but invalid
 */
export function getCorrelationExtension(
  extensions?: Record<string, unknown>
): CorrelationExtension | undefined {
  return getExtension(extensions, CORRELATION_EXTENSION_KEY, CorrelationExtensionSchema);
}

// ---------------------------------------------------------------------------
// Envelope-level extension validation (for Wire02ClaimsSchema.superRefine)
// ---------------------------------------------------------------------------

/**
 * Validate extensions record in Wire02ClaimsSchema.superRefine().
 *
 * For each key in the extensions record:
 *   1. Check key grammar via isValidExtensionKey(): if malformed,
 *      add hard Zod issue (ERROR_CODES.E_INVALID_EXTENSION_KEY)
 *   2. If key matches a known group, validate value against its schema;
 *      if invalid, add Zod issue with message from first schema error
 *
 * Schema does NOT emit unknown_extension_preserved warning for
 * unrecognized keys (that belongs in @peac/protocol.verifyLocal()).
 *
 * @param extensions - The extensions record from Wire 0.2 claims
 * @param ctx - Zod refinement context
 */
export function validateKnownExtensions(
  extensions: Record<string, unknown> | undefined,
  ctx: z.RefinementCtx
): void {
  if (extensions === undefined) return;

  for (const key of Object.keys(extensions)) {
    // Step 1: Validate extension key grammar
    if (!isValidExtensionKey(key)) {
      ctx.addIssue({
        code: 'custom',
        message: ERROR_CODES.E_INVALID_EXTENSION_KEY,
        path: ['extensions', key],
      });
      continue;
    }

    // Step 2: Validate known extension groups against their schemas
    const schema = EXTENSION_SCHEMA_MAP.get(key);
    if (schema !== undefined) {
      const result = schema.safeParse(extensions[key]);
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        const issuePath: PropertyKey[] = firstIssue?.path ?? [];
        ctx.addIssue({
          code: 'custom',
          message: firstIssue?.message ?? 'Invalid extension value',
          path: ['extensions', key, ...issuePath],
        });
      }
    }
    // Unknown keys with valid grammar: pass through silently (protocol layer handles)
  }
}
