/**
 * Attribution Extension Group (org.peacprotocol/attribution)
 *
 * Records credit, obligations, and content signal observations.
 *
 * Design:
 *   - Identifier and reference-based fields; not identity attestation
 *   - Closed enum for content_signal_source (known observation sources)
 *   - SPDX license expressions via parser-grade shared validator
 *   - Observation-only semantics: records events, never enforces policy
 */

import { z } from 'zod';
import { EXTENSION_LIMITS } from './limits.js';
import { Sha256DigestSchema, SpdxExpressionSchema } from './shared-validators.js';

export const ATTRIBUTION_EXTENSION_KEY = 'org.peacprotocol/attribution' as const;

/**
 * Content signal observation source.
 *
 * Closed enum: maps to the known observation sources in the
 * content signals precedence chain.
 */
export const CONTENT_SIGNAL_SOURCES = [
  'tdmrep_json',
  'content_signal_header',
  'content_usage_header',
  'robots_txt',
  'custom',
] as const;
export const ContentSignalSourceSchema = z.enum(CONTENT_SIGNAL_SOURCES);
export type ContentSignalSource = z.infer<typeof ContentSignalSourceSchema>;

export const AttributionExtensionSchema = z
  .object({
    /**
     * Creator identifier (DID, URI, or opaque ID).
     * Not an identity attestation; records observed attribution metadata.
     */
    creator_ref: z.string().min(1).max(EXTENSION_LIMITS.maxCreatorRefLength),

    /** SPDX license expression (parser-grade structural subset validator). */
    license_spdx: SpdxExpressionSchema.optional(),

    /**
     * Obligation type.
     * Open vocabulary (e.g., attribution_required, share_alike, non_commercial).
     */
    obligation_type: z.string().min(1).max(EXTENSION_LIMITS.maxObligationTypeLength).optional(),

    /** Required attribution text. */
    attribution_text: z.string().min(1).max(EXTENSION_LIMITS.maxAttributionTextLength).optional(),

    /** Content signal observation source (closed vocabulary). */
    content_signal_source: ContentSignalSourceSchema.optional(),

    /** SHA-256 digest of the attributed content. */
    content_digest: Sha256DigestSchema.optional(),
  })
  .strict();

export type AttributionExtension = z.infer<typeof AttributionExtensionSchema>;
