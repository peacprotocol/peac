/**
 * PEAC Protocol Schema Package
 *
 * Dual-stack: Wire 0.1 (peac-receipt/0.1, frozen legacy) + Interaction Record
 * format (interaction-record+jwt, current stable on `latest`).
 *
 * Wire 0.1 schemas, validators, and helpers are preserved for backward
 * compatibility. The Interaction Record format types are the current stable
 * public surface.
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

// Kernel constraints (v0.10.14+ formalized limits)
export { KERNEL_CONSTRAINTS, validateKernelConstraints } from './constraints';
export type {
  KernelConstraintKey,
  ConstraintViolation,
  ConstraintValidationResult,
} from './constraints';

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
  // Wire 0.1 JWS header Zod schema.
  // Canonical name: Wire01JWSHeaderSchema (v0.12.0-preview.1+).
  // JWSHeader is kept as a deprecated alias for backward compatibility.
  Wire01JWSHeaderSchema,
  // @deprecated Use Wire01JWSHeaderSchema. Will be removed at v1.0.
  JWSHeader,
  ReceiptClaimsSchema,
  ReceiptClaims, // @deprecated - use ReceiptClaimsSchema
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
export type { EvidenceValidationResult, ReceiptClaimsType } from './validators';

// Agent Identity validators (v0.9.25+)
export {
  ControlTypeSchema,
  BindingDetailsSchema,
  AgentProofSchema,
  AgentIdentityEvidenceSchema,
  AgentIdentityAttestationSchema,
  IdentityBindingSchema,
  AgentIdentityVerifiedSchema,
  // Constants
  AGENT_IDENTITY_TYPE,
  CONTROL_TYPES,
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
  BindingDetails,
  AgentProof,
  AgentIdentityEvidence,
  AgentIdentityAttestation,
  IdentityBinding,
  AgentIdentityVerified,
  CreateAgentIdentityAttestationParams,
} from './agent-identity';

// ActorBinding + MVIS (v0.11.3+ )
export {
  ProofTypeSchema,
  ActorBindingSchema,
  MVISFieldsSchema,
  MVISTimeBoundsSchema,
  MVISReplayProtectionSchema,
  // Constants
  PROOF_TYPES,
  ACTOR_BINDING_EXTENSION_KEY,
  // Helpers
  isOriginOnly,
  validateActorBinding,
  validateMVIS,
} from './actor-binding';
export type {
  ProofType,
  ActorBinding,
  MVISFields,
  MVISTimeBounds,
  MVISReplayProtection,
} from './actor-binding';

// ZT Extension Schemas (v0.11.3+ )
export {
  // Credential Event
  CredentialEventTypeSchema,
  CredentialRefSchema,
  CredentialEventSchema,
  CREDENTIAL_EVENT_EXTENSION_KEY,
  CREDENTIAL_EVENTS,
  validateCredentialEvent,
  // Tool Registry
  ToolRegistrySchema,
  TOOL_REGISTRY_EXTENSION_KEY,
  validateToolRegistry,
  // Control Action
  ControlActionTypeSchema,
  ControlTriggerSchema,
  ControlActionSchema,
  CONTROL_ACTION_EXTENSION_KEY,
  CONTROL_ACTIONS,
  CONTROL_TRIGGERS,
  validateControlAction,
  // Treaty
  CommitmentClassSchema,
  TreatySchema,
  TREATY_EXTENSION_KEY,
  COMMITMENT_CLASSES,
  validateTreaty,
  // Fingerprint Reference Conversion
  stringToFingerprintRef,
  fingerprintRefToString,
  // v0.14.1 A2A Handoff Observation
  A2A_HANDOFF_EXTENSION_KEY,
  A2A_AGENT_CARD_OBSERVATION_TYPE,
  A2A_TASK_EVENT_TYPES,
  A2A_TASK_TYPE_URIS,
  A2A_HANDOFF_TYPE_URIS,
  A2A_TASK_EVENT_SCHEMAS,
  A2A_HANDOFF_ERROR_CODES,
  A2AAgentCardObservationSchema,
  A2ATaskObservationSchema,
  A2AHandoffSchema,
  validateA2AHandoff,
  // CLI Execution Observation
  CLI_EXECUTION_EXTENSION_KEY,
  CLI_COMMAND_EXECUTION_TYPE,
  CLI_EXECUTION_ERROR_CODES,
  CLI_SCHEMA_LIMITS,
  CliExecutionSchema,
  validateCliExecution,
  // Lifecycle Observation
  LIFECYCLE_OBSERVATION_EXTENSION_KEY,
  LIFECYCLE_OBSERVATION_TYPE_URIS,
  LIFECYCLE_OBSERVATION_ERROR_CODES,
  FORBIDDEN_TOP_LEVEL_KEYS,
  LifecycleObservationSchema,
  validateLifecycleObservation,
  // Provisioning Lifecycle (v0.14.2)
  PROVISIONING_LIFECYCLE_EXTENSION_KEY,
  PROVISIONING_LIFECYCLE_TYPE_URIS,
  PROVISIONING_LIFECYCLE_ERROR_CODES,
  ProvisioningLifecycleSchema,
  validateProvisioningLifecycle,
  // Agent Action Records (v0.14.3)
  AGENT_ACTION_EXTENSION_KEY,
  AGENT_ACTION_TYPE_URIS,
  AGENT_ACTION_ERROR_CODES,
  AGENT_ACTION_FORBIDDEN_TOP_LEVEL_KEYS,
  AgentActionSchema,
  validateAgentAction,
  validateAgentActionForType,
  // Commerce Mandate Records (v0.14.3)
  COMMERCE_MANDATE_EXTENSION_KEY,
  COMMERCE_MANDATE_TYPE_URIS,
  COMMERCE_MANDATE_ERROR_CODES,
  COMMERCE_MANDATE_FORBIDDEN_PAYMENT_DATA_KEYS,
  CommerceMandateSchema,
  validateCommerceMandate,
  validateCommerceMandateForType,
  // Gateway Export Records (v0.14.3)
  GATEWAY_EXPORT_EXTENSION_KEY,
  GATEWAY_EXPORT_TYPE_URIS,
  GATEWAY_EXPORT_ERROR_CODES,
  GATEWAY_EXPORT_FORBIDDEN_PAYMENT_DATA_KEYS,
  GatewayExportSchema,
  validateGatewayExport,
  validateGatewayExportForType,
} from './extensions/index';
export type {
  CredentialEventType,
  CredentialEvent,
  ToolRegistry,
  ControlActionType,
  ControlTrigger,
  ControlAction,
  CommitmentClass,
  Treaty,
  FingerprintRefObject,
  // v0.14.1 A2A Handoff Observation
  A2ATaskEvent,
  A2AAgentCardObservation,
  A2ATaskObservation,
  A2AHandoffPayload,
  A2AValidationError,
  A2AValidationResult,
  // CLI Execution Observation
  CliExecutionObservation,
  CliValidationError,
  CliValidationResult,
  // Lifecycle Observation
  LifecycleEventKind,
  LifecycleObservation,
  LifecycleObservationTypeUri,
  LifecycleValidationError,
  LifecycleValidationResult,
  // Provisioning Lifecycle (v0.14.2)
  ProvisioningEventKind,
  ProvisioningLifecycle,
  ProvisioningLifecycleTypeUri,
  ProvisioningLifecycleValidationError,
  ProvisioningLifecycleValidationResult,
  // Agent Action Records (v0.14.3)
  AgentActionEventKind,
  AgentAction,
  AgentActionTypeUri,
  AgentActionValidationError,
  AgentActionValidationResult,
  // Commerce Mandate Records (v0.14.3)
  CommerceMandateEventKind,
  CommerceMandate,
  CommerceMandateTypeUri,
  CommerceMandateValidationError,
  CommerceMandateValidationResult,
  // Gateway Export Records (v0.14.3)
  GatewayExportEventKind,
  GatewayExport,
  GatewayExportTypeUri,
  GatewayExportValidationError,
  GatewayExportValidationResult,
} from './extensions/index';

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

// Workflow correlation (v0.10.2+ multi-agent orchestration)
export {
  WorkflowIdSchema,
  StepIdSchema,
  WorkflowStatusSchema,
  OrchestrationFrameworkSchema,
  WorkflowContextSchema,
  WorkflowErrorContextSchema,
  WorkflowSummaryEvidenceSchema,
  WorkflowSummaryAttestationSchema,
  // Constants
  WORKFLOW_EXTENSION_KEY,
  WORKFLOW_SUMMARY_TYPE,
  WORKFLOW_STATUSES,
  ORCHESTRATION_FRAMEWORKS,
  WORKFLOW_LIMITS,
  WORKFLOW_ID_PATTERN,
  STEP_ID_PATTERN,
  // Helpers
  createWorkflowId,
  createStepId,
  validateWorkflowContext,
  validateWorkflowContextOrdered,
  isValidWorkflowContext,
  validateWorkflowSummaryAttestation,
  isWorkflowSummaryAttestation,
  isTerminalWorkflowStatus,
  hasValidDagSemantics,
  createWorkflowContext,
  createWorkflowSummaryAttestation,
} from './workflow';
export type {
  WorkflowId,
  StepId,
  WorkflowStatus,
  OrchestrationFramework,
  WorkflowContext,
  WorkflowErrorContext,
  WorkflowSummaryEvidence,
  WorkflowSummaryAttestation,
  WorkflowValidationResult,
  CreateWorkflowSummaryParams,
} from './workflow';

// Interaction evidence (v0.10.7+ agent execution capture)
export {
  DigestAlgSchema,
  DigestSchema,
  PayloadRefSchema,
  ExecutorSchema,
  ToolTargetSchema,
  ResourceTargetSchema,
  ResultSchema,
  PolicyContextSchema,
  RefsSchema,
  KindSchema,
  InteractionEvidenceV01Schema,
  // Constants
  INTERACTION_EXTENSION_KEY,
  CANONICAL_DIGEST_ALGS,
  DIGEST_SIZE_CONSTANTS,
  RESULT_STATUSES,
  REDACTION_MODES,
  POLICY_DECISIONS,
  WELL_KNOWN_KINDS,
  RESERVED_KIND_PREFIXES,
  INTERACTION_LIMITS,
  KIND_FORMAT_PATTERN,
  EXTENSION_KEY_PATTERN,
  DIGEST_VALUE_PATTERN,
  // Validation
  validateInteraction,
  validateInteractionOrdered,
  validateInteractionEvidence,
  isValidInteractionEvidence,
  // Helpers
  isWellKnownKind,
  isReservedKindPrefix,
  isDigestTruncated,
  // SDK Accessors
  getInteraction,
  setInteraction,
  hasInteraction,
  // Projection API
  createReceiptView,
  // Factory
  createInteractionEvidence,
} from './interaction';
export type {
  DigestAlg,
  Digest,
  PayloadRef,
  Executor,
  ToolTarget,
  ResourceTarget,
  ResultStatus,
  Result,
  PolicyDecision,
  PolicyContext,
  Refs,
  InteractionEvidenceV01,
  ValidationError,
  ValidationWarning,
  InteractionValidationResult,
  SimpleValidationResult,
  ReceiptView,
  CreateInteractionParams,
} from './interaction';

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

// Attestation receipt types (v0.10.8+ middleware profile)
export {
  MinimalInteractionBindingSchema,
  AttestationExtensionsSchema,
  AttestationReceiptClaimsSchema,
  // Constants
  ATTESTATION_RECEIPT_TYPE,
  MIDDLEWARE_INTERACTION_KEY,
  ATTESTATION_LIMITS,
  // Helpers
  validateAttestationReceiptClaims,
  isAttestationReceiptClaims,
  validateMinimalInteractionBinding,
  isMinimalInteractionBinding,
  createAttestationReceiptClaims,
  isAttestationOnly,
  isPaymentReceipt,
} from './attestation-receipt';
export type {
  MinimalInteractionBinding,
  AttestationExtensions,
  AttestationReceiptClaims,
  AttestationValidationResult,
  CreateAttestationReceiptParams,
} from './attestation-receipt';

// Evidence Carrier Contract schemas + helpers (v0.11.1+ )
export {
  ReceiptRefSchema,
  CompactJwsSchema,
  ReceiptUrlSchema,
  CarrierFormatSchema,
  PeacEvidenceCarrierSchema,
  CarrierMetaSchema,
  CARRIER_TRANSPORT_LIMITS,
  computeReceiptRef,
  validateCarrierConstraints,
  verifyReceiptRefConsistency,
} from './carrier';
export type {
  ReceiptRef,
  CarrierFormat,
  PeacEvidenceCarrier,
  CarrierMeta,
  CarrierValidationResult,
  CarrierAdapter,
} from './carrier';

// Unified receipt parser (v0.10.9+; v0.12.0-preview.1: dual-stack Wire 0.1 + Wire 0.2)
export { parseReceiptClaims, detectWireVersion } from './receipt-parser';
export type {
  ParseReceiptResult,
  ParseSuccess,
  ParseFailure,
  PEACParseError,
  ReceiptVariant,
  ParseReceiptOptions,
} from './receipt-parser';

// Wire 0.2 schemas and types (v0.12.0-preview.1)
export {
  EvidencePillarSchema,
  PillarsSchema,
  Wire02KindSchema,
  ReceiptTypeSchema,
  CanonicalIssSchema,
  PolicyBlockSchema,
  Wire02ClaimsSchema,
  isCanonicalIss,
  isValidReceiptType,
  checkOccurredAtSkew,
} from './wire-02-envelope';
export type { Wire02Claims } from './wire-02-envelope';

// Wire 0.2 warning constants and utilities (v0.12.0-preview.1)
export {
  WARNING_TYPE_UNREGISTERED,
  WARNING_UNKNOWN_EXTENSION,
  WARNING_OCCURRED_AT_SKEW,
  WARNING_TYP_MISSING,
  WARNING_EXTENSION_GROUP_MISSING,
  WARNING_EXTENSION_GROUP_MISMATCH,
  sortWarnings,
} from './wire-02-warnings';

// Wire 0.2 representation fields (v0.12.0-preview.1)
export {
  Wire02RepresentationFieldsSchema,
  RepresentationFieldsSchema,
  REPRESENTATION_LIMITS,
} from './wire-02-representation';
export type { Wire02RepresentationFields } from './wire-02-representation';

// Wire 0.2 extension group schemas and accessors
export {
  // Schemas
  CommerceExtensionSchema,
  // Commerce validators
  AmountMinorStringSchema,
  isValidAmountMinor,
  AccessExtensionSchema,
  ChallengeExtensionSchema,
  ChallengeTypeSchema,
  ProblemDetailsSchema,
  IdentityExtensionSchema,
  CorrelationExtensionSchema,
  // Constants
  COMMERCE_EXTENSION_KEY,
  ACCESS_EXTENSION_KEY,
  CHALLENGE_EXTENSION_KEY,
  IDENTITY_EXTENSION_KEY,
  CORRELATION_EXTENSION_KEY,
  CHALLENGE_TYPES,
  EXTENSION_LIMITS,
  EXTENSION_BUDGET,
  // Grammar validator
  isValidExtensionKey,
  // Typed accessors
  getCommerceExtension,
  getAccessExtension,
  getChallengeExtension,
  getIdentityExtension,
  getCorrelationExtension,
  getConsentExtension,
  getPrivacyExtension,
  getSafetyExtension,
  // Envelope validation helper (used internally by Wire02ClaimsSchema)
  validateKnownExtensions,
  CONSENT_EXTENSION_KEY,
  CONSENT_STATUSES,
  ConsentStatusSchema,
  ConsentExtensionSchema,
  PRIVACY_EXTENSION_KEY,
  RETENTION_MODES,
  RetentionModeSchema,
  RECIPIENT_SCOPES,
  RecipientScopeSchema,
  PrivacyExtensionSchema,
  SAFETY_EXTENSION_KEY,
  REVIEW_STATUSES,
  ReviewStatusSchema,
  RISK_LEVELS,
  RiskLevelSchema,
  SafetyExtensionSchema,
  // Compliance
  COMPLIANCE_EXTENSION_KEY,
  COMPLIANCE_STATUSES,
  ComplianceStatusSchema,
  ComplianceExtensionSchema,
  getComplianceExtension,
  // Provenance
  PROVENANCE_EXTENSION_KEY,
  CustodyEntrySchema,
  SlsaLevelSchema,
  ProvenanceExtensionSchema,
  getProvenanceExtension,
  // Attribution
  ATTRIBUTION_EXTENSION_KEY,
  CONTENT_SIGNAL_SOURCES,
  ContentSignalSourceSchema,
  AttributionExtensionSchema,
  getAttributionExtension,
  // Purpose
  PURPOSE_EXTENSION_KEY,
  PurposeExtensionSchema,
  getPurposeExtension,
  // Shared validators
  Sha256DigestSchema,
  HttpsUriHintSchema,
  Iso8601DurationSchema,
  Iso8601DateStringSchema,
  Iso8601DateSchema,
  Iso8601OffsetDateTimeSchema,
  Rfc3339DateTimeSchema,
  Rfc3339TimestampSchema,
  SpdxExpressionSchema,
} from './wire-02-extensions';
export type {
  CommerceExtension,
  AccessExtension,
  ChallengeExtension,
  ChallengeType,
  IdentityExtension,
  CorrelationExtension,
  ConsentStatus,
  ConsentExtension,
  RetentionMode,
  RecipientScope,
  PrivacyExtension,
  ReviewStatus,
  RiskLevel,
  SafetyExtension,
  ComplianceStatus,
  ComplianceExtension,
  CustodyEntry,
  SlsaLevel,
  ProvenanceExtension,
  ContentSignalSource,
  AttributionExtension,
  PurposeExtension,
} from './wire-02-extensions';

// Wire 0.2 registry constants (v0.12.0-preview.1)
export { REGISTERED_RECEIPT_TYPES, REGISTERED_EXTENSION_GROUP_KEYS } from './wire-02-registries';

// Policy binding comparison (v0.12.0-preview.1)
export { verifyPolicyBinding } from './policy-binding';

// Issuer configuration schemas (v0.11.3+ )
export {
  RevokedKeyEntrySchema,
  RevokedKeysArraySchema,
  REVOCATION_REASONS,
  validateRevokedKeys,
  findRevokedKey,
} from './issuer-config';
export type {
  RevokedKeyEntryInput,
  RevokedKeyEntryOutput,
  RevocationReason,
} from './issuer-config';

// v0.14.1 shared opaque-reference grammar (used by a2a-handoff,
// cli-execution, and lifecycle-observation extension namespaces).
// Sha256DigestSchema is the canonical one from wire-02-extensions/shared-validators.ts;
// see comment in opaque-ref.ts for why it is not re-exported here.
export { OPAQUE_REF_PREFIXES, OpaqueRefSchema, createOpaqueRefSchema } from './opaque-ref';
export type { OpaqueRef, OpaqueRefSchemaOptions } from './opaque-ref';
