/**
 * Purpose Extension Group (org.peacprotocol/purpose)
 *
 * Records external/legal/business purpose declarations as observations.
 * Explicitly separated from PEAC operational purpose tokens
 * (CanonicalPurpose in purpose.ts).
 *
 * Design:
 *   - external_purposes: token-based array (machine-safe, bounded, unique)
 *   - peac_purpose_mapping: optional bridge to PEAC operational tokens
 *     via PURPOSE_TOKEN_REGEX
 *   - No prose-heavy fields at schema layer
 *   - Observation-only semantics: records events, never enforces policy
 */

import { z } from 'zod';
import { EXTENSION_LIMITS } from './limits.js';
import { PURPOSE_TOKEN_REGEX, MAX_PURPOSE_TOKEN_LENGTH } from '../purpose.js';

export const PURPOSE_EXTENSION_KEY = 'org.peacprotocol/purpose' as const;

/**
 * Machine-safe token schema for purpose label arrays.
 *
 * Reuses PURPOSE_TOKEN_REGEX from purpose.ts for the lexical grammar
 * (lowercase alphanumeric, underscores, hyphens, optional vendor prefix).
 * Semantically independent from PEAC operational CanonicalPurpose tokens.
 */
const MachineSafePurposeTokenSchema = z
  .string()
  .min(1)
  .max(EXTENSION_LIMITS.maxExternalPurposeLength)
  .regex(PURPOSE_TOKEN_REGEX, 'must be a machine-safe lowercase token');

/**
 * Check that all items in a string array are unique.
 */
function hasUniqueItems(items: string[]): boolean {
  return new Set(items).size === items.length;
}

export const PurposeExtensionSchema = z
  .object({
    /**
     * External/legal/business purpose labels.
     * Machine-safe tokens: lowercase alphanumeric with underscores, hyphens,
     * and optional vendor prefix (e.g., ai_training, analytics, marketing).
     * Not PEAC operational tokens; use peac_purpose_mapping for bridging.
     * Items must be unique.
     */
    external_purposes: z
      .array(MachineSafePurposeTokenSchema)
      .min(1)
      .max(EXTENSION_LIMITS.maxExternalPurposesCount)
      .refine(hasUniqueItems, { message: 'external_purposes must contain unique items' }),

    /**
     * Legal or policy basis for the declared purposes.
     * Open vocabulary (e.g., consent, legitimate_interest, contract).
     */
    purpose_basis: z.string().min(1).max(EXTENSION_LIMITS.maxPurposeBasisLength).optional(),

    /** Whether purpose limitation applies. */
    purpose_limitation: z.boolean().optional(),

    /** Whether data minimization was applied. */
    data_minimization: z.boolean().optional(),

    /**
     * Compatible purposes for secondary use.
     * Same machine-safe token grammar as external_purposes.
     * Items must be unique.
     */
    compatible_purposes: z
      .array(MachineSafePurposeTokenSchema)
      .max(EXTENSION_LIMITS.maxCompatiblePurposesCount)
      .refine(hasUniqueItems, { message: 'compatible_purposes must contain unique items' })
      .optional(),

    /**
     * Explicit mapping to a PEAC operational CanonicalPurpose token.
     * Validated against PURPOSE_TOKEN_REGEX from purpose.ts.
     * Bridges external purpose vocabulary to operational tokens.
     */
    peac_purpose_mapping: z
      .string()
      .min(1)
      .max(MAX_PURPOSE_TOKEN_LENGTH)
      .regex(PURPOSE_TOKEN_REGEX, 'must be a valid PEAC purpose token')
      .optional(),
  })
  .strict();

export type PurposeExtension = z.infer<typeof PurposeExtensionSchema>;
