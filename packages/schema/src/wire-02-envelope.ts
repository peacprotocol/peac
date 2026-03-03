/**
 * Wire 0.2 Zod schemas and types (v0.12.0-preview.1, DD-156)
 *
 * This file contains:
 *   - Wire02ClaimsSchema: the canonical Zod schema for Wire 0.2 envelopes
 *   - Wire02Claims: inferred TypeScript type (z.infer<typeof Wire02ClaimsSchema>)
 *   - Supporting schemas: EvidencePillarSchema, PillarsSchema, Wire02KindSchema,
 *     ReceiptTypeSchema, CanonicalIssSchema, PolicyBlockSchema
 *   - isCanonicalIss(): exported canonical-iss validator
 *   - isValidReceiptType(): exported type-grammar validator
 *   - checkOccurredAtSkew(): cross-field skew check helper
 *
 * Wire02Claims does NOT live in @peac/kernel (layer violation);
 * it lives here because it references schema-layer types (Correction 4, DD-156).
 */

import { z } from 'zod';
import {
  ISS_CANONICAL,
  TYPE_GRAMMAR,
  POLICY_BLOCK,
  OCCURRED_AT_TOLERANCE_SECONDS,
  HASH,
} from '@peac/kernel';
import type { EvidencePillar, VerificationWarning } from '@peac/kernel';
import { ActorBindingSchema } from './actor-binding.js';

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Check that an array is sorted in ascending order with no duplicates.
 * Used to validate the pillars array.
 */
function isSortedAndUnique(arr: readonly string[]): boolean {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] <= arr[i - 1]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// isCanonicalIss (DD-156, exported helper)
// ---------------------------------------------------------------------------

/**
 * Validate that an issuer (iss) claim is in canonical form.
 *
 * Accepted schemes:
 *   - `https://`: ASCII origin (lowercase scheme+host, no explicit default port
 *     (:443 rejected), origin-only, no path/query/fragment/userinfo).
 *     Raw Unicode hosts are rejected; punycode (xn--...) is accepted.
 *   - `did:`: DID Core identifier (`did:<method>:<id>`) where method is
 *     `[a-z0-9]+` and the method-specific-id contains no `#`, `?`, or `/`.
 *
 * All other schemes produce E_ISS_NOT_CANONICAL.
 *
 * @param iss - Issuer claim value to validate
 * @returns true if canonical form; false otherwise
 */
