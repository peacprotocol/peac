/**
 * ActorBinding and MVIS (Minimum Viable Identity Set) Schemas (v0.11.3+)
 *
 * Implements DD-142 (ActorBinding), DD-143 (Multi-Root Proof Types),
 * and DD-144 (MVIS) for the Agent Identity Profile.
 *
 * ActorBinding lives in ext["org.peacprotocol/actor_binding"] in Wire 0.1.
 * ProofTypeSchema is SEPARATE from ProofMethodSchema (agent-identity.ts)
 * to avoid breaking the v0.9.25+ API. Unification deferred to v0.12.0.
 *
 * @see docs/specs/AGENT-IDENTITY-PROFILE.md for normative specification
 */
import { z } from 'zod';

// =============================================================================
// PROOF TYPES (DD-143: Multi-Root Proof Types)
// =============================================================================

/**
 * Proof types for ActorBinding (DD-143).
 *
 * 8 methods covering attestation chains, RATS, keyless signing,
 * decentralized identity, workload identity, PKI, and vendor-defined.
 *
 * SEPARATE from ProofMethodSchema (4 transport-level methods in agent-identity.ts).
 * ProofMethodSchema covers how proof is transported (HTTP sig, DPoP, mTLS, JWK thumbprint).
 * ProofTypeSchema covers the trust root model used to establish identity.
 */
export const PROOF_TYPES = [
  'ed25519-cert-chain',
  'eat-passport',
  'eat-background-check',
  'sigstore-oidc',
  'did',
  'spiffe',
  'x509-pki',
  'custom',
] as const;

export const ProofTypeSchema = z.enum(PROOF_TYPES);
export type ProofType = z.infer<typeof ProofTypeSchema>;

// =============================================================================
// ORIGIN VALIDATION
// =============================================================================

/**
 * Validate that a string is an origin-only URL (scheme + host + optional port).
 * Rejects URLs with path (other than '/'), query, or fragment components.
 * This prevents correlation leakage and ambiguity in ActorBinding.
 *
 * Valid: "https://example.com", "https://example.com:8443"
 * Invalid: "https://example.com/api/v1", "https://example.com?q=1", "https://example.com#frag"
 */
export function isOriginOnly(value: string): boolean {
  try {
    const url = new URL(value);
    // Must be http or https
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return false;
    }
    // pathname must be exactly '/' (the implicit root)
    if (url.pathname !== '/') {
      return false;
    }
    // No search params
    if (url.search !== '') {
      return false;
    }
    // No fragment: url.hash is '' for both no-fragment and bare '#',
    // so also check the raw string for a trailing '#'
    if (url.hash !== '' || value.includes('#')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// ACTOR BINDING (DD-142)
// =============================================================================

/**
 * Extension key for ActorBinding in Wire 0.1 ext[].
 */
export const ACTOR_BINDING_EXTENSION_KEY = 'org.peacprotocol/actor_binding' as const;

/**
 * ActorBinding schema (DD-142).
 *
 * Binds an actor identity to a receipt via ext["org.peacprotocol/actor_binding"].
 * Wire 0.2 moves this to a kernel field.
 *
 * - id: Stable actor identifier (opaque, no PII)
 * - proof_type: Trust root model from DD-143 vocabulary
 * - proof_ref: Optional URI or hash of external proof artifact
 * - origin: Origin-only URL (scheme + host + optional port; no path/query/fragment)
 * - intent_hash: Optional SHA-256 hash of the intent (hash-first per DD-138)
 */
export const ActorBindingSchema = z
  .object({
    /** Stable actor identifier (opaque, no PII) */
    id: z.string().min(1).max(256),

    /** Proof type from DD-143 multi-root vocabulary */
    proof_type: ProofTypeSchema,

    /** URI or hash of external proof artifact */
    proof_ref: z.string().max(2048).optional(),

    /** Origin-only URL: scheme + host + optional port; NO path, query, or fragment */
    origin: z.string().max(2048).refine(isOriginOnly, {
      message:
        'origin must be an origin-only URL (scheme + host + optional port; no path, query, or fragment)',
    }),

    /** SHA-256 hash of the intent (hash-first per DD-138) */
    intent_hash: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/, {
        message: 'intent_hash must match sha256:<64 hex chars>',
      })
      .optional(),
  })
  .strict();

export type ActorBinding = z.infer<typeof ActorBindingSchema>;

// =============================================================================
// MVIS: Minimum Viable Identity Set (DD-144)
// =============================================================================

/**
 * MVIS (Minimum Viable Identity Set) fields (DD-144).
 *
 * 5 required fields for any identity receipt to be considered complete.
 * validateMVIS() is a pure validation function with zero I/O (DD-141).
 *
 * Fields:
 * - issuer: Who issued the identity assertion
 * - subject: Who the identity is about (opaque identifier)
 * - key_binding: Cryptographic binding to a key (kid or thumbprint)
 * - time_bounds: Validity period with not_before and not_after
 * - replay_protection: Unique token ID (jti) and optional nonce
 */
export const MVISTimeBoundsSchema = z
  .object({
    /** Earliest valid time (RFC 3339) */
    not_before: z.string().datetime(),
    /** Latest valid time (RFC 3339) */
    not_after: z.string().datetime(),
  })
  .strict();

export type MVISTimeBounds = z.infer<typeof MVISTimeBoundsSchema>;

export const MVISReplayProtectionSchema = z
  .object({
    /** Unique token identifier (jti from JWT or equivalent) */
    jti: z.string().min(1).max(256),
    /** Optional nonce for additional replay protection */
    nonce: z.string().max(256).optional(),
  })
  .strict();

export type MVISReplayProtection = z.infer<typeof MVISReplayProtectionSchema>;

export const MVISFieldsSchema = z
  .object({
    /** Who issued the identity assertion */
    issuer: z.string().min(1).max(2048),

    /** Who the identity is about (opaque identifier, no PII) */
    subject: z.string().min(1).max(256),

    /** Cryptographic binding: kid or JWK thumbprint */
    key_binding: z.string().min(1).max(256),

    /** Validity period */
    time_bounds: MVISTimeBoundsSchema,

    /** Replay protection */
    replay_protection: MVISReplayProtectionSchema,
  })
  .strict();

export type MVISFields = z.infer<typeof MVISFieldsSchema>;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate an ActorBinding object.
 *
 * @param data - Unknown data to validate
 * @returns Result with validated ActorBinding or error message
 */
export function validateActorBinding(
  data: unknown
): { ok: true; value: ActorBinding } | { ok: false; error: string } {
  const result = ActorBindingSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.message };
}

/**
 * Validate MVIS fields (DD-144).
 *
 * Pure validation function with zero I/O (DD-141).
 * Checks that all 5 required fields are present and valid.
 * Also validates that time_bounds.not_before < time_bounds.not_after.
 *
 * @param data - Unknown data to validate
 * @returns Result with validated MVIS fields or error message
 */
export function validateMVIS(
  data: unknown
): { ok: true; value: MVISFields } | { ok: false; error: string } {
  const result = MVISFieldsSchema.safeParse(data);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }

  // Semantic check: not_before must be before not_after
  const notBefore = new Date(result.data.time_bounds.not_before).getTime();
  const notAfter = new Date(result.data.time_bounds.not_after).getTime();
  if (notBefore >= notAfter) {
    return { ok: false, error: 'not_before must be before not_after' };
  }

  return { ok: true, value: result.data };
}
