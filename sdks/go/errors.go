package peac

import "errors"

// Sentinel errors for Interaction Record issuance and verification.
var (
	ErrIssNotCanonical    = errors.New("iss must start with https:// or did: scheme")
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

	// ErrCodeKeyIDMismatch indicates IssueOptions.Kid was set to a non-empty value
	// that differs from the signing key's own key ID. The signing key's ID is
	// authoritative; a conflicting Kid is rejected rather than silently ignored.
	ErrCodeKeyIDMismatch = "KEY_ID_MISMATCH"

	// ErrCodeInvalidKeyID indicates the authoritative key ID does not satisfy the
	// Wire 0.2 kid rule (non-empty, valid UTF-8, no Unicode noncharacters, at most
	// 256 UTF-8 bytes), so a record signed with it would be rejected by the verifier.
	ErrCodeInvalidKeyID = "INVALID_KEY_ID"

	// ErrCodeInvalidUTF8 indicates a caller-controlled claim string is not valid
	// UTF-8. It is detected before json.Marshal, which would otherwise silently
	// replace the invalid bytes with U+FFFD and sign a mutated identifier.
	ErrCodeInvalidUTF8 = "INVALID_UTF8"

	// ErrCodeInvalidJSONProfile indicates the marshaled claims payload failed the
	// PEAC raw JSON admission profile the verifier applies. That profile combines
	// RFC 7493 requirements (UTF-8, no surrogates or noncharacters, unique member
	// names) with PEAC's stricter safe-numeric-range rule, which rejects numbers
	// whose magnitude exceeds 2^53-1 (RFC 7493 treats that bound as SHOULD-NOT, not
	// a MUST). The underlying canonical code (E_IJSON_* / E_INVALID_FORMAT) is
	// preserved in the message.
	ErrCodeInvalidJSONProfile = "INVALID_JSON_PROFILE"
)
