// Package conformance provides cross-language conformance tests for the PEAC Go SDK.
//
// Wire 0.1 conformance tests have been removed as part of the Interaction Record
// rewrite. Interaction Record format (interaction-record+jwt) conformance vectors
// and cross-language golden vector tests ship in PR4 (Go tests + CI).
package conformance

import (
	"encoding/json"
	"testing"

	peac "github.com/peacprotocol/peac/sdks/go"
	"github.com/peacprotocol/peac/sdks/go/jws"
)

// TestInteractionRecordRoundtrip verifies that Issue() produces a JWS that
// can be parsed back into valid InteractionRecordClaims.
func TestInteractionRecordRoundtrip(t *testing.T) {
	key, err := jws.GenerateSigningKey("conformance-key-1")
	if err != nil {
		t.Fatal(err)
	}

	result, err := peac.Issue(peac.IssueOptions{
		Iss:        "https://conformance.example.com",
		Kind:       peac.KindEvidence,
		Type:       "org.peacprotocol/conformance-test",
		SigningKey: key,
		Pillars:    []string{"commerce", "access"},
		Extensions: map[string]any{
			"org.peacprotocol/commerce": map[string]any{
				"amount_minor": "500",
				"currency":     "USD",
			},
		},
	})
	if err != nil {
		t.Fatalf("Issue() failed: %v", err)
	}

	// Parse the JWS
	parsed, err := jws.Parse(result.JWS)
	if err != nil {
		t.Fatalf("Parse() failed: %v", err)
	}

	// Validate header
	if err := jws.ValidateHeader(parsed.Header); err != nil {
		t.Fatalf("ValidateHeader() failed: %v", err)
	}
	if parsed.Header.Type != peac.InteractionRecordTyp {
		t.Errorf("typ = %s, want %s", parsed.Header.Type, peac.InteractionRecordTyp)
	}

	// Unmarshal claims
	var claims peac.InteractionRecordClaims
	if err := json.Unmarshal(parsed.Payload, &claims); err != nil {
		t.Fatalf("Unmarshal claims failed: %v", err)
	}

	if claims.Iss != "https://conformance.example.com" {
		t.Errorf("iss = %s, want https://conformance.example.com", claims.Iss)
	}
	if claims.Kind != peac.KindEvidence {
		t.Errorf("kind = %s, want evidence", claims.Kind)
	}
	if claims.PeacVersion != peac.PeacVersion {
		t.Errorf("peac_version = %s, want %s", claims.PeacVersion, peac.PeacVersion)
	}
	if len(claims.Pillars) != 2 {
		t.Errorf("pillars length = %d, want 2", len(claims.Pillars))
	}
	if claims.Ext == nil {
		t.Fatal("expected extensions")
	}

	// Verify Ed25519 signature
	if err := jws.VerifyJWS(parsed, key.PublicKey()); err != nil {
		t.Fatalf("VerifyJWS() failed: %v", err)
	}
}
