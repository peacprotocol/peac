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

	// ErrCodeInvalidUTF8 indicates a caller-controlled claim string is not valid
	// UTF-8. It is detected before json.Marshal, which would otherwise silently
	// replace the invalid bytes with U+FFFD and sign a mutated identifier.
	ErrCodeInvalidUTF8 = "INVALID_UTF8"

	// ErrCodeNonIJSONPayload indicates the marshaled claims payload violates the
	// raw-bytes I-JSON (RFC 7493) gate the verifier applies. The underlying
	// canonical code (E_IJSON_*) is preserved in the message.
	ErrCodeNonIJSONPayload = "NON_IJSON_PAYLOAD"
)
