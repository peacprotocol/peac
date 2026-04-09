// Package jws provides JWS parsing and verification for PEAC receipts.
package jws

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
)

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
		return fmt.Errorf("missing key ID (kid) in header")
	}

	return nil
}

// Encode encodes data as base64url without padding.
func Encode(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

// Decode decodes base64url data without padding.
func Decode(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(s)
}
