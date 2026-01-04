/**
 * Attribution Attestation Types and Validators (v0.9.26+)
 *
 * Provides content derivation and usage proof for PEAC receipts,
 * enabling chain tracking and compliance artifacts.
 *
 * @see docs/specs/ATTRIBUTION.md for normative specification
 */
import { z } from 'zod';
import type { JsonValue } from '@peac/kernel';
import { JsonValueSchema } from './json';

// =============================================================================
// ATTRIBUTION LIMITS (v0.9.26+)
// =============================================================================

/**
 * Attribution limits for DoS protection and verification feasibility.
 *
 * These are implementation safety limits, not protocol constraints.
 */
export const ATTRIBUTION_LIMITS = {
  /** Maximum sources per attestation */
  maxSources: 100,
  /** Maximum chain resolution depth */
  maxDepth: 8,
  /** Maximum attestation size in bytes (64KB) */
  maxAttestationSize: 65536,
  /** Per-hop resolution timeout in milliseconds */
  resolutionTimeout: 5000,
  /** Maximum receipt reference length */
  maxReceiptRefLength: 2048,
  /** Maximum model ID length */
  maxModelIdLength: 256,
} as const;

// =============================================================================
// CONTENT HASH (v0.9.26+)
// =============================================================================

/**
 * Supported hash algorithms for content hashing.
 * Only sha-256 is supported in v0.9.26.
 */
export const HashAlgorithmSchema = z.literal('sha-256');
export type HashAlgorithm = z.infer<typeof HashAlgorithmSchema>;

/**
 * Supported encoding formats for hash values.
 */
export const HashEncodingSchema = z.literal('base64url');
export type HashEncoding = z.infer<typeof HashEncodingSchema>;

/**
 * ContentHash - deterministic content identification.
 *
 * Provides cryptographic verification of content identity using SHA-256.
 * The hash value is base64url-encoded without padding (RFC 4648 Section 5).
 *
 * @example
 * ```typescript
 * const hash: ContentHash = {
 *   alg: 'sha-256',
 *   value: 'n4bQgYhMfWWaL28IoEbM8Qa8jG7x0QXJZJqL-w_zZdA',
 *   enc: 'base64url',
 * };
 * ```
 */
export const ContentHashSchema = z
  .object({
    /** Hash algorithm (REQUIRED, must be 'sha-256') */
    alg: HashAlgorithmSchema,

    /** Base64url-encoded hash value without padding (REQUIRED, 43 chars for SHA-256) */
    value: z
      .string()
      .min(43)
      .max(43)
      .regex(/^[A-Za-z0-9_-]+$/, 'Invalid base64url characters'),

    /** Encoding format (REQUIRED, must be 'base64url') */
    enc: HashEncodingSchema,
  })
  .strict();
export type ContentHash = z.infer<typeof ContentHashSchema>;

// =============================================================================
// ATTRIBUTION USAGE (v0.9.26+)
// =============================================================================

/**
 * How source content was used in derivation.
 *
 * - 'training_input': Used to train a model
 * - 'rag_context': Retrieved for RAG context
 * - 'direct_reference': Directly quoted or referenced
 * - 'synthesis_source': Combined with other sources to create new content
 * - 'embedding_source': Used to create embeddings/vectors
 */
export const AttributionUsageSchema = z.enum([
  'training_input',
  'rag_context',
  'direct_reference',
  'synthesis_source',
  'embedding_source',
]);
export type AttributionUsage = z.infer<typeof AttributionUsageSchema>;

/**
 * Array of valid attribution usage types for runtime checks.
 */
export const ATTRIBUTION_USAGES = [
  'training_input',
  'rag_context',
  'direct_reference',
  'synthesis_source',
  'embedding_source',
] as const;

// =============================================================================
// DERIVATION TYPE (v0.9.26+)
// =============================================================================

/**
 * Type of content derivation.
 *
 * - 'training': Model training or fine-tuning
 * - 'inference': Runtime inference with RAG/grounding
 * - 'rag': Retrieval-augmented generation
 * - 'synthesis': Multi-source content synthesis
 * - 'embedding': Vector embedding generation
 */
