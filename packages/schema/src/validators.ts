/**
 * Zod validators for PEAC protocol types
 */
import { z } from 'zod';
import { PEAC_WIRE_TYP, PEAC_ALG } from './constants';
import {
  JsonValueSchema,
  JsonObjectSchema,
  assertJsonSafeIterative,
  type JsonEvidenceLimits,
} from './json';
import { createEvidenceNotJsonError, type PEACError } from './errors';

const httpsUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://'), 'must be https://');
const iso4217 = z.string().regex(/^[A-Z]{3}$/);
const uuidv7 = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

export const NormalizedPayment = z
  .object({
    rail: z.string().min(1),
    reference: z.string().min(1),
    amount: z.number().int().nonnegative(),
    currency: iso4217,
    asset: z.string().optional(),
    env: z.string().optional(),
    evidence: JsonValueSchema.optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

export const Subject = z.object({ uri: httpsUrl }).strict();

export const AIPREFSnapshot = z
  .object({
    url: httpsUrl,
    hash: z.string().min(8),
  })
  .strict();

// Note: Extensions uses a forward reference pattern since ControlBlockSchema
// is defined after this. We use catchall for now and validate control separately.
export const Extensions = z
  .object({
    aipref_snapshot: AIPREFSnapshot.optional(),
    // control block validated via ControlBlockSchema when present
  })
  .catchall(z.unknown());

export const JWSHeader = z
  .object({
    typ: z.literal(PEAC_WIRE_TYP),
    alg: z.literal(PEAC_ALG),
    kid: z.string().min(8),
  })
  .strict();

export const ReceiptClaims = z
  .object({
    iss: httpsUrl,
    aud: httpsUrl,
    iat: z.number().int().nonnegative(),
    exp: z.number().int().optional(),
    rid: uuidv7,
    amt: z.number().int().nonnegative(),
    cur: iso4217,
    payment: NormalizedPayment,
    subject: Subject.optional(),
    ext: Extensions.optional(),
  })
  .strict();

export const VerifyRequest = z
  .object({
    receipt_jws: z.string().min(16),
  })
  .strict();

// -----------------------------------------------------------------------------
// Control Abstraction Layer (CAL) Validators (v0.9.16+)
// -----------------------------------------------------------------------------

/**
 * Control purpose - what the access is for
 *
 * v0.9.17+: Added ai_input, search for RSL alignment
 * v0.9.18+: Added ai_index (RSL 1.0 canonical token). Removed ai_search.
 *
 * @see https://rslstandard.org/rsl for RSL 1.0 specification
 */
export const ControlPurposeSchema = z.enum([
  'crawl',
  'index',
  'train',
  'inference',
  'ai_input',
  'ai_index',
  'search',
]);

/**
 * Control licensing mode - how access is licensed
 */
export const ControlLicensingModeSchema = z.enum([
  'subscription',
  'pay_per_crawl',
  'pay_per_inference',
]);

/**
 * Control decision type
 */
export const ControlDecisionSchema = z.enum(['allow', 'deny', 'review']);

/**
 * Single control step in governance chain
 */
export const ControlStepSchema = z.object({
  engine: z.string().min(1),
  version: z.string().optional(),
  policy_id: z.string().optional(),
  result: ControlDecisionSchema,
  reason: z.string().optional(),
  purpose: ControlPurposeSchema.optional(),
  licensing_mode: ControlLicensingModeSchema.optional(),
  scope: z.union([z.string(), z.array(z.string())]).optional(),
  limits_snapshot: z.unknown().optional(),
  evidence_ref: z.string().optional(),
});

/**
 * Composable control block - multi-party governance
 */
export const ControlBlockSchema = z
  .object({
    chain: z.array(ControlStepSchema).min(1),
    decision: ControlDecisionSchema,
    combinator: z.literal('any_can_veto').optional(),
  })
  .refine(
    (data) => {
      // Validate decision consistency with chain
      const hasAnyDeny = data.chain.some((step) => step.result === 'deny');
      const allAllow = data.chain.every((step) => step.result === 'allow');
      const hasReview = data.chain.some((step) => step.result === 'review');

      if (hasAnyDeny && data.decision !== 'deny') {
        return false;
      }
      if (allAllow && data.decision !== 'allow') {
        return false;
      }
      // If has review but no deny, decision can be review or allow
      if (hasReview && !hasAnyDeny && data.decision === 'deny') {
        return false;
      }
      return true;
    },
    {
      message: 'Control block decision must be consistent with chain results',
    }
  );

// -----------------------------------------------------------------------------
// Payment Evidence Validators (v0.9.16+)
// -----------------------------------------------------------------------------

/**
 * Payment split schema
 *
 * Invariants:
 * - party is required (non-empty string)
 * - amount if present must be >= 0
 * - share if present must be in [0,1]
 * - At least one of amount or share must be specified
 */
export const PaymentSplitSchema = z
  .object({
    party: z.string().min(1),
    amount: z.number().int().nonnegative().optional(),
    currency: iso4217.optional(),
    share: z.number().min(0).max(1).optional(),
    rail: z.string().min(1).optional(),
    account_ref: z.string().min(1).optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict()
  .refine((data) => data.amount !== undefined || data.share !== undefined, {
    message: 'At least one of amount or share must be specified',
  });

/**
 * Payment routing mode schema (rail-agnostic)
 *
 * Describes how the payment is routed between payer, aggregator, and merchant.
 * This is a generic hint - specific rails populate it from their native formats.
 *
 * Values:
 * - "direct": Direct payment to merchant (no intermediary)
 * - "callback": Routed via callback URL / payment service
 * - "role": Role-based routing (e.g., "publisher", "platform")
 *
 * Examples of producers:
 * - x402 v2 `payTo.mode` -> routing
 * - Stripe Connect `destination` -> routing = 'direct' or 'callback'
 * - UPI `pa` (payee address) -> routing = 'direct'
 */
export const PaymentRoutingSchema = z.enum(['direct', 'callback', 'role']);

/**
 * Payment evidence schema
 *
 * Full schema for PaymentEvidence including aggregator/splits support.
 */
export const PaymentEvidenceSchema = z
  .object({
    rail: z.string().min(1),
    reference: z.string().min(1),
    amount: z.number().int().nonnegative(),
    currency: iso4217,
    asset: z.string().min(1),
    env: z.enum(['live', 'test']),
    network: z.string().min(1).optional(),
    facilitator_ref: z.string().min(1).optional(),
    evidence: JsonValueSchema,
    aggregator: z.string().min(1).optional(),
    splits: z.array(PaymentSplitSchema).optional(),
    routing: PaymentRoutingSchema.optional(),
  })
  .strict();

// -----------------------------------------------------------------------------
// Subject Profile Validators (v0.9.16+)
// -----------------------------------------------------------------------------

/**
 * Subject type schema
 */
export const SubjectTypeSchema = z.enum(['human', 'org', 'agent']);

/**
 * Subject profile schema
 *
 * Invariants:
 * - id is required (non-empty string)
 * - type is required (human, org, or agent)
 * - labels if present must be non-empty strings
 */
export const SubjectProfileSchema = z
  .object({
    id: z.string().min(1),
    type: SubjectTypeSchema,
    labels: z.array(z.string().min(1)).optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

/**
 * Subject profile snapshot schema
 *
 * Invariants:
 * - subject is required (valid SubjectProfile)
 * - captured_at is required (non-empty string)
 *   MUST be RFC 3339 / ISO 8601 UTC; format not enforced in schema for v0.9.16
 */
export const SubjectProfileSnapshotSchema = z
  .object({
    subject: SubjectProfileSchema,
    captured_at: z.string().min(1),
    source: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
  })
  .strict();

// -----------------------------------------------------------------------------
// Attestation Validators (v0.9.22+)
// -----------------------------------------------------------------------------

/**
 * Namespaced extensions schema
 *
 * Keys must be namespaced (e.g., "com.example/field", "io.vendor/data").
 * This provides a forward-compatible extension mechanism.
 */
export const ExtensionsSchema = z.record(
  z.string().regex(/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/),
  JsonValueSchema
);

/**
 * Generic attestation schema
 *
 * Invariants:
 * - issuer, type, issued_at, evidence are required
 * - issued_at and expires_at must be RFC 3339 date-time
 * - ref if present must be a valid URI
 */
export const AttestationSchema = z
  .object({
    issuer: z.string().min(1),
    type: z.string().min(1),
    issued_at: z.string().datetime(),
    expires_at: z.string().datetime().optional(),
    ref: z.string().url().optional(),
    evidence: JsonValueSchema,
  })
  .strict();

// -----------------------------------------------------------------------------
// Subject Snapshot Validation Helper (v0.9.17+)
// -----------------------------------------------------------------------------

// Module-level set for PII warning deduplication
const warnedSubjectIds = new Set<string>();

/**
 * Heuristic check if a subject ID looks like PII (email/phone)
 */
function looksLikePII(id: string): boolean {
  // Email pattern
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id)) {
    return true;
  }
  // Phone pattern (starts with + followed by digits)
  if (/^\+?\d{10,15}$/.test(id.replace(/[\s\-()]/g, ''))) {
    return true;
  }
  return false;
}

/**
 * Validate a subject snapshot (if present)
 *
 * - Returns validated snapshot or null if absent
 * - Throws ZodError for malformed data
 * - Logs advisory warning if id looks like PII (deduplicated)
 */
export function validateSubjectSnapshot(
  snapshot: unknown
): z.infer<typeof SubjectProfileSnapshotSchema> | null {
  if (snapshot === undefined || snapshot === null) {
    return null;
  }

  // Validate against schema (throws on malformed data)
  const validated = SubjectProfileSnapshotSchema.parse(snapshot);

  // Advisory PII warning (deduplicated)
  const subjectId = validated.subject.id;
  if (looksLikePII(subjectId) && !warnedSubjectIds.has(subjectId)) {
    warnedSubjectIds.add(subjectId);
    console.warn(
      `[peac:subject] Advisory: subject.id "${subjectId}" looks like PII. ` +
        'Prefer opaque identifiers (e.g., "user:abc123").'
    );
  }

  return validated;
}

// -----------------------------------------------------------------------------
// Evidence Validation (v0.9.21+)
// -----------------------------------------------------------------------------

/**
 * Result type for evidence validation
 */
export type EvidenceValidationResult =
  | { ok: true; value: unknown }
  | { ok: false; error: PEACError };

/**
 * Validate payment evidence for JSON safety
 *
 * Uses iterative validation (no recursion) to prevent stack overflow on
 * deeply nested structures. Enforces limits on depth, array length,
 * object keys, and string length.
 *
 * @param evidence - Evidence value to validate
 * @param limits - Optional limits (internal, not part of public API)
 * @returns Result indicating success with validated value, or failure with PEACError
 *
 * @example
 * ```ts
 * const result = validateEvidence({ txId: '123', amount: 100 });
 * if (!result.ok) {
 *   console.error(result.error.code, result.error.remediation);
 * }
 * ```
 */
export function validateEvidence(
  evidence: unknown,
  limits?: JsonEvidenceLimits
): EvidenceValidationResult {
  const result = assertJsonSafeIterative(evidence, limits);

  if (!result.ok) {
    return {
      ok: false,
      error: createEvidenceNotJsonError(result.error, result.path),
    };
  }

  return { ok: true, value: evidence };
}
