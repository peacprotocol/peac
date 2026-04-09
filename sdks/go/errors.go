package peac

import "errors"

// Sentinel errors for Interaction Record issuance and verification.
var (
	ErrIssNotCanonical    = errors.New("iss must start with https:// or did:")
	ErrInvalidKind        = errors.New("kind must be evidence or challenge")
	ErrInvalidType        = errors.New("type must be non-empty reverse-DNS or URI")
	ErrMissingRequired    = errors.New("missing required field")
	ErrUnsupportedVersion = errors.New("unsupported wire version")
)

// Error code constants for issuance validation.
const (
	ErrCodeMissingIssuer = "MISSING_ISSUER"
	ErrCodeMissingKind   = "MISSING_KIND"
	ErrCodeMissingType   = "MISSING_TYPE"
	ErrCodeMissingKey    = "MISSING_SIGNING_KEY"
	ErrCodeMissingKid    = "MISSING_KEY_ID"
	ErrCodeInvalidIss    = "INVALID_ISSUER"
	ErrCodeInvalidKind   = "INVALID_KIND"
	ErrCodeInvalidType   = "INVALID_TYPE"
	ErrCodeInvalidPillar = "INVALID_PILLAR"
	ErrCodeSignFailed    = "SIGN_FAILED"
	ErrCodeIDGenFailed   = "ID_GEN_FAILED"
)
