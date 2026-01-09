package peac

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/peacprotocol/peac/sdks/go/jws"
)

// testReceiptClaims is a test-only type for parsing issued receipt claims.
// This mirrors the wire format of issueClaims for verification in tests.
type testReceiptClaims struct {
	Issuer    string              `json:"iss"`
	Audience  string              `json:"aud"`
	IssuedAt  int64               `json:"iat"`
	ReceiptID string              `json:"rid"`
	Amount    int64               `json:"amt"`
	Currency  string              `json:"cur"`
	Payment   testPaymentEvidence `json:"payment"`
	Expiry    int64               `json:"exp,omitempty"`
	Subject   *testSubjectClaim   `json:"subject,omitempty"`
}

// testPaymentEvidence is a test-only type for parsing payment evidence.
type testPaymentEvidence struct {
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

// testSubjectClaim is a test-only type for parsing subject claims.
type testSubjectClaim struct {
	URI string `json:"uri"`
}

func newTestSigningKey(t *testing.T) *jws.SigningKey {
	t.Helper()
	key, err := jws.GenerateSigningKey("test-key")
	if err != nil {
		t.Fatalf("failed to generate signing key: %v", err)
	}
	return key
}

func validIssueOptions(t *testing.T) IssueOptions {
	t.Helper()
	return IssueOptions{
		Issuer:     "https://publisher.example",
		Audience:   "https://agent.example",
		Amount:     1000,
		Currency:   "USD",
		Rail:       "stripe",
		Reference:  "pi_123456",
		SigningKey: newTestSigningKey(t),
		Clock:      FixedClock{Time: time.Date(2025, 1, 15, 12, 0, 0, 0, time.UTC)},
	}
}

// Invariant tests - these verify that the Issue function maintains
// its documented invariants regardless of valid input combinations.

func TestIssue_Invariant_JWSIsValidFormat(t *testing.T) {
	// Invariant: The returned JWS must be a valid compact serialization
	// (three base64url parts separated by dots)
	opts := validIssueOptions(t)
	result, err := Issue(opts)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	parts := strings.Split(result.JWS, ".")
	if len(parts) != 3 {
		t.Errorf("JWS should have 3 parts, got %d", len(parts))
	}

	// Verify it can be parsed
	parsed, err := jws.Parse(result.JWS)
	if err != nil {
		t.Errorf("JWS should be parseable: %v", err)
	}

	// Verify header has correct algorithm
	if parsed.Header.Algorithm != "EdDSA" {
		t.Errorf("Algorithm = %s, want EdDSA", parsed.Header.Algorithm)
	}
}

func TestIssue_Invariant_ClaimsContainRequiredFields(t *testing.T) {
	// Invariant: The JWS payload must contain all required claims
	opts := validIssueOptions(t)
	result, err := Issue(opts)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	parsed, _ := jws.Parse(result.JWS)
	var claims map[string]any
	if err := json.Unmarshal(parsed.Payload, &claims); err != nil {
		t.Fatalf("failed to unmarshal claims: %v", err)
	}

	requiredFields := []string{"iss", "aud", "iat", "rid", "amt", "cur", "payment"}
	for _, field := range requiredFields {
		if _, ok := claims[field]; !ok {
			t.Errorf("missing required field: %s", field)
		}
	}

	// Verify payment has required fields
	payment, ok := claims["payment"].(map[string]any)
	if !ok {
		t.Fatal("payment is not an object")
	}
	paymentFields := []string{"rail", "reference", "amount", "currency", "asset", "env"}
	for _, field := range paymentFields {
		if _, ok := payment[field]; !ok {
			t.Errorf("missing required payment field: %s", field)
		}
	}
}

func TestIssue_Invariant_ReceiptIDIsUUID(t *testing.T) {
	// Invariant: The receipt ID must be a valid UUID format
	opts := validIssueOptions(t)
	result, err := Issue(opts)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	// UUID format: 8-4-4-4-12 hex characters
	if len(result.ReceiptID) != 36 {
		t.Errorf("ReceiptID length = %d, want 36", len(result.ReceiptID))
	}

	// Verify the claims also contain the receipt ID
	parsed, _ := jws.Parse(result.JWS)
	var claims map[string]any
	json.Unmarshal(parsed.Payload, &claims)
	if claims["rid"] != result.ReceiptID {
		t.Errorf("claims.rid = %v, want %s", claims["rid"], result.ReceiptID)
	}
}

func TestIssue_Invariant_IssuedAtMatchesResult(t *testing.T) {
	// Invariant: The iat claim must match the IssuedAt in the result
	fixedTime := time.Date(2025, 1, 15, 12, 30, 45, 0, time.UTC)
	opts := validIssueOptions(t)
	opts.Clock = FixedClock{Time: fixedTime}

	result, err := Issue(opts)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	expectedIat := fixedTime.Unix()
	if result.IssuedAt != expectedIat {
		t.Errorf("IssuedAt = %d, want %d", result.IssuedAt, expectedIat)
	}

	parsed, _ := jws.Parse(result.JWS)
	var claims map[string]any
	json.Unmarshal(parsed.Payload, &claims)
	claimsIat := int64(claims["iat"].(float64))
	if claimsIat != expectedIat {
		t.Errorf("claims.iat = %d, want %d", claimsIat, expectedIat)
	}
}

func TestIssue_Invariant_SignatureVerifiable(t *testing.T) {
	// Invariant: The signature must be verifiable with the signing key's public key
	opts := validIssueOptions(t)
	result, err := Issue(opts)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	parsed, _ := jws.Parse(result.JWS)
	if err := jws.VerifyJWS(parsed, opts.SigningKey.PublicKey()); err != nil {
		t.Errorf("signature verification failed: %v", err)
	}
}

func TestIssue_Invariant_DifferentKeysProduceDifferentSignatures(t *testing.T) {
	// Invariant: Different signing keys must produce different signatures
	opts1 := validIssueOptions(t)
	opts1.IDGenerator = NewFixedIDGenerator("fixed-id") // Same ID for comparison
	result1, _ := Issue(opts1)

	opts2 := validIssueOptions(t)
	opts2.IDGenerator = NewFixedIDGenerator("fixed-id")
	result2, _ := Issue(opts2)

	parsed1, _ := jws.Parse(result1.JWS)
	parsed2, _ := jws.Parse(result2.JWS)

	if string(parsed1.Signature) == string(parsed2.Signature) {
		t.Error("different keys should produce different signatures")
	}
}

func TestIssue_Invariant_AssetDefaultsToCurrency(t *testing.T) {
	// Invariant: If Asset is not set, it defaults to Currency
	opts := validIssueOptions(t)
	opts.Asset = "" // Not set

	result, err := Issue(opts)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	parsed, _ := jws.Parse(result.JWS)
	var claims testReceiptClaims
	json.Unmarshal(parsed.Payload, &claims)

	if claims.Payment.Asset != opts.Currency {
		t.Errorf("payment.asset = %s, want %s (default to currency)", claims.Payment.Asset, opts.Currency)
	}
}

func TestIssue_Invariant_EnvDefaultsToTest(t *testing.T) {
	// Invariant: If Env is not set, it defaults to "test"
	opts := validIssueOptions(t)
	opts.Env = "" // Not set

	result, err := Issue(opts)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	parsed, _ := jws.Parse(result.JWS)
	var claims testReceiptClaims
	json.Unmarshal(parsed.Payload, &claims)

	if claims.Payment.Env != "test" {
		t.Errorf("payment.env = %s, want test (default)", claims.Payment.Env)
	}
}

// Validation error tests

func TestIssue_Error_InvalidIssuer(t *testing.T) {
	tests := []struct {
		name   string
		issuer string
	}{
		{"http scheme", "http://example.com"},
		{"no scheme", "example.com"},
		{"empty", ""},
		{"ftp scheme", "ftp://example.com"},
		{"https no host", "https://"},
		{"just scheme", "https:"},
		{"whitespace", "https:// "},
		{"invalid URL chars", "https://exam ple.com"},
		{"fragment", "https://example.com#section"},
		{"userinfo", "https://user:pass@example.com"},
		{"userinfo no password", "https://user@example.com"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts := validIssueOptions(t)
			opts.Issuer = tt.issuer

			_, err := Issue(opts)
			if err == nil {
				t.Error("expected error for invalid issuer")
				return
			}

			ie, ok := err.(*IssueError)
			if !ok {
				t.Errorf("error type = %T, want *IssueError", err)
				return
			}
			if ie.Code != ErrCodeInvalidIssuer {
				t.Errorf("error code = %s, want %s", ie.Code, ErrCodeInvalidIssuer)
			}
		})
	}
}

