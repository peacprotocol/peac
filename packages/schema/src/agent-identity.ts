/**
 * Agent Identity Attestation Types and Validators (v0.9.25+)
 *
 * Provides cryptographic proof-of-control binding for agents,
 * distinguishing operator-verified bots from user-delegated agents.
 *
 * @see docs/specs/AGENT-IDENTITY.md for normative specification
 */
import { z } from 'zod';
import type { JsonValue } from '@peac/kernel';
import { JsonValueSchema } from './json';

// =============================================================================
// CONTROL TYPE (v0.9.25+)
// =============================================================================

/**
 * Control type distinguishes operator-verified bots from user-delegated agents.
 *
 * - 'operator': Bot/crawler operated by a known organization (e.g., Googlebot, GPTBot)
 * - 'user-delegated': Agent acting on behalf of a human user (e.g., browser extension, AI assistant)
 */
export const ControlTypeSchema = z.enum(['operator', 'user-delegated']);
export type ControlType = z.infer<typeof ControlTypeSchema>;

/**
 * Array of valid control types for runtime checks
 */
export const CONTROL_TYPES = ['operator', 'user-delegated'] as const;

// =============================================================================
// PROOF METHOD (v0.9.25+)
// =============================================================================

/**
 * Proof method used to establish agent identity.
 *
 * - 'http-message-signature': RFC 9421 HTTP Message Signatures
 * - 'dpop': RFC 9449 DPoP token binding
 * - 'mtls': Mutual TLS client certificate
 * - 'jwk-thumbprint': JWK Thumbprint confirmation (RFC 7638)
 */
export const ProofMethodSchema = z.enum([
  'http-message-signature',
  'dpop',
  'mtls',
  'jwk-thumbprint',
]);
export type ProofMethod = z.infer<typeof ProofMethodSchema>;

/**
 * Array of valid proof methods for runtime checks
 */
export const PROOF_METHODS = [
  'http-message-signature',
  'dpop',
  'mtls',
  'jwk-thumbprint',
] as const;

// =============================================================================
// BINDING DETAILS (v0.9.25+)
// =============================================================================

/**
 * Details of what was included in the binding message for http-message-signature.
 *
 * This allows verifiers to reconstruct the binding message for verification.
 */
export const BindingDetailsSchema = z
  .object({
    /** HTTP method (uppercase: GET, POST, etc.) */
    method: z.string().min(1).max(16),

    /** Target URI of the request */
    target: z.string().min(1).max(2048),

    /** Headers included in the signature (lowercase) */
    headers_included: z.array(z.string().max(64)).max(32),

    /** SHA-256 hash of request body (base64url), empty string if no body */
    body_hash: z.string().max(64).optional(),

    /** When the binding was signed (RFC 3339) */
    signed_at: z.string().datetime(),
  })
  .strict();
export type BindingDetails = z.infer<typeof BindingDetailsSchema>;

// =============================================================================
// AGENT PROOF (v0.9.25+)
// =============================================================================

/**
 * Proof of control binding - cryptographic evidence that the agent controls the key.
 */
export const AgentProofSchema = z
  .object({
    /** Proof method used */
    method: ProofMethodSchema,

    /** Key ID (matches kid in JWS header or JWKS) */
    key_id: z.string().min(1).max(256),

    /** Algorithm used (default: EdDSA for Ed25519) */
    alg: z.string().max(32).default('EdDSA'),

    /** Signature over binding message (base64url, for http-message-signature) */
    signature: z.string().max(512).optional(),

    /** DPoP proof JWT (for dpop method) */
    dpop_proof: z.string().max(4096).optional(),

    /** Certificate fingerprint (for mtls method, SHA-256 base64url) */
    cert_thumbprint: z.string().max(64).optional(),

    /** Binding details for http-message-signature */
    binding: BindingDetailsSchema.optional(),
  })
  .strict();
export type AgentProof = z.infer<typeof AgentProofSchema>;

// =============================================================================
// AGENT IDENTITY EVIDENCE (v0.9.25+)
// =============================================================================

/**
 * Agent identity evidence - the payload of an AgentIdentityAttestation.
 *
 * Contains the agent identifier, control type, capabilities, and optional
 * cryptographic proof of key control.
 */
