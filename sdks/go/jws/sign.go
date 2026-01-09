package jws

import (
	"crypto/ed25519"
	"encoding/json"
	"fmt"
)

// SigningKey represents an Ed25519 private key for signing JWS.
// This type clearly indicates a key used for signing (private key),
// distinct from verification keys (public keys).
type SigningKey struct {
	// PrivateKey is the Ed25519 private key (64 bytes: 32-byte seed + 32-byte public).
	PrivateKey ed25519.PrivateKey

	// KeyID is the key identifier included in the JWS header.
	KeyID string
}

// NewSigningKey creates a SigningKey from an Ed25519 private key and key ID.
// Returns an error if the private key is invalid.
func NewSigningKey(privateKey ed25519.PrivateKey, keyID string) (*SigningKey, error) {
	if len(privateKey) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("invalid private key size: expected %d, got %d",
			ed25519.PrivateKeySize, len(privateKey))
	}
	if keyID == "" {
		return nil, fmt.Errorf("key ID is required")
	}
	return &SigningKey{
		PrivateKey: privateKey,
		KeyID:      keyID,
	}, nil
}

// PublicKey returns the public key corresponding to this signing key.
func (k *SigningKey) PublicKey() ed25519.PublicKey {
	return k.PrivateKey.Public().(ed25519.PublicKey)
}

// Sign creates a JWS compact serialization for the given payload.
// The typ header is set to "peac.receipt/0.9" by default.
func (k *SigningKey) Sign(payload []byte) (string, error) {
	return k.SignWithType(payload, "peac.receipt/0.9")
}

// SignWithType creates a JWS compact serialization with a custom type header.
func (k *SigningKey) SignWithType(payload []byte, typ string) (string, error) {
	header := Header{
		Algorithm: "EdDSA",
		Type:      typ,
		KeyID:     k.KeyID,
	}

	headerBytes, err := json.Marshal(header)
	if err != nil {
		return "", fmt.Errorf("failed to marshal header: %w", err)
	}

	headerB64 := Encode(headerBytes)
	payloadB64 := Encode(payload)

	signingInput := headerB64 + "." + payloadB64
	signature := ed25519.Sign(k.PrivateKey, []byte(signingInput))

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

// GenerateSigningKey generates a new Ed25519 signing key pair.
// The keyID should be a unique identifier for key management.
func GenerateSigningKey(keyID string) (*SigningKey, error) {
	_, privateKey, err := ed25519.GenerateKey(nil)
	if err != nil {
		return nil, fmt.Errorf("failed to generate key pair: %w", err)
	}
	return NewSigningKey(privateKey, keyID)
}
