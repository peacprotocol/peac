// Package peac provides PEAC receipt issuance and verification for Go.
package peac

import (
	"fmt"
	"net/url"
	"regexp"
	"time"

	"github.com/peacprotocol/peac/sdks/go/evidence"
	"github.com/peacprotocol/peac/sdks/go/jws"
)

// IssueOptions contains the parameters for issuing a PEAC receipt.
type IssueOptions struct {
	// Issuer URL (must start with https://)
	Issuer string

	// Audience/resource URL (must start with https://)
	Audience string

	// Amount in smallest currency unit (non-negative integer)
	Amount int64

	// ISO 4217 currency code (uppercase, 3 letters)
	Currency string

	// Payment rail identifier
	Rail string

	// Rail-specific payment reference
	Reference string

	// Asset transferred (defaults to Currency if not provided)
	Asset string

	// Environment ("live" or "test", defaults to "test")
	Env string

	// Network/rail identifier (optional)
	Network string

	// Facilitator reference (optional)
	FacilitatorRef string

	// Rail-specific evidence (JSON-safe, validated against DoS limits)
	Evidence any

	// Idempotency key (optional)
	IdempotencyKey string

	// Subject URI (optional, must start with https:// if provided)
	Subject string

	// Expiry timestamp in Unix seconds (optional)
	Expiry int64

	// SigningKey for Ed25519 signing (required)
	SigningKey *jws.SigningKey

	// Clock for timestamp generation (optional, uses real clock if nil)
	Clock Clock

	// IDGenerator for receipt ID generation (optional, uses UUIDv7 if nil)
	IDGenerator ReceiptIDGenerator

	// EvidenceLimits for DoS protection (optional, uses defaults if zero)
	EvidenceLimits evidence.Limits
}

// IssueResult contains the result of issuing a receipt.
type IssueResult struct {
	// JWS compact serialization
	JWS string

	// Receipt ID (UUIDv7)
	ReceiptID string

	// Issued at timestamp (Unix seconds)
	IssuedAt int64
}

// issuePaymentEvidence represents the payment evidence in an issued receipt.
// This is the wire format for issuance - distinct from PaymentEvidence used in verification.
type issuePaymentEvidence struct {
	Rail           string `json:"rail"`
	Reference      string `json:"reference"`
	Amount         int64  `json:"amount"`
	Currency       string `json:"currency"`
	Asset          string `json:"asset"`
	Env            string `json:"env"`
	Evidence       any    `json:"evidence,omitempty"`
	Network        string `json:"network,omitempty"`
	FacilitatorRef string `json:"facilitator_ref,omitempty"`
	IdempotencyKey string `json:"idempotency_key,omitempty"`
}

// issueClaims represents the claims in an issued PEAC receipt.
// This is the wire format for issuance.
type issueClaims struct {
	Issuer    string               `json:"iss"`
	Audience  string               `json:"aud"`
	IssuedAt  int64                `json:"iat"`
	ReceiptID string               `json:"rid"`
	Amount    int64                `json:"amt"`
	Currency  string               `json:"cur"`
	Payment   issuePaymentEvidence `json:"payment"`
	Expiry    int64                `json:"exp,omitempty"`
	Subject   *issueSubjectClaim   `json:"subject,omitempty"`
}

// issueSubjectClaim represents the subject claim in an issued receipt.
type issueSubjectClaim struct {
	URI string `json:"uri"`
}

// IssueError represents an error during receipt issuance.
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

