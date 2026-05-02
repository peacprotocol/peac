/**
 * Bounded internal schema-parse validator.
 *
 * INTERNAL ONLY. Thin wrapper around the canonical
 * `parseReceiptClaims` from `@peac/schema`. Projects the canonical
 * accept/reject signal plus the full canonical projection (parsed
 * claims, parser warnings, canonical error triple) so production
 * callers can reproduce the canonical surface byte-equally without
 * re-invoking `parseReceiptClaims`.
 *
 * Module is internal-only; not re-exported from
 * `packages/protocol/src/index.ts`.
 *
 * SCOPE:
 *   - Run `parseReceiptClaims(payload)` and surface its accept/reject.
 *   - On acceptance: surface `wireVersion`, parsed `claims`, and
 *     parser `warnings` (e.g., `type_unregistered`,
 *     `unknown_extension_preserved`). Higher-layer aggregation merges
 *     these into the caller's warning array.
 *   - On rejection: surface the canonical error triple
 *     (`errorCode`, `errorMessage`, `errorIssues`) so callers can
 *     project the canonical `details: { parse_code, issues }` and
 *     `message: 'Receipt schema validation failed: <message>'`
 *     surface byte-equally.
 */

import type { ZodError } from 'zod';
import type { VerificationWarning } from '@peac/kernel';
import { parseReceiptClaims } from '@peac/schema';
import type { Wire02Claims } from '@peac/schema';

export interface SchemaParseResult {
  readonly accepted: boolean;
  /**
   * Canonical parse-error code from `parseReceiptClaims` when the
   * parse rejects. Mirrors `pr.error.code`.
   */
  readonly errorCode?: string;
  /**
   * Canonical parse-error message from `parseReceiptClaims` when the
   * parse rejects. Mirrors `pr.error.message`. Required for callers
   * that reproduce the canonical surface message
   * `Receipt schema validation failed: <message>` byte-equally.
   */
  readonly errorMessage?: string;
  /**
   * Canonical parse-error issues from `parseReceiptClaims` when the
   * parse rejects. Mirrors `pr.error.issues`. Callers downstream
   * apply their own bounded sanitization (path-join, length cap)
   * before surfacing on a public verifier-result `details` payload.
   */
  readonly errorIssues?: ZodError['issues'];
  /**
   * Parsed Wire 0.2 claims when accepted. Internal-only; does not
   * appear on any emitted record or public surface.
   */
  readonly claims?: Wire02Claims;
  /**
   * Wire version surfaced from `parseReceiptClaims` on acceptance.
   * The bounded surface only admits `'0.2'`; Wire 0.1 acceptance from
   * the canonical parser is rejected at this layer with
   * `E_UNSUPPORTED_WIRE_VERSION` because the bounded composition is
   * keyed on Wire 0.2 claim shapes.
   */
  readonly wireVersion?: '0.2';
  /**
   * Parser warnings surfaced on acceptance. Mirrors `pr.warnings` for
   * Wire 0.2 acceptance. Callers that aggregate into a single
   * canonical warning array merge this list at the canonical-equivalent
   * flow position before the canonical sort.
   */
  readonly warnings?: readonly VerificationWarning[];
}

export function validateSchemaParseInternal(payload: unknown): SchemaParseResult {
  const pr = parseReceiptClaims(payload);
  if (!pr.ok) {
    return {
      accepted: false,
      errorCode: pr.error.code,
      errorMessage: pr.error.message,
      ...(pr.error.issues !== undefined && { errorIssues: pr.error.issues }),
    };
  }
  if (pr.wireVersion !== '0.2') {
    return {
      accepted: false,
      errorCode: 'E_UNSUPPORTED_WIRE_VERSION',
      errorMessage: `Unsupported wire version: ${pr.wireVersion}`,
    };
  }
  return {
    accepted: true,
    claims: pr.claims as Wire02Claims,
    wireVersion: '0.2',
    warnings: pr.warnings,
  };
}
