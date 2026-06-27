package jws

import (
	"crypto/ed25519"
	"encoding/hex"
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

// ed25519SmallOrderPublicKeys lists the small-order public-key encodings
// rejected by the PEAC Ed25519 verification profile. A public key with small
// order admits trivial/forgeable signatures and is never produced by an honest
// signer.
//
// Provenance: this is a fixed, reviewed set of 11 small-order public-key
// encodings (canonical and non-canonical encodings of low-order Ed25519
// points). Only two of these encodings appear as public keys in the current
// ed25519-peac-profile corpus; the remaining entries are included so the
// profile rejects small-order public keys regardless of encoding. The list is
// duplicated byte-for-byte from the TypeScript reference verifier
// (packages/crypto/src/ed25519.ts) and is pinned by the shared corpus tests.
var ed25519SmallOrderPublicKeys = map[string]struct{}{
	"0100000000000000000000000000000000000000000000000000000000000000": {},
	"0000000000000000000000000000000000000000000000000000000000000000": {},
	"0000000000000000000000000000000000000000000000000000000000000080": {},
	"ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f": {},
	"ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff": {},
	"26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05": {},
	"26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85": {},
	"c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac0305": {},
	"c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac0385": {},
	"c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a": {},
	"c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa": {},
}

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
// Profile = cofactorless Ed25519 verification plus admissibility checks over the
// public inputs:
//  1. length: public key is 32 bytes, signature is 64 bytes;
//  2. reject small-order public keys (denylist above);
//  3. reject non-reduced scalars S >= L (RFC 8032 malleability guard);
//  4. cofactorless verification via crypto/ed25519.Verify.
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

	if _, smallOrder := ed25519SmallOrderPublicKeys[hex.EncodeToString(publicKey)]; smallOrder {
		return fmt.Errorf("small-order public key rejected")
	}

	if scalarFromSignature(signature).Cmp(ed25519GroupOrderL) >= 0 {
		return fmt.Errorf("non-canonical signature scalar (S >= L) rejected")
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
