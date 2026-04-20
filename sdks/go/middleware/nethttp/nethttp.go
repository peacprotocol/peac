// Package nethttp provides PEAC receipt verification middleware for
// the Go standard library `net/http` package.
//
// The core `sdks/go/middleware` package already returns
// `func(http.Handler) http.Handler`, which is the stdlib-native
// middleware signature. This package re-exports that API under a
// framework-specific path so users who want to depend on a named
// net/http adapter have one, matching the adapter-per-framework
// pattern used by chi, gin, and echo. Install with:
//
//	go get github.com/peacprotocol/peac/sdks/go/middleware/nethttp
//
// Usage:
//
//	import (
//	    "net/http"
//	    peacnethttp "github.com/peacprotocol/peac/sdks/go/middleware/nethttp"
//	)
//
//	mux := http.NewServeMux()
//	mux.HandleFunc("/protected", protected)
//
//	verified := peacnethttp.Verifier(peacnethttp.Config{
//	    Issuer:   "https://publisher.example",
//	    Audience: "https://agent.example",
//	})(mux)
//
//	http.ListenAndServe(":8080", verified)
package nethttp

import (
	"net/http"

	"github.com/peacprotocol/peac/sdks/go/middleware"
)

// Config is an alias for the core middleware config. Identical to the
// chi, gin, and echo adapters so `type Config = middleware.Config`
// parity holds across every framework wrapper.
type Config = middleware.Config

// DefaultConfig returns the default middleware configuration with
// hardened defaults: panic recovery on, 1 MiB body cap,
// TrustProxyHeaders off. Identical to the other adapters.
func DefaultConfig() Config {
	return middleware.DefaultConfig()
}

// Verifier creates a PEAC verification middleware for standard
// net/http handlers. The returned middleware has the canonical
// signature `func(http.Handler) http.Handler` and can be composed with
// any net/http mux or third-party router that accepts stdlib
// middleware.
func Verifier(cfg Config) func(http.Handler) http.Handler {
	return middleware.Middleware(cfg)
}

// RequireReceipt creates a middleware that requires a valid PEAC
// receipt. Requests without a verified receipt return 401.
func RequireReceipt(issuer, audience string) func(http.Handler) http.Handler {
	return middleware.RequireReceipt(issuer, audience)
}

// OptionalReceipt creates a middleware that optionally verifies PEAC
// receipts. Requests without a receipt are passed through.
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
