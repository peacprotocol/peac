package jws

import (
	"crypto/ed25519"
	"encoding/json"
	"testing"
)

func TestNewSigningKey(t *testing.T) {
	_, privateKey, _ := ed25519.GenerateKey(nil)

	tests := []struct {
		name       string
		privateKey ed25519.PrivateKey
		keyID      string
		wantErr    bool
	}{
		{
			name:       "valid key",
			privateKey: privateKey,
			keyID:      "key-001",
			wantErr:    false,
		},
		{
			name:       "empty key ID",
			privateKey: privateKey,
			keyID:      "",
			wantErr:    true,
		},
		{
			name:       "invalid private key size",
			privateKey: []byte("too-short"),
			keyID:      "key-001",
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key, err := NewSigningKey(tt.privateKey, tt.keyID)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewSigningKey() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && key == nil {
				t.Error("NewSigningKey() returned nil without error")
			}
		})
	}
}

func TestSigningKey_PublicKey(t *testing.T) {
	publicKey, privateKey, _ := ed25519.GenerateKey(nil)
	key, _ := NewSigningKey(privateKey, "key-001")

	got := key.PublicKey()
	if !got.Equal(publicKey) {
		t.Error("PublicKey() does not match expected")
	}
}

func TestSigningKey_Sign(t *testing.T) {
	_, privateKey, _ := ed25519.GenerateKey(nil)
	key, _ := NewSigningKey(privateKey, "key-001")

	payload := []byte(`{"iss":"https://example.com","iat":1234567890}`)

	jws, err := key.Sign(payload)
	if err != nil {
		t.Fatalf("Sign() error = %v", err)
	}

	// Parse and verify the JWS
	parsed, err := Parse(jws)
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}

	// Check header
	if parsed.Header.Algorithm != "EdDSA" {
		t.Errorf("Algorithm = %s, want EdDSA", parsed.Header.Algorithm)
	}
	if parsed.Header.Type != "peac.receipt/0.9" {
		t.Errorf("Type = %s, want peac.receipt/0.9", parsed.Header.Type)
	}
	if parsed.Header.KeyID != "key-001" {
		t.Errorf("KeyID = %s, want key-001", parsed.Header.KeyID)
	}

	// Verify signature
	if err := VerifyJWS(parsed, key.PublicKey()); err != nil {
		t.Errorf("VerifyJWS() error = %v", err)
	}
}

func TestSigningKey_SignWithType(t *testing.T) {
	_, privateKey, _ := ed25519.GenerateKey(nil)
	key, _ := NewSigningKey(privateKey, "key-001")

	payload := []byte(`{"test":"data"}`)

	jws, err := key.SignWithType(payload, "custom/type")
	if err != nil {
		t.Fatalf("SignWithType() error = %v", err)
	}

	parsed, err := Parse(jws)
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}

	if parsed.Header.Type != "custom/type" {
		t.Errorf("Type = %s, want custom/type", parsed.Header.Type)
	}
}

func TestSigningKey_SignClaims(t *testing.T) {
	_, privateKey, _ := ed25519.GenerateKey(nil)
	key, _ := NewSigningKey(privateKey, "key-001")

	claims := map[string]any{
		"iss": "https://example.com",
		"aud": []string{"https://agent.example"},
		"iat": 1234567890,
	}

	jws, err := key.SignClaims(claims)
	if err != nil {
		t.Fatalf("SignClaims() error = %v", err)
	}

	parsed, err := Parse(jws)
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}

	// Verify payload matches
	var parsedClaims map[string]any
	if err := json.Unmarshal(parsed.Payload, &parsedClaims); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if parsedClaims["iss"] != "https://example.com" {
		t.Errorf("iss = %v, want https://example.com", parsedClaims["iss"])
	}
}

func TestGenerateSigningKey(t *testing.T) {
	key, err := GenerateSigningKey("test-key")
	if err != nil {
		t.Fatalf("GenerateSigningKey() error = %v", err)
	}

	if key.KeyID != "test-key" {
		t.Errorf("KeyID = %s, want test-key", key.KeyID)
	}

	if len(key.PrivateKey) != ed25519.PrivateKeySize {
		t.Errorf("PrivateKey size = %d, want %d", len(key.PrivateKey), ed25519.PrivateKeySize)
	}

	// Should be able to sign and verify
	payload := []byte(`{"test":"data"}`)
	jws, err := key.Sign(payload)
	if err != nil {
		t.Fatalf("Sign() error = %v", err)
	}

	parsed, err := Parse(jws)
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}

	if err := VerifyJWS(parsed, key.PublicKey()); err != nil {
		t.Errorf("VerifyJWS() error = %v", err)
	}
}

func TestSignAndVerify_RoundTrip(t *testing.T) {
	// Generate key pair
	key, err := GenerateSigningKey("roundtrip-key")
	if err != nil {
		t.Fatalf("GenerateSigningKey() error = %v", err)
	}

	// Create claims
	claims := map[string]any{
		"iss":        "https://publisher.example",
		"aud":        []string{"https://agent.example"},
		"iat":        1736553600,
		"receipt_id": "test-receipt-001",
	}

	// Sign
	jws, err := key.SignClaims(claims)
	if err != nil {
		t.Fatalf("SignClaims() error = %v", err)
	}

	// Parse
	parsed, err := Parse(jws)
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}

	// Validate header
	if err := ValidateHeader(parsed.Header); err != nil {
		t.Errorf("ValidateHeader() error = %v", err)
	}

	// Verify signature
	if err := VerifyJWS(parsed, key.PublicKey()); err != nil {
		t.Errorf("VerifyJWS() error = %v", err)
	}

	// Check payload
	var parsedClaims map[string]any
	if err := json.Unmarshal(parsed.Payload, &parsedClaims); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if parsedClaims["receipt_id"] != "test-receipt-001" {
		t.Errorf("receipt_id = %v, want test-receipt-001", parsedClaims["receipt_id"])
	}
}

func TestSigningKey_DifferentKeysProduceDifferentSignatures(t *testing.T) {
	key1, _ := GenerateSigningKey("key-1")
	key2, _ := GenerateSigningKey("key-2")

	payload := []byte(`{"test":"data"}`)

	jws1, _ := key1.Sign(payload)
	jws2, _ := key2.Sign(payload)

	parsed1, _ := Parse(jws1)
	parsed2, _ := Parse(jws2)

	// Signatures should be different
	if string(parsed1.Signature) == string(parsed2.Signature) {
		t.Error("Different keys should produce different signatures")
	}

	// Cross-verification should fail
	if err := VerifyJWS(parsed1, key2.PublicKey()); err == nil {
		t.Error("Verification with wrong key should fail")
	}
	if err := VerifyJWS(parsed2, key1.PublicKey()); err == nil {
		t.Error("Verification with wrong key should fail")
	}
}
