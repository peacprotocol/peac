package jws

import (
	"bytes"
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

func TestNewSigningKeyFromSeed(t *testing.T) {
	// Generate a valid seed (32 bytes)
	_, privateKey, _ := ed25519.GenerateKey(nil)
	validSeed := privateKey.Seed()

	tests := []struct {
		name    string
		seed    []byte
		keyID   string
		wantErr bool
	}{
		{
			name:    "valid seed",
			seed:    validSeed,
			keyID:   "seed-key-001",
			wantErr: false,
		},
		{
			name:    "empty key ID",
			seed:    validSeed,
			keyID:   "",
			wantErr: true,
		},
		{
			name:    "seed too short",
			seed:    []byte("short"),
			keyID:   "key-001",
			wantErr: true,
		},
		{
			name:    "seed too long",
			seed:    make([]byte, 64),
			keyID:   "key-001",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key, err := NewSigningKeyFromSeed(tt.seed, tt.keyID)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewSigningKeyFromSeed() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && key == nil {
				t.Error("NewSigningKeyFromSeed() returned nil without error")
			}
		})
	}
}

func TestNewSigningKeyFromSeed_RoundTrip(t *testing.T) {
	// Create a key from seed
	seed := make([]byte, ed25519.SeedSize)
	for i := range seed {
		seed[i] = byte(i)
	}

	key, err := NewSigningKeyFromSeed(seed, "seed-test")
	if err != nil {
		t.Fatalf("NewSigningKeyFromSeed() error = %v", err)
	}

	// Sign some data
	payload := []byte(`{"test":"data"}`)
	jws, err := key.Sign(payload)
	if err != nil {
		t.Fatalf("Sign() error = %v", err)
	}

	// Parse and verify
	parsed, err := Parse(jws)
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}

	if err := VerifyJWS(parsed, key.PublicKey()); err != nil {
		t.Errorf("VerifyJWS() error = %v", err)
	}

	// Verify KeyID accessor
	if key.KeyID() != "seed-test" {
		t.Errorf("KeyID() = %s, want seed-test", key.KeyID())
	}
}

func TestSigningKey_KeyID(t *testing.T) {
	_, privateKey, _ := ed25519.GenerateKey(nil)
	key, _ := NewSigningKey(privateKey, "my-key-id")

	if got := key.KeyID(); got != "my-key-id" {
		t.Errorf("KeyID() = %s, want my-key-id", got)
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
	if parsed.Header.Type != DefaultReceiptTyp {
		t.Errorf("Type = %s, want %s", parsed.Header.Type, DefaultReceiptTyp)
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

	if key.KeyID() != "test-key" {
		t.Errorf("KeyID() = %s, want test-key", key.KeyID())
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

func TestGenerateSigningKey_EmptyKeyID(t *testing.T) {
	_, err := GenerateSigningKey("")
	if err == nil {
		t.Error("GenerateSigningKey() with empty keyID should error")
	}
}

func TestGenerateSigningKeyWithRand_Deterministic(t *testing.T) {
	// Use deterministic "random" source
	deterministicRand := bytes.NewReader(make([]byte, 64))

	key1, err := GenerateSigningKeyWithRand(deterministicRand, "det-key")
	if err != nil {
		t.Fatalf("GenerateSigningKeyWithRand() error = %v", err)
	}

	// Reset and generate again - should get same key
	deterministicRand = bytes.NewReader(make([]byte, 64))
	key2, err := GenerateSigningKeyWithRand(deterministicRand, "det-key")
	if err != nil {
		t.Fatalf("GenerateSigningKeyWithRand() error = %v", err)
	}

	// Public keys should match
	if !key1.PublicKey().Equal(key2.PublicKey()) {
		t.Error("Deterministic keygen should produce same keys")
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

// Header validation tests

func TestValidateHeader_UnsupportedAlgorithm(t *testing.T) {
	header := Header{
		Algorithm: "RS256",
		KeyID:     "key-001",
		Type:      "peac.receipt/0.9",
	}

	err := ValidateHeader(header)
	if err == nil {
		t.Error("ValidateHeader() should reject non-EdDSA algorithm")
	}
}

func TestValidateHeader_MissingKeyID(t *testing.T) {
	header := Header{
		Algorithm: "EdDSA",
		KeyID:     "",
		Type:      "peac.receipt/0.9",
	}

	err := ValidateHeader(header)
	if err == nil {
		t.Error("ValidateHeader() should reject missing key ID")
	}
}

func TestValidateHeader_InvalidType(t *testing.T) {
	header := Header{
		Algorithm: "EdDSA",
		KeyID:     "key-001",
		Type:      "invalid/type",
	}

	err := ValidateHeader(header)
	if err == nil {
		t.Error("ValidateHeader() should reject non-peac.receipt type")
	}
}

func TestValidateHeader_EmptyTypeAllowed(t *testing.T) {
	// Empty type should be allowed (omitted is valid)
	header := Header{
		Algorithm: "EdDSA",
		KeyID:     "key-001",
		Type:      "",
	}

	err := ValidateHeader(header)
	if err != nil {
		t.Errorf("ValidateHeader() should allow empty type, got error: %v", err)
	}
}

func TestValidateHeader_ValidPeacType(t *testing.T) {
	header := Header{
		Algorithm: "EdDSA",
		KeyID:     "key-001",
		Type:      "peac.receipt/0.9",
	}

	err := ValidateHeader(header)
	if err != nil {
		t.Errorf("ValidateHeader() error = %v", err)
	}
}

func TestDefaultReceiptTyp_Constant(t *testing.T) {
	if DefaultReceiptTyp != "peac.receipt/0.9" {
		t.Errorf("DefaultReceiptTyp = %s, want peac.receipt/0.9", DefaultReceiptTyp)
	}
}
