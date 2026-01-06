/**
 * PEAC Protocol Schema Package
 * Wire format frozen at peac.receipt/0.9 with v1.0-equivalent semantics
 */

// Core envelope and types
export * from './envelope';
export * from './control';
export * from './evidence';
export * from './subject';
export * from './errors';
export * from './normalize';
export * from './purpose';
export * from './agent-identity';
export * from './attribution';

// JSON-safe validation schemas (v0.9.21+)
export {
  JsonPrimitiveSchema,
  JsonValueSchema,
  JsonObjectSchema,
  JsonArraySchema,
  // Iterative validator for DoS protection (v0.9.21+)
  JSON_EVIDENCE_LIMITS,
  assertJsonSafeIterative,
} from './json';
export type { JsonSafetyResult } from './json';

// Internal types - exported with UNSAFE_ prefix for testing only
// Do NOT use in production code; use validateEvidence() with defaults instead
export type { JsonEvidenceLimits as UNSAFE_JsonEvidenceLimits } from './json';

// Legacy types (for backward compatibility in tests)
export * from './constants';
export * from './types';

// Validators (explicit exports to avoid name conflicts with types)
export {
  NormalizedPayment,
  Extensions,
  JWSHeader,
  ReceiptClaims,
  Subject as SubjectSchema,
  AIPREFSnapshot as AIPREFSnapshotSchema,
  VerifyRequest as VerifyRequestSchema,
  // CAL validators (v0.9.16+)
  ControlPurposeSchema,
  ControlLicensingModeSchema,
  ControlDecisionSchema,
  ControlStepSchema,
  ControlBlockSchema,
  // Payment evidence validators (v0.9.16+)
  PaymentSplitSchema,
  PaymentEvidenceSchema,
  PaymentRoutingSchema,
  // Subject profile validators (v0.9.16+)
  SubjectTypeSchema,
  SubjectProfileSchema,
  SubjectProfileSnapshotSchema,
  // Attestation validators (v0.9.21+)
  AttestationSchema,
  ExtensionsSchema,
  // Purpose validators (v0.9.24+)
  PurposeTokenSchema,
  CanonicalPurposeSchema,
  PurposeReasonSchema,
  // Subject snapshot validation helper (v0.9.17+)
  validateSubjectSnapshot,
  // Evidence validation with DoS protection (v0.9.21+)
  validateEvidence,
} from './validators';
export type { EvidenceValidationResult } from './validators';

// Agent Identity validators (v0.9.25+)
export {
  ControlTypeSchema,
  ProofMethodSchema,
  BindingDetailsSchema,
  AgentProofSchema,
  AgentIdentityEvidenceSchema,
  AgentIdentityAttestationSchema,
  IdentityBindingSchema,
  AgentIdentityVerifiedSchema,
  // Constants
  AGENT_IDENTITY_TYPE,
  CONTROL_TYPES,
  PROOF_METHODS,
  // Helpers
  validateAgentIdentityAttestation,
  isAgentIdentityAttestation,
  createAgentIdentityAttestation,
  validateIdentityBinding,
  isAttestationExpired,
  isAttestationNotYetValid,
} from './agent-identity';
export type {
  ControlType,
  ProofMethod,
  BindingDetails,
  AgentProof,
  AgentIdentityEvidence,
  AgentIdentityAttestation,
  IdentityBinding,
  AgentIdentityVerified,
  CreateAgentIdentityAttestationParams,
} from './agent-identity';

// Attribution validators (v0.9.26+)
export {
  HashAlgorithmSchema,
  HashEncodingSchema,
  ContentHashSchema,
  AttributionUsageSchema,
  DerivationTypeSchema,
  AttributionSourceSchema,
  AttributionEvidenceSchema,
  AttributionAttestationSchema,
  // Constants
  ATTRIBUTION_TYPE,
  ATTRIBUTION_LIMITS,
  ATTRIBUTION_USAGES,
  DERIVATION_TYPES,
  // Helpers
  validateContentHash,
  validateAttributionSource,
  validateAttributionAttestation,
  isAttributionAttestation,
  createAttributionAttestation,
  isAttributionExpired,
  isAttributionNotYetValid,
  computeTotalWeight,
  detectCycleInSources,
} from './attribution';
export type {
  HashAlgorithm,
  HashEncoding,
  ContentHash,
  AttributionUsage,
  DerivationType,
  AttributionSource,
  AttributionEvidence,
  AttributionAttestation,
  ChainVerificationResult,
  CreateAttributionAttestationParams,
} from './attribution';

// Dispute attestation types (v0.9.27+)
export {
  DisputeIdSchema,
  DisputeTypeSchema,
  DisputeTargetTypeSchema,
  DisputeGroundsCodeSchema,
  DisputeGroundsSchema,
  DisputeStateSchema,
  DisputeOutcomeSchema,
  RemediationTypeSchema,
  RemediationSchema,
  DisputeResolutionSchema,
  ContactMethodSchema,
  DisputeContactSchema,
  DocumentRefSchema,
  DisputeEvidenceSchema,
  DisputeAttestationSchema,
  // Constants
  DISPUTE_TYPE,
  DISPUTE_LIMITS,
  DISPUTE_TYPES,
  DISPUTE_TARGET_TYPES,
  DISPUTE_GROUNDS_CODES,
  DISPUTE_STATES,
  TERMINAL_STATES,
  DISPUTE_TRANSITIONS,
  DISPUTE_OUTCOMES,
  REMEDIATION_TYPES,
  // Helpers
  validateDisputeAttestation,
  isValidDisputeAttestation,
  isDisputeAttestation,
  validateDisputeResolution,
  validateDisputeContact,
  createDisputeAttestation,
  transitionDisputeState,
  canTransitionTo,
  isTerminalState,
  getValidTransitions,
  isDisputeExpired,
  isDisputeNotYetValid,
} from './dispute';
export type {
  DisputeId,
  DisputeType,
  DisputeTargetType,
  DisputeGroundsCode,
  DisputeGrounds,
  DisputeState,
  DisputeOutcome,
  RemediationType,
  Remediation,
  DisputeResolution,
  ContactMethod,
  DisputeContact,
  DocumentRef,
  DisputeEvidence,
  DisputeAttestation,
  CreateDisputeAttestationParams,
} from './dispute';

// Obligations extension (v0.9.26+ CC Signals alignment)
export {
  CreditMethodSchema,
  ContributionTypeSchema,
  CreditObligationSchema,
  ContributionObligationSchema,
  ObligationsExtensionSchema,
  // Constants
  OBLIGATIONS_EXTENSION_KEY,
  CREDIT_METHODS,
  CONTRIBUTION_TYPES,
  // Helpers
  validateCreditObligation,
  validateContributionObligation,
  validateObligationsExtension,
  extractObligationsExtension,
  isCreditRequired,
  isContributionRequired,
  createCreditObligation,
  createContributionObligation,
  createObligationsExtension,
} from './obligations';
export type {
  CreditMethod,
  ContributionType,
  CreditObligation,
  ContributionObligation,
  ObligationsExtension,
} from './obligations';

// Envelope types (v0.9.15+ normative structure)
export type {
  PEACEnvelope,
  AuthContext,
  EvidenceBlock,
  MetadataBlock,
  EnforcementContext,
  TransportBinding,
  ContextMetadata,
} from './envelope';
