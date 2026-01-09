package policy

import (
	"net/http"
)

// EnforcementResult contains the HTTP enforcement result.
type EnforcementResult struct {
	// StatusCode is the HTTP status code to return.
	StatusCode int

	// Headers are additional HTTP headers to include.
	Headers http.Header

	// Allowed indicates whether access is permitted.
	Allowed bool

	// Challenge indicates whether a challenge (402) is being issued.
	Challenge bool
}

// WWWAuthenticateHeader is the header value for 402 responses.
const WWWAuthenticateHeader = `PEAC realm="receipt", error="receipt_required"`

// EnforceDecision maps a policy decision to an HTTP response.
// For review decisions, receiptVerified determines whether access is granted.
func EnforceDecision(decision Decision, receiptVerified bool) *EnforcementResult {
	result := &EnforcementResult{
		Headers: make(http.Header),
	}

	switch decision {
	case Allow:
		result.StatusCode = http.StatusOK
		result.Allowed = true
		result.Challenge = false

	case Deny:
		result.StatusCode = http.StatusForbidden
		result.Allowed = false
		result.Challenge = false

	case Review:
		if receiptVerified {
			result.StatusCode = http.StatusOK
			result.Allowed = true
			result.Challenge = false
		} else {
			result.StatusCode = http.StatusPaymentRequired
			result.Allowed = false
			result.Challenge = true
			result.Headers.Set("WWW-Authenticate", WWWAuthenticateHeader)
		}

	default:
		// Unknown decision defaults to deny
		result.StatusCode = http.StatusForbidden
		result.Allowed = false
		result.Challenge = false
	}

	return result
}

// EnforceResult is a convenience function that evaluates and enforces in one step.
func EnforceResult(result *EvaluationResult, receiptVerified bool) *EnforcementResult {
	return EnforceDecision(result.Decision, receiptVerified)
}

// EvaluateAndEnforce evaluates a policy and returns the enforcement result.
func EvaluateAndEnforce(policy *PolicyDocument, context *EvaluationContext, receiptVerified bool) *EnforcementResult {
	result := Evaluate(policy, context)
	return EnforceDecision(result.Decision, receiptVerified)
}
