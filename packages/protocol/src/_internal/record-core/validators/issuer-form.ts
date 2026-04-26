/**
 * Bounded internal issuer-form validator.
 *
 * INTERNAL ONLY. This is the parity-observed counterpart of
 * @peac/schema.isCanonicalIss (referenced by Wire 0.2's CanonicalIssSchema
 * and by issue.ts pre-sign validation). Both implementations consume the
 * same ISS_CANONICAL.maxLength constant from @peac/kernel and apply the
 * same accept/reject rules in the same order; behavioral parity is proven
 * byte-equal by the parity tests, not by code copy.
 *
 * Existing canonical isCanonicalIss in @peac/schema remains canonical.
 * This module is observational only; it is NOT re-exported from
 * packages/protocol/src/index.ts and is NOT wired into runtime paths
 * (issue.ts, verify-local.ts) in v0.13.1.
 *
 * Scope (must mirror isCanonicalIss in packages/schema/src/wire-02-envelope.ts):
 *
 *   1. Type and length:
 *      - Non-string iss -> rejected
 *      - Empty string -> rejected
 *      - Length > ISS_CANONICAL.maxLength (2048) -> rejected
 *
 *   2. did: branch (checked before URL parsing because did: is a valid
 *      URL scheme in some parsers):
 *      - Pattern: ^did:[a-z0-9]+:[^#?/]+$
 *      - Method: lowercase letters and digits only, non-empty
 *      - Method-specific-id: non-empty, no '/', '?', or '#'
 *
 *   3. https:// branch (URL-constructor based):
 *      - new URL(iss) must succeed
 *      - url.protocol === 'https:'
 *      - Non-empty url.hostname
 *      - No userinfo (url.username and url.password both empty)
 *      - iss must equal the canonical reconstructed origin
 *        ('https://${url.host}'). This rejects:
 *          - uppercase host (URL spec lowercases hostname)
 *          - explicit default port (:443 is dropped from url.host)
 *          - trailing slash, path, query, fragment, userinfo
 *          - raw Unicode hostname (URL emits punycode in url.host)
 *
 *   4. All other schemes -> rejected with E_ISS_NOT_CANONICAL.
 */

import { ISS_CANONICAL } from '@peac/kernel';

/**
 * Normalized result. accepted=true means iss is in canonical form.
 * accepted=false carries the canonical error code E_ISS_NOT_CANONICAL.
 *
 * The canonical surface emits a single error code for any rejection;
 * no path field is attached, so the comparison is on (accepted, errorCode)
 * only.
 */
export type IssuerFormResult =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly errorCode: string };

const ACCEPTED: IssuerFormResult = { accepted: true } as const;
const REJECTED: IssuerFormResult = { accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' } as const;

/** did:<method>:<method-specific-id> grammar (mirrors canonical regex). */
const DID_PATTERN = /^did:[a-z0-9]+:[^#?/]+$/;

export function validateIssuerFormInternal(iss: unknown): IssuerFormResult {
  // 1. Type and length
  if (typeof iss !== 'string' || iss.length === 0 || iss.length > ISS_CANONICAL.maxLength) {
    return REJECTED;
  }

  // 2. did: branch (check before URL parsing)
  if (iss.startsWith('did:')) {
    return DID_PATTERN.test(iss) ? ACCEPTED : REJECTED;
  }

  // 3. https:// branch (URL-constructor based)
  let url: URL;
  try {
    url = new URL(iss);
  } catch {
    return REJECTED;
  }

  if (url.protocol !== 'https:') return REJECTED;
  if (!url.hostname) return REJECTED;
  if (url.username !== '' || url.password !== '') return REJECTED;

  const origin = `${url.protocol}//${url.host}`;
  return iss === origin ? ACCEPTED : REJECTED;
}