func TestIssue_Error_InvalidAudience(t *testing.T) {
	tests := []struct {
		name     string
		audience string
	}{
		{"http scheme", "http://example.com"},
		{"no scheme", "example.com"},
		{"empty", ""},
		{"fragment", "https://example.com#section"},
		{"userinfo", "https://user:pass@example.com"},
		{"userinfo no password", "https://user@example.com"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts := validIssueOptions(t)
			opts.Audience = tt.audience

			_, err := Issue(opts)
			if err == nil {
				t.Error("expected error for invalid audience")
				return
			}

			ie, ok := err.(*IssueError)
			if !ok {
				t.Errorf("error type = %T, want *IssueError", err)
				return
			}
			if ie.Code != ErrCodeInvalidAudience {
				t.Errorf("error code = %s, want %s", ie.Code, ErrCodeInvalidAudience)
			}
		})
	}
}

func TestIssue_Error_InvalidSubject(t *testing.T) {
	tests := []struct {
		name    string
		subject string
	}{
		{"http scheme", "http://example.com"},
		{"no scheme", "example.com"},
		{"fragment", "https://example.com#section"},
		{"userinfo", "https://user:pass@example.com"},
		{"userinfo no password", "https://user@example.com"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts := validIssueOptions(t)
			opts.Subject = tt.subject

			_, err := Issue(opts)
			if err == nil {
				t.Error("expected error for invalid subject")
				return
			}

			ie, ok := err.(*IssueError)
			if !ok {
				t.Errorf("error type = %T, want *IssueError", err)
				return
			}
			if ie.Code != ErrCodeInvalidSubject {
				t.Errorf("error code = %s, want %s", ie.Code, ErrCodeInvalidSubject)
			}
		})
	}
}

