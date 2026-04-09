package peac

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/peacprotocol/peac/sdks/go/jws"
)

// VerifyLocalOptions contains options for local interaction record verification.
type VerifyLocalOptions struct {
	// PublicKey is the Ed25519 public key (32 bytes, required).
	PublicKey ed25519.PublicKey

	// Issuer is the expected issuer URI (optional; if set, iss must match).
	Issuer string

	// MaxClockSkew is the tolerance for clock differences (default: 30 seconds).
	MaxClockSkew time.Duration

	// RequireExp requires the exp claim to be present.
	RequireExp bool

	// PolicyBytes is the local policy document for binding check (optional).
	// When provided, the policy digest is computed via JCS + SHA-256 and
	// compared with claims.Peac.Digest.
	PolicyBytes []byte
}

// VerifyLocalResult contains the result of local interaction record verification.
type VerifyLocalResult struct {
	// Valid indicates whether the receipt passed all verification checks.
	Valid bool

	// Claims contains the verified interaction record claims (nil if invalid).
	Claims *InteractionRecordClaims

	// Kid is the key ID from the JWS header.
	Kid string

	// Algorithm is always "EdDSA" for Ed25519.
	Algorithm string

	// Warnings contains non-fatal verification warnings.
	Warnings []VerificationWarning

	// PolicyBinding is the three-state policy binding result.
	PolicyBinding PolicyBindingStatus

	// WireVersion is the wire format version ("0.2").
	WireVersion string

	// ReceiptRef is the receipt reference ("sha256:<hex>" of compact JWS bytes).
	ReceiptRef string

	// Error details (populated only when Valid is false).
	ErrorCode    string
	ErrorMessage string
}

// VerificationWarning represents a non-fatal verification warning.
type VerificationWarning struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Pointer string `json:"pointer,omitempty"`
}

