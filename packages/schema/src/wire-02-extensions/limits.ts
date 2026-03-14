/**
 * Wire 0.2 Extension Group Limits (DD-173.1)
 *
 * Centralized per-field bounds for all Wire 0.2 extension group fields.
 * Prevents magic numbers and allows external reference.
 * Follows repo _LIMITS convention.
 *
 * Byte-budget constants are normative and live in @peac/kernel
 * (EXTENSION_BUDGET). Re-exported here for schema-layer convenience.
 */

import { EXTENSION_BUDGET } from '@peac/kernel';

// Re-export kernel byte-budget constants for schema-layer consumers
export { EXTENSION_BUDGET } from '@peac/kernel';

/**
 * Normative per-field bounds for Wire 0.2 extension group fields.
 */
export const EXTENSION_LIMITS = {
  // Extension key grammar
  maxExtensionKeyLength: 512,
  maxDnsLabelLength: 63,
  maxDnsDomainLength: 253,

  // Commerce
  maxPaymentRailLength: 128,
  maxCurrencyLength: 16,
  maxAmountMinorLength: 64,
  maxReferenceLength: 256,
  maxAssetLength: 256,
  maxCommerceEventLength: 64,

  // Access
  maxResourceLength: 2048,
  maxActionLength: 256,

  // Challenge
  maxProblemTypeLength: 2048,
  maxProblemTitleLength: 256,
  maxProblemDetailLength: 4096,
  maxProblemInstanceLength: 2048,

  // Identity
  maxProofRefLength: 256,

  // Correlation
  maxTraceIdLength: 32,
  maxSpanIdLength: 16,
  maxWorkflowIdLength: 256,
  maxParentJtiLength: 256,
  maxDependsOnLength: 64,

  // Consent (DD-174)
  maxConsentBasisLength: 128,
  maxConsentMethodLength: 128,
  maxDataCategoriesCount: 64,
  maxDataCategoryLength: 128,
  maxConsentScopeLength: 256,
  maxJurisdictionLength: 16,

  // Compliance (DD-175)
  maxFrameworkLength: 256,
  maxAuditRefLength: 256,
  maxAuditorLength: 256,
  maxComplianceScopeLength: 512,
  maxEvidenceRefLength: 256,

  // Privacy (DD-176)
  maxDataClassificationLength: 128,
  maxProcessingBasisLength: 128,
  maxAnonymizationMethodLength: 128,
  maxDataSubjectCategoryLength: 128,
  maxTransferMechanismLength: 128,

  // Safety (DD-177)
  maxAssessmentMethodLength: 256,
  maxSafetyMeasuresCount: 32,
  maxSafetyMeasureLength: 256,
  maxIncidentRefLength: 256,
  maxModelRefLength: 256,
  maxSafetyCategoryLength: 128,

  // Provenance (DD-178)
  maxSourceTypeLength: 128,
  maxSourceRefLength: 256,
  maxCustodyEntriesCount: 16,
  maxCustodianLength: 256,
  maxCustodyActionLength: 128,

  // Attribution (DD-179)
  maxCreatorRefLength: 256,
  maxObligationTypeLength: 128,
  maxAttributionTextLength: 1024,
  maxContentSignalSourceLength: 128,

  // Purpose (DD-180)
  maxExternalPurposesCount: 32,
  maxExternalPurposeLength: 128,
  maxPurposeBasisLength: 128,
  maxCompatiblePurposesCount: 32,

  // Shared field bounds
  maxHttpsUriLength: 2048,
  maxSha256DigestLength: 71, // "sha256:" (7) + 64 hex = 71 chars
  maxIso8601DurationLength: 64,
  maxIso8601DateLength: 10,
  maxSpdxExpressionLength: 128,
} as const;