export const DerivationTypeSchema = z.enum([
  'training',
  'inference',
  'rag',
  'synthesis',
  'embedding',
]);
export type DerivationType = z.infer<typeof DerivationTypeSchema>;

/**
 * Array of valid derivation types for runtime checks.
 */
export const DERIVATION_TYPES = ['training', 'inference', 'rag', 'synthesis', 'embedding'] as const;

// =============================================================================
// ATTRIBUTION SOURCE (v0.9.26+)
// =============================================================================

/**
 * Receipt reference format validation.
 *
 * Valid formats:
 * - jti:{receipt_id} - Direct receipt identifier
 * - https://... - Resolvable receipt URL
 * - urn:peac:receipt:{id} - URN-formatted identifier
 */
const ReceiptRefSchema = z
  .string()
  .min(1)
  .max(ATTRIBUTION_LIMITS.maxReceiptRefLength)
  .refine(
    (ref) => {
      // jti: prefix
      if (ref.startsWith('jti:')) return true;
      // URL
      if (ref.startsWith('https://') || ref.startsWith('http://')) return true;
      // URN
      if (ref.startsWith('urn:peac:receipt:')) return true;
      return false;
    },
    { message: 'Invalid receipt reference format. Must be jti:{id}, URL, or urn:peac:receipt:{id}' }
  );

/**
 * AttributionSource - links to a source receipt and describes how content was used.
 *
 * For cross-issuer resolution, include `receipt_issuer` when using `jti:*` references.
 * URL-based references (`https://...`) are self-resolvable.
 *
 * @example
 * ```typescript
 * const source: AttributionSource = {
 *   receipt_ref: 'jti:rec_abc123def456',
 *   receipt_issuer: 'https://publisher.example.com',
 *   content_hash: { alg: 'sha-256', value: '...', enc: 'base64url' },
 *   usage: 'rag_context',
 *   weight: 0.3,
 * };
 * ```
 */
export const AttributionSourceSchema = z
  .object({
    /** Reference to source PEAC receipt (REQUIRED) */
    receipt_ref: ReceiptRefSchema,

    /**
     * Issuer of the referenced receipt (OPTIONAL but RECOMMENDED for jti: refs).
     *
     * Required for cross-issuer resolution when receipt_ref is jti:{id} format.
     * Not needed for URL-based references which are self-resolvable.
     * Used to construct resolution URL: {receipt_issuer}/.well-known/peac/receipts/{id}
     */
    receipt_issuer: z.string().url().max(2048).optional(),

    /** Hash of source content (OPTIONAL) */
    content_hash: ContentHashSchema.optional(),

    /** Hash of used excerpt (OPTIONAL, content-minimizing, not privacy-preserving for short text) */
    excerpt_hash: ContentHashSchema.optional(),

    /** How the source was used (REQUIRED) */
    usage: AttributionUsageSchema,

    /** Relative contribution weight 0.0-1.0 (OPTIONAL) */
    weight: z.number().min(0).max(1).optional(),
  })
  .strict();
export type AttributionSource = z.infer<typeof AttributionSourceSchema>;

// =============================================================================
// ATTRIBUTION EVIDENCE (v0.9.26+)
// =============================================================================

/**
 * AttributionEvidence - the payload of an AttributionAttestation.
 *
 * Contains the sources, derivation type, and optional output metadata.
 */
export const AttributionEvidenceSchema = z
  .object({
    /** Array of attribution sources (REQUIRED, 1-100 sources) */
    sources: z.array(AttributionSourceSchema).min(1).max(ATTRIBUTION_LIMITS.maxSources),

    /** Type of derivation (REQUIRED) */
    derivation_type: DerivationTypeSchema,

    /** Hash of derived output (OPTIONAL) */
    output_hash: ContentHashSchema.optional(),

    /** Model identifier (OPTIONAL) */
    model_id: z.string().max(ATTRIBUTION_LIMITS.maxModelIdLength).optional(),

    /** Inference provider URL (OPTIONAL) */
    inference_provider: z.string().url().max(2048).optional(),

    /** Session correlation ID (OPTIONAL) */
    session_id: z.string().max(256).optional(),

    /** Additional type-specific metadata (OPTIONAL) */
    metadata: z.record(z.string(), JsonValueSchema).optional(),
  })
  .strict();