func TestIssue_Error_InvalidCurrency(t *testing.T) {
	tests := []struct {
		name     string
		currency string
	}{
		{"lowercase", "usd"},
		{"too short", "US"},
		{"too long", "USDC"},
		{"with numbers", "US1"},
		{"empty", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts := validIssueOptions(t)
			opts.Currency = tt.currency

			_, err := Issue(opts)
			if err == nil {
				t.Error("expected error for invalid currency")
				return
			}

			ie, ok := err.(*IssueError)
			if !ok {
				t.Errorf("error type = %T, want *IssueError", err)
				return
			}
			if ie.Code != ErrCodeInvalidCurrency {
				t.Errorf("error code = %s, want %s", ie.Code, ErrCodeInvalidCurrency)
			}
		})
	}
}

func TestIssue_Error_NegativeAmount(t *testing.T) {
	opts := validIssueOptions(t)
	opts.Amount = -1

	_, err := Issue(opts)
	if err == nil {
		t.Fatal("expected error for negative amount")
	}

	ie := err.(*IssueError)
	if ie.Code != ErrCodeInvalidAmount {
		t.Errorf("error code = %s, want %s", ie.Code, ErrCodeInvalidAmount)
	}
}

func TestIssue_Error_NegativeExpiry(t *testing.T) {
	opts := validIssueOptions(t)
	opts.Expiry = -1

	_, err := Issue(opts)
	if err == nil {
		t.Fatal("expected error for negative expiry")
	}

	ie := err.(*IssueError)
	if ie.Code != ErrCodeInvalidExpiry {
		t.Errorf("error code = %s, want %s", ie.Code, ErrCodeInvalidExpiry)
	}
}

