/**
 * Dispute Attestation Types and Validators (v0.9.27+)
 *
 * Provides formal mechanism for contesting PEAC receipts, attributions,
 * and identity claims with lifecycle state management.
 *
 * @see docs/specs/DISPUTE.md for normative specification
 */
import { z } from 'zod';
import { ContentHashSchema, type ContentHash } from './attribution';

// =============================================================================
// DISPUTE LIMITS (v0.9.27+)
// =============================================================================

/**
 * Dispute limits for DoS protection and validation.
 *
 * These are implementation safety limits, not protocol constraints.
 */
export const DISPUTE_LIMITS = {
  /** Maximum grounds per dispute */
  maxGrounds: 10,
  /** Maximum supporting receipts */
  maxSupportingReceipts: 50,
  /** Maximum supporting attributions */
  maxSupportingAttributions: 50,
  /** Maximum supporting documents */
  maxSupportingDocuments: 20,
  /** Maximum description length in chars */
  maxDescriptionLength: 4000,
  /** Maximum details length per ground in chars */
  maxGroundDetailsLength: 1000,
  /** Maximum rationale length in chars */
  maxRationaleLength: 4000,
  /** Maximum remediation details length in chars */
  maxRemediationDetailsLength: 4000,
  /** Minimum description for 'other' dispute type */
  minOtherDescriptionLength: 50,
} as const;

// =============================================================================
// ULID VALIDATION (v0.9.27+)
// =============================================================================

/**
 * ULID format regex: 26 characters, Crockford Base32, UPPERCASE ONLY.
 *
 * ULIDs are time-ordered, globally unique identifiers that are URL-safe.
 * Format: 10 characters timestamp + 16 characters randomness
 *
 * CASE SENSITIVITY DECISION (v0.9.27):
 * While the ULID spec allows case-insensitive decoding (lowercase is valid),
 * PEAC enforces UPPERCASE as the canonical form for dispute IDs. This ensures:
 * 1. Consistent string comparison without normalization
 * 2. Predictable indexing and lookup in storage systems
 * 3. Deterministic hash computation for audit trails
 *
 * Implementations generating ULIDs MUST use uppercase encoding.
 * Implementations receiving ULIDs MAY normalize to uppercase before validation
 * if interoperating with systems that produce lowercase, but SHOULD warn.
 *
 * @see https://github.com/ulid/spec
 */
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Dispute ID schema using ULID format.
 *
 * @example "01ARZ3NDEKTSV4RRFFQ69G5FAV"
 */
export const DisputeIdSchema = z.string().regex(ULID_REGEX, 'Invalid ULID format');
export type DisputeId = z.infer<typeof DisputeIdSchema>;

// =============================================================================
// DISPUTE TYPES (v0.9.27+)
// =============================================================================

/**
 * Type of dispute being filed.
 *
 * - 'unauthorized_access': Content accessed without valid receipt
 * - 'attribution_missing': Used content without attribution
 * - 'attribution_incorrect': Attribution exists but is wrong
 * - 'receipt_invalid': Receipt was fraudulently issued
 * - 'identity_spoofed': Agent identity was impersonated
 * - 'purpose_mismatch': Declared purpose doesn't match actual use
 * - 'policy_violation': Terms/policy violated despite receipt
 * - 'other': Catch-all (requires description >= 50 chars)
 */
export const DisputeTypeSchema = z.enum([
  'unauthorized_access',
  'attribution_missing',
  'attribution_incorrect',
  'receipt_invalid',
  'identity_spoofed',
  'purpose_mismatch',
  'policy_violation',
  'other',
]);
export type DisputeType = z.infer<typeof DisputeTypeSchema>;

/**
 * Array of valid dispute types for runtime checks.
 */
export const DISPUTE_TYPES = [
  'unauthorized_access',
  'attribution_missing',
  'attribution_incorrect',
  'receipt_invalid',
  'identity_spoofed',
  'purpose_mismatch',
  'policy_violation',
  'other',
] as const;

// =============================================================================
// DISPUTE TARGET TYPES (v0.9.27+)
// =============================================================================

