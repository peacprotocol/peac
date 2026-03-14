/**
 * Safety Extension Group (org.peacprotocol/safety)
 *
 * Records safety assessment evidence. Jurisdiction-neutral design.
 * Usage profiles decide when regulatory-specific fields become required.
 *
 * Design:
 *   - review_status required (universal assessment lifecycle)
 *   - risk_level optional at schema layer; usage profiles may require it
 *   - Open taxonomy for assessment_method, safety_measures, category
 *   - Observation-only semantics: records events, never enforces policy
 *
 * @see docs/specs/WIRE-0.2.md Section 12.12
 */

import { z } from 'zod';
import { EXTENSION_LIMITS } from './limits.js';

export const SAFETY_EXTENSION_KEY = 'org.peacprotocol/safety' as const;

/**
 * Review status: universal safety assessment lifecycle.
 *
 * Closed enum: 4 states cover the assessment lifecycle across
 * EU AI Act, NIST AI RMF, ISO 23894, and general safety review.
 */
export const REVIEW_STATUSES = ['reviewed', 'pending', 'flagged', 'not_applicable'] as const;
export const ReviewStatusSchema = z.enum(REVIEW_STATUSES);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

/**
 * Risk level: converges across EU AI Act Art 6, NIST AI RMF, ISO 23894.
 *
 * Closed enum: 4 risk tiers. Optional at schema level to maintain
 * jurisdiction neutrality; usage profiles may require this field.
 */
export const RISK_LEVELS = ['unacceptable', 'high', 'limited', 'minimal'] as const;
export const RiskLevelSchema = z.enum(RISK_LEVELS);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const SafetyExtensionSchema = z
  .object({
    /** Safety review status (closed vocabulary, universal lifecycle) */
    review_status: ReviewStatusSchema,

    /**
     * Risk classification level.
     * Optional at schema level; usage profiles may require it.
     * Converges across EU AI Act Art 6, NIST AI RMF, ISO 23894.
     */
    risk_level: RiskLevelSchema.optional(),

    /**
     * Assessment method used.
     * Open vocabulary (e.g., automated_scan, human_review, red_team,
     * penetration_test, static_analysis, model_evaluation).
     */
    assessment_method: z.string().min(1).max(EXTENSION_LIMITS.maxAssessmentMethodLength).optional(),

    /**
     * Safety measures applied.
     * Open vocabulary. Array bounded by maxSafetyMeasuresCount.
     */
    safety_measures: z
      .array(z.string().min(1).max(EXTENSION_LIMITS.maxSafetyMeasureLength))
      .max(EXTENSION_LIMITS.maxSafetyMeasuresCount)
      .optional(),

    /** Incident report reference. Opaque identifier (e.g., ticket ID or digest). */
    incident_ref: z.string().min(1).max(EXTENSION_LIMITS.maxIncidentRefLength).optional(),

    /** AI model reference. Opaque identifier (e.g., model version string). */
    model_ref: z.string().min(1).max(EXTENSION_LIMITS.maxModelRefLength).optional(),

    /**
     * Safety category.
     * Open vocabulary (e.g., content_safety, bias, hallucination,
     * toxicity, fairness, robustness, privacy_risk).
     */
    category: z.string().min(1).max(EXTENSION_LIMITS.maxSafetyCategoryLength).optional(),
  })
  .strict();

export type SafetyExtension = z.infer<typeof SafetyExtensionSchema>;
