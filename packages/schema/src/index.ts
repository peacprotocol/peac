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
  // Subject snapshot validation helper (v0.9.17+)
  validateSubjectSnapshot,
  // Evidence validation with DoS protection (v0.9.21+)
  validateEvidence,
} from './validators';
export type { EvidenceValidationResult } from './validators';

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
