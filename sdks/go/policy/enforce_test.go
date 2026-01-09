package policy

import (
	"net/http"
	"testing"
)

// Conformance tests from enforcement.json

func TestEnforceDecision_Allow200(t *testing.T) {
	// enforce-001: Allow decision maps to 200 OK
	result := EnforceDecision(Allow, false)

	if result.StatusCode != http.StatusOK {
		t.Errorf("StatusCode = %d, want %d", result.StatusCode, http.StatusOK)
	}
	if !result.Allowed {
		t.Error("Allowed = false, want true")
	}
	if result.Challenge {
		t.Error("Challenge = true, want false")
	}
}

func TestEnforceDecision_Deny403(t *testing.T) {
	// enforce-002: Deny decision maps to 403 Forbidden
	result := EnforceDecision(Deny, false)

	if result.StatusCode != http.StatusForbidden {
		t.Errorf("StatusCode = %d, want %d", result.StatusCode, http.StatusForbidden)
	}
	if result.Allowed {
		t.Error("Allowed = true, want false")
	}
	if result.Challenge {
		t.Error("Challenge = true, want false")
	}
}

func TestEnforceDecision_ReviewNoReceipt402(t *testing.T) {
	// enforce-003: Review decision without receipt maps to 402 with WWW-Authenticate
	result := EnforceDecision(Review, false)

	if result.StatusCode != http.StatusPaymentRequired {
		t.Errorf("StatusCode = %d, want %d", result.StatusCode, http.StatusPaymentRequired)
	}
	if result.Allowed {
		t.Error("Allowed = true, want false")
	}
	if !result.Challenge {
		t.Error("Challenge = false, want true")
	}

	// Check WWW-Authenticate header
	wwwAuth := result.Headers.Get("WWW-Authenticate")
	expectedAuth := `PEAC realm="receipt", error="receipt_required"`
	if wwwAuth != expectedAuth {
		t.Errorf("WWW-Authenticate = %q, want %q", wwwAuth, expectedAuth)
	}
}

func TestEnforceDecision_ReviewWithReceipt200(t *testing.T) {
	// enforce-004: Review decision with verified receipt maps to 200 OK
	result := EnforceDecision(Review, true)

	if result.StatusCode != http.StatusOK {
		t.Errorf("StatusCode = %d, want %d", result.StatusCode, http.StatusOK)
	}
	if !result.Allowed {
		t.Error("Allowed = false, want true")
	}
	if result.Challenge {
		t.Error("Challenge = true, want false")
	}
}

func TestEnforceDecision_AllowWithReceipt200(t *testing.T) {
	// enforce-005: Allow with receipt still 200 (receipt is bonus)
	result := EnforceDecision(Allow, true)

	if result.StatusCode != http.StatusOK {
		t.Errorf("StatusCode = %d, want %d", result.StatusCode, http.StatusOK)
	}
	if !result.Allowed {
		t.Error("Allowed = false, want true")
	}
}

func TestEnforceDecision_DenyWithReceipt403(t *testing.T) {
	// enforce-006: Deny with receipt still 403 (receipt doesn't override deny)
	result := EnforceDecision(Deny, true)

	if result.StatusCode != http.StatusForbidden {
		t.Errorf("StatusCode = %d, want %d", result.StatusCode, http.StatusForbidden)
	}
	if result.Allowed {
		t.Error("Allowed = true, want false")
	}
}

// Additional enforcement tests

func TestEnforceDecision_UnknownDecision(t *testing.T) {
	// Unknown decisions default to deny (403)
	result := EnforceDecision(Decision("unknown"), false)

	if result.StatusCode != http.StatusForbidden {
		t.Errorf("StatusCode = %d, want %d (forbidden)", result.StatusCode, http.StatusForbidden)
	}
	if result.Allowed {
		t.Error("Allowed = true, want false")
	}
}

func TestEnforceResult(t *testing.T) {
	evalResult := &EvaluationResult{
		Decision: Review,
	}

	result := EnforceResult(evalResult, false)

	if result.StatusCode != http.StatusPaymentRequired {
		t.Errorf("StatusCode = %d, want %d", result.StatusCode, http.StatusPaymentRequired)
	}
}

func TestEvaluateAndEnforce(t *testing.T) {
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{Name: "review-all", Decision: Review},
		},
	}
	context := &EvaluationContext{}

	// Without receipt
	result := EvaluateAndEnforce(policy, context, false)
	if result.StatusCode != http.StatusPaymentRequired {
		t.Errorf("StatusCode = %d, want %d", result.StatusCode, http.StatusPaymentRequired)
	}

	// With receipt
	result = EvaluateAndEnforce(policy, context, true)
	if result.StatusCode != http.StatusOK {
		t.Errorf("StatusCode = %d, want %d", result.StatusCode, http.StatusOK)
	}
}
