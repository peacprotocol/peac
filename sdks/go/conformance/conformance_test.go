// Package conformance provides conformance tests for the PEAC Go SDK.
package conformance

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	peac "github.com/peacprotocol/peac-go"
	"github.com/peacprotocol/peac-go/jws"
)

// TestJWSParsing tests JWS parsing functionality.
func TestJWSParsing(t *testing.T) {
	// Test valid JWS structure (not signature verification)
	testCases := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{
			name:    "valid 3-part JWS",
			input:   "eyJhbGciOiJFZERTQSIsImtpZCI6InRlc3Qta2V5In0.eyJpc3MiOiJ0ZXN0In0.c2lnbmF0dXJl",
			wantErr: false,
		},
		{
			name:    "invalid 2-part",
			input:   "eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0",
			wantErr: true,
		},
		{
			name:    "invalid 4-part",
			input:   "a.b.c.d",
			wantErr: true,
		},
		{
			name:    "empty string",
			input:   "",
			wantErr: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := jws.Parse(tc.input)
			if (err != nil) != tc.wantErr {
				t.Errorf("Parse() error = %v, wantErr %v", err, tc.wantErr)
			}
		})
	}
}

// TestHeaderValidation tests JWS header validation.
func TestHeaderValidation(t *testing.T) {
	testCases := []struct {
		name    string
		header  jws.Header
		wantErr bool
	}{
		{
			name: "valid EdDSA header",
			header: jws.Header{
				Algorithm: "EdDSA",
				Type:      "peac.receipt/0.9",
				KeyID:     "test-key",
			},
			wantErr: false,
		},
		{
			name: "unsupported algorithm",
			header: jws.Header{
				Algorithm: "RS256",
				KeyID:     "test-key",
			},
			wantErr: true,
		},
		{
			name: "missing key ID",
			header: jws.Header{
				Algorithm: "EdDSA",
			},
			wantErr: true,
		},
		{
			name: "invalid type",
			header: jws.Header{
				Algorithm: "EdDSA",
				Type:      "jwt",
				KeyID:     "test-key",
			},
			wantErr: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := jws.ValidateHeader(tc.header)
			if (err != nil) != tc.wantErr {
				t.Errorf("ValidateHeader() error = %v, wantErr %v", err, tc.wantErr)
			}
		})
	}
}

// TestErrorCodes tests error code values.
func TestErrorCodes(t *testing.T) {
	codes := []peac.ErrorCode{
		peac.ErrInvalidSignature,
		peac.ErrInvalidFormat,
		peac.ErrExpired,
		peac.ErrNotYetValid,
		peac.ErrInvalidIssuer,
		peac.ErrInvalidAudience,
		peac.ErrJWKSFetchFailed,
		peac.ErrKeyNotFound,
		peac.ErrIdentityMissing,
		peac.ErrIdentityInvalidFormat,
		peac.ErrIdentityExpired,
		peac.ErrIdentityNotYetValid,
		peac.ErrIdentitySigInvalid,
		peac.ErrIdentityKeyUnknown,
		peac.ErrIdentityKeyExpired,
		peac.ErrIdentityKeyRevoked,
		peac.ErrIdentityBindingMismatch,
		peac.ErrIdentityBindingStale,
		peac.ErrIdentityBindingFuture,
		peac.ErrIdentityProofUnsupported,
		peac.ErrIdentityDirectoryUnavailable,
	}

	for _, code := range codes {
		if code == "" {
			t.Errorf("Error code should not be empty")
		}
	}
}

// TestPEACErrorMethods tests PEACError methods.
func TestPEACErrorMethods(t *testing.T) {
	err := peac.NewPEACError(peac.ErrInvalidSignature, "test message")

	if err.Error() != "E_INVALID_SIGNATURE: test message" {
		t.Errorf("Error() = %v, want 'E_INVALID_SIGNATURE: test message'", err.Error())
	}

	if err.HTTPStatus() != 400 {
		t.Errorf("HTTPStatus() = %v, want 400", err.HTTPStatus())
	}

	if err.IsRetriable() {
		t.Error("IsRetriable() should be false for ErrInvalidSignature")
	}

	err = err.WithDetail("key", "value")
	if err.Details["key"] != "value" {
		t.Error("WithDetail() should add detail")
	}
}

// TestRetriableErrors tests which errors are retriable.
func TestRetriableErrors(t *testing.T) {
	retriable := []peac.ErrorCode{
		peac.ErrNotYetValid,
		peac.ErrJWKSFetchFailed,
		peac.ErrIdentityNotYetValid,
		peac.ErrIdentityKeyUnknown,
		peac.ErrIdentityBindingStale,
		peac.ErrIdentityDirectoryUnavailable,
	}

	notRetriable := []peac.ErrorCode{
		peac.ErrInvalidSignature,
		peac.ErrInvalidFormat,
		peac.ErrExpired,
		peac.ErrInvalidIssuer,
		peac.ErrIdentityMissing,
		peac.ErrIdentitySigInvalid,
	}

	for _, code := range retriable {
		err := peac.NewPEACError(code, "test")
		if !err.IsRetriable() {
			t.Errorf("%s should be retriable", code)
		}
	}

	for _, code := range notRetriable {
		err := peac.NewPEACError(code, "test")
		if err.IsRetriable() {
			t.Errorf("%s should not be retriable", code)
		}
	}
}

