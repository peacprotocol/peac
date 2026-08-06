package jws

import (
	"crypto/ed25519"
	"fmt"
	"math/big"
)

// Ed25519PublicKey represents an Ed25519 public key.
type Ed25519PublicKey struct {
	Key ed25519.PublicKey
	KID string
}

// ed25519GroupOrderL is the Ed25519 group order L = 2^252 +
// 27742317777372353535851937790883648493. The signature scalar S (signature
// bytes 32..64, little-endian) must be reduced modulo L; S >= L is non-canonical
// and is rejected (RFC 8032 malleability guard).
var ed25519GroupOrderL, _ = new(big.Int).SetString(
	"1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed", 16)

// scalarFromSignature reads the signature scalar S (bytes 32..64,
// little-endian) as a big.Int.
func scalarFromSignature(signature []byte) *big.Int {
	le := signature[32:64]
	be := make([]byte, len(le))
	for i := range le {
		be[i] = le[len(le)-1-i]
	}
	return new(big.Int).SetBytes(be)
}

// VerifyEd25519 verifies an Ed25519 signature under the PEAC Ed25519
// verification profile.
//
// Profile = cofactorless Ed25519 verification plus bounded admissibility checks
// over the public inputs, applied in order:
//  1. length: public key is 32 bytes, signature is 64 bytes;
//  2. bounded admissibility precheck on the public key A;
//  3. reject non-reduced scalars S >= L (RFC 8032 malleability guard);
//  4. bounded admissibility precheck on the signature component R;
//  5. cofactorless verification via crypto/ed25519.Verify.
//
// "RFC 8032 strict" is not a single predicate: libraries differ on small-order
// points and cofactored-versus-cofactorless verification. Go's stdlib is
// cofactorless; the TypeScript reference verifier (packages/crypto/src/ed25519.ts)
// uses Web Crypto, which is also cofactorless, with the identical admissibility
// checks above, so both implementations accept and reject the same signatures
// across the shared edge-vector corpus
// (specs/conformance/parity-corpus/ed25519-peac-profile/).
func VerifyEd25519(publicKey ed25519.PublicKey, message, signature []byte) error {
	if len(publicKey) != ed25519.PublicKeySize {
		return fmt.Errorf("invalid public key size: expected %d, got %d", ed25519.PublicKeySize, len(publicKey))
	}

	if len(signature) != ed25519.SignatureSize {
		return fmt.Errorf("invalid signature size: expected %d, got %d", ed25519.SignatureSize, len(signature))
	}

	if reason := ed25519RejectionReason(ed25519PointFrom(publicKey)); reason != ed25519NoRejection {
		return fmt.Errorf("inadmissible public key encoding rejected: %s", reason)
	}

	if scalarFromSignature(signature).Cmp(ed25519GroupOrderL) >= 0 {
		return fmt.Errorf("non-canonical signature scalar (S >= L) rejected")
	}

	// The same bounded precheck on the signature component R. Reached only after the 64-byte
	// length check above, so this slice is always in range.
	if reason := ed25519RejectionReason(ed25519PointFrom(signature[:32])); reason != ed25519NoRejection {
		return fmt.Errorf("inadmissible signature R encoding rejected: %s", reason)
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
