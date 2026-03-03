/**
 * Policy binding comparison (Layer 1, DD-49, DD-151)
 *
 * Pure string comparison with no I/O and no crypto imports (DD-141).
 * The digest format is 'sha256:<64 lowercase hex>'.
 *
 * This function handles only the binary match/mismatch decision. The full
 * 3-state result ('verified' | 'failed' | 'unavailable') is computed by
 * checkPolicyBinding() in @peac/protocol (Layer 3), which handles the
 * absent-digest case and invokes computePolicyDigestJcs() for hashing.
 */

/**
 * Compare a receipt policy digest against a locally-computed digest.
 *
 * Returns 'verified' if the two digests match exactly, 'failed' otherwise.
 * Both arguments must be present; callers must handle the absent-digest case
 * (producing 'unavailable') before calling this function.
 *
 * @param receiptDigest - policy.digest from the receipt claims
 * @param localDigest - digest computed from the caller's local policy bytes
 * @returns 'verified' on exact match, 'failed' on mismatch
 */
export function verifyPolicyBinding(
  receiptDigest: string,
  localDigest: string
): 'verified' | 'failed' {
  return receiptDigest === localDigest ? 'verified' : 'failed';
}
