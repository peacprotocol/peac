/**
 * Compliance Extension Group (org.peacprotocol/compliance)
 *
 * Records regulatory compliance check evidence as an observation.
 * Framework-neutral. Does not assert or certify compliance; records
 * that a check occurred, what framework was evaluated, and what the
 * observed outcome was.
 *
 * Design:
 *   - Open taxonomy for framework, auditor, scope (domain-specific)
 *   - Closed enum for compliance_status (universal audit conclusion categories)
 *   - ISO 8601 durations for validity periods
 *   - Observation-only semantics: records events, never enforces policy
 */

import { z } from 'zod';
import { EXTENSION_LIMITS } from './limits.js';
import {
  Iso8601DateStringSchema,
  Iso8601DurationSchema,
  Sha256DigestSchema,
} from './shared-validators.js';

export const COMPLIANCE_EXTENSION_KEY = 'org.peacprotocol/compliance' as const;

/**
 * Compliance status: maps to ISO 19011 audit conclusion categories.
 *
 * Closed enum: 5 values cover the universal compliance assessment
 * lifecycle across regulatory frameworks.
 */
export const COMPLIANCE_STATUSES = [
  'compliant',
  'non_compliant',
  'partial',
  'under_review',
  'exempt',
] as const;
export const ComplianceStatusSchema = z.enum(COMPLIANCE_STATUSES);
export type ComplianceStatus = z.infer<typeof ComplianceStatusSchema>;

export const ComplianceExtensionSchema = z
  .object({
    /**
     * Framework identifier evaluated.
     * Open string: preferred grammar is lowercase slugs with hyphens
     * (e.g., eu-ai-act, soc2-type2, iso-27001, nist-ai-rmf, gdpr, hipaa).
     */
    framework: z.string().min(1).max(EXTENSION_LIMITS.maxFrameworkLength),

    /** Observed compliance status (closed vocabulary) */
    compliance_status: ComplianceStatusSchema,

    /** Opaque reference to audit report or evidence (e.g., report ID, ticket number). */
    audit_ref: z.string().min(1).max(EXTENSION_LIMITS.maxAuditRefLength).optional(),

    /** Auditor identifier (organization name or DID). */
    auditor: z.string().min(1).max(EXTENSION_LIMITS.maxAuditorLength).optional(),

    /** Date the compliance check was performed (YYYY-MM-DD). */
    audit_date: Iso8601DateStringSchema.optional(),

    /** Scope of the compliance check. */
    scope: z.string().min(1).max(EXTENSION_LIMITS.maxComplianceScopeLength).optional(),

    /** How long this finding remains valid as an ISO 8601 duration. */
    validity_period: Iso8601DurationSchema.optional(),

    /** SHA-256 digest of supporting evidence document. */
    evidence_ref: Sha256DigestSchema.optional(),
  })
  .strict();

export type ComplianceExtension = z.infer<typeof ComplianceExtensionSchema>;