func TestIssue_Error_InvalidEnv(t *testing.T) {
	tests := []struct {
		name string
		env  string
	}{
		{"production", "production"},
		{"prod", "prod"},
		{"dev", "dev"},
		{"staging", "staging"},
		{"LIVE", "LIVE"},
		{"TEST", "TEST"},
		{"Live", "Live"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts := validIssueOptions(t)
			opts.Env = tt.env

			_, err := Issue(opts)
			if err == nil {
				t.Error("expected error for invalid env")
				return
			}

			ie, ok := err.(*IssueError)
			if !ok {
				t.Errorf("error type = %T, want *IssueError", err)
				return
			}
			if ie.Code != ErrCodeInvalidEnv {
				t.Errorf("error code = %s, want %s", ie.Code, ErrCodeInvalidEnv)
			}
		})
	}
}

func TestIssue_ValidEnv(t *testing.T) {
	tests := []struct {
		name string
		env  string
	}{
		{"live", "live"},
		{"test", "test"},
		{"empty defaults to test", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts := validIssueOptions(t)
			opts.Env = tt.env

			_, err := Issue(opts)
			if err != nil {
				t.Errorf("Issue() error = %v, want nil for env=%q", err, tt.env)
			}
		})
	}
}

func TestIssue_Error_MissingRail(t *testing.T) {
	opts := validIssueOptions(t)
	opts.Rail = ""

	_, err := Issue(opts)
	if err == nil {
		t.Fatal("expected error for missing rail")
	}

	ie := err.(*IssueError)
	if ie.Code != ErrCodeInvalidRail {
		t.Errorf("error code = %s, want %s", ie.Code, ErrCodeInvalidRail)
	}
}

func TestIssue_Error_MissingReference(t *testing.T) {
	opts := validIssueOptions(t)
	opts.Reference = ""

	_, err := Issue(opts)
	if err == nil {
		t.Fatal("expected error for missing reference")
	}

	ie := err.(*IssueError)
	if ie.Code != ErrCodeInvalidReference {
		t.Errorf("error code = %s, want %s", ie.Code, ErrCodeInvalidReference)
	}
}

func TestIssue_Error_MissingSigningKey(t *testing.T) {
	opts := validIssueOptions(t)
	opts.SigningKey = nil

	_, err := Issue(opts)
	if err == nil {
		t.Fatal("expected error for missing signing key")
	}

	ie := err.(*IssueError)
	if ie.Code != ErrCodeMissingSigningKey {
		t.Errorf("error code = %s, want %s", ie.Code, ErrCodeMissingSigningKey)
	}
}

func TestIssue_Error_InvalidEvidence(t *testing.T) {
	opts := validIssueOptions(t)
	// Create evidence that exceeds depth limit
	opts.Evidence = map[string]any{
		"a": map[string]any{
			"b": map[string]any{
				"c": "too deep",
			},
		},
	}
	opts.EvidenceLimits.MaxDepth = 2

	_, err := Issue(opts)
	if err == nil {
		t.Fatal("expected error for invalid evidence")
	}

	ie := err.(*IssueError)
	if ie.Code != ErrCodeInvalidEvidence {
		t.Errorf("error code = %s, want %s", ie.Code, ErrCodeInvalidEvidence)
	}
}

// Optional field tests

