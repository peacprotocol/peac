/**
 * Wire 0.2 Typed Extension Group Schemas and Accessors
 *
 * Thin barrel module: re-exports from per-group and shared modules.
 * All logic lives in dedicated files; this file contains no implementation.
 *
 * Layer 1 (@peac/schema): pure Zod validation, zero I/O.
 */

// Limits and byte-budget
export { EXTENSION_LIMITS, EXTENSION_BUDGET } from './limits.js';

// Grammar validator
export { isValidExtensionKey } from './grammar.js';

// Per-group schemas, types, and constants
export { COMMERCE_EXTENSION_KEY, CommerceExtensionSchema } from './commerce.js';
export type { CommerceExtension } from './commerce.js';

export { ACCESS_EXTENSION_KEY, AccessExtensionSchema } from './access.js';
export type { AccessExtension } from './access.js';

export {
  CHALLENGE_EXTENSION_KEY,
  CHALLENGE_TYPES,
  ChallengeTypeSchema,
  ProblemDetailsSchema,
  ChallengeExtensionSchema,
} from './challenge.js';
export type { ChallengeType, ChallengeExtension } from './challenge.js';

export { IDENTITY_EXTENSION_KEY, IdentityExtensionSchema } from './identity.js';
export type { IdentityExtension } from './identity.js';

export { CORRELATION_EXTENSION_KEY, CorrelationExtensionSchema } from './correlation.js';
export type { CorrelationExtension } from './correlation.js';

export {
  CONSENT_EXTENSION_KEY,
  CONSENT_STATUSES,
  ConsentStatusSchema,
  ConsentExtensionSchema,
} from './consent.js';
export type { ConsentStatus, ConsentExtension } from './consent.js';

export {
  PRIVACY_EXTENSION_KEY,
  RETENTION_MODES,
  RetentionModeSchema,
  RECIPIENT_SCOPES,
  RecipientScopeSchema,
  PrivacyExtensionSchema,
} from './privacy.js';
export type { RetentionMode, RecipientScope, PrivacyExtension } from './privacy.js';

export {
  SAFETY_EXTENSION_KEY,
  REVIEW_STATUSES,
  ReviewStatusSchema,
  RISK_LEVELS,
  RiskLevelSchema,
  SafetyExtensionSchema,
} from './safety.js';
export type { ReviewStatus, RiskLevel, SafetyExtension } from './safety.js';

export {
  COMPLIANCE_EXTENSION_KEY,
  COMPLIANCE_STATUSES,
  ComplianceStatusSchema,
  ComplianceExtensionSchema,
} from './compliance.js';
export type { ComplianceStatus, ComplianceExtension } from './compliance.js';

export {
  PROVENANCE_EXTENSION_KEY,
  CustodyEntrySchema,
  SlsaLevelSchema,
  ProvenanceExtensionSchema,
} from './provenance.js';
export type { CustodyEntry, SlsaLevel, ProvenanceExtension } from './provenance.js';

// Typed accessors
export {
  getCommerceExtension,
  getAccessExtension,
  getChallengeExtension,
  getIdentityExtension,
  getCorrelationExtension,
  getConsentExtension,
  getPrivacyExtension,
  getSafetyExtension,
  getComplianceExtension,
  getProvenanceExtension,
} from './accessors.js';

// Envelope validation helper (used by Wire02ClaimsSchema.superRefine)
export { validateKnownExtensions } from './validation.js';

// Shared validators
export {
  Sha256DigestSchema,
  HttpsUriHintSchema,
  Iso8601DurationSchema,
  Iso8601DateStringSchema,
  Iso8601DateSchema, // @deprecated alias
  Iso8601OffsetDateTimeSchema,
  Rfc3339DateTimeSchema,
  Rfc3339TimestampSchema, // @deprecated alias -> Iso8601OffsetDateTimeSchema
  SpdxExpressionSchema,
} from './shared-validators.js';