// VerifyLocal verifies a signed interaction record locally with a provided public key.
//
// Enforces the current stable Interaction Record format (interaction-record+jwt)
// at the protocol layer. The underlying jws/ package remains typ-agnostic.
func VerifyLocal(receiptJWS string, opts VerifyLocalOptions) *VerifyLocalResult {
	result := &VerifyLocalResult{
		Algorithm:     "EdDSA",
		WireVersion:   PeacVersion,
		PolicyBinding: PolicyBindingUnavailable,
	}

	// Compute receipt_ref
	h := sha256.Sum256([]byte(receiptJWS))
	result.ReceiptRef = "sha256:" + hex.EncodeToString(h[:])

	// Parse JWS
	parsed, err := jws.Parse(receiptJWS)
	if err != nil {
		result.ErrorCode = "E_INVALID_FORMAT"
		result.ErrorMessage = fmt.Sprintf("invalid JWS: %v", err)
		return result
	}

	// Low-level header validation (typ-agnostic)
	if err := jws.ValidateHeader(parsed.Header); err != nil {
		result.ErrorCode = "E_INVALID_FORMAT"
		result.ErrorMessage = fmt.Sprintf("invalid header: %v", err)
		return result
	}

	result.Kid = parsed.Header.KeyID

	// Protocol-layer format enforcement: require interaction-record+jwt
	if parsed.Header.Type != InteractionRecordTyp {
		result.ErrorCode = "E_UNSUPPORTED_WIRE_VERSION"
		result.ErrorMessage = fmt.Sprintf("expected typ %s, got %s", InteractionRecordTyp, parsed.Header.Type)
		return result
	}

	// JOSE hardening: reject unsafe header fields
	if err := checkJOSEHardening(parsed.HeaderRaw); err != nil {
		result.ErrorCode = "E_INVALID_FORMAT"
		result.ErrorMessage = err.Error()
		return result
	}

	// Verify Ed25519 signature
	if len(opts.PublicKey) != ed25519.PublicKeySize {
		result.ErrorCode = "E_INVALID_FORMAT"
		result.ErrorMessage = fmt.Sprintf("invalid public key size: expected %d, got %d", ed25519.PublicKeySize, len(opts.PublicKey))
		return result
	}
	if err := jws.VerifyJWS(parsed, opts.PublicKey); err != nil {
		result.ErrorCode = "E_INVALID_SIGNATURE"
		result.ErrorMessage = "Ed25519 signature verification failed"
		return result
	}

	// Unmarshal claims
	var claims InteractionRecordClaims
	if err := json.Unmarshal(parsed.Payload, &claims); err != nil {
		result.ErrorCode = "E_INVALID_FORMAT"
		result.ErrorMessage = fmt.Sprintf("failed to parse claims: %v", err)
		return result
	}

	// Validate peac_version
	if claims.PeacVersion != PeacVersion {
		result.ErrorCode = "E_UNSUPPORTED_WIRE_VERSION"
		result.ErrorMessage = fmt.Sprintf("expected peac_version %s, got %s", PeacVersion, claims.PeacVersion)
		return result
	}

	// Validate kind
	if !ValidKinds[claims.Kind] {
		result.ErrorCode = "E_CONSTRAINT_VIOLATION"
		result.ErrorMessage = fmt.Sprintf("invalid kind %q", claims.Kind)
		return result
	}

	// Apply default clock skew
	maxSkew := opts.MaxClockSkew
	if maxSkew == 0 {
		maxSkew = 30 * time.Second
	}
	now := time.Now()

	// Check iat (not in future)
	iat := time.Unix(claims.Iat, 0)
	if iat.After(now.Add(maxSkew)) {
		result.ErrorCode = "E_NOT_YET_VALID"
		result.ErrorMessage = "iat is in the future"
		return result
	}

	// Check exp (if present)
	if claims.Exp > 0 {
		exp := time.Unix(claims.Exp, 0)
		if exp.Before(now.Add(-maxSkew)) {
			result.ErrorCode = "E_EXPIRED"
			result.ErrorMessage = "interaction record has expired"
			return result
		}
	} else if opts.RequireExp {
		result.ErrorCode = "E_CONSTRAINT_VIOLATION"
		result.ErrorMessage = "exp is required but not present"
		return result
	}

	// Check issuer match
	if opts.Issuer != "" && claims.Iss != opts.Issuer {
		result.ErrorCode = "E_INVALID_ISSUER"
		result.ErrorMessage = fmt.Sprintf("expected issuer %s, got %s", opts.Issuer, claims.Iss)
		return result
	}

	// Policy binding
	if opts.PolicyBytes != nil && claims.Peac != nil && claims.Peac.Digest != "" {
		localDigest, err := ComputePolicyDigest(opts.PolicyBytes)
		if err == nil {
			result.PolicyBinding = CheckPolicyBinding(claims.Peac.Digest, localDigest)
			if result.PolicyBinding == PolicyBindingFailed {
				result.ErrorCode = "E_POLICY_BINDING_FAILED"
				result.ErrorMessage = "policy digest mismatch"
				return result
			}
		}
	} else if opts.PolicyBytes != nil && (claims.Peac == nil || claims.Peac.Digest == "") {
		result.PolicyBinding = PolicyBindingUnavailable
	}

	result.Valid = true
	result.Claims = &claims
	return result
}

// checkJOSEHardening rejects unsafe JOSE header fields per Wire 0.2 spec.
func checkJOSEHardening(headerRaw []byte) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(headerRaw, &raw); err != nil {
		return fmt.Errorf("failed to parse header for JOSE hardening: %w", err)
	}

	// Reject embedded keys
	for _, field := range []string{"jwk", "x5c", "x5t", "x5u", "jku"} {
		if _, ok := raw[field]; ok {
			return fmt.Errorf("JOSE hardening: embedded key field %q is not allowed", field)
		}
	}

	// Reject crit
	if _, ok := raw["crit"]; ok {
		return fmt.Errorf("JOSE hardening: crit header is not allowed")
	}

	// Reject b64:false
	if b64Raw, ok := raw["b64"]; ok {
		var b64 bool
		if err := json.Unmarshal(b64Raw, &b64); err == nil && !b64 {
			return fmt.Errorf("JOSE hardening: b64:false is not allowed")
		}
	}

	// Reject zip
	if _, ok := raw["zip"]; ok {
		return fmt.Errorf("JOSE hardening: zip header is not allowed")
	}

	return nil
}
