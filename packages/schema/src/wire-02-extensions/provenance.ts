/**
 * Provenance Extension Group (org.peacprotocol/provenance)
 *
 * Records origin tracking and chain of custody as observations.
 *
 * Design:
 *   - source_type required, open vocabulary for derivation categories
 *   - custody_chain: ordered array of strict nested entries
 *   - slsa: structured object recording SLSA-aligned metadata
 *     (track-based model; does not certify SLSA compliance)
 *   - URI fields are locator hints only; callers MUST NOT auto-fetch
 *   - Observation-only semantics: records events, never enforces policy
 */

import { z } from 'zod';
import { EXTENSION_LIMITS } from './limits.js';
import { HttpsUriHintSchema, Rfc3339DateTimeSchema } from './shared-validators.js';

export const PROVENANCE_EXTENSION_KEY = 'org.peacprotocol/provenance' as const;

// ---------------------------------------------------------------------------
// Nested schemas
// ---------------------------------------------------------------------------

/**
 * A single entry in the custody chain.
 *
 * Records one transfer-of-custody event: who held it, what action
 * occurred, and when. Ordered within the custody_chain array.
 */
export const CustodyEntrySchema = z
  .object({
    /** Custodian identifier (organization name, DID, or opaque ID). */
    custodian: z.string().min(1).max(EXTENSION_LIMITS.maxCustodianLength),

    /** Action performed (e.g., received, transformed, verified, released). */
    action: z.string().min(1).max(EXTENSION_LIMITS.maxCustodyActionLength),

    /** When the custody event occurred (RFC 3339 with seconds). */
    timestamp: Rfc3339DateTimeSchema,
  })
  .strict();

export type CustodyEntry = z.infer<typeof CustodyEntrySchema>;

/**
 * Structured SLSA-aligned provenance metadata.
 *
 * Uses a track-based model rather than a flat scalar.
 * Records metadata; does not certify compliance.
 */
export const SlsaLevelSchema = z
  .object({
    /** SLSA track identifier (e.g., build, source). */
    track: z.string().min(1).max(EXTENSION_LIMITS.maxSlsaTrackLength),

    /** SLSA level within the track (0-4). */
    level: z.number().int().min(0).max(4),

    /** SLSA spec version this metadata references (e.g., 1.0, 1.2). */
    version: z.string().min(1).max(EXTENSION_LIMITS.maxSlsaVersionLength),
  })
  .strict();

export type SlsaLevel = z.infer<typeof SlsaLevelSchema>;

// ---------------------------------------------------------------------------
// Main schema
// ---------------------------------------------------------------------------

export const ProvenanceExtensionSchema = z
  .object({
    /**
     * Type of source or derivation.
     * Open vocabulary (e.g., original, derived, curated, synthetic, aggregated, transformed).
     */
    source_type: z.string().min(1).max(EXTENSION_LIMITS.maxSourceTypeLength),

    /** Opaque source reference identifier (e.g., commit hash, artifact ID). */
    source_ref: z.string().min(1).max(EXTENSION_LIMITS.maxSourceRefLength).optional(),

    /**
     * HTTPS URI hint for the source artifact.
     * Locator hint only: callers MUST NOT auto-fetch.
     */
    source_uri: HttpsUriHintSchema.optional(),

    /**
     * HTTPS URI hint for build provenance metadata.
     * Locator hint only: callers MUST NOT auto-fetch.
     */
    build_provenance_uri: HttpsUriHintSchema.optional(),

    /**
     * How provenance was verified.
     * Open vocabulary (e.g., signature_check, hash_chain,
     * manual_attestation, transparency_log).
     */
    verification_method: z
      .string()
      .min(1)
      .max(EXTENSION_LIMITS.maxVerificationMethodLength)
      .optional(),

    /**
     * Ordered custody chain entries.
     * Each entry records a custodian, action, and timestamp.
     */
    custody_chain: z
      .array(CustodyEntrySchema)
      .max(EXTENSION_LIMITS.maxCustodyChainCount)
      .optional(),

    /**
     * Structured SLSA-aligned provenance metadata.
     * Records track, level, and spec version.
     */
    slsa: SlsaLevelSchema.optional(),
  })
  .strict();

export type ProvenanceExtension = z.infer<typeof ProvenanceExtensionSchema>;
