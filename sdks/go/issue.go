// Package peac provides Interaction Record issuance and verification for Go.
package peac

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/peacprotocol/peac/sdks/go/evidence"
	"github.com/peacprotocol/peac/sdks/go/jws"
)

// IssueOptions contains parameters for issuing a signed interaction record.
type IssueOptions struct {
	// Iss is the issuer URI (must start with https:// or did:).
	Iss string

	// Kind is the structural kind ("evidence" or "challenge").
	Kind string

	// Type is the semantic type (reverse-DNS or URI, e.g., "org.peacprotocol/mcp-tool-call").
	Type string

	// SigningKey for Ed25519 signing (required).
	SigningKey *jws.SigningKey

	// Kid is the key identifier for the JWS header (required).
	Kid string

	// Sub is the optional subject URI.
	Sub string

	// Exp is the optional expiration timestamp (Unix seconds).
	Exp int64

	// Pillars is the optional list of pillar values from the 10-pillar taxonomy.
	Pillars []string

	// Actor is the optional top-level actor binding.
	Actor *ActorBinding

	// Extensions is the optional extension map (ext field).
	Extensions map[string]any

	// Policy is the optional policy block.
	Policy *PolicyBlock

	// Clock for timestamp generation (optional; uses system clock if nil).
	Clock Clock

	// IDGen for receipt ID generation (optional; uses UUIDv7 if nil).
	IDGen ReceiptIDGenerator

	// EvidenceLimits for DoS protection on extension values (optional; uses defaults if zero).
	EvidenceLimits evidence.Limits
}

// IssueResult contains the output of a successful Issue() call.
type IssueResult struct {
	// JWS is the compact JWS serialization of the signed interaction record.
	JWS string

	// ReceiptID is the generated UUIDv7 receipt identifier (rid claim).
	ReceiptID string

	// IssuedAt is the Unix timestamp (seconds) when the record was issued.
	IssuedAt int64
}

// IssueError represents a structured issuance error with a code and field path.
type IssueError struct {
	Code    string
	Message string
	Field   string
}

func (e *IssueError) Error() string {
	if e.Field != "" {
		return fmt.Sprintf("%s: %s (field: %s)", e.Code, e.Message, e.Field)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// validateCanonicalIss checks that iss starts with https:// or did: per the
// Interaction Record spec.
func validateCanonicalIss(iss string) error {
	if strings.HasPrefix(iss, "https://") {
		if len(iss) <= len("https://") {
			return fmt.Errorf("%w: https:// issuer must have authority", ErrIssNotCanonical)
		}
		return nil
	}
	if strings.HasPrefix(iss, "did:") {
		if len(iss) <= len("did:") {
			return fmt.Errorf("%w: did: issuer must have method", ErrIssNotCanonical)
		}
		return nil
	}
	return fmt.Errorf("%w: got %q", ErrIssNotCanonical, iss)
}

// Issue creates a signed interaction record in the current stable format
// (interaction-record+jwt).
//
// Validates all inputs, generates a UUIDv7 receipt ID, and signs with Ed25519.
func Issue(opts IssueOptions) (*IssueResult, error) {
	// Validate required fields
	if opts.Iss == "" {
		return nil, &IssueError{Code: ErrCodeMissingIssuer, Message: "iss is required", Field: "Iss"}
	}
	if err := validateCanonicalIss(opts.Iss); err != nil {
		return nil, &IssueError{Code: ErrCodeInvalidIss, Message: err.Error(), Field: "Iss"}
	}

	if opts.Kind == "" {
		return nil, &IssueError{Code: ErrCodeMissingKind, Message: "kind is required", Field: "Kind"}
	}
	if !ValidKinds[opts.Kind] {
		return nil, &IssueError{Code: ErrCodeInvalidKind, Message: fmt.Sprintf("kind must be evidence or challenge, got %q", opts.Kind), Field: "Kind"}
	}

	if opts.Type == "" {
		return nil, &IssueError{Code: ErrCodeMissingType, Message: "type is required", Field: "Type"}
	}

	if opts.SigningKey == nil {
		return nil, &IssueError{Code: ErrCodeMissingKey, Message: "signing key is required", Field: "SigningKey"}
	}

	kid := opts.Kid
	if kid == "" {
		kid = opts.SigningKey.KeyID()
	}
	if kid == "" {
		return nil, &IssueError{Code: ErrCodeMissingKid, Message: "kid is required", Field: "Kid"}
	}

	// Validate pillars if provided
	for _, p := range opts.Pillars {
		if !ValidPillars[p] {
			return nil, &IssueError{Code: ErrCodeInvalidPillar, Message: fmt.Sprintf("invalid pillar %q", p), Field: "Pillars"}
		}
	}

	// Validate extensions if provided
	if opts.Extensions != nil {
		limits := opts.EvidenceLimits.WithDefaults()
		if err := evidence.ValidateValue(opts.Extensions, limits); err != nil {
			return nil, &IssueError{Code: ErrCodeInvalidType, Message: fmt.Sprintf("extension validation failed: %v", err), Field: "Extensions"}
		}
	}

	// Clock and ID generator
	clock := opts.Clock
	if clock == nil {
		clock = DefaultClock()
	}
	idGen := opts.IDGen
	if idGen == nil {
		idGen = DefaultIDGenerator()
	}

	receiptID, err := idGen.NewReceiptID()
	if err != nil {
		return nil, &IssueError{Code: ErrCodeIDGenFailed, Message: fmt.Sprintf("failed to generate receipt ID: %v", err)}
	}

	issuedAt := clock.Now().Unix()

	// Build claims
	claims := InteractionRecordClaims{
		Iss:         opts.Iss,
		Sub:         opts.Sub,
		Iat:         issuedAt,
		Rid:         receiptID,
		Kind:        opts.Kind,
		Type:        opts.Type,
		PeacVersion: PeacVersion,
		Pillars:     opts.Pillars,
		Actor:       opts.Actor,
		Ext:         opts.Extensions,
		Peac:        opts.Policy,
	}
	if opts.Exp > 0 {
		claims.Exp = opts.Exp
	}

	// Marshal and sign
	payload, err := json.Marshal(claims)
	if err != nil {
		return nil, &IssueError{Code: ErrCodeSignFailed, Message: fmt.Sprintf("failed to marshal claims: %v", err)}
	}

	jwsString, err := opts.SigningKey.SignWithType(payload, InteractionRecordTyp)
	if err != nil {
		return nil, &IssueError{Code: ErrCodeSignFailed, Message: fmt.Sprintf("failed to sign: %v", err)}
	}

	return &IssueResult{
		JWS:       jwsString,
		ReceiptID: receiptID,
		IssuedAt:  issuedAt,
	}, nil
}

// IssueJWS is a convenience function that issues a record and returns just the JWS string.
func IssueJWS(opts IssueOptions) (string, error) {
	result, err := Issue(opts)
	if err != nil {
		return "", err
	}
	return result.JWS, nil
}

// DefaultIssueOptions returns IssueOptions with sensible defaults for testing.
// Still requires Iss, Kind, Type, and SigningKey to be set.
func DefaultIssueOptions() IssueOptions {
	return IssueOptions{
		Kind:  KindEvidence,
		Type:  "org.peacprotocol/test",
		Clock: FixedClock{Time: time.Now()},
	}
}
