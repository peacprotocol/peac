package peac

import "fmt"

// PolicyBindingStatus represents the three-state policy binding result.
type PolicyBindingStatus string

const (
	PolicyBindingVerified    PolicyBindingStatus = "verified"
	PolicyBindingFailed      PolicyBindingStatus = "failed"
	PolicyBindingUnavailable PolicyBindingStatus = "unavailable"
)

// CheckPolicyBinding computes policy binding status from receipt and local digests.
//
// Three-state logic:
//   - Both present and match: verified
//   - Both present and mismatch: failed
//   - Either absent: unavailable
func CheckPolicyBinding(receiptDigest, localDigest string) PolicyBindingStatus {
	if receiptDigest == "" || localDigest == "" {
		return PolicyBindingUnavailable
	}
	if receiptDigest == localDigest {
		return PolicyBindingVerified
	}
	return PolicyBindingFailed
}

// ComputePolicyDigest computes a JCS + SHA-256 digest of a policy document.
// Returns "sha256:<hex>" format matching the TypeScript computePolicyDigestJcs().
//
// The raw policy bytes are admitted through the same I-JSON (RFC 7493) gate that
// record header/payload bytes pass (assertIJSON) BEFORE they reach Canonicalize.
// This is required for JCS correctness, not an extra profile: encoding/json (v1)
// silently replaces invalid UTF-8 and lone \uD800-\uDFFF escapes with U+FFFD and
// keeps the LAST of duplicate member names, so without a raw-bytes check two
// different policy documents could canonicalize to the same digest, and a
// document RFC 8785 Section 3.2.2.2 / RFC 7493 forbids would be silently
// accepted. A post-decode utf8.ValidString check cannot detect this: by then the
// original bytes are gone.
//
// Numeric profile: assertIJSON also rejects numbers whose magnitude exceeds
// 2^53-1 (E_IJSON_NUMBER_OUT_OF_RANGE). That is deliberately the SAME rule the
// TypeScript side is subject to, because computePolicyDigestJcs() takes an
// already-parsed JsonValue: a JavaScript caller's JSON.parse has already rounded
// any such number, so Go keeping the exact digits via json.Number would produce a
// DIFFERENT digest for the same bytes. Rejecting is the only fail-closed answer;
// encode such values as strings.
//
// Errors: an *ijsonError (Code = E_IJSON_INVALID_STRING /
// E_IJSON_DUPLICATE_MEMBER_NAME / E_IJSON_NUMBER_OUT_OF_RANGE / E_INVALID_FORMAT)
// when the bytes are rejected at admission; otherwise whatever Canonicalize
// reports. Both are ordinary error returns on the existing signature.
func ComputePolicyDigest(policyJSON []byte) (string, error) {
	if err := assertIJSON(policyJSON); err != nil {
		return "", fmt.Errorf("policy document rejected: %w", err)
	}
	return JCSHash(policyJSON)
}