// Error codes for issuance.
const (
	ErrCodeInvalidIssuer     = "E_ISSUE_INVALID_ISSUER"
	ErrCodeInvalidAudience   = "E_ISSUE_INVALID_AUDIENCE"
	ErrCodeInvalidSubject    = "E_ISSUE_INVALID_SUBJECT"
	ErrCodeInvalidCurrency   = "E_ISSUE_INVALID_CURRENCY"
	ErrCodeInvalidAmount     = "E_ISSUE_INVALID_AMOUNT"
	ErrCodeInvalidExpiry     = "E_ISSUE_INVALID_EXPIRY"
	ErrCodeInvalidEnv        = "E_ISSUE_INVALID_ENV"
	ErrCodeInvalidRail       = "E_ISSUE_INVALID_RAIL"
	ErrCodeInvalidReference  = "E_ISSUE_INVALID_REFERENCE"
	ErrCodeInvalidEvidence   = "E_ISSUE_INVALID_EVIDENCE"
	ErrCodeMissingSigningKey = "E_ISSUE_MISSING_SIGNING_KEY"
	ErrCodeIDGeneration      = "E_ISSUE_ID_GENERATION"
	ErrCodeSigningFailed     = "E_ISSUE_SIGNING_FAILED"
)

var currencyRegex = regexp.MustCompile(`^[A-Z]{3}$`)