export type AttributionEvidence = z.infer<typeof AttributionEvidenceSchema>;

// =============================================================================
// ATTRIBUTION ATTESTATION (v0.9.26+)
// =============================================================================

/**
 * Attestation type literal for attribution
 */
export const ATTRIBUTION_TYPE = 'peac/attribution' as const;

/**
 * AttributionAttestation - proves content derivation and usage.
 *
 * This attestation provides cryptographic evidence that content was derived
 * from specific sources, enabling chain tracking and compliance.
 *
 * @example
 * ```typescript
 * const attestation: AttributionAttestation = {
 *   type: 'peac/attribution',
 *   issuer: 'https://ai.example.com',
 *   issued_at: '2026-01-04T12:00:00Z',
 *   evidence: {
 *     sources: [
 *       { receipt_ref: 'jti:rec_abc123', usage: 'rag_context', weight: 0.5 },
 *       { receipt_ref: 'jti:rec_def456', usage: 'rag_context', weight: 0.5 },
 *     ],
 *     derivation_type: 'rag',
 *     model_id: 'gpt-4',
 *   },
 * };
 * ```
 */
export const AttributionAttestationSchema = z
  .object({
    /** Attestation type (MUST be 'peac/attribution') */
    type: z.literal(ATTRIBUTION_TYPE),

    /** Issuer of the attestation (inference provider, platform) */
    issuer: z.string().min(1).max(2048),

    /** When the attestation was issued (RFC 3339) */
    issued_at: z.string().datetime(),

    /** When the attestation expires (RFC 3339, OPTIONAL) */
    expires_at: z.string().datetime().optional(),

    /** Reference to external verification endpoint (OPTIONAL) */
    ref: z.string().url().max(2048).optional(),

    /** Attribution evidence */
    evidence: AttributionEvidenceSchema,
  })
  .strict();
export type AttributionAttestation = z.infer<typeof AttributionAttestationSchema>;

// =============================================================================
// CHAIN VERIFICATION RESULT (v0.9.26+)
// =============================================================================

/**
 * Result of chain verification including depth and resolved sources.
 */
export interface ChainVerificationResult {
  /** Whether the chain is valid */
  valid: boolean;
  /** Maximum depth encountered in the chain */
  maxDepth: number;
  /** Total number of sources across the chain */
  totalSources: number;
  /** Any cycle detected in the chain */
  cycleDetected?: string;
  /** Error message if validation failed */
  error?: string;
}

// =============================================================================
// VALIDATION HELPERS (v0.9.26+)
// =============================================================================

/**
 * Validate a ContentHash.
 *
 * @param data - Unknown data to validate
 * @returns Result with validated hash or error message
 */
export function validateContentHash(
  data: unknown
): { ok: true; value: ContentHash } | { ok: false; error: string } {
  const result = ContentHashSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.message };
}

/**
 * Validate an AttributionSource.
 *
 * @param data - Unknown data to validate
 * @returns Result with validated source or error message
 */
export function validateAttributionSource(
  data: unknown
): { ok: true; value: AttributionSource } | { ok: false; error: string } {
  const result = AttributionSourceSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.message };
}

/**
 * Validate an AttributionAttestation.
 *
 * @param data - Unknown data to validate
 * @returns Result with validated attestation or error message
 *
 * @example
 * ```typescript
 * const result = validateAttributionAttestation(data);
 * if (result.ok) {
 *   console.log('Sources:', result.value.evidence.sources.length);
 * } else {
 *   console.error('Validation error:', result.error);
 * }
 * ```
 */
export function validateAttributionAttestation(
  data: unknown
): { ok: true; value: AttributionAttestation } | { ok: false; error: string } {
  const result = AttributionAttestationSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.message };
}

/**
 * Check if an object is an AttributionAttestation.
 *
 * @param attestation - Object with a type field
 * @returns True if the type is 'peac/attribution'
 */
export function isAttributionAttestation(attestation: {
  type: string;
}): attestation is AttributionAttestation {
  return attestation.type === ATTRIBUTION_TYPE;
}

/**
 * Parameters for creating an AttributionAttestation.
 */
