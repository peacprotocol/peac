/**
 * Credential Event Extension Schema (v0.11.3+, DD-145 ZT Pack)
 *
 * Records credential lifecycle events in ext["org.peacprotocol/credential_event"].
 * Events: issued, leased, rotated, revoked, expired.
 *
 * credential_ref is an opaque fingerprint reference (DD-146): schema validates
 * format only (prefix + hex). Issuers compute values externally; verifiers
 * MUST NOT assume they can recompute the reference.
 */
import { z } from 'zod';

export const CREDENTIAL_EVENT_EXTENSION_KEY = 'org.peacprotocol/credential_event' as const;

/**
 * Credential lifecycle events
 */
export const CREDENTIAL_EVENTS = ['issued', 'leased', 'rotated', 'revoked', 'expired'] as const;

export const CredentialEventTypeSchema = z.enum(CREDENTIAL_EVENTS);
export type CredentialEventType = z.infer<typeof CredentialEventTypeSchema>;

/**
 * Opaque fingerprint reference format (DD-146).
 * Validates prefix (sha256: or hmac-sha256:) + 64 hex chars.
 * Schema does NOT compute or derive this value.
 */
const FINGERPRINT_REF_PATTERN = /^(sha256|hmac-sha256):[a-f0-9]{64}$/;

export const CredentialRefSchema = z.string().max(256).regex(FINGERPRINT_REF_PATTERN, {
  message:
    'credential_ref must be an opaque fingerprint reference: (sha256|hmac-sha256):<64 hex chars>',
});

/**
 * Credential Event extension schema
 */
export const CredentialEventSchema = z
  .object({
    /** Lifecycle event type */
    event: CredentialEventTypeSchema,

    /** Opaque fingerprint reference of the credential (format validation only) */
    credential_ref: CredentialRefSchema,

    /** Authority that performed the action (HTTPS URL) */
    authority: z
      .string()
      .url()
      .max(2048)
      .refine((v) => v.startsWith('https://'), {
        message: 'authority must be an HTTPS URL',
      }),

    /** When the credential expires (RFC 3339, optional) */
    expires_at: z.string().datetime().optional(),

    /** Previous credential reference for rotation chains (optional) */
    previous_ref: CredentialRefSchema.optional(),
  })
  .strict();

export type CredentialEvent = z.infer<typeof CredentialEventSchema>;

/**
 * Validate a CredentialEvent object.
 */
export function validateCredentialEvent(
  data: unknown
): { ok: true; value: CredentialEvent } | { ok: false; error: string } {
  const result = CredentialEventSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.message };
}