// validateHTTPSURL validates that a URL is a valid https:// URL with a host.
func validateHTTPSURL(rawURL string) error {
	if rawURL == "" {
		return fmt.Errorf("URL is required")
	}
	u, err := url.ParseRequestURI(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	if u.Scheme != "https" {
		return fmt.Errorf("URL must use https scheme, got %q", u.Scheme)
	}
	if u.Host == "" {
		return fmt.Errorf("URL must have a host")
	}
	return nil
}

// Issue creates a signed PEAC receipt.
//
// The function validates all inputs, generates a UUIDv7 receipt ID,
// and signs the claims with Ed25519.
//
// Invariants enforced:
//   - Issuer and Audience must be valid https:// URLs with a host
//   - Currency must be ISO 4217 uppercase (3 letters)
//   - Amount must be non-negative
//   - Env must be "live" or "test" (defaults to "test" if empty)
//   - Expiry (if set) must be non-negative; typically should be >= iat
//   - Evidence (if provided) must pass DoS validation
//   - SigningKey must be provided
func Issue(opts IssueOptions) (*IssueResult, error) {
	// Validate issuer URL
	if err := validateHTTPSURL(opts.Issuer); err != nil {
		return nil, &IssueError{
			Code:    ErrCodeInvalidIssuer,
			Message: fmt.Sprintf("invalid issuer: %v", err),
			Field:   "Issuer",
		}
	}

	// Validate audience URL
	if err := validateHTTPSURL(opts.Audience); err != nil {
		return nil, &IssueError{
			Code:    ErrCodeInvalidAudience,
			Message: fmt.Sprintf("invalid audience: %v", err),
			Field:   "Audience",
		}
	}

	// Validate subject URL (if provided)
	if opts.Subject != "" {
		if err := validateHTTPSURL(opts.Subject); err != nil {
			return nil, &IssueError{
				Code:    ErrCodeInvalidSubject,
				Message: fmt.Sprintf("invalid subject: %v", err),
				Field:   "Subject",
			}
		}
	}

	// Validate currency code
	if !currencyRegex.MatchString(opts.Currency) {
		return nil, &IssueError{
			Code:    ErrCodeInvalidCurrency,
			Message: "currency must be ISO 4217 uppercase (e.g., USD)",
			Field:   "Currency",
		}
	}

	// Validate amount
	if opts.Amount < 0 {
		return nil, &IssueError{
			Code:    ErrCodeInvalidAmount,
			Message: "amount must be non-negative",
			Field:   "Amount",
		}
	}

	// Validate expiry (if provided)
	if opts.Expiry != 0 && opts.Expiry < 0 {
		return nil, &IssueError{
			Code:    ErrCodeInvalidExpiry,
			Message: "expiry must be non-negative",
			Field:   "Expiry",
		}
	}

	// Validate env (must be "live" or "test", empty defaults to "test")
	if opts.Env != "" && opts.Env != "live" && opts.Env != "test" {
		return nil, &IssueError{
			Code:    ErrCodeInvalidEnv,
			Message: fmt.Sprintf("env must be \"live\" or \"test\", got %q", opts.Env),
			Field:   "Env",
		}
	}

	// Validate rail
	if opts.Rail == "" {
		return nil, &IssueError{
			Code:    ErrCodeInvalidRail,
			Message: "rail is required",
			Field:   "Rail",
		}
	}

	// Validate reference
	if opts.Reference == "" {
		return nil, &IssueError{
			Code:    ErrCodeInvalidReference,
			Message: "reference is required",
			Field:   "Reference",
		}
	}

	// Validate signing key
	if opts.SigningKey == nil {
		return nil, &IssueError{
			Code:    ErrCodeMissingSigningKey,
			Message: "signing key is required",
			Field:   "SigningKey",
		}
	}

	// Validate evidence (if provided)
	if opts.Evidence != nil {
		limits := opts.EvidenceLimits.WithDefaults()
		if err := evidence.ValidateValue(opts.Evidence, limits); err != nil {
			return nil, &IssueError{
				Code:    ErrCodeInvalidEvidence,
				Message: fmt.Sprintf("evidence validation failed: %v", err),
				Field:   "Evidence",
			}
		}
	}

	// Get clock (default to real clock)
	clock := opts.Clock
	if clock == nil {
		clock = DefaultClock()
	}

	// Get ID generator (default to UUIDv7)
	idGen := opts.IDGenerator
	if idGen == nil {
		idGen = DefaultIDGenerator()
	}

	// Generate receipt ID
	receiptID, err := idGen.NewReceiptID()
	if err != nil {
		return nil, &IssueError{
			Code:    ErrCodeIDGeneration,
			Message: fmt.Sprintf("failed to generate receipt ID: %v", err),
		}
	}

	// Get issued at timestamp
	issuedAt := clock.Now().Unix()

	// Set defaults
	asset := opts.Asset
	if asset == "" {
		asset = opts.Currency
	}
	env := opts.Env
	if env == "" {
		env = "test"
	}

	// Build claims
	claims := issueClaims{
		Issuer:    opts.Issuer,
		Audience:  opts.Audience,
		IssuedAt:  issuedAt,
		ReceiptID: receiptID,
		Amount:    opts.Amount,
		Currency:  opts.Currency,
		Payment: issuePaymentEvidence{
			Rail:           opts.Rail,
			Reference:      opts.Reference,
			Amount:         opts.Amount,
			Currency:       opts.Currency,
			Asset:          asset,
			Env:            env,
			Evidence:       opts.Evidence,
			Network:        opts.Network,
			FacilitatorRef: opts.FacilitatorRef,
			IdempotencyKey: opts.IdempotencyKey,
		},
	}

	// Add optional fields
	if opts.Expiry != 0 {
		claims.Expiry = opts.Expiry
	}
	if opts.Subject != "" {
		claims.Subject = &issueSubjectClaim{URI: opts.Subject}
	}

	// Sign claims
	jwsString, err := opts.SigningKey.SignClaims(claims)
	if err != nil {
		return nil, &IssueError{
			Code:    ErrCodeSigningFailed,
			Message: fmt.Sprintf("failed to sign receipt: %v", err),
		}
	}

	return &IssueResult{
		JWS:       jwsString,
		ReceiptID: receiptID,
		IssuedAt:  issuedAt,
	}, nil
}

// IssueJWS is a convenience function that issues a receipt and returns just the JWS string.
func IssueJWS(opts IssueOptions) (string, error) {
	result, err := Issue(opts)
	if err != nil {
		return "", err
	}
	return result.JWS, nil
}

// MustIssue is like Issue but panics on error. Use only in tests.
func MustIssue(opts IssueOptions) *IssueResult {
	result, err := Issue(opts)
	if err != nil {
		panic(err)
	}
	return result
}

// DefaultIssueOptions returns IssueOptions with sensible defaults for testing.
// The returned options still require Issuer, Audience, and SigningKey to be set.
func DefaultIssueOptions() IssueOptions {
	return IssueOptions{
		Amount:    0,
		Currency:  "USD",
		Rail:      "test",
		Reference: "test-ref",
		Env:       "test",
		Clock:     FixedClock{Time: time.Now()},
	}
}