func TestIssue_OptionalFields(t *testing.T) {
	t.Run("with expiry", func(t *testing.T) {
		opts := validIssueOptions(t)
		opts.Expiry = 1736553600 // Future timestamp

		result, err := Issue(opts)
		if err != nil {
			t.Fatalf("Issue() error = %v", err)
		}

		parsed, _ := jws.Parse(result.JWS)
		var claims testReceiptClaims
		json.Unmarshal(parsed.Payload, &claims)

		if claims.Expiry != opts.Expiry {
			t.Errorf("claims.exp = %d, want %d", claims.Expiry, opts.Expiry)
		}
	})

	t.Run("with subject", func(t *testing.T) {
		opts := validIssueOptions(t)
		opts.Subject = "https://user.example/abc123"

		result, err := Issue(opts)
		if err != nil {
			t.Fatalf("Issue() error = %v", err)
		}

		parsed, _ := jws.Parse(result.JWS)
		var claims testReceiptClaims
		json.Unmarshal(parsed.Payload, &claims)

		if claims.Subject == nil {
			t.Fatal("claims.subject is nil")
		}
		if claims.Subject.URI != opts.Subject {
			t.Errorf("claims.subject.uri = %s, want %s", claims.Subject.URI, opts.Subject)
		}
	})

	t.Run("with network", func(t *testing.T) {
		opts := validIssueOptions(t)
		opts.Network = "eip155:8453"

		result, err := Issue(opts)
		if err != nil {
			t.Fatalf("Issue() error = %v", err)
		}

		parsed, _ := jws.Parse(result.JWS)
		var claims testReceiptClaims
		json.Unmarshal(parsed.Payload, &claims)

		if claims.Payment.Network != opts.Network {
			t.Errorf("payment.network = %s, want %s", claims.Payment.Network, opts.Network)
		}
	})

	t.Run("with evidence", func(t *testing.T) {
		opts := validIssueOptions(t)
		opts.Evidence = map[string]any{
			"transaction_id": "tx_123",
			"status":         "completed",
		}

		result, err := Issue(opts)
		if err != nil {
			t.Fatalf("Issue() error = %v", err)
		}

		parsed, _ := jws.Parse(result.JWS)
		var claims testReceiptClaims
		json.Unmarshal(parsed.Payload, &claims)

		evidence, ok := claims.Payment.Evidence.(map[string]any)
		if !ok {
			t.Fatal("payment.evidence is not an object")
		}
		if evidence["transaction_id"] != "tx_123" {
			t.Errorf("evidence.transaction_id = %v, want tx_123", evidence["transaction_id"])
		}
	})
}

// Convenience function tests

func TestIssueJWS(t *testing.T) {
	opts := validIssueOptions(t)
	jwsString, err := IssueJWS(opts)
	if err != nil {
		t.Fatalf("IssueJWS() error = %v", err)
	}

	// Should be valid JWS
	parts := strings.Split(jwsString, ".")
	if len(parts) != 3 {
		t.Errorf("JWS should have 3 parts, got %d", len(parts))
	}
}

func TestMustIssue(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		opts := validIssueOptions(t)
		result := MustIssue(opts)
		if result.JWS == "" {
			t.Error("MustIssue() returned empty JWS")
		}
	})

	t.Run("panic on error", func(t *testing.T) {
		defer func() {
			if r := recover(); r == nil {
				t.Error("MustIssue() should panic on error")
			}
		}()

		opts := validIssueOptions(t)
		opts.SigningKey = nil
		MustIssue(opts)
	})
}

func TestDefaultIssueOptions(t *testing.T) {
	opts := DefaultIssueOptions()

	// Should have defaults set
	if opts.Currency != "USD" {
		t.Errorf("Currency = %s, want USD", opts.Currency)
	}
	if opts.Rail != "test" {
		t.Errorf("Rail = %s, want test", opts.Rail)
	}
	if opts.Reference != "test-ref" {
		t.Errorf("Reference = %s, want test-ref", opts.Reference)
	}
	if opts.Env != "test" {
		t.Errorf("Env = %s, want test", opts.Env)
	}
	if opts.Clock == nil {
		t.Error("Clock should be set")
	}
}

