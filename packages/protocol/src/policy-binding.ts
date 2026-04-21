/**
 * Policy binding utilities (Layer 3)
 *
 * Thin delegate over `document-binding.ts`. Preserves the pre-v0.12.14
 * API surface (`computePolicyDigestJcs`, `checkPolicyBinding`) with
 * byte-identical output. New callers should prefer the generalized
 * helpers in `document-binding.ts`.
 *
 * The pure string comparison (`verifyPolicyBinding`) lives in Layer 1
 * (`@peac/schema`) so consumers that only need to check pre-computed
 * digests do not pull in protocol-level dependencies.
 *
 * @see packages/protocol/src/document-binding.ts
 * @see docs/specs/DOCUMENT-BINDING.md
 */

import type { JsonValue } from '@peac/kernel';
import type { PolicyBindingStatus } from './verifier-types.js';
import { checkDocumentBinding, computeJsonDocumentDigestJcs } from './document-binding.js';

/**
 * Compute the JCS+SHA-256 digest of a policy object.
 *
 * Canonicalizes the policy value via RFC 8785 (JSON Canonicalization
 * Scheme), computes SHA-256 over the resulting UTF-8 bytes, and returns
 * the result in the PEAC self-describing hash format
 * `'sha256:<64 lowercase hex>'`.
 *
 * This is the normative digest format for the policy.digest field in
 * Wire 0.2 receipts. The format is stable and identical across
 * implementations. Output is byte-identical to
 * `computeJsonDocumentDigestJcs(policy)` from `document-binding.ts`.
 *
 * Callers MUST pass the same JSON structure that was embedded in the
 * receipt's policy block when issuing. Key order is irrelevant; JCS
 * normalizes it.
 *
 * @param policy - Policy value (any JSON-serializable value)
 * @returns Digest string in 'sha256:<64 lowercase hex>' format
 * @throws Error if the value cannot be canonicalized (e.g., contains
 *         functions or non-finite numbers)
 */
export async function computePolicyDigestJcs(policy: JsonValue): Promise<string> {
  return computeJsonDocumentDigestJcs(policy);
}

/**
 * Compute the 3-state policy binding result.
 *
 * Three-state semantics:
 *   - `'unavailable'`: either digest is absent (receipt has no policy
 *     block, or caller did not provide a local digest). No binding
 *     check performed.
 *   - `'verified'`: both digests present and match exactly.
 *   - `'failed'`: both digests present but do not match.
 *
 * When the result is `'failed'`, `verifyLocal()` returns
 * `E_POLICY_BINDING_FAILED` as a hard verification error.
 *
 * Output is byte-identical to `checkDocumentBinding` from
 * `document-binding.ts`.
 *
 * @param receiptDigest - policy.digest from the receipt claims; undefined if
 *   the receipt contains no policy block
 * @param localDigest - digest computed from the caller's local policy bytes via
 *   `computePolicyDigestJcs()`; undefined if the caller has no policy to check
 * @returns Three-state PolicyBindingStatus
 */
export function checkPolicyBinding(
  receiptDigest: string | undefined,
  localDigest: string | undefined
): PolicyBindingStatus {
  return checkDocumentBinding(receiptDigest, localDigest);
}
