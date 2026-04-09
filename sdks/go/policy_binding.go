package peac

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
func ComputePolicyDigest(policyJSON []byte) (string, error) {
	return JCSHash(policyJSON)
}