/**
 * Type of entity being disputed.
 *
 * - 'receipt': A PEAC receipt
 * - 'attribution': An attribution attestation
 * - 'identity': An agent identity attestation
 * - 'policy': A policy decision or enforcement
 */
export const DisputeTargetTypeSchema = z.enum(['receipt', 'attribution', 'identity', 'policy']);
export type DisputeTargetType = z.infer<typeof DisputeTargetTypeSchema>;

/**
 * Array of valid target types for runtime checks.
 */
export const DISPUTE_TARGET_TYPES = ['receipt', 'attribution', 'identity', 'policy'] as const;

// =============================================================================
// DISPUTE GROUNDS (v0.9.27+)
// =============================================================================

/**
 * Specific grounds for the dispute.
 *
 * Evidence-based:
 * - 'missing_receipt': No receipt exists for access
 * - 'expired_receipt': Receipt was expired at time of use
 * - 'forged_receipt': Receipt signature invalid or tampered
 * - 'receipt_not_applicable': Receipt doesn't cover the resource
 *
 * Attribution-based:
 * - 'content_not_used': Content was not actually used
 * - 'source_misidentified': Wrong source attributed
 * - 'usage_type_wrong': RAG claimed but was training, etc.
 * - 'weight_inaccurate': Attribution weight is incorrect
 *
 * Identity-based:
 * - 'agent_impersonation': Agent ID was spoofed
 * - 'key_compromise': Signing key was compromised
 * - 'delegation_invalid': Delegation chain is broken
 *
 * Policy-based:
 * - 'purpose_exceeded': Used beyond declared purpose
 * - 'terms_violated': Specific terms were violated
 * - 'rate_limit_exceeded': Exceeded rate limits
 */
export const DisputeGroundsCodeSchema = z.enum([
  // Evidence-based
  'missing_receipt',
  'expired_receipt',
  'forged_receipt',
  'receipt_not_applicable',
  // Attribution-based
  'content_not_used',
  'source_misidentified',
  'usage_type_wrong',
  'weight_inaccurate',
  // Identity-based
  'agent_impersonation',
  'key_compromise',
  'delegation_invalid',
  // Policy-based
  'purpose_exceeded',
  'terms_violated',
  'rate_limit_exceeded',
]);
export type DisputeGroundsCode = z.infer<typeof DisputeGroundsCodeSchema>;

/**
 * Array of valid grounds codes for runtime checks.
 */
export const DISPUTE_GROUNDS_CODES = [
  'missing_receipt',
  'expired_receipt',
  'forged_receipt',
  'receipt_not_applicable',
  'content_not_used',
  'source_misidentified',
  'usage_type_wrong',
  'weight_inaccurate',
  'agent_impersonation',
  'key_compromise',
  'delegation_invalid',
  'purpose_exceeded',
  'terms_violated',
  'rate_limit_exceeded',
] as const;

/**
 * Individual dispute ground with supporting evidence reference.
 */
export const DisputeGroundsSchema = z
  .object({
    /** Specific code for this ground (REQUIRED) */
    code: DisputeGroundsCodeSchema,
    /** Reference to supporting evidence (OPTIONAL) */
    evidence_ref: z.string().max(2048).optional(),
    /** Additional context for this ground (OPTIONAL) */
    details: z.string().max(DISPUTE_LIMITS.maxGroundDetailsLength).optional(),
  })
  .strict();
export type DisputeGrounds = z.infer<typeof DisputeGroundsSchema>;

// =============================================================================
// DISPUTE LIFECYCLE STATES (v0.9.27+)
// =============================================================================

/**
 * Dispute lifecycle states.
 *
 * State flow:
 * ```
 * FILED -> ACKNOWLEDGED -> UNDER_REVIEW -> RESOLVED
 *            |                |              |
 *            +-> REJECTED     +-> ESCALATED  +-> APPEALED
 *                                               |
 *                                               +-> FINAL
 * ```
 *
 * Terminal states (REQUIRE resolution): resolved, rejected, final
 * Non-terminal states: filed, acknowledged, under_review, escalated, appealed
 */
export const DisputeStateSchema = z.enum([
  'filed',
  'acknowledged',
  'under_review',
  'escalated',
  'resolved',
  'rejected',
  'appealed',
  'final',
]);
export type DisputeState = z.infer<typeof DisputeStateSchema>;

