// Package chi provides Chi router middleware for PEAC receipt verification.
//
// This is a separate module to avoid pulling chi as a dependency for users
// who don't use the Chi router. Install with:
//
//	go get github.com/peacprotocol/peac/sdks/go/middleware/chi
//
// Usage:
//
//	import (
//	    "github.com/go-chi/chi/v5"
//	    peacchi "github.com/peacprotocol/peac/sdks/go/middleware/chi"
//	)
//
//	r := chi.NewRouter()
//	r.Use(peacchi.Verifier(peacchi.Config{
//	    Issuer:   "https://publisher.example",
//	    Audience: "https://agent.example",
//	}))
package chi

import (
	"net/http"

	"github.com/peacprotocol/peac/sdks/go/middleware"
)

// Config is an alias for the core middleware config.
type Config = middleware.Config

// DefaultConfig returns the default middleware configuration.
func DefaultConfig() Config {
	return middleware.DefaultConfig()
}

// Verifier creates a Chi-compatible PEAC verification middleware.
// This wraps the standard net/http middleware for Chi router compatibility.
func Verifier(cfg Config) func(http.Handler) http.Handler {
	return middleware.Middleware(cfg)
}

// RequireReceipt creates a middleware that requires a valid PEAC receipt.
func RequireReceipt(issuer, audience string) func(http.Handler) http.Handler {
	return middleware.RequireReceipt(issuer, audience)
}

// OptionalReceipt creates a middleware that optionally verifies PEAC receipts.
func OptionalReceipt(issuer, audience string) func(http.Handler) http.Handler {
	return middleware.OptionalReceipt(issuer, audience)
}

// GetClaims retrieves the verified claims from the request context.
var GetClaims = middleware.GetClaims

// GetResult retrieves the full verify result from the request context.
var GetResult = middleware.GetResult

// ClaimsContextKey is the context key for verified claims.
const ClaimsContextKey = middleware.ClaimsContextKey

// ResultContextKey is the context key for the full verify result.
const ResultContextKey = middleware.ResultContextKey
