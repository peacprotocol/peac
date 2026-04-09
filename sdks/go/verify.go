package peac

import (
	"context"
	"fmt"
	"time"

	"github.com/peacprotocol/peac/sdks/go/jwks"
	"github.com/peacprotocol/peac/sdks/go/jws"
)

// VerifyOptions contains options for receipt verification.
//
// Deprecated: This type supports Wire 0.1 verification only.
// Use VerifyLocal() (shipping in v0.12.8 PR3) for Interaction Record verification.
type VerifyOptions struct {
	Issuer    string
	Audience  string
	MaxAge    time.Duration
	ClockSkew time.Duration
	JWKSURL   string
	KeySet    *jwks.KeySet
	JWKSCache *jwks.Cache
	Context   context.Context
}

// VerifyResult contains the result of receipt verification.
//
// Deprecated: This type supports Wire 0.1 verification only.
type VerifyResult struct {
	Claims    *PEACReceiptClaims
	KeyID     string
	Algorithm string
	Perf      *VerifyPerf
}

// VerifyPerf contains timing information for verification.
type VerifyPerf struct {
	VerifyMs    float64 `json:"verify_ms"`
	JWKSFetchMs float64 `json:"jwks_fetch_ms,omitempty"`
}

// PEACReceiptClaims represents Wire 0.1 receipt claims.
//
// Deprecated: Use InteractionRecordClaims for the current stable format.
type PEACReceiptClaims struct {
	Issuer    string `json:"iss"`
	Subject   string `json:"sub,omitempty"`
	IssuedAt  int64  `json:"iat"`
	ExpiresAt int64  `json:"exp,omitempty"`
	ReceiptID string `json:"receipt_id"`
}

// ErrorCode represents a PEAC error code.
//
// Deprecated: Use sentinel errors (ErrIssNotCanonical, etc.) for Interaction Record errors.
type ErrorCode string

// Legacy error codes preserved for middleware compilation.
//
// Deprecated: Use sentinel errors for new code.
const (
	ErrInvalidSignature ErrorCode = "E_INVALID_SIGNATURE"
	ErrInvalidFormat    ErrorCode = "E_INVALID_FORMAT"
	ErrExpired          ErrorCode = "E_EXPIRED"
	ErrNotYetValid      ErrorCode = "E_NOT_YET_VALID"
	ErrInvalidIssuer    ErrorCode = "E_INVALID_ISSUER"
	ErrInvalidAudience  ErrorCode = "E_INVALID_AUDIENCE"
	ErrJWKSFetchFailed  ErrorCode = "E_JWKS_FETCH_FAILED"
	ErrKeyNotFound      ErrorCode = "E_KEY_NOT_FOUND"

	ErrIdentityMissing              ErrorCode = "E_IDENTITY_MISSING"
	ErrIdentityInvalidFormat        ErrorCode = "E_IDENTITY_INVALID_FORMAT"
	ErrIdentityExpired              ErrorCode = "E_IDENTITY_EXPIRED"
	ErrIdentityNotYetValid          ErrorCode = "E_IDENTITY_NOT_YET_VALID"
	ErrIdentitySigInvalid           ErrorCode = "E_IDENTITY_SIG_INVALID"
	ErrIdentityKeyUnknown           ErrorCode = "E_IDENTITY_KEY_UNKNOWN"
	ErrIdentityKeyExpired           ErrorCode = "E_IDENTITY_KEY_EXPIRED"
	ErrIdentityKeyRevoked           ErrorCode = "E_IDENTITY_KEY_REVOKED"
	ErrIdentityBindingMismatch      ErrorCode = "E_IDENTITY_BINDING_MISMATCH"
	ErrIdentityBindingStale         ErrorCode = "E_IDENTITY_BINDING_STALE"
	ErrIdentityBindingFuture        ErrorCode = "E_IDENTITY_BINDING_FUTURE"
	ErrIdentityProofUnsupported     ErrorCode = "E_IDENTITY_PROOF_UNSUPPORTED"
	ErrIdentityDirectoryUnavailable ErrorCode = "E_IDENTITY_DIRECTORY_UNAVAILABLE"
)

// PEACError represents an error from PEAC operations.
//
// Deprecated: Use IssueError for issuance errors; verification errors
// will use a new type in PR3.
type PEACError struct {
	Code    ErrorCode
	Message string
	Details map[string]interface{}
}

func (e *PEACError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// NewPEACError creates a new PEAC error.
func NewPEACError(code ErrorCode, message string) *PEACError {
	return &PEACError{Code: code, Message: message, Details: make(map[string]interface{})}
}

func (e *PEACError) WithDetail(key string, value interface{}) *PEACError {
	e.Details[key] = value
	return e
}

func (e *PEACError) IsRetryable() bool {
	switch e.Code {
	case ErrNotYetValid, ErrJWKSFetchFailed, ErrIdentityNotYetValid,
		ErrIdentityKeyUnknown, ErrIdentityBindingStale, ErrIdentityDirectoryUnavailable:
		return true
	default:
		return false
	}
}

func (e *PEACError) HTTPStatus() int {
	switch e.Code {
	case ErrInvalidSignature, ErrInvalidFormat, ErrInvalidIssuer, ErrInvalidAudience,
		ErrKeyNotFound, ErrIdentityInvalidFormat, ErrIdentityBindingMismatch,
		ErrIdentityBindingFuture, ErrIdentityProofUnsupported:
		return 400
	case ErrExpired, ErrNotYetValid, ErrIdentityMissing, ErrIdentityExpired,
		ErrIdentityNotYetValid, ErrIdentitySigInvalid, ErrIdentityKeyUnknown,
		ErrIdentityKeyExpired, ErrIdentityKeyRevoked, ErrIdentityBindingStale:
		return 401
	case ErrJWKSFetchFailed, ErrIdentityDirectoryUnavailable:
		return 503
	default:
		return 500
	}
}

// Verify verifies a receipt using JWKS resolution.
//
// Deprecated: This function supports Wire 0.1 only.
// VerifyLocal() for the current stable format ships in v0.12.8 PR3.
func Verify(receiptJWS string, opts VerifyOptions) (*VerifyResult, error) {
	parsed, err := jws.Parse(receiptJWS)
	if err != nil {
		return nil, NewPEACError(ErrInvalidFormat, err.Error())
	}
	if err := jws.ValidateHeader(parsed.Header); err != nil {
		return nil, NewPEACError(ErrInvalidFormat, err.Error())
	}
	return nil, NewPEACError(ErrInvalidFormat,
		"Wire 0.1 Verify() is deprecated; use VerifyLocal() for Interaction Record format")
}

// VerifyWithContext is the context-aware variant of Verify.
//
// Deprecated: Use VerifyLocal() instead.
func VerifyWithContext(ctx context.Context, receiptJWS string, opts VerifyOptions) (*VerifyResult, error) {
	return Verify(receiptJWS, opts)
}