func TestIssueError_Error(t *testing.T) {
	t.Run("with field", func(t *testing.T) {
		e := &IssueError{
			Code:    ErrCodeInvalidIssuer,
			Message: "issuer must start with https://",
			Field:   "Issuer",
		}
		expected := "E_ISSUE_INVALID_ISSUER: issuer must start with https:// (field: Issuer)"
		if e.Error() != expected {
			t.Errorf("Error() = %s, want %s", e.Error(), expected)
		}
	})

	t.Run("without field", func(t *testing.T) {
		e := &IssueError{
			Code:    ErrCodeIDGeneration,
			Message: "failed to generate ID",
		}
		expected := "E_ISSUE_ID_GENERATION: failed to generate ID"
		if e.Error() != expected {
			t.Errorf("Error() = %s, want %s", e.Error(), expected)
		}
	})
}

// Testability - verify Clock and IDGenerator injection

func TestIssue_WithFixedClock(t *testing.T) {
	fixedTime := time.Date(2025, 6, 15, 10, 30, 0, 0, time.UTC)
	opts := validIssueOptions(t)
	opts.Clock = FixedClock{Time: fixedTime}

	result, err := Issue(opts)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	if result.IssuedAt != fixedTime.Unix() {
		t.Errorf("IssuedAt = %d, want %d", result.IssuedAt, fixedTime.Unix())
	}
}

func TestIssue_WithFixedIDGenerator(t *testing.T) {
	opts := validIssueOptions(t)
	opts.IDGenerator = NewFixedIDGenerator("custom-receipt-id-001")

	result, err := Issue(opts)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	if result.ReceiptID != "custom-receipt-id-001" {
		t.Errorf("ReceiptID = %s, want custom-receipt-id-001", result.ReceiptID)
	}
}

// Round-trip test - issue and verify

func TestIssue_RoundTrip(t *testing.T) {
	key, _ := jws.GenerateSigningKey("test-key-001")
	opts := IssueOptions{
		Issuer:     "https://publisher.example",
		Audience:   "https://agent.example",
		Amount:     5000,
		Currency:   "USD",
		Rail:       "stripe",
		Reference:  "pi_test_123",
		Asset:      "USD",
		Env:        "test",
		Network:    "card",
		Subject:    "https://user.example/u/12345",
		SigningKey: key,
		Evidence: map[string]any{
			"charge_id": "ch_123",
		},
	}

	result, err := Issue(opts)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	// Parse and verify
	parsed, err := jws.Parse(result.JWS)
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}

	// Verify signature
	if err := jws.VerifyJWS(parsed, key.PublicKey()); err != nil {
		t.Fatalf("VerifyJWS() error = %v", err)
	}

	// Verify claims
	var claims testReceiptClaims
	if err := json.Unmarshal(parsed.Payload, &claims); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}

	if claims.Issuer != opts.Issuer {
		t.Errorf("iss = %s, want %s", claims.Issuer, opts.Issuer)
	}
	if claims.Audience != opts.Audience {
		t.Errorf("aud = %s, want %s", claims.Audience, opts.Audience)
	}
	if claims.Amount != opts.Amount {
		t.Errorf("amt = %d, want %d", claims.Amount, opts.Amount)
	}
	if claims.Currency != opts.Currency {
		t.Errorf("cur = %s, want %s", claims.Currency, opts.Currency)
	}
	if claims.Payment.Rail != opts.Rail {
		t.Errorf("payment.rail = %s, want %s", claims.Payment.Rail, opts.Rail)
	}
	if claims.Subject == nil || claims.Subject.URI != opts.Subject {
		t.Errorf("subject.uri = %v, want %s", claims.Subject, opts.Subject)
	}
}

func TestIssue_ZeroAmount(t *testing.T) {
	// Zero amount should be valid (e.g., free tier, promotional)
	opts := validIssueOptions(t)
	opts.Amount = 0

	result, err := Issue(opts)
	if err != nil {
		t.Fatalf("Issue() with zero amount should succeed: %v", err)
	}

	parsed, _ := jws.Parse(result.JWS)
	var claims testReceiptClaims
	json.Unmarshal(parsed.Payload, &claims)

	if claims.Amount != 0 {
		t.Errorf("amt = %d, want 0", claims.Amount)
	}
}

// Evidence omitempty tests - verify evidence field in payment is omitted when nil

