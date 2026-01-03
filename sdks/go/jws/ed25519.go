package jws

import (
	"crypto/ed25519"
	"fmt"
)

// Ed25519PublicKey represents an Ed25519 public key.
type Ed25519PublicKey struct {
	Key ed25519.PublicKey
	KID string
}

// VerifyEd25519 verifies an Ed25519 signature.
func VerifyEd25519(publicKey ed25519.PublicKey, message, signature []byte) error {
	if len(publicKey) != ed25519.PublicKeySize {
		return fmt.Errorf("invalid public key size: expected %d, got %d", ed25519.PublicKeySize, len(publicKey))
	}

	if len(signature) != ed25519.SignatureSize {
		return fmt.Errorf("invalid signature size: expected %d, got %d", ed25519.SignatureSize, len(signature))
	}

	if !ed25519.Verify(publicKey, message, signature) {
		return fmt.Errorf("signature verification failed")
	}

	return nil
}

// VerifyJWS verifies a JWS using Ed25519.
func VerifyJWS(jws *ParsedJWS, publicKey ed25519.PublicKey) error {
	if jws.Header.Algorithm != "EdDSA" {
		return fmt.Errorf("unsupported algorithm: %s", jws.Header.Algorithm)
	}

	return VerifyEd25519(publicKey, jws.SigningInput, jws.Signature)
}

// ParsePublicKeyFromBytes parses an Ed25519 public key from raw bytes.
func ParsePublicKeyFromBytes(data []byte) (ed25519.PublicKey, error) {
	if len(data) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("invalid public key size: expected %d, got %d", ed25519.PublicKeySize, len(data))
	}
	return ed25519.PublicKey(data), nil
}
