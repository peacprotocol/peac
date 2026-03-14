/**
 * Privacy Extension Group (org.peacprotocol/privacy)
 *
 * Records data classification and handling observations.
 * Aligned with ISO/IEC 27701 concepts.
 *
 * Design:
 *   - Open taxonomy for data_classification, processing_basis, methods
 *   - Closed enums for retention_mode, recipient_scope (universal categories)
 *   - retention_period (ISO 8601 duration) and retention_mode are separate fields
 *     to keep duration grammar and non-duration semantics distinct
 *   - Observation-only semantics: records events, never enforces policy
 *
 * @see docs/specs/WIRE-0.2.md Section 12.11
 */

import { z } from 'zod';
import { EXTENSION_LIMITS } from './limits.js';
import { Iso8601DurationSchema } from './shared-validators.js';

export const PRIVACY_EXTENSION_KEY = 'org.peacprotocol/privacy' as const;

/**
 * Retention mode: non-duration retention semantics.
 * Separate from retention_period to keep duration grammar distinct.
 *
 * Closed enum: 3 values cover all non-duration retention patterns.
 */
export const RETENTION_MODES = ['time_bound', 'indefinite', 'session_only'] as const;
export const RetentionModeSchema = z.enum(RETENTION_MODES);
export type RetentionMode = z.infer<typeof RetentionModeSchema>;

/**
 * Recipient scope: aligned with GDPR Art 13-14 disclosure categories.
 *
 * Closed enum: 4 values cover standard data recipient classifications.
 */
export const RECIPIENT_SCOPES = ['internal', 'processor', 'third_party', 'public'] as const;
export const RecipientScopeSchema = z.enum(RECIPIENT_SCOPES);
export type RecipientScope = z.infer<typeof RecipientScopeSchema>;

export const PrivacyExtensionSchema = z
  .object({
    /**
     * Data classification level.
     * Open taxonomy (e.g., public, internal, confidential, restricted, pii, sensitive_pii).
     */
    data_classification: z.string().min(1).max(EXTENSION_LIMITS.maxDataClassificationLength),

    /**
     * Legal basis for data processing.
     * Open vocabulary (e.g., consent, legitimate_interest, contract, legal_obligation).
     */
    processing_basis: z.string().min(1).max(EXTENSION_LIMITS.maxProcessingBasisLength).optional(),

    /**
     * Data retention period as ISO 8601 duration.
     * For non-duration retention semantics, use retention_mode instead.
     */
    retention_period: Iso8601DurationSchema.optional(),

    /**
     * Retention mode for non-duration semantics.
     * Closed enum: time_bound, indefinite, session_only.
     * When time_bound, retention_period SHOULD also be present.
     */
    retention_mode: RetentionModeSchema.optional(),

    /**
     * Data recipient classification.
     * Closed enum aligned with GDPR Art 13-14 disclosure categories.
     */
    recipient_scope: RecipientScopeSchema.optional(),

    /**
     * Anonymization or pseudonymization method applied.
     * Open vocabulary (e.g., k_anonymity, differential_privacy, pseudonymization,
     * tokenization, aggregation).
     */
    anonymization_method: z
      .string()
      .min(1)
      .max(EXTENSION_LIMITS.maxAnonymizationMethodLength)
      .optional(),

    /**
     * Data subject category.
     * Open vocabulary (e.g., customer, employee, minor, patient, student).
     */
    data_subject_category: z
      .string()
      .min(1)
      .max(EXTENSION_LIMITS.maxDataSubjectCategoryLength)
      .optional(),

    /**
     * Cross-border data transfer mechanism.
     * Open vocabulary (e.g., adequacy_decision, scc, bcr, derogation, consent).
     */
    transfer_mechanism: z
      .string()
      .min(1)
      .max(EXTENSION_LIMITS.maxTransferMechanismLength)
      .optional(),
  })
  .strict();

export type PrivacyExtension = z.infer<typeof PrivacyExtensionSchema>;
