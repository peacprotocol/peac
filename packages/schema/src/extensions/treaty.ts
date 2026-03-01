/**
 * Treaty Extension Schema (v0.11.3+, DD-147)
 *
 * Records agreement commitment levels in ext["org.peacprotocol/treaty"].
 * 4-level commitment_class vocabulary: informational, operational, financial, legal.
 *
 * Governance: commitment_class is a CLOSED vocabulary. Adding new levels requires
 * a registry update in registries.json and a minor version bump.
 *
 * Terms pairing: when terms_hash is provided alongside terms_ref, the hash
 * SHOULD correspond to the content at terms_ref. Future enforcement may
 * verify this binding at verification time.
 */
import { z } from 'zod';

export const TREATY_EXTENSION_KEY = 'org.peacprotocol/treaty' as const;

/**
 * Commitment class vocabulary (DD-147).
 * Ascending levels of binding commitment.
 */
export const COMMITMENT_CLASSES = ['informational', 'operational', 'financial', 'legal'] as const;

export const CommitmentClassSchema = z.enum(COMMITMENT_CLASSES);
export type CommitmentClass = z.infer<typeof CommitmentClassSchema>;

/**
 * Treaty extension schema
 */
export const TreatySchema = z
  .object({
    /** Commitment level */
    commitment_class: CommitmentClassSchema,

    /** URL to full terms document (optional) */
    terms_ref: z.string().url().max(2048).optional(),

    /** SHA-256 hash of terms document for integrity verification (optional) */
    terms_hash: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/, {
        message: 'terms_hash must match sha256:<64 hex chars>',
      })
      .optional(),

    /** Counterparty identifier (optional) */
    counterparty: z.string().max(256).optional(),

    /** When the treaty becomes effective (RFC 3339, optional) */
    effective_at: z.string().datetime().optional(),

    /** When the treaty expires (RFC 3339, optional) */
    expires_at: z.string().datetime().optional(),
  })
  .strict();

export type Treaty = z.infer<typeof TreatySchema>;

/**
 * Validate a Treaty object.
 */
export function validateTreaty(
  data: unknown
): { ok: true; value: Treaty } | { ok: false; error: string } {
  const result = TreatySchema.safeParse(data);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }

  // Semantic check: effective_at must be before or equal to expires_at
  if (result.data.effective_at && result.data.expires_at) {
    const effectiveMs = new Date(result.data.effective_at).getTime();
    const expiresMs = new Date(result.data.expires_at).getTime();
    if (effectiveMs > expiresMs) {
      return { ok: false, error: 'effective_at must not be after expires_at' };
    }
  }

  return { ok: true, value: result.data };
}
