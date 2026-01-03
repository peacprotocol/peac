// Package peac provides a Go client for PEAC protocol receipt verification.
package peac

import (
	"fmt"
)

// ErrorCode represents a PEAC error code.
type ErrorCode string

// Error codes for PEAC operations.
const (
	ErrInvalidSignature ErrorCode = "E_INVALID_SIGNATURE"
	ErrInvalidFormat    ErrorCode = "E_INVALID_FORMAT"
	ErrExpired          ErrorCode = "E_EXPIRED"
	ErrNotYetValid      ErrorCode = "E_NOT_YET_VALID"
	ErrInvalidIssuer    ErrorCode = "E_INVALID_ISSUER"
	ErrInvalidAudience  ErrorCode = "E_INVALID_AUDIENCE"
	ErrJWKSFetchFailed  ErrorCode = "E_JWKS_FETCH_FAILED"
	ErrKeyNotFound      ErrorCode = "E_KEY_NOT_FOUND"

	// Identity error codes (v0.9.25+)
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
type PEACError struct {
	Code    ErrorCode
	Message string
	Details map[string]interface{}
}

// Error implements the error interface.
func (e *PEACError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// NewPEACError creates a new PEAC error.
func NewPEACError(code ErrorCode, message string) *PEACError {
	return &PEACError{
		Code:    code,
		Message: message,
		Details: make(map[string]interface{}),
	}
}

// WithDetail adds a detail to the error.
func (e *PEACError) WithDetail(key string, value interface{}) *PEACError {
	e.Details[key] = value
	return e
}

// IsRetriable returns true if the error is retriable.
func (e *PEACError) IsRetriable() bool {
	switch e.Code {
	case ErrNotYetValid, ErrJWKSFetchFailed, ErrIdentityNotYetValid,
		ErrIdentityKeyUnknown, ErrIdentityBindingStale, ErrIdentityDirectoryUnavailable:
		return true
	default:
		return false
	}
}

// HTTPStatus returns the appropriate HTTP status code for the error.
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
