package peac

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/peacprotocol/peac-go/jws"
	"github.com/peacprotocol/peac-go/jwks"
)

// VerifyOptions configures receipt verification.
type VerifyOptions struct {
	// Issuer is the expected issuer (REQUIRED).
	Issuer string

	// Audience is the expected audience (REQUIRED).
	Audience string

	// MaxAge is the maximum age of the receipt (default: 1 hour).
	MaxAge time.Duration

	// ClockSkew is the tolerance for clock differences (default: 30 seconds).
	ClockSkew time.Duration

	// JWKSURL is the explicit JWKS endpoint URL (optional).
	// If not set, it will be discovered from the issuer.
	JWKSURL string

	// KeySet is a custom key set to use (optional).
	// If set, JWKS discovery is skipped.
	KeySet *jwks.KeySet

	// JWKSCache is a JWKS cache to use for key resolution.
	JWKSCache *jwks.Cache

	// Context is the context for the operation.
	Context context.Context
}

// Verify verifies a PEAC receipt JWS and returns the claims.
//
// Example:
//
//	result, err := peac.Verify(receiptJWS, peac.VerifyOptions{
//	    Issuer:   "https://publisher.example",
//	    Audience: "https://agent.example",
//	    MaxAge:   time.Hour,
//	})
//	if err != nil {
//	    log.Fatal(err)
//	}
//	fmt.Printf("Receipt ID: %s\n", result.Claims.ReceiptID)
func Verify(receiptJWS string, opts VerifyOptions) (*VerifyResult, error) {
	startTime := time.Now()
	perf := &VerifyPerf{}

	// Apply defaults
	if opts.MaxAge == 0 {
		opts.MaxAge = time.Hour
	}
	if opts.ClockSkew == 0 {
		opts.ClockSkew = 30 * time.Second
	}
	if opts.Context == nil {
		opts.Context = context.Background()
	}

	// Parse JWS
	parsed, err := jws.Parse(receiptJWS)
	if err != nil {
		return nil, NewPEACError(ErrInvalidFormat, err.Error())
	}

	// Validate header
	if err := jws.ValidateHeader(parsed.Header); err != nil {
		return nil, NewPEACError(ErrInvalidFormat, err.Error())
	}

	// Parse claims
	var claims PEACReceiptClaims
	if err := json.Unmarshal(parsed.Payload, &claims); err != nil {
		return nil, NewPEACError(ErrInvalidFormat, fmt.Sprintf("failed to parse claims: %v", err))
	}

	// Validate issuer
	if opts.Issuer != "" && claims.Issuer != opts.Issuer {
		return nil, NewPEACError(ErrInvalidIssuer, fmt.Sprintf("expected %s, got %s", opts.Issuer, claims.Issuer)).
			WithDetail("expected", opts.Issuer).
			WithDetail("actual", claims.Issuer)
	}

	// Validate audience
	if opts.Audience != "" && !containsAudience(claims.Audience, opts.Audience) {
		return nil, NewPEACError(ErrInvalidAudience, fmt.Sprintf("expected %s in audience", opts.Audience)).
			WithDetail("expected", opts.Audience).
			WithDetail("actual", claims.Audience)
	}

	// Validate time claims
	now := time.Now()

	// Check iat (issued at)
	iat := time.Unix(claims.IssuedAt, 0)
	if iat.After(now.Add(opts.ClockSkew)) {
		return nil, NewPEACError(ErrNotYetValid, "issued_at is in the future").
			WithDetail("iat", claims.IssuedAt).
			WithDetail("now", now.Unix())
	}

	// Check exp (expires at)
	if claims.ExpiresAt > 0 {
		exp := time.Unix(claims.ExpiresAt, 0)
		if exp.Before(now.Add(-opts.ClockSkew)) {
			return nil, NewPEACError(ErrExpired, "receipt has expired").
				WithDetail("exp", claims.ExpiresAt).
				WithDetail("now", now.Unix())
		}
	}

	// Check nbf (not before)
	if claims.NotBefore > 0 {
		nbf := time.Unix(claims.NotBefore, 0)
		if nbf.After(now.Add(opts.ClockSkew)) {
			return nil, NewPEACError(ErrNotYetValid, "receipt is not yet valid").
				WithDetail("nbf", claims.NotBefore).
				WithDetail("now", now.Unix())
		}
	}

	// Check max age
	if time.Since(iat) > opts.MaxAge+opts.ClockSkew {
		return nil, NewPEACError(ErrExpired, "receipt exceeds max age").
			WithDetail("iat", claims.IssuedAt).
			WithDetail("max_age_seconds", opts.MaxAge.Seconds())
	}

	// Resolve public key
	keyStartTime := time.Now()
	publicKey, err := resolveKey(opts, parsed.Header.KeyID, claims.Issuer)
	perf.JWKSFetchMs = float64(time.Since(keyStartTime).Microseconds()) / 1000

	if err != nil {
		return nil, err
	}

	// Verify signature
	if err := jws.VerifyJWS(parsed, publicKey); err != nil {
		return nil, NewPEACError(ErrInvalidSignature, err.Error())
	}

	perf.VerifyMs = float64(time.Since(startTime).Microseconds()) / 1000

	return &VerifyResult{
		Claims:    &claims,
		KeyID:     parsed.Header.KeyID,
		Algorithm: parsed.Header.Algorithm,
		Perf:      perf,
	}, nil
}

// VerifyWithContext is like Verify but explicitly takes a context.
func VerifyWithContext(ctx context.Context, receiptJWS string, opts VerifyOptions) (*VerifyResult, error) {
	opts.Context = ctx
	return Verify(receiptJWS, opts)
}

func resolveKey(opts VerifyOptions, keyID, issuer string) ([]byte, error) {
	// Use provided KeySet if available
	if opts.KeySet != nil {
		key, ok := opts.KeySet.Get(keyID)
		if !ok {
			return nil, NewPEACError(ErrKeyNotFound, fmt.Sprintf("key %s not found in provided key set", keyID)).
				WithDetail("kid", keyID)
		}
		return key, nil
	}

	// Determine JWKS URL
	jwksURL := opts.JWKSURL
	if jwksURL == "" {
		jwksURL = jwks.DiscoverJWKS(issuer)
	}

	// Use cache if available
	var keySet *jwks.KeySet
	var err error

	if opts.JWKSCache != nil {
		keySet, err = opts.JWKSCache.Get(opts.Context, jwksURL)
	} else {
		var jwksData *jwks.JWKS
		jwksData, err = jwks.Fetch(opts.Context, jwksURL, jwks.DefaultFetchOptions())
		if err == nil {
			keySet, err = jwksData.ToKeySet()
		}
	}

	if err != nil {
		return nil, NewPEACError(ErrJWKSFetchFailed, err.Error()).
			WithDetail("url", jwksURL)
	}

	key, ok := keySet.Get(keyID)
	if !ok {
		return nil, NewPEACError(ErrKeyNotFound, fmt.Sprintf("key %s not found in JWKS", keyID)).
			WithDetail("kid", keyID).
			WithDetail("jwks_url", jwksURL)
	}

	return key, nil
}

func containsAudience(audiences []string, expected string) bool {
	for _, aud := range audiences {
		if aud == expected {
			return true
		}
	}
	return false
}