export function isCanonicalIss(iss: string): boolean {
  if (typeof iss !== 'string' || iss.length === 0 || iss.length > ISS_CANONICAL.maxLength) {
    return false;
  }

  // did: branch: check before URL parsing (did: is a valid URL scheme in some parsers)
  if (iss.startsWith('did:')) {
    // did:<method>:<method-specific-id>
    // Method: lowercase letters and digits only ([a-z0-9]+)
    // Method-specific-id: non-empty, no literal '/', '?', or '#'
    return /^did:[a-z0-9]+:[^#?/]+$/.test(iss);
  }

  // https:// branch: try URL constructor for comprehensive validation
  try {
    const url = new URL(iss);

    // Must be https: scheme only
    if (url.protocol !== 'https:') return false;

    // Non-empty host required
    if (!url.hostname) return false;

    // No userinfo (credentials in origins are a security risk)
    if (url.username !== '' || url.password !== '') return false;

    // Reconstruct canonical origin (URL spec normalizes hostname to lowercase
    // and removes the default port 443 from url.host).
    // Exact match rejects: uppercase host, trailing slash, default port (:443),
    // path, query, fragment, userinfo, raw Unicode hostname.
    const origin = `${url.protocol}//${url.host}`;
    return iss === origin;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// isValidReceiptType (exported helper)
// ---------------------------------------------------------------------------

/** Absolute URI pattern: scheme followed by '://' (RFC 3986 generic-URI) */
const ABS_URI_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//;

/**
 * Validate that a type claim conforms to the Wire 0.2 type grammar.
 *
 * Accepted forms:
 *   - Reverse-DNS notation: `<domain>/<segment>` where `<domain>` has at
 *     least one dot (e.g., `org.peacprotocol/commerce`, `com.example/flow`)
 *   - Absolute URI: starts with `scheme://` (e.g., `https://example.com/type`)
 *
 * @param value - Type claim value to validate
 * @returns true if valid type grammar; false otherwise
 */
export function isValidReceiptType(value: string): boolean {
  if (value.length === 0 || value.length > TYPE_GRAMMAR.maxLength) return false;

  // Absolute URI form
  if (ABS_URI_PATTERN.test(value)) return true;

  // Reverse-DNS form: <domain>/<segment>
  const slashIdx = value.indexOf('/');
  if (slashIdx <= 0) return false; // no slash, or slash at position 0

  const domain = value.slice(0, slashIdx);
  const segment = value.slice(slashIdx + 1);

  // Domain must have at least one dot (distinguishes from single-label paths)
  if (!domain.includes('.')) return false;

  // Segment must be non-empty
  if (segment.length === 0) return false;

  // Domain: letters, digits, dots, hyphens; must start with alphanumeric
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(domain)) return false;

  // Segment: letters, digits, hyphens, underscores, dots.
  // Additional slashes are NOT permitted in the reverse-DNS form; use an
  // absolute URI (handled by ABS_URI_PATTERN above) for multi-segment paths.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(segment)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// EvidencePillar schema (closed 10-value taxonomy)
// ---------------------------------------------------------------------------

/** All 10 registered pillar values in ascending lexicographic order */
const EVIDENCE_PILLARS: readonly EvidencePillar[] = [
  'access',
  'attribution',
  'commerce',
  'compliance',
  'consent',
  'identity',
  'privacy',
  'provenance',
  'purpose',
  'safety',
];

export const EvidencePillarSchema = z.enum(
  EVIDENCE_PILLARS as [EvidencePillar, ...EvidencePillar[]]
);

// ---------------------------------------------------------------------------
// PillarsSchema (non-empty array, sorted + unique)
// ---------------------------------------------------------------------------

export const PillarsSchema = z
  .array(EvidencePillarSchema)
  .min(1)
  .superRefine((arr, ctx) => {
    if (!isSortedAndUnique(arr)) {
      ctx.addIssue({
        code: 'custom',
        message: 'E_PILLARS_NOT_SORTED',
      });
    }
  });

// ---------------------------------------------------------------------------
// Wire02KindSchema
// ---------------------------------------------------------------------------

export const Wire02KindSchema = z.enum(['evidence', 'challenge']);

// ---------------------------------------------------------------------------
// ReceiptTypeSchema
// ---------------------------------------------------------------------------

export const ReceiptTypeSchema = z.string().max(TYPE_GRAMMAR.maxLength).refine(isValidReceiptType, {
  message: 'type must be reverse-DNS notation (e.g., org.example/flow) or an absolute URI',
});

// ---------------------------------------------------------------------------
// CanonicalIssSchema
// ---------------------------------------------------------------------------

export const CanonicalIssSchema = z.string().max(ISS_CANONICAL.maxLength).refine(isCanonicalIss, {
  message: 'E_ISS_NOT_CANONICAL',
});

// ---------------------------------------------------------------------------
// PolicyBlockSchema (DD-151)
// ---------------------------------------------------------------------------

export const PolicyBlockSchema = z.object({
  /** JCS+SHA-256 digest: 'sha256:<64 lowercase hex>' */
  digest: z.string().regex(HASH.pattern, 'digest must be sha256:<64 lowercase hex>'),
  /**
   * HTTPS locator hint for the policy document.
   * MUST be an https:// URL (max 2048 chars).
   * MUST NOT trigger auto-fetch; callers use this as a hint only (DD-55).
   */
  uri: z
    .string()
    .max(POLICY_BLOCK.uriMaxLength)
    .url()
    .refine((u) => u.startsWith('https://'), 'policy.uri must be an https:// URL')
    .optional(),
  /** Caller-assigned version label (max 256 chars) */
  version: z.string().max(POLICY_BLOCK.versionMaxLength).optional(),
});

// ---------------------------------------------------------------------------
// RepresentationFieldsSchema (basic; PR 15 adds FingerprintRef validation)
// ---------------------------------------------------------------------------

const RepresentationFieldsSchemaBasic = z.object({
  /** FingerprintRef string form: sha256:<64 lowercase hex> */
  content_hash: z.string().regex(HASH.pattern).optional(),
  /** MIME type (e.g., 'text/markdown') */
  content_type: z.string().max(256).optional(),
  /** Size of the served content in bytes */
  content_length: z.number().int().nonnegative().optional(),
});

// ---------------------------------------------------------------------------
// Wire02ClaimsSchema (DD-156)
// ---------------------------------------------------------------------------

export const Wire02ClaimsSchema = z
  .object({
    /** Wire format version discriminant; always '0.2' for Wire 0.2 */
    peac_version: z.literal('0.2'),
    /** Structural kind: 'evidence' or 'challenge' */
    kind: Wire02KindSchema,
    /** Open semantic type (reverse-DNS or absolute URI) */
    type: ReceiptTypeSchema,
    /** Canonical issuer (https:// ASCII origin or did: identifier) */
    iss: CanonicalIssSchema,
    /** Issued-at time (Unix seconds). REQUIRED. */
    iat: z.number().int(),
    /** Unique receipt identifier; 1 to 256 chars */
    jti: z.string().min(1).max(256),
    /** Subject identifier; max 2048 chars */
    sub: z.string().max(2048).optional(),
    /** Evidence pillars (closed 10-value taxonomy); sorted ascending, unique */
    pillars: PillarsSchema.optional(),
    /** Top-level actor binding (sole location for ActorBinding in Wire 0.2) */
    actor: ActorBindingSchema.optional(),
    /** Policy binding block (DD-151) */
    policy: PolicyBlockSchema.optional(),
    /** Representation fields (DD-152); PR 15 upgrades to full FingerprintRef validation */
    representation: RepresentationFieldsSchemaBasic.optional(),
    /** ISO 8601 / RFC 3339 timestamp when the interaction occurred; evidence kind only */
    occurred_at: z.string().datetime({ offset: true }).optional(),
    /** Declared purpose string; max 256 chars */
    purpose_declared: z.string().max(256).optional(),
    /** Extension groups (open; known group keys validated by group schema) */
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    // occurred_at is prohibited on challenge-kind receipts
    if (data.kind === 'challenge' && data.occurred_at !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'E_OCCURRED_AT_ON_CHALLENGE',
      });
    }
  })
  .strict();

/** Inferred type for Wire 0.2 receipt claims */
export type Wire02Claims = z.infer<typeof Wire02ClaimsSchema>;

// ---------------------------------------------------------------------------
// checkOccurredAtSkew (DD-156, Correction 5)
// ---------------------------------------------------------------------------

/**
 * Check the occurred_at field for temporal consistency.
 *
 * Rules (evidence kind only; caller must not call for challenge kind):
 *   - If occurred_at > now + tolerance: hard error (E_OCCURRED_AT_FUTURE)
 *   - If occurred_at > iat (within tolerance): warning (occurred_at_skew)
 *   - If occurred_at <= iat: valid, no warning
 *   - If occurred_at is undefined: no check performed
 *
 * @param occurredAt - Value of the occurred_at claim, or undefined
 * @param iat - iat claim value (Unix seconds)
 * @param now - Current time (Unix seconds)
 * @param tolerance - Allowed future skew in seconds (default: OCCURRED_AT_TOLERANCE_SECONDS)
 * @returns 'future_error' for hard error, VerificationWarning for skew warning, null for valid
 */
export function checkOccurredAtSkew(
  occurredAt: string | undefined,
  iat: number,
  now: number,
  tolerance: number = OCCURRED_AT_TOLERANCE_SECONDS
): VerificationWarning | 'future_error' | null {
  if (occurredAt === undefined) return null;

  const ts = Date.parse(occurredAt) / 1000;
  if (isNaN(ts)) return null; // unparseable; parse error surfaces from schema validation

  if (ts > now + tolerance) return 'future_error';

  if (ts > iat) {
    return {
      code: 'occurred_at_skew',
      message: 'occurred_at is after iat',
      pointer: '/occurred_at',
    };
  }

  return null;
}
