/**
 * Bounded internal schema-parse validator (canonical-composed).
 *
 * INTERNAL ONLY. Thin wrapper around the canonical
 * `parseReceiptClaims` from `@peac/schema`, projecting the canonical
 * result into the bounded validator's normalized shape. The wrapper
 * has no decision logic of its own: it delegates the parse, then
 * surfaces the canonical accept/reject and the canonical error code.
 *
 * This is observational equivalence by construction, not a divergent
 * parser. The layer boundary allows an alternate implementation
 * without changing callers; the input/output shape is stable enough
 * for a drop-in replacement should rigorous cross-implementation
 * parity beyond observational evidence be required.
 *
 * Module is observational only; not re-exported from
 * `packages/protocol/src/index.ts` and not wired into the public
 * runtime path.
 *
 * SCOPE:
 *   - Run `parseReceiptClaims(payload)` and surface its accept/reject.
 *   - On rejection, surface `pr.error.code` (canonical parse-error code)
 *     so the candidate's error taxonomy matches the canonical's.
 *   - On acceptance, no warnings are surfaced from this layer; parser
 *     warnings (e.g., `type_unregistered`, `unknown_extension_preserved`)
 *     are emitted by the canonical parser and consumed at higher layers
 *     (verifyLocal warning aggregation).
 */

import { parseReceiptClaims } from '@peac/schema';
import type { Wire02Claims } from '@peac/schema';

export interface SchemaParseResult {
  readonly accepted: boolean;
  readonly errorCode?: string;
  /**
   * Parsed Wire 0.2 claims when accepted. Internal-only; does not
   * appear on any emitted record or public surface. Callers that need
   * a typed view of the parsed claims read this field; callers that
   * only need the accept/reject signal ignore it.
   */
  readonly claims?: Wire02Claims;
}

export function validateSchemaParseInternal(payload: unknown): SchemaParseResult {
  const pr = parseReceiptClaims(payload);
  if (!pr.ok) {
    return { accepted: false, errorCode: pr.error.code };
  }
  if (pr.wireVersion !== '0.2') {
    return { accepted: false, errorCode: 'E_UNSUPPORTED_WIRE_VERSION' };
  }
  return { accepted: true, claims: pr.claims as Wire02Claims };
}