// TestClaimsUnmarshal tests claims unmarshalling.
func TestClaimsUnmarshal(t *testing.T) {
	jsonData := `{
		"iss": "https://publisher.example",
		"sub": "user:123",
		"aud": ["https://agent.example"],
		"iat": 1704067200,
		"exp": 1704070800,
		"jti": "receipt-001",
		"receipt_id": "rcpt_abc123",
		"purpose_declared": ["inference", "search"],
		"purpose_enforced": "inference",
		"decision": "allow"
	}`

	var claims peac.PEACReceiptClaims
	if err := json.Unmarshal([]byte(jsonData), &claims); err != nil {
		t.Fatalf("Failed to unmarshal claims: %v", err)
	}

	if claims.Issuer != "https://publisher.example" {
		t.Errorf("Issuer = %v, want 'https://publisher.example'", claims.Issuer)
	}

	if claims.ReceiptID != "rcpt_abc123" {
		t.Errorf("ReceiptID = %v, want 'rcpt_abc123'", claims.ReceiptID)
	}

	if len(claims.PurposeDeclared) != 2 {
		t.Errorf("PurposeDeclared length = %d, want 2", len(claims.PurposeDeclared))
	}

	if claims.PurposeEnforced != "inference" {
		t.Errorf("PurposeEnforced = %v, want 'inference'", claims.PurposeEnforced)
	}
}

// TestAgentIdentityEvidence tests agent identity evidence unmarshalling.
func TestAgentIdentityEvidence(t *testing.T) {
	jsonData := `{
		"agent_id": "bot:crawler-001",
		"control_type": "operator",
		"capabilities": ["crawl", "index"],
		"operator": "Example Corp",
		"proof": {
			"method": "http-message-signature",
			"key_id": "key-2026-01",
			"alg": "EdDSA"
		}
	}`

	var evidence peac.AgentIdentityEvidence
	if err := json.Unmarshal([]byte(jsonData), &evidence); err != nil {
		t.Fatalf("Failed to unmarshal evidence: %v", err)
	}

	if evidence.AgentID != "bot:crawler-001" {
		t.Errorf("AgentID = %v, want 'bot:crawler-001'", evidence.AgentID)
	}

	if evidence.ControlType != "operator" {
		t.Errorf("ControlType = %v, want 'operator'", evidence.ControlType)
	}

	if evidence.Proof == nil {
		t.Fatal("Proof should not be nil")
	}

	if evidence.Proof.Method != "http-message-signature" {
		t.Errorf("Proof.Method = %v, want 'http-message-signature'", evidence.Proof.Method)
	}
}

// TestAgentIdentityGoldenVectors loads and validates agent identity golden vectors.
func TestAgentIdentityGoldenVectors(t *testing.T) {
	// Path to golden vectors
	vectorsPath := filepath.Join("..", "..", "..", "specs", "conformance", "fixtures", "agent-identity")

	// Check if vectors exist
	if _, err := os.Stat(vectorsPath); os.IsNotExist(err) {
		t.Skip("Golden vectors not found at", vectorsPath)
	}

	// Load valid.json
	validPath := filepath.Join(vectorsPath, "valid.json")
	validData, err := os.ReadFile(validPath)
	if err != nil {
		t.Skipf("Could not read valid.json: %v", err)
	}

	var validFixtures struct {
		Description string `json:"description"`
		Version     string `json:"version"`
		Fixtures    []struct {
			ID          string          `json:"id"`
			Description string          `json:"description"`
			Input       json.RawMessage `json:"input"`
			Expected    struct {
				Valid       bool   `json:"valid"`
				AgentID     string `json:"agent_id,omitempty"`
				ControlType string `json:"control_type,omitempty"`
			} `json:"expected"`
		} `json:"fixtures"`
	}

	if err := json.Unmarshal(validData, &validFixtures); err != nil {
		t.Fatalf("Failed to parse valid.json: %v", err)
	}

	t.Logf("Loaded %d valid fixtures from %s", len(validFixtures.Fixtures), validFixtures.Version)

	for _, fixture := range validFixtures.Fixtures {
		t.Run(fixture.ID, func(t *testing.T) {
			if !fixture.Expected.Valid {
				t.Errorf("Fixture %s expected to be valid but marked as invalid", fixture.ID)
			}

			// Parse the attestation
			var attestation struct {
				Type     string                    `json:"type"`
				Evidence peac.AgentIdentityEvidence `json:"evidence"`
			}

			if err := json.Unmarshal(fixture.Input, &attestation); err != nil {
				t.Errorf("Failed to parse fixture %s: %v", fixture.ID, err)
				return
			}

			// Validate expected values
			if fixture.Expected.AgentID != "" && attestation.Evidence.AgentID != fixture.Expected.AgentID {
				t.Errorf("AgentID = %v, want %v", attestation.Evidence.AgentID, fixture.Expected.AgentID)
			}

			if fixture.Expected.ControlType != "" && attestation.Evidence.ControlType != fixture.Expected.ControlType {
				t.Errorf("ControlType = %v, want %v", attestation.Evidence.ControlType, fixture.Expected.ControlType)
			}
		})
	}
}