/**
 * Array of valid dispute states for runtime checks.
 */
export const DISPUTE_STATES = [
  'filed',
  'acknowledged',
  'under_review',
  'escalated',
  'resolved',
  'rejected',
  'appealed',
  'final',
] as const;

/**
 * Terminal states that REQUIRE a resolution field.
 */
export const TERMINAL_STATES: readonly DisputeState[] = ['resolved', 'rejected', 'final'] as const;

/**
 * Canonical state transition table for dispute lifecycle.
 *
 * This is the SINGLE SOURCE OF TRUTH for valid transitions.
 * Do not duplicate elsewhere - reference this constant.
 */
export const DISPUTE_TRANSITIONS: Record<DisputeState, readonly DisputeState[]> = {
  filed: ['acknowledged', 'rejected'],
  acknowledged: ['under_review', 'rejected'],
  under_review: ['resolved', 'escalated'],
  escalated: ['resolved'],
  resolved: ['appealed', 'final'],
  rejected: ['appealed', 'final'],
  appealed: ['under_review', 'final'],
  final: [], // Terminal - no transitions out
} as const;

/**
 * Check if a state transition is valid.
 *
 * @param current - Current dispute state
 * @param next - Proposed next state
 * @returns True if the transition is valid
 */
export function canTransitionTo(current: DisputeState, next: DisputeState): boolean {
  return DISPUTE_TRANSITIONS[current].includes(next);
}

/**
 * Check if a state is terminal (requires resolution).
 *
 * @param state - Dispute state to check
 * @returns True if the state is terminal
 */
export function isTerminalState(state: DisputeState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * Get valid next states from current state.
 *
 * @param current - Current dispute state
 * @returns Array of valid next states
 */
export function getValidTransitions(current: DisputeState): readonly DisputeState[] {
  return DISPUTE_TRANSITIONS[current];
}

// =============================================================================
// DISPUTE OUTCOME AND RESOLUTION (v0.9.27+)
// =============================================================================

/**
 * Outcome of a resolved dispute.
 *
 * - 'upheld': Dispute was valid, in favor of filer
 * - 'dismissed': Dispute invalid or without merit
 * - 'partially_upheld': Some grounds upheld, others dismissed
 * - 'settled': Parties reached agreement
 */
export const DisputeOutcomeSchema = z.enum(['upheld', 'dismissed', 'partially_upheld', 'settled']);
export type DisputeOutcome = z.infer<typeof DisputeOutcomeSchema>;

/**
 * Array of valid outcomes for runtime checks.
 */
export const DISPUTE_OUTCOMES = ['upheld', 'dismissed', 'partially_upheld', 'settled'] as const;

/**
 * Type of remediation action taken.
 *
 * - 'attribution_corrected': Attribution was fixed
 * - 'receipt_revoked': Receipt was revoked
 * - 'access_restored': Access was restored
 * - 'compensation': Financial compensation provided
 * - 'policy_updated': Policy was updated
 * - 'no_action': No action required
 * - 'other': Other remediation
 */
export const RemediationTypeSchema = z.enum([
  'attribution_corrected',
  'receipt_revoked',
  'access_restored',
  'compensation',
  'policy_updated',
  'no_action',
  'other',
]);
export type RemediationType = z.infer<typeof RemediationTypeSchema>;

/**
 * Array of valid remediation types for runtime checks.
 */
export const REMEDIATION_TYPES = [
  'attribution_corrected',
  'receipt_revoked',
  'access_restored',
  'compensation',
  'policy_updated',
  'no_action',
  'other',
] as const;

/**
 * Remediation action taken to address the dispute.
 */
export const RemediationSchema = z
  .object({
    /** Type of remediation (REQUIRED) */
    type: RemediationTypeSchema,
    /** Details of the remediation action (REQUIRED) */
    details: z.string().min(1).max(DISPUTE_LIMITS.maxRemediationDetailsLength),
    /** Deadline for completing remediation (OPTIONAL) */
    deadline: z.string().datetime().optional(),
  })
  .strict();
export type Remediation = z.infer<typeof RemediationSchema>;

/**
 * Resolution of a dispute.
 *
 * Required for terminal states (resolved, rejected, final).
 */
export const DisputeResolutionSchema = z
  .object({
    /** Outcome of the dispute (REQUIRED) */
    outcome: DisputeOutcomeSchema,
    /** When the decision was made (REQUIRED) */
    decided_at: z.string().datetime(),
    /** Who made the decision (REQUIRED) */
    decided_by: z.string().min(1).max(2048),
    /** Explanation of the decision (REQUIRED) */
    rationale: z.string().min(1).max(DISPUTE_LIMITS.maxRationaleLength),
    /** Remediation action if applicable (OPTIONAL) */
    remediation: RemediationSchema.optional(),
  })
  .strict();
export type DisputeResolution = z.infer<typeof DisputeResolutionSchema>;

// =============================================================================
// DISPUTE CONTACT (v0.9.27+)
// =============================================================================

/**
 * Contact method for dispute resolution.
 *
 * - 'email': Email address
 * - 'url': URL (webhook, contact form)
 * - 'did': Decentralized identifier
 */
export const ContactMethodSchema = z.enum(['email', 'url', 'did']);
export type ContactMethod = z.infer<typeof ContactMethodSchema>;

/**
 * Contact information for dispute communication.
 *
 * Validated based on method type.
 */
export const DisputeContactSchema = z
  .object({
    /** Contact method (REQUIRED) */
    method: ContactMethodSchema,
    /** Contact value (REQUIRED) */
    value: z.string().min(1).max(2048),
  })
  .strict()
  .superRefine((contact, ctx) => {
    if (contact.method === 'email') {
      // Basic email validation (RFC 5322 simplified)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(contact.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid email format',
          path: ['value'],
        });
      }
    } else if (contact.method === 'did') {
      // DID must start with did:
      if (!contact.value.startsWith('did:')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'DID must start with "did:"',
          path: ['value'],
        });
      }
    } else if (contact.method === 'url') {
      // URL validation
      try {
        new URL(contact.value);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid URL format',
          path: ['value'],
        });
      }
    }
  });
