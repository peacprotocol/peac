/**
 * Wire 0.2 Typed Extension Group Schemas and Accessors
 *
 * BACKWARD-COMPATIBILITY BARREL: This file re-exports everything from
 * the per-group module directory `wire-02-extensions/`. All import paths
 * that previously resolved to this file continue to work.
 *
 * @see wire-02-extensions/index.ts for the canonical module barrel
 */

export {
  // Limits and byte-budget
  EXTENSION_LIMITS,
  EXTENSION_BUDGET,
  // Grammar validator
  isValidExtensionKey,
  // Commerce
  COMMERCE_EXTENSION_KEY,
  CommerceExtensionSchema,
  getCommerceExtension,
  // Access
  ACCESS_EXTENSION_KEY,
  AccessExtensionSchema,
  getAccessExtension,
  // Challenge
  CHALLENGE_EXTENSION_KEY,
  CHALLENGE_TYPES,
  ChallengeTypeSchema,
  ProblemDetailsSchema,
  ChallengeExtensionSchema,
  getChallengeExtension,
  // Identity
  IDENTITY_EXTENSION_KEY,
  IdentityExtensionSchema,
  getIdentityExtension,
  // Correlation
  CORRELATION_EXTENSION_KEY,
  CorrelationExtensionSchema,
  getCorrelationExtension,
  // Consent
  CONSENT_EXTENSION_KEY,
  CONSENT_STATUSES,
  ConsentStatusSchema,
  ConsentExtensionSchema,
  getConsentExtension,
  // Privacy
  PRIVACY_EXTENSION_KEY,
  RETENTION_MODES,
  RetentionModeSchema,
  RECIPIENT_SCOPES,
  RecipientScopeSchema,
  PrivacyExtensionSchema,
  getPrivacyExtension,
  // Safety
  SAFETY_EXTENSION_KEY,
  REVIEW_STATUSES,
  ReviewStatusSchema,
  RISK_LEVELS,
  RiskLevelSchema,
  SafetyExtensionSchema,
  getSafetyExtension,
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
  // Envelope validation helper
  validateKnownExtensions,
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
} from './wire-02-extensions/index.js';

export type {
  CommerceExtension,
  AccessExtension,
  ChallengeType,
  ChallengeExtension,
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
} from './wire-02-extensions/index.js';
