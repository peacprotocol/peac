package peac

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// fixturesDir returns the path to cross-language golden vectors.
func fixturesDir(t *testing.T) string {
	t.Helper()
	dir := filepath.Join("..", "..", "specs", "conformance", "fixtures", "go-interaction-record")
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		t.Fatalf("Cross-language fixtures not found at %s; these are mandatory committed artifacts", dir)
	}
	return dir
}

// TestCrossLang_JCSParity verifies Go JCS produces identical bytes to TypeScript.
func TestCrossLang_JCSParity(t *testing.T) {
	dir := fixturesDir(t)
	data, err := os.ReadFile(filepath.Join(dir, "jcs-golden-vectors.json"))
	if err != nil {
		t.Fatalf("jcs-golden-vectors.json not found; mandatory committed fixture")
	}

	var fixture struct {
		Vectors []struct {
			ID          string `json:"id"`
			Description string `json:"description"`
			Input       any    `json:"input"`
			Canonical   string `json:"canonical"`
		} `json:"vectors"`
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatalf("Failed to parse JCS vectors: %v", err)
	}

	for _, v := range fixture.Vectors {
		t.Run(v.ID, func(t *testing.T) {
			// Re-serialize the input through Go's JSON marshaler
			inputBytes, err := json.Marshal(v.Input)
			if err != nil {
				t.Fatalf("Failed to marshal input: %v", err)
			}

			got, err := Canonicalize(inputBytes)
			if err != nil {
				t.Fatalf("Canonicalize failed: %v", err)
			}

			if string(got) != v.Canonical {
				t.Errorf("JCS parity failure\n  input:    %s\n  got:      %s\n  expected: %s",
					string(inputBytes), string(got), v.Canonical)
			}
		})
	}
}

// TestCrossLang_VerifyTSIssuedReceipt verifies a TypeScript-issued receipt in Go.
func TestCrossLang_VerifyTSIssuedReceipt(t *testing.T) {
	dir := fixturesDir(t)
	data, err := os.ReadFile(filepath.Join(dir, "ts-issued-receipt.json"))
	if err != nil {
		t.Fatalf("ts-issued-receipt.json not found; mandatory committed fixture")
	}

	var fixture struct {
		JWS             string `json:"jws"`
		PublicKeyB64URL string `json:"public_key_b64url"`
		Expected        struct {
			Valid       bool   `json:"valid"`
			Iss         string `json:"iss"`
			Kind        string `json:"kind"`
			Type        string `json:"type"`
			Kid         string `json:"kid"`
			WireVersion string `json:"wire_version"`
		} `json:"expected"`
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatalf("Failed to parse receipt fixture: %v", err)
	}

	pubKeyBytes, err := base64.RawURLEncoding.DecodeString(fixture.PublicKeyB64URL)
	if err != nil {
		t.Fatalf("Failed to decode public key: %v", err)
	}

	result := VerifyLocal(fixture.JWS, VerifyLocalOptions{
		PublicKey: ed25519.PublicKey(pubKeyBytes),
	})

	if !result.Valid {
		t.Fatalf("Expected valid, got error: %s: %s", result.ErrorCode, result.ErrorMessage)
	}
	if result.Claims.Iss != fixture.Expected.Iss {
		t.Errorf("iss = %s, want %s", result.Claims.Iss, fixture.Expected.Iss)
	}
	if result.Claims.Kind != fixture.Expected.Kind {
		t.Errorf("kind = %s, want %s", result.Claims.Kind, fixture.Expected.Kind)
	}
	if result.Claims.Type != fixture.Expected.Type {
		t.Errorf("type = %s, want %s", result.Claims.Type, fixture.Expected.Type)
	}
	if result.Kid != fixture.Expected.Kid {
		t.Errorf("kid = %s, want %s", result.Kid, fixture.Expected.Kid)
	}
	if result.WireVersion != fixture.Expected.WireVersion {
		t.Errorf("wire_version = %s, want %s", result.WireVersion, fixture.Expected.WireVersion)
	}
}

// TestCrossLang_PolicyBindingParity verifies policy binding with TypeScript-issued vector.
func TestCrossLang_PolicyBindingParity(t *testing.T) {
	dir := fixturesDir(t)
	data, err := os.ReadFile(filepath.Join(dir, "policy-binding-vector.json"))
	if err != nil {
		t.Fatalf("policy-binding-vector.json not found; mandatory committed fixture")
	}

	var fixture struct {
		JWS             string `json:"jws"`
		PublicKeyB64URL string `json:"public_key_b64url"`
		PolicyJSON      string `json:"policy_json"`
		ExpectedDigest  string `json:"expected_digest"`
		ExpectedBinding string `json:"expected_binding"`
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatalf("Failed to parse policy binding fixture: %v", err)
	}

	// Verify the Go JCS hash matches the TypeScript-computed digest
	goDigest, err := JCSHash([]byte(fixture.PolicyJSON))
	if err != nil {
		t.Fatalf("JCSHash failed: %v", err)
	}
	if goDigest != fixture.ExpectedDigest {
		t.Errorf("Policy digest mismatch\n  go:       %s\n  expected: %s", goDigest, fixture.ExpectedDigest)
	}

	// Verify the receipt with policy binding
	pubKeyBytes, err := base64.RawURLEncoding.DecodeString(fixture.PublicKeyB64URL)
	if err != nil {
		t.Fatalf("Failed to decode public key: %v", err)
	}

	result := VerifyLocal(fixture.JWS, VerifyLocalOptions{
		PublicKey:   ed25519.PublicKey(pubKeyBytes),
		PolicyBytes: []byte(fixture.PolicyJSON),
	})

	if !result.Valid {
		t.Fatalf("Expected valid, got error: %s: %s", result.ErrorCode, result.ErrorMessage)
	}
	if string(result.PolicyBinding) != fixture.ExpectedBinding {
		t.Errorf("policy_binding = %s, want %s", result.PolicyBinding, fixture.ExpectedBinding)
	}
}

// TestCrossLang_TrailingGarbageRejection verifies Canonicalize rejects trailing data.
func TestCrossLang_TrailingGarbageRejection(t *testing.T) {
	// Valid JSON followed by non-whitespace garbage must be rejected
	rejectInputs := []string{
		`{"a":1}extra`,
		`[1,2]trailing`,
		`"hello"garbage`,
		`123abc`,
	}

	for _, input := range rejectInputs {
		_, err := Canonicalize([]byte(input))
		if err == nil {
			t.Errorf("Input %q: expected rejection, got nil error", input)
		}
	}

	// Valid JSON followed by only whitespace must be accepted
	acceptInputs := []string{
		`{"a":1}`,
		`{"a":1}  `,
		`{"a":1}` + "\n",
		`{"a":1}` + "\t\n ",
	}

	for _, input := range acceptInputs {
		_, err := Canonicalize([]byte(input))
		if err != nil {
			t.Errorf("Input %q: expected acceptance, got error: %v", input, err)
		}
	}
}
