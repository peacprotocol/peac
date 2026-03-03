/**
 * Wire 0.2 RepresentationFields schema (DD-152)
 *
 * Records metadata about the content representation that was observed or served,
 * enabling reproducible content drift detection.
 *
 * Layer 1 (@peac/schema): pure Zod validation, zero I/O (DD-141).
 *
 * content_hash validation uses stringToFingerprintRef() as the parser gate
 * and additionally requires alg === 'sha256'. The hmac-sha256 algorithm is
 * not permitted for representation hashes (sha256-only by design).
 */

import { z } from 'zod';
import {
  stringToFingerprintRef,
  MAX_FINGERPRINT_REF_LENGTH,
} from './extensions/fingerprint-ref.js';

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a content_hash string is a valid sha256 FingerprintRef.
 *
 * Uses stringToFingerprintRef() as the parser gate (format correctness),
 * then additionally requires alg === 'sha256'. hmac-sha256 is rejected
 * for representation content hashes.
 */
function isValidContentHash(s: string): boolean {
  const ref = stringToFingerprintRef(s);
  if (ref === null) return false;
  // Only sha256 is permitted for representation.content_hash
  return ref.alg === 'sha256';
}

/**
 * Conservative MIME type validation.
 *
 * Accepts the token/token form with optional parameters (type/subtype;key=value).
 * Does NOT attempt full RFC 9110/6838 grammar parsing.
 *
 * Valid examples: text/plain, application/json, application/json; charset=utf-8
 * Invalid examples: "text", "text/", "  text/plain", ""
 */
const MIME_PATTERN =
  /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*(;\s*[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*=[^\s;]+)*$/;

function isValidMimeType(s: string): boolean {
  return MIME_PATTERN.test(s);
}

// ---------------------------------------------------------------------------
// Bounds constants (follows repo _LIMITS convention)
// ---------------------------------------------------------------------------

/**
 * Normative bounds for Wire 0.2 representation fields.
 *
 * Centralised to prevent magic numbers and allow external reference.
 */
export const REPRESENTATION_LIMITS = {
  /** Max content_hash string length (sha256:<64 hex> = 71 chars, capped at FingerprintRef max) */
  maxContentHashLength: MAX_FINGERPRINT_REF_LENGTH,
  /** Max content_type string length */
  maxContentTypeLength: 256,
} as const;

// ---------------------------------------------------------------------------
// Wire02RepresentationFieldsSchema
// ---------------------------------------------------------------------------

/**
 * Zod schema for Wire 0.2 representation fields (DD-152).
 *
 * All fields are optional; an empty object is valid.
 * Unknown keys are rejected (.strict()).
 *
 * Bounds:
 *   - content_hash: max 76 chars (MAX_FINGERPRINT_REF_LENGTH), sha256-only
 *   - content_type: max 256 chars, conservative MIME pattern
 *   - content_length: non-negative integer, <= Number.MAX_SAFE_INTEGER
 */
export const Wire02RepresentationFieldsSchema = z
  .object({
    /**
     * FingerprintRef of the served content body.
     * Format: sha256:<64 lowercase hex>
     * hmac-sha256 is NOT permitted for representation hashes.
     */
    content_hash: z
      .string()
      .max(REPRESENTATION_LIMITS.maxContentHashLength)
      .refine(isValidContentHash, {
        message: 'content_hash must be a valid sha256 FingerprintRef (sha256:<64 lowercase hex>)',
      })
      .optional(),
    /**
     * MIME type of the served content (e.g., 'text/plain', 'application/json').
     * Conservative pattern validation: type/subtype with optional parameters.
     */
    content_type: z
      .string()
      .max(REPRESENTATION_LIMITS.maxContentTypeLength)
      .refine(isValidMimeType, {
        message: 'content_type must be a valid MIME type (type/subtype with optional parameters)',
      })
      .optional(),
    /**
     * Size of the served content in bytes.
     * Non-negative integer, bounded by Number.MAX_SAFE_INTEGER.
     */
    content_length: z.number().int().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();

/** Inferred type for Wire 0.2 representation fields */
export type Wire02RepresentationFields = z.infer<typeof Wire02RepresentationFieldsSchema>;

/**
 * Public export alias.
 * Internal name is Wire02RepresentationFieldsSchema to prevent wire-version
 * collisions; exported as RepresentationFieldsSchema for ergonomic use.
 */
export { Wire02RepresentationFieldsSchema as RepresentationFieldsSchema };