export const AgentIdentityEvidenceSchema = z
  .object({
    /** Stable agent identifier (opaque string, REQUIRED) */
    agent_id: z.string().min(1).max(256),

    /** Control type: operator-verified or user-delegated (REQUIRED) */
    control_type: ControlTypeSchema,

    /** Agent capabilities/scopes (optional, for fine-grained access) */
    capabilities: z.array(z.string().max(64)).max(32).optional(),

    /** Delegation chain for user-delegated agents (optional) */
    delegation_chain: z.array(z.string().max(256)).max(8).optional(),

    /** Cryptographic proof of key control (optional) */
    proof: AgentProofSchema.optional(),

    /** Key directory URL for public key discovery (optional) */
    key_directory_url: z.string().url().max(2048).optional(),

    /** Agent operator/organization (optional, for operator type) */
    operator: z.string().max(256).optional(),

    /** User identifier (optional, for user-delegated type, should be opaque) */
    user_id: z.string().max(256).optional(),

    /** Additional type-specific metadata (optional) */
    metadata: z.record(z.string(), JsonValueSchema).optional(),
  })
  .strict();
export type AgentIdentityEvidence = z.infer<typeof AgentIdentityEvidenceSchema>;

// =============================================================================
// AGENT IDENTITY ATTESTATION (v0.9.25+)
// =============================================================================

/**
 * Attestation type literal for agent identity
 */
export const AGENT_IDENTITY_TYPE = 'peac/agent-identity' as const;

/**
 * AgentIdentityAttestation - extends generic Attestation with agent-specific evidence.
 *
 * This attestation proves cryptographic control over an agent identity,
 * distinguishing operator-verified bots from user-delegated agents.
 *
 * @example
 * ```typescript
 * const attestation: AgentIdentityAttestation = {
 *   type: 'peac/agent-identity',
 *   issuer: 'https://crawler.example.com',
 *   issued_at: '2026-01-03T12:00:00Z',
 *   evidence: {
 *     agent_id: 'bot:crawler-prod-001',
 *     control_type: 'operator',
 *     operator: 'Example Crawler Inc.',
 *     capabilities: ['crawl', 'index'],
 *     proof: {
 *       method: 'http-message-signature',
 *       key_id: 'key-2026-01',
 *       alg: 'EdDSA',
 *     },
 *   },
 * };
 * ```
 */
export const AgentIdentityAttestationSchema = z
  .object({
    /** Attestation type (MUST be 'peac/agent-identity') */
    type: z.literal(AGENT_IDENTITY_TYPE),

    /** Issuer of the attestation (agent operator, IdP, or platform) */
    issuer: z.string().min(1).max(2048),

    /** When the attestation was issued (RFC 3339) */
    issued_at: z.string().datetime(),

    /** When the attestation expires (RFC 3339, optional) */
    expires_at: z.string().datetime().optional(),

    /** Reference to external verification endpoint (optional) */
    ref: z.string().url().max(2048).optional(),

    /** Agent identity evidence */
    evidence: AgentIdentityEvidenceSchema,
  })
  .strict();
export type AgentIdentityAttestation = z.infer<typeof AgentIdentityAttestationSchema>;

// =============================================================================
// IDENTITY BINDING (v0.9.25+)
// =============================================================================

/**
 * Identity binding result from constructBindingMessage().
 *
 * Used to tie an agent identity attestation to a specific HTTP request.
 */
export const IdentityBindingSchema = z
  .object({
    /** SHA-256 hash of the canonical binding message (base64url) */
    binding_message_hash: z.string().min(1).max(64),

    /** Ed25519 signature over binding message (base64url) */
    signature: z.string().min(1).max(512),

    /** Key ID used for signing */
    key_id: z.string().min(1).max(256),

    /** When the binding was created (RFC 3339) */
    signed_at: z.string().datetime(),
  })
  .strict();
export type IdentityBinding = z.infer<typeof IdentityBindingSchema>;

// =============================================================================
// AGENT IDENTITY VERIFIED BLOCK (v0.9.25+)
// =============================================================================

/**
 * Agent identity verification result to include in receipt evidence.
 *
 * This block is added by the publisher after verifying an agent identity
 * attestation, binding the verified identity to the issued receipt.
 */
export const AgentIdentityVerifiedSchema = z
  .object({
    /** Agent ID from the verified attestation */
    agent_id: z.string().min(1).max(256),

    /** Control type from the verified attestation */
    control_type: ControlTypeSchema,

    /** When the publisher verified the identity (RFC 3339) */
    verified_at: z.string().datetime(),

    /** Key ID that was used for verification */
    key_id: z.string().min(1).max(256),

    /** SHA-256 hash of the binding message (base64url) */
    binding_hash: z.string().min(1).max(64),
  })
  .strict();
export type AgentIdentityVerified = z.infer<typeof AgentIdentityVerifiedSchema>;

// =============================================================================
// VALIDATION HELPERS (v0.9.25+)
// =============================================================================

