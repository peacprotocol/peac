/**
 * Issuer Configuration Schema Extensions (v0.11.3+, DD-148)
 *
 * Zod schemas for revoked_keys field in peac-issuer.json.
 * Reason values aligned with RFC 5280 CRLReason subset
 * (only values meaningful for receipt signing keys).
 *
 * @packageDocumentation
 */

import { z } from 'zod';

/**
 * Revocation reasons: RFC 5280 CRLReason subset relevant to receipt signing keys.
 */
export const REVOCATION_REASONS = [
  'key_compromise',
  'superseded',
  'cessation_of_operation',
  'privilege_withdrawn',
] as const;

export type RevocationReason = (typeof REVOCATION_REASONS)[number];

/**
 * Schema for a single revoked key entry.
 */
export const RevokedKeyEntrySchema = z
  .object({
    /** Key ID that was revoked */
    kid: z.string().min(1).max(256),
    /** ISO 8601 timestamp of revocation */
    revoked_at: z.string().datetime(),
    /** Revocation reason (optional, RFC 5280 CRLReason subset) */
    reason: z.enum(REVOCATION_REASONS).optional(),
  })
  .strict();

export type RevokedKeyEntryInput = z.input<typeof RevokedKeyEntrySchema>;
export type RevokedKeyEntryOutput = z.output<typeof RevokedKeyEntrySchema>;

/**
 * Schema for the revoked_keys array in issuer configuration.
 * Maximum 100 entries to prevent unbounded growth.
 */
export const RevokedKeysArraySchema = z.array(RevokedKeyEntrySchema).max(100);

/**
 * Validate a revoked_keys array.
 * Returns a discriminated result (no exceptions).
 */
export function validateRevokedKeys(
  data: unknown
): { ok: true; value: RevokedKeyEntryOutput[] } | { ok: false; error: string } {
  const result = RevokedKeysArraySchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.issues.map((i) => i.message).join('; ') };
}

/**
 * Check if a kid is present in a revoked_keys array.
 * Returns the revocation entry if found, null otherwise.
 */
export function findRevokedKey(
  revokedKeys: RevokedKeyEntryOutput[],
  kid: string
): RevokedKeyEntryOutput | null {
  return revokedKeys.find((entry) => entry.kid === kid) ?? null;
}
