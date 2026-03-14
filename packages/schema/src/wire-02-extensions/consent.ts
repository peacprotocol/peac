/**
 * Consent Extension Group (org.peacprotocol/consent)
 *
 * Records consent collection or withdrawal as an observation.
 * Jurisdiction-neutral. Aligned with ISO/IEC 29184:2020 concepts.
 *
 * Design:
 *   - Open taxonomy for consent_basis, consent_method (jurisdiction-specific)
 *   - Closed enum for consent_status (universal lifecycle states)
 *   - URI fields are locator hints only; callers MUST NOT auto-fetch
 *   - ISO 8601 durations for retention periods
 *   - Observation-only semantics: records events, never enforces policy
 *
 * @see docs/specs/WIRE-0.2.md Section 12.10
 */

import { z } from 'zod';
import { EXTENSION_LIMITS } from './limits.js';
import { HttpsUriHintSchema, Iso8601DurationSchema } from './shared-validators.js';

export const CONSENT_EXTENSION_KEY = 'org.peacprotocol/consent' as const;

/**
 * Consent status: universal lifecycle states across GDPR Art 7,
 * CCPA Sec 1798.120, LGPD Art 8, ISO/IEC 29184.
 *
 * Closed enum: these 4 states cover all consent lifecycle transitions.
 */
export const CONSENT_STATUSES = ['granted', 'withdrawn', 'denied', 'expired'] as const;
export const ConsentStatusSchema = z.enum(CONSENT_STATUSES);
export type ConsentStatus = z.infer<typeof ConsentStatusSchema>;

export const ConsentExtensionSchema = z
  .object({
    /**
     * Legal basis identifier for consent.
     * Open string: jurisdictions define different bases
     * (e.g., explicit, implied, opt_out, legitimate_interest, contractual, legal_obligation).
     */
    consent_basis: z.string().min(1).max(EXTENSION_LIMITS.maxConsentBasisLength),

    /** Consent lifecycle state (closed vocabulary) */
    consent_status: ConsentStatusSchema,

    /**
     * Data categories covered by this consent.
     * Open vocabulary (e.g., personal, sensitive, biometric).
     */
    data_categories: z
      .array(z.string().min(1).max(EXTENSION_LIMITS.maxDataCategoryLength))
      .max(EXTENSION_LIMITS.maxDataCategoriesCount)
      .optional(),

    /** Data retention period as ISO 8601 duration. */
    retention_period: Iso8601DurationSchema.optional(),

    /**
     * How consent was collected.
     * Open vocabulary (e.g., click_through, double_opt_in, verbal, written).
     */
    consent_method: z.string().min(1).max(EXTENSION_LIMITS.maxConsentMethodLength).optional(),

    /**
     * HTTPS URI hint for consent withdrawal.
     * Locator hint only: callers MUST NOT auto-fetch.
     * Rejects non-HTTPS, embedded credentials, fragments, control chars.
     */
    withdrawal_uri: HttpsUriHintSchema.optional(),

    /** Free-text scope description */
    scope: z.string().min(1).max(EXTENSION_LIMITS.maxConsentScopeLength).optional(),

    /**
     * Jurisdiction code: ISO 3166-1 alpha-2 or composite.
     * Examples: EU, US-CA, BR, GB, DE, JP, IN.
     */
    jurisdiction: z.string().min(1).max(EXTENSION_LIMITS.maxJurisdictionLength).optional(),
  })
  .strict();

export type ConsentExtension = z.infer<typeof ConsentExtensionSchema>;