/**
 * Validate an AgentIdentityAttestation.
 *
 * @param data - Unknown data to validate
 * @returns Result with validated attestation or error message
 *
 * @example
 * ```typescript
 * const result = validateAgentIdentityAttestation(data);
 * if (result.ok) {
 *   console.log('Agent ID:', result.value.evidence.agent_id);
 * } else {
 *   console.error('Validation error:', result.error);
 * }
 * ```
 */
export function validateAgentIdentityAttestation(
  data: unknown
): { ok: true; value: AgentIdentityAttestation } | { ok: false; error: string } {
  const result = AgentIdentityAttestationSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.message };
}

/**
 * Check if an object is an AgentIdentityAttestation.
 *
 * @param attestation - Object with a type field
 * @returns True if the type is 'peac/agent-identity'
 */
export function isAgentIdentityAttestation(
  attestation: { type: string }
): attestation is AgentIdentityAttestation {
  return attestation.type === AGENT_IDENTITY_TYPE;
}

/**
 * Parameters for creating an AgentIdentityAttestation.
 */
export interface CreateAgentIdentityAttestationParams {
  /** Issuer of the attestation */
  issuer: string;
  /** Stable agent identifier */
  agent_id: string;
  /** Control type: operator or user-delegated */
  control_type: ControlType;
  /** Cryptographic proof (optional) */
  proof?: AgentProof;
  /** Agent capabilities (optional) */
  capabilities?: string[];
  /** Delegation chain for user-delegated (optional) */
  delegation_chain?: string[];
  /** Key directory URL (optional) */
  key_directory_url?: string;
  /** Agent operator name (optional, for operator type) */
  operator?: string;
  /** User ID (optional, for user-delegated type) */
  user_id?: string;
  /** When the attestation expires (optional) */
  expires_at?: string;
  /** External verification endpoint (optional) */
  ref?: string;
  /** Additional metadata (optional, must be JSON-safe) */
  metadata?: Record<string, JsonValue>;
}

/**
 * Create an AgentIdentityAttestation with current timestamp.
 *
 * @param params - Attestation parameters
 * @returns A valid AgentIdentityAttestation
 *
 * @example
 * ```typescript
 * const attestation = createAgentIdentityAttestation({
 *   issuer: 'https://crawler.example.com',
 *   agent_id: 'bot:crawler-prod-001',
 *   control_type: 'operator',
 *   operator: 'Example Crawler Inc.',
 *   capabilities: ['crawl', 'index'],
 * });
 * ```
 */
export function createAgentIdentityAttestation(
  params: CreateAgentIdentityAttestationParams
): AgentIdentityAttestation {
  const evidence: AgentIdentityEvidence = {
    agent_id: params.agent_id,
    control_type: params.control_type,
  };

  if (params.capabilities) {
    evidence.capabilities = params.capabilities;
  }
  if (params.delegation_chain) {
    evidence.delegation_chain = params.delegation_chain;
  }
  if (params.proof) {
    evidence.proof = params.proof;
  }
  if (params.key_directory_url) {
    evidence.key_directory_url = params.key_directory_url;
  }
  if (params.operator) {
    evidence.operator = params.operator;
  }
  if (params.user_id) {
    evidence.user_id = params.user_id;
  }
  if (params.metadata) {
    // Validate metadata is JSON-safe at runtime
    evidence.metadata = params.metadata;
  }

  const attestation: AgentIdentityAttestation = {
    type: AGENT_IDENTITY_TYPE,
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
 * Validate an IdentityBinding.
 *
 * @param data - Unknown data to validate
 * @returns Result with validated binding or error message
 */
export function validateIdentityBinding(
  data: unknown
): { ok: true; value: IdentityBinding } | { ok: false; error: string } {
  const result = IdentityBindingSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.message };
}

/**
 * Check if an agent identity attestation is expired.
 *
 * @param attestation - The attestation to check
 * @param clockSkew - Optional clock skew tolerance in milliseconds (default: 30000)
 * @returns True if the attestation has expired
 */
export function isAttestationExpired(
  attestation: AgentIdentityAttestation,
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
 * Check if an agent identity attestation is not yet valid.
 *
 * @param attestation - The attestation to check
 * @param clockSkew - Optional clock skew tolerance in milliseconds (default: 30000)
 * @returns True if the attestation is not yet valid (issued_at in the future)
 */
export function isAttestationNotYetValid(
  attestation: AgentIdentityAttestation,
  clockSkew: number = 30000
): boolean {
  const issuedAt = new Date(attestation.issued_at).getTime();
  const now = Date.now();
  return issuedAt > now + clockSkew;
}
