// Package jws provides JWS parsing and verification for PEAC receipts.
package jws

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// ErrMissingKid is returned by ValidateHeader when the header has no kid. It is
// exported so a protocol-layer caller can classify a Wire 0.2 missing-kid failure
// distinctly (as E_JWS_MISSING_KID) without changing this generic, typ-agnostic
// layer. Accept and reject behavior is unchanged; this only makes the reason
// inspectable via errors.Is.
var ErrMissingKid = errors.New("missing key ID (kid) in header")

// Header represents a JWS header.
type Header struct {
	Algorithm   string `json:"alg"`
	Type        string `json:"typ,omitempty"`
	KeyID       string `json:"kid,omitempty"`
	ContentType string `json:"cty,omitempty"`
}

// ParsedJWS represents a parsed JWS.
type ParsedJWS struct {
	Header               Header
	HeaderRaw            []byte
	Payload              []byte
	Signature            []byte
	SigningInput         []byte
	CompactSerialization string
}

// Parse parses a JWS compact serialization.
func Parse(compact string) (*ParsedJWS, error) {
	parts := strings.Split(compact, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid JWS format: expected 3 parts, got %d", len(parts))
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("failed to decode header: %w", err)
	}

	var header Header
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, fmt.Errorf("failed to parse header: %w", err)
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("failed to decode payload: %w", err)
	}

	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, fmt.Errorf("failed to decode signature: %w", err)
	}

	signingInput := []byte(parts[0] + "." + parts[1])

	return &ParsedJWS{
		Header:               header,
		HeaderRaw:            headerBytes,
		Payload:              payload,
		Signature:            signature,
		SigningInput:         signingInput,
		CompactSerialization: compact,
	}, nil
}

// ValidateHeader validates the JWS header at the low level.
//
// This function is typ-agnostic: it accepts both interaction-record+jwt (current)
// and peac-receipt/0.1 (legacy). Format enforcement (requiring a specific typ)
// belongs in the protocol layer (VerifyLocal), not in the generic JWS helper.
func ValidateHeader(header Header) error {
	if header.Algorithm != "EdDSA" {
		return fmt.Errorf("unsupported algorithm: %s (expected EdDSA)", header.Algorithm)
	}

	// Accept known typ values or empty (typ-agnostic)
	if header.Type != "" &&
		header.Type != InteractionRecordTyp &&
		!strings.HasPrefix(header.Type, "peac-receipt/") {
		return fmt.Errorf("unsupported type: %s", header.Type)
	}

	if header.KeyID == "" {
		return ErrMissingKid
	}

	return nil
}

// IsWire02Typ reports whether typ identifies the PEAC Wire 0.2 profile. It is the
// single decision point so no alternate accepted spelling can bypass the Wire 0.2
// header rules; Go accepts only the compact form.
func IsWire02Typ(typ string) bool {
	return typ == InteractionRecordTyp
}

// Encode encodes data as base64url without padding.
func Encode(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

// Decode decodes base64url data without padding.
func Decode(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(s)
}
