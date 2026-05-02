/**
 * Bounded internal policy-binding validator (canonical-composed).
 *
 * INTERNAL ONLY. Thin wrapper around `verifyPolicyBinding` from
 * `@peac/schema`. Surfaces the canonical three-state result
 * (`verified` / `failed` / `unavailable`) projected into the bounded
 * validator's accept/reject contract, where `failed` is the only
 * rejection.
 *
 * This is observational equivalence by construction, not a divergent
 * binding check. Module is observational only; not re-exported from
 * `packages/protocol/src/index.ts` and not wired into the public
 * runtime path.
 *
 * SCOPE:
 *   - Both digests present and equal -> accepted (`verified`).
 *   - Either digest absent -> accepted (`unavailable`); no policy
 *     check is performed when the receipt or caller omits the digest.
 *   - Both present but unequal -> rejected with E_POLICY_BINDING_FAILED.
 *
 * Out of scope:
 *   - Policy-document fetch and digest computation (lives in
 *     `verifyLocal()` / caller responsibility).
 *   - Policy URI handling (`policy.uri` is informational only).
 */

import { verifyPolicyBinding } from '@peac/schema';

export interface PolicyBindingResult {
  readonly accepted: boolean;
  readonly errorCode?: string;
  /** 'verified' | 'failed' | 'unavailable'. Surfaced unchanged from canonical. */
  readonly status: 'verified' | 'failed' | 'unavailable';
}

export function validatePolicyBindingInternal(
  receiptPolicyDigest: string | undefined,
  localPolicyDigest: string | undefined
): PolicyBindingResult {
  if (receiptPolicyDigest === undefined || localPolicyDigest === undefined) {
    return { accepted: true, status: 'unavailable' };
  }
  const status = verifyPolicyBinding(receiptPolicyDigest, localPolicyDigest);
  if (status === 'failed') {
    return { accepted: false, errorCode: 'E_POLICY_BINDING_FAILED', status };
  }
  return { accepted: true, status };
}
