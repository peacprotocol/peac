package jws

import (
	"crypto/ed25519"
	"encoding/json"
	"fmt"
	"io"
)

// DefaultReceiptTyp is the default JWS type header for PEAC receipts.
// Normalized in v0.10.0 to peac-<artifact>/<major>.<minor> pattern.
const DefaultReceiptTyp = "peac-receipt/0.1"

// SigningKey represents an Ed25519 private key for signing JWS.
// This type clearly indicates a key used for signing (private key),
// distinct from verification keys (public keys).
//
// Fields are unexported to prevent accidental logging or mutation.
// Use the accessor methods to retrieve key information.
type SigningKey struct {
	privateKey ed25519.PrivateKey
	keyID      string
}

// NewSigningKey creates a SigningKey from an Ed25519 private key (64 bytes) and key ID.
// The private key must be exactly 64 bytes (32-byte seed + 32-byte public key).
// For 32-byte seeds, use NewSigningKeyFromSeed instead.
func NewSigningKey(privateKey ed25519.PrivateKey, keyID string) (*SigningKey, error) {
	if len(privateKey) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("invalid private key size: expected %d, got %d",
			ed25519.PrivateKeySize, len(privateKey))
	}
	if keyID == "" {
		return nil, fmt.Errorf("key ID is required")
	}
	return &SigningKey{
		privateKey: privateKey,
		keyID:      keyID,
	}, nil
}

// NewSigningKeyFromSeed creates a SigningKey from a 32-byte Ed25519 seed.
// This is useful when keys are stored as seeds rather than full private keys.
func NewSigningKeyFromSeed(seed []byte, keyID string) (*SigningKey, error) {
	if len(seed) != ed25519.SeedSize {
		return nil, fmt.Errorf("invalid seed size: expected %d, got %d",
			ed25519.SeedSize, len(seed))
	}
	if keyID == "" {
		return nil, fmt.Errorf("key ID is required")
	}
	privateKey := ed25519.NewKeyFromSeed(seed)
	return &SigningKey{
		privateKey: privateKey,
		keyID:      keyID,
	}, nil
}

// KeyID returns the key identifier for this signing key.
func (k *SigningKey) KeyID() string {
	return k.keyID
}

// PublicKey returns the public key corresponding to this signing key.
func (k *SigningKey) PublicKey() ed25519.PublicKey {
	return k.privateKey.Public().(ed25519.PublicKey)
}

// Sign creates a JWS compact serialization for the given payload.
// The typ header is set to DefaultReceiptTyp ("peac-receipt/0.1").
func (k *SigningKey) Sign(payload []byte) (string, error) {
	return k.SignWithType(payload, DefaultReceiptTyp)
}

// SignWithType creates a JWS compact serialization with a custom type header.
func (k *SigningKey) SignWithType(payload []byte, typ string) (string, error) {
	header := Header{
		Algorithm: "EdDSA",
		Type:      typ,
		KeyID:     k.keyID,
	}

	headerBytes, err := json.Marshal(header)
	if err != nil {
		return "", fmt.Errorf("failed to marshal header: %w", err)
	}

	headerB64 := Encode(headerBytes)
	payloadB64 := Encode(payload)

	signingInput := headerB64 + "." + payloadB64
	signature := ed25519.Sign(k.privateKey, []byte(signingInput))

	return signingInput + "." + Encode(signature), nil
}

// SignClaims marshals claims to JSON and signs them.
func (k *SigningKey) SignClaims(claims any) (string, error) {
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("failed to marshal claims: %w", err)
	}
	return k.Sign(payload)
}

// GenerateSigningKey generates a new Ed25519 signing key pair using crypto/rand.
// The keyID should be a unique identifier for key management.
func GenerateSigningKey(keyID string) (*SigningKey, error) {
	return GenerateSigningKeyWithRand(nil, keyID)
}

// GenerateSigningKeyWithRand generates a new Ed25519 signing key pair using the provided
// random source. If rand is nil, crypto/rand.Reader is used.
// Use a deterministic reader for reproducible test keys.
func GenerateSigningKeyWithRand(rand io.Reader, keyID string) (*SigningKey, error) {
	if keyID == "" {
		return nil, fmt.Errorf("key ID is required")
	}
	_, privateKey, err := ed25519.GenerateKey(rand)
	if err != nil {
		return nil, fmt.Errorf("failed to generate key pair: %w", err)
	}
	return &SigningKey{
		privateKey: privateKey,
		keyID:      keyID,
	}, nil
}