export type DisputeContact = z.infer<typeof DisputeContactSchema>;

// =============================================================================
// DOCUMENT REFERENCE (v0.9.27+)
// =============================================================================

/**
 * Reference to an external document supporting the dispute.
 */
export const DocumentRefSchema = z
  .object({
    /** URI of the document (REQUIRED) */
    uri: z.string().url().max(2048),
    /** Content hash for integrity verification (OPTIONAL) */
    content_hash: ContentHashSchema.optional(),
    /** Brief description of the document (OPTIONAL) */
    description: z.string().max(500).optional(),
  })
  .strict();
export type DocumentRef = z.infer<typeof DocumentRefSchema>;

// =============================================================================
// DISPUTE EVIDENCE (v0.9.27+)
// =============================================================================

/**
 * Base evidence schema without invariants.
 */
const DisputeEvidenceBaseSchema = z
  .object({
    /** Type of dispute (REQUIRED) */
    dispute_type: DisputeTypeSchema,
    /** Reference to disputed target: jti:{id}, URL, or URN (REQUIRED) */
    target_ref: z.string().min(1).max(2048),
    /** Type of target being disputed (REQUIRED) */
    target_type: DisputeTargetTypeSchema,
    /** Grounds for the dispute (REQUIRED, at least 1) */
    grounds: z.array(DisputeGroundsSchema).min(1).max(DISPUTE_LIMITS.maxGrounds),
    /** Human-readable description (REQUIRED) */
    description: z.string().min(1).max(DISPUTE_LIMITS.maxDescriptionLength),
    /** Receipt references supporting the claim (OPTIONAL) */
    supporting_receipts: z
      .array(z.string().max(2048))
      .max(DISPUTE_LIMITS.maxSupportingReceipts)
      .optional(),
    /** Attribution references supporting the claim (OPTIONAL) */
    supporting_attributions: z
      .array(z.string().max(2048))
      .max(DISPUTE_LIMITS.maxSupportingAttributions)
      .optional(),
    /** External document references (OPTIONAL) */
    supporting_documents: z
      .array(DocumentRefSchema)
      .max(DISPUTE_LIMITS.maxSupportingDocuments)
      .optional(),
    /** Contact for dispute resolution (OPTIONAL) */
    contact: DisputeContactSchema.optional(),
    /** Current lifecycle state (REQUIRED) */
    state: DisputeStateSchema,
    /** When state was last changed (OPTIONAL) */
    state_changed_at: z.string().datetime().optional(),
    /** Reason for state change (OPTIONAL) */
    state_reason: z.string().max(1000).optional(),
    /** Resolution details (REQUIRED for terminal states) */
    resolution: DisputeResolutionSchema.optional(),
    /** Advisory: filing window used by issuer in days (OPTIONAL, informative only) */
    window_hint_days: z.number().int().positive().max(365).optional(),
  })
  .strict();

