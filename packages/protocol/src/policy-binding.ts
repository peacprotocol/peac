/**
 * Policy binding utilities (Layer 3, DD-49, DD-151)
 *
 * JCS (RFC 8785) canonicalization + SHA-256 for policy digest computation,
 * and the 3-state binding check that combines receipt and local digests.
 *
 * The JCS + hash computation lives in Layer 3 (@peac/protocol) rather than
 * Layer 1 (@peac/schema) to avoid introducing crypto dependencies into the
 * schema package (DD-141: @peac/schema is validation-only).
 *
 * The pure string comparison (verifyPolicyBinding) lives in Layer 1
 * (@peac/schema) so that consumers who only need to check pre-computed
 * digests do not need to pull in protocol-level dependencies.
 */

import { jcsHash } from '@peac/crypto';
import { HASH } from '@peac/kernel';
import type { JsonValue } from '@peac/kernel';
import type { PolicyBindingStatus } from './verifier-types.js';
import { verifyPolicyBinding } from '@peac/schema';

/**
 * Compute the JCS+SHA-256 digest of a policy object.
 *
 * Canonicalizes the policy value via RFC 8785 (JSON Canonicalization Scheme),
 * computes SHA-256 over the resulting UTF-8 bytes, and returns the result in
 * the PEAC self-describing hash format: 'sha256:<64 lowercase hex>'.
 *
 * This is the normative digest format for the policy.digest field in Wire 0.2
 * receipts (DD-151). The format is stable and identical across implementations.
 *
 * Callers MUST pass the same JSON structure that was embedded in the receipt's
 * policy block when issuing. Key order is irrelevant; JCS normalizes it.
 *
 * @param policy - Policy value (any JSON-serializable value)
 * @returns Digest string in 'sha256:<64 lowercase hex>' format
 * @throws Error if the value cannot be canonicalized (e.g., contains functions
 *         or non-finite numbers)
 */
export async function computePolicyDigestJcs(policy: JsonValue): Promise<string> {
  const hex = await jcsHash(policy);
  return `${HASH.prefix}${hex}`;
}

/**
 * Compute the 3-state policy binding result.
 *
 * Three-state semantics (DD-151):
 *   - 'unavailable': either digest is absent (receipt has no policy block, or
 *     caller did not provide a local digest). No binding check performed.
 *   - 'verified': both digests present and match exactly.
 *   - 'failed': both digests present but do not match.
 *
 * When the result is 'failed', verifyLocal() returns E_POLICY_BINDING_FAILED
 * as a hard verification error.
 *
 * @param receiptDigest - policy.digest from the receipt claims; undefined if
 *   the receipt contains no policy block
 * @param localDigest - digest computed from the caller's local policy bytes via
 *   computePolicyDigestJcs(); undefined if the caller has no policy to check
 * @returns Three-state PolicyBindingStatus
 */
export function checkPolicyBinding(
  receiptDigest: string | undefined,
  localDigest: string | undefined
): PolicyBindingStatus {
  if (receiptDigest === undefined || localDigest === undefined) {
    return 'unavailable';
  }
  return verifyPolicyBinding(receiptDigest, localDigest);
}