export interface CreateAttributionAttestationParams {
  /** Issuer of the attestation */
  issuer: string;
  /** Attribution sources */
  sources: AttributionSource[];
  /** Type of derivation */
  derivation_type: DerivationType;
  /** Hash of derived output (optional) */
  output_hash?: ContentHash;
  /** Model identifier (optional) */
  model_id?: string;
  /** Inference provider URL (optional) */
  inference_provider?: string;
  /** Session correlation ID (optional) */
  session_id?: string;
  /** When the attestation expires (optional) */
  expires_at?: string;
  /** External verification endpoint (optional) */
  ref?: string;
  /** Additional metadata (optional, must be JSON-safe) */
  metadata?: Record<string, JsonValue>;
}

/**
 * Create an AttributionAttestation with current timestamp.
 *
 * @param params - Attestation parameters
 * @returns A valid AttributionAttestation
 *
 * @example
 * ```typescript
 * const attestation = createAttributionAttestation({
 *   issuer: 'https://ai.example.com',
 *   sources: [
 *     { receipt_ref: 'jti:rec_abc123', usage: 'rag_context' },
 *   ],
 *   derivation_type: 'rag',
 *   model_id: 'gpt-4',
 * });
 * ```
 */
export function createAttributionAttestation(
  params: CreateAttributionAttestationParams
): AttributionAttestation {
  const evidence: AttributionEvidence = {
    sources: params.sources,
    derivation_type: params.derivation_type,
  };

  if (params.output_hash) {
    evidence.output_hash = params.output_hash;
  }
  if (params.model_id) {
    evidence.model_id = params.model_id;
  }
  if (params.inference_provider) {
    evidence.inference_provider = params.inference_provider;
  }
  if (params.session_id) {
    evidence.session_id = params.session_id;
  }
  if (params.metadata) {
    evidence.metadata = params.metadata;
  }

  const attestation: AttributionAttestation = {
    type: ATTRIBUTION_TYPE,
    issuer: params.issuer,
    issued_at: new Date().toISOString(),
    evidence,
  };

  if (params.expires_at) {
    attestation.expires_at = params.expires_at;
  }
  if (params.ref) {
    attestation.ref = params.ref;
  }

  return attestation;
}

/**
 * Check if an attribution attestation is expired.
 *
 * @param attestation - The attestation to check
 * @param clockSkew - Optional clock skew tolerance in milliseconds (default: 30000)
 * @returns True if the attestation has expired
 */
export function isAttributionExpired(
  attestation: AttributionAttestation,
  clockSkew: number = 30000
): boolean {
  if (!attestation.expires_at) {
    return false; // No expiry = never expires
  }
  const expiresAt = new Date(attestation.expires_at).getTime();
  const now = Date.now();
  return expiresAt < now - clockSkew;
}

/**
 * Check if an attribution attestation is not yet valid.
 *
 * @param attestation - The attestation to check
 * @param clockSkew - Optional clock skew tolerance in milliseconds (default: 30000)
 * @returns True if the attestation is not yet valid (issued_at in the future)
 */
export function isAttributionNotYetValid(
  attestation: AttributionAttestation,
  clockSkew: number = 30000
): boolean {
  const issuedAt = new Date(attestation.issued_at).getTime();
  const now = Date.now();
  return issuedAt > now + clockSkew;
}

/**
 * Compute total weight of sources (for validation).
 *
 * @param sources - Array of attribution sources
 * @returns Total weight, or undefined if no weights specified
 */
export function computeTotalWeight(sources: AttributionSource[]): number | undefined {
  const weights = sources.filter((s) => s.weight !== undefined).map((s) => s.weight as number);
  if (weights.length === 0) {
    return undefined;
  }
  return weights.reduce((sum, w) => sum + w, 0);
}

/**
 * Detect cycles in attribution sources (for chain validation).
 *
 * @param sources - Array of attribution sources
 * @param visited - Set of visited receipt refs (for recursion)
 * @returns Receipt ref that caused cycle, or undefined if no cycle
 */
export function detectCycleInSources(
  sources: AttributionSource[],
  visited: Set<string> = new Set()
): string | undefined {
  for (const source of sources) {
    if (visited.has(source.receipt_ref)) {
      return source.receipt_ref;
    }
  }
  return undefined;
}