/**
 * Dispute evidence with cross-field invariants enforced via superRefine.
 *
 * Invariants:
 * 1. Terminal states (resolved, rejected, final) REQUIRE resolution
 * 2. Resolution is ONLY valid for terminal states
 * 3. Dispute type 'other' requires description >= 50 characters
 */
export const DisputeEvidenceSchema = DisputeEvidenceBaseSchema.superRefine((evidence, ctx) => {
  const terminalStates: DisputeState[] = ['resolved', 'rejected', 'final'];

  // Invariant 1: Terminal states REQUIRE resolution
  if (terminalStates.includes(evidence.state) && !evidence.resolution) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Resolution is required when state is "${evidence.state}"`,
      path: ['resolution'],
    });
  }

  // Invariant 2: Resolution REQUIRES terminal state
  if (evidence.resolution && !terminalStates.includes(evidence.state)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Resolution is only valid for terminal states (resolved, rejected, final), not "${evidence.state}"`,
      path: ['state'],
    });
  }

  // Invariant 3: 'other' dispute type requires meaningful description
  if (
    evidence.dispute_type === 'other' &&
    evidence.description.length < DISPUTE_LIMITS.minOtherDescriptionLength
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Dispute type "other" requires description of at least ${DISPUTE_LIMITS.minOtherDescriptionLength} characters`,
      path: ['description'],
    });
  }
});
export type DisputeEvidence = z.infer<typeof DisputeEvidenceSchema>;

// =============================================================================
// DISPUTE ATTESTATION (v0.9.27+)
// =============================================================================

/**
 * Attestation type literal for disputes.
 */
export const DISPUTE_TYPE = 'peac/dispute' as const;

/**
 * DisputeAttestation - formal mechanism for contesting PEAC claims.
 *
 * This attestation provides a standardized way to dispute receipts,
 * attributions, identity claims, or policy decisions.
 *
 * @example
 * ```typescript
 * const dispute: DisputeAttestation = {
 *   type: 'peac/dispute',
 *   issuer: 'https://publisher.example.com',
 *   issued_at: '2026-01-06T12:00:00Z',
 *   ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   evidence: {
 *     dispute_type: 'unauthorized_access',
 *     target_ref: 'jti:01H5KPT9QZA123456789VWXYZG',
 *     target_type: 'receipt',
 *     grounds: [{ code: 'missing_receipt' }],
 *     description: 'Content was accessed without a valid receipt.',
 *     state: 'filed',
 *   },
 * };
 * ```
 */
export const DisputeAttestationSchema = z
  .object({
    /** Attestation type (MUST be 'peac/dispute') */
    type: z.literal(DISPUTE_TYPE),
    /** Party filing the dispute (REQUIRED) */
    issuer: z.string().min(1).max(2048),
    /** When the dispute was filed (REQUIRED) */
    issued_at: z.string().datetime(),
    /** When the dispute expires (OPTIONAL) */
    expires_at: z.string().datetime().optional(),
    /** Unique dispute reference in ULID format (REQUIRED) */
    ref: DisputeIdSchema,
    /** Dispute evidence and state */
    evidence: DisputeEvidenceSchema,
  })
  .strict();
export type DisputeAttestation = z.infer<typeof DisputeAttestationSchema>;

// =============================================================================
// VALIDATION HELPERS (v0.9.27+)
// =============================================================================

/**
 * Validate a DisputeAttestation.
 *
 * @param data - Unknown data to validate
 * @returns Result with validated attestation or error message
 *
 * @example
 * ```typescript
 * const result = validateDisputeAttestation(data);
 * if (result.ok) {
 *   console.log('Dispute ref:', result.value.ref);
 * } else {
 *   console.error('Validation error:', result.error);
 * }
 * ```
 */
export function validateDisputeAttestation(
  data: unknown
): { ok: true; value: DisputeAttestation } | { ok: false; error: string } {
  const result = DisputeAttestationSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.message };
}

/**
 * Check if an object is a valid DisputeAttestation.
 *
 * @param data - Unknown data to check
 * @returns True if valid
 */
export function isValidDisputeAttestation(data: unknown): data is DisputeAttestation {
  return DisputeAttestationSchema.safeParse(data).success;
}

/**
 * Check if an object has the dispute attestation type.
 *
 * @param attestation - Object with a type field
 * @returns True if type is 'peac/dispute'
 */
export function isDisputeAttestation(attestation: {
  type: string;
}): attestation is DisputeAttestation {
  return attestation.type === DISPUTE_TYPE;
}

/**
 * Validate a DisputeResolution.
 *
 * @param data - Unknown data to validate
 * @returns Result with validated resolution or error message
 */
export function validateDisputeResolution(
  data: unknown
): { ok: true; value: DisputeResolution } | { ok: false; error: string } {
  const result = DisputeResolutionSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.message };
}

/**
 * Validate a DisputeContact.
 *
 * @param data - Unknown data to validate
 * @returns Result with validated contact or error message
 */
export function validateDisputeContact(
  data: unknown
): { ok: true; value: DisputeContact } | { ok: false; error: string } {
  const result = DisputeContactSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.message };
}

// =============================================================================
// FACTORY HELPERS (v0.9.27+)
// =============================================================================

/**
 * Parameters for creating a DisputeAttestation.
 */
export interface CreateDisputeAttestationParams {
  /** Party filing the dispute */
  issuer: string;
  /** Unique dispute reference (ULID format) */
  ref: string;
  /** Type of dispute */
  dispute_type: DisputeType;
  /** Reference to disputed target */
  target_ref: string;
  /** Type of target */
  target_type: DisputeTargetType;
  /** Grounds for dispute */
  grounds: DisputeGrounds[];
  /** Human-readable description */
  description: string;
  /** Contact information (optional) */
  contact?: DisputeContact;
  /** When the attestation expires (optional) */
  expires_at?: string;
  /** Supporting receipt references (optional) */
  supporting_receipts?: string[];
  /** Supporting attribution references (optional) */
  supporting_attributions?: string[];
  /** Supporting document references (optional) */
  supporting_documents?: DocumentRef[];
  /** Advisory filing window in days (optional) */
  window_hint_days?: number;
}

/**
 * Create a DisputeAttestation with current timestamp and 'filed' state.
 *
 * @param params - Attestation parameters
 * @returns A valid DisputeAttestation in 'filed' state
 *
 * @example
 * ```typescript
 * const dispute = createDisputeAttestation({
 *   issuer: 'https://publisher.example.com',
 *   ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   dispute_type: 'unauthorized_access',
 *   target_ref: 'jti:01H5KPT9QZA123456789VWXYZG',
 *   target_type: 'receipt',
 *   grounds: [{ code: 'missing_receipt' }],
 *   description: 'Content was accessed without a valid receipt.',
 * });
 * ```
 */
export function createDisputeAttestation(
  params: CreateDisputeAttestationParams
): DisputeAttestation {
  const now = new Date().toISOString();

  const evidence: DisputeEvidence = {
    dispute_type: params.dispute_type,
    target_ref: params.target_ref,
    target_type: params.target_type,
    grounds: params.grounds,
    description: params.description,
    state: 'filed',
  };

  if (params.contact) {
    evidence.contact = params.contact;
  }
  if (params.supporting_receipts) {
    evidence.supporting_receipts = params.supporting_receipts;
  }
  if (params.supporting_attributions) {
    evidence.supporting_attributions = params.supporting_attributions;
  }
  if (params.supporting_documents) {
    evidence.supporting_documents = params.supporting_documents;
  }
  if (params.window_hint_days !== undefined) {
    evidence.window_hint_days = params.window_hint_days;
  }

  const attestation: DisputeAttestation = {
    type: DISPUTE_TYPE,
    issuer: params.issuer,
    issued_at: now,
    ref: params.ref,
    evidence,
  };

  if (params.expires_at) {
    attestation.expires_at = params.expires_at;
  }

  return attestation;
}

/**
 * Transition a dispute to a new state.
 *
 * @param dispute - Current dispute attestation
 * @param newState - Target state
 * @param reason - Reason for transition (optional)
 * @param resolution - Resolution details (required for terminal states)
 * @returns Updated dispute attestation or error
 *
 * @example
 * ```typescript
 * // Acknowledge a filed dispute
 * const acknowledged = transitionDisputeState(
 *   dispute,
 *   'acknowledged',
 *   'Dispute received and under review'
 * );
 *
 * // Resolve a dispute (terminal state requires resolution)
 * const resolved = transitionDisputeState(
 *   dispute,
 *   'resolved',
 *   'Investigation complete',
 *   {
 *     outcome: 'upheld',
 *     decided_at: new Date().toISOString(),
 *     decided_by: 'https://platform.example.com',
 *     rationale: 'Evidence supports the claim.',
 *   }
 * );
 * ```
 */
export function transitionDisputeState(
  dispute: DisputeAttestation,
  newState: DisputeState,
  reason?: string,
  resolution?: DisputeResolution
):
  | { ok: true; value: DisputeAttestation }
  | {
      ok: false;
      error: string;
      code: 'INVALID_TRANSITION' | 'RESOLUTION_REQUIRED' | 'RESOLUTION_NOT_ALLOWED';
    } {
  const currentState = dispute.evidence.state;

  // Check if transition is valid
  if (!canTransitionTo(currentState, newState)) {
    return {
      ok: false,
      error: `Invalid transition from "${currentState}" to "${newState}". Valid transitions: ${DISPUTE_TRANSITIONS[currentState].join(', ') || 'none'}`,
      code: 'INVALID_TRANSITION',
    };
  }

  // Check resolution requirements
  const isTargetTerminal = isTerminalState(newState);

  if (isTargetTerminal && !resolution) {
    return {
      ok: false,
      error: `Resolution is required when transitioning to terminal state "${newState}"`,
      code: 'RESOLUTION_REQUIRED',
    };
  }

  if (!isTargetTerminal && resolution) {
    return {
      ok: false,
      error: `Resolution is not allowed for non-terminal state "${newState}"`,
      code: 'RESOLUTION_NOT_ALLOWED',
    };
  }

  // Create updated dispute
  const now = new Date().toISOString();

  // Destructure to separate resolution from other evidence fields
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { resolution: _existingResolution, ...evidenceWithoutResolution } = dispute.evidence;

  // Build updated evidence: start without resolution, add back only if terminal
  const updatedEvidence: DisputeEvidence = {
    ...evidenceWithoutResolution,
    state: newState,
    state_changed_at: now,
  };

  if (reason) {
    updatedEvidence.state_reason = reason;
  }

  // Only add resolution for terminal states
  if (isTargetTerminal && resolution) {
    updatedEvidence.resolution = resolution;
  }

  return {
    ok: true,
    value: {
      ...dispute,
      evidence: updatedEvidence,
    },
  };
}

// =============================================================================
// TIME VALIDATION HELPERS (v0.9.27+)
// =============================================================================

/**
 * Check if a dispute attestation is expired.
 *
 * @param attestation - The attestation to check
 * @param clockSkew - Clock skew tolerance in milliseconds (default: 30000)
 * @returns True if expired
 */
export function isDisputeExpired(
  attestation: DisputeAttestation,
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
 * Check if a dispute attestation is not yet valid (issued_at in future).
 *
 * @param attestation - The attestation to check
 * @param clockSkew - Clock skew tolerance in milliseconds (default: 30000)
 * @returns True if not yet valid
 */
export function isDisputeNotYetValid(
  attestation: DisputeAttestation,
  clockSkew: number = 30000
): boolean {
  const issuedAt = new Date(attestation.issued_at).getTime();
  const now = Date.now();
  return issuedAt > now + clockSkew;
}