func TestIssue_EvidenceOmittedWhenNil(t *testing.T) {
	// When Evidence is nil, payment.evidence should NOT be present
	opts := validIssueOptions(t)
	opts.Evidence = nil // Explicitly nil

	result, err := Issue(opts)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	parsed, _ := jws.Parse(result.JWS)

	// Use JSON unmarshal to check for payment.evidence field presence
	var claims map[string]any
	if err := json.Unmarshal(parsed.Payload, &claims); err != nil {
		t.Fatalf("failed to unmarshal payload: %v", err)
	}

	payment, ok := claims["payment"].(map[string]any)
	if !ok {
		t.Fatal("payment claim should be a map")
	}

	if _, exists := payment["evidence"]; exists {
		t.Errorf("payment should NOT contain 'evidence' key when nil, got: %v", payment["evidence"])
	}
}

func TestIssue_EvidencePresentWhenProvided(t *testing.T) {
	// When Evidence is provided, it should be in payment.evidence
	opts := validIssueOptions(t)
	opts.Evidence = map[string]any{"key": "value"}

	result, err := Issue(opts)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	parsed, _ := jws.Parse(result.JWS)

	// Use JSON unmarshal to check for payment.evidence field presence and value
	var claims map[string]any
	if err := json.Unmarshal(parsed.Payload, &claims); err != nil {
		t.Fatalf("failed to unmarshal payload: %v", err)
	}

	payment, ok := claims["payment"].(map[string]any)
	if !ok {
		t.Fatal("payment claim should be a map")
	}

	evidence, exists := payment["evidence"]
	if !exists {
		t.Fatal("payment should contain 'evidence' key when provided")
	}

	// Verify evidence content
	evidenceMap, ok := evidence.(map[string]any)
	if !ok {
		t.Fatalf("evidence should be a map, got %T", evidence)
	}
	if evidenceMap["key"] != "value" {
		t.Errorf("evidence[key] = %v, want 'value'", evidenceMap["key"])
	}
}

// Header invariant tests

func TestIssue_Invariant_HeaderTypIsCorrect(t *testing.T) {
	// Invariant: The JWS header type must be the PEAC receipt type
	opts := validIssueOptions(t)
	result, err := Issue(opts)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	parsed, _ := jws.Parse(result.JWS)

	// Verify header has correct type
	expectedTyp := jws.DefaultReceiptTyp
	if parsed.Header.Type != expectedTyp {
		t.Errorf("Header.Type = %s, want %s", parsed.Header.Type, expectedTyp)
	}
}

func TestIssue_Invariant_HeaderKeyIDMatchesSigningKey(t *testing.T) {
	// Invariant: The JWS header key ID must match the signing key's ID
	opts := validIssueOptions(t)
	result, err := Issue(opts)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	parsed, _ := jws.Parse(result.JWS)

	// Verify header has correct key ID
	expectedKid := opts.SigningKey.KeyID()
	if parsed.Header.KeyID != expectedKid {
		t.Errorf("Header.KeyID = %s, want %s", parsed.Header.KeyID, expectedKid)
	}
}

// URL validation edge cases

func TestIssue_URLValidation_StrictParsing(t *testing.T) {
	// Verify that URL validation catches various malformed URLs
	tests := []struct {
		name string
		url  string
	}{
		{"path only", "/path/to/resource"},
		{"relative URL", "../resource"},
		{"mailto scheme", "mailto:test@example.com"},
		{"data URI", "data:text/plain,hello"},
	}

	for _, tt := range tests {
		t.Run("issuer_"+tt.name, func(t *testing.T) {
			opts := validIssueOptions(t)
			opts.Issuer = tt.url
			_, err := Issue(opts)
			if err == nil {
				t.Errorf("expected error for issuer URL: %q", tt.url)
			}
		})

		t.Run("audience_"+tt.name, func(t *testing.T) {
			opts := validIssueOptions(t)
			opts.Audience = tt.url
			_, err := Issue(opts)
			if err == nil {
				t.Errorf("expected error for audience URL: %q", tt.url)
			}
		})
	}
}
