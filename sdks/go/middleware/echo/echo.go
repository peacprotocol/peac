// Package echo provides PEAC receipt verification middleware for Echo.
//
// Echo (labstack/echo/v4) accepts stdlib middleware through
// `echo.WrapMiddleware`, which converts `func(http.Handler) http.Handler`
// into `echo.MiddlewareFunc`. This adapter mirrors the chi and gin
// adapter pattern by re-exporting the core middleware types and
// constructors under a framework-specific path, so Echo users can
// install this package without pulling Echo into every other PEAC
// consumer. Install with:
//
//	go get github.com/peacprotocol/peac/sdks/go/middleware/echo
//
// Usage with Echo:
//
//	import (
//	    "github.com/labstack/echo/v4"
//	    peacecho "github.com/peacprotocol/peac/sdks/go/middleware/echo"
//	)
//
//	e := echo.New()
//	e.Use(echo.WrapMiddleware(peacecho.Verifier(peacecho.Config{
//	    Issuer:   "https://publisher.example",
//	    Audience: "https://agent.example",
//	})))
//
// This is a separate Go module so consumers who do not use Echo do not
// pay for Echo in their dependency graph. The adapter itself has no
// Echo dependency; it simply exposes the stdlib-compatible
// `func(http.Handler) http.Handler` that `echo.WrapMiddleware` accepts.
package echo

import (
	"net/http"

	"github.com/peacprotocol/peac/sdks/go/middleware"
)

// Config is an alias for the core middleware config. Identical to the
// chi and gin adapters so `type Config = middleware.Config` parity
// holds across every framework wrapper.
type Config = middleware.Config

// DefaultConfig returns the default middleware configuration with
// hardened defaults: panic recovery on, 1 MiB body cap, TrustProxyHeaders
// off. Identical to the chi and gin adapters.
func DefaultConfig() Config {
	return middleware.DefaultConfig()
}

// Verifier creates a PEAC verification middleware in stdlib form.
// Wrap with `echo.WrapMiddleware(...)` to attach it to an Echo router:
//
//	e.Use(echo.WrapMiddleware(peacecho.Verifier(cfg)))
//
// Returning the stdlib type keeps this adapter free of an Echo import
// and preserves identical wrapper semantics with the chi and gin
// adapters. Framework-level context (`echo.Context`) is populated by
// Echo's own wrapper; claims on the request are available via
// `middleware.GetClaims(c.Request())`.
func Verifier(cfg Config) func(http.Handler) http.Handler {
	return middleware.Middleware(cfg)
}

// RequireReceipt creates a middleware that requires a valid PEAC
// receipt. Wrap with `echo.WrapMiddleware(...)` to attach.
func RequireReceipt(issuer, audience string) func(http.Handler) http.Handler {
	return middleware.RequireReceipt(issuer, audience)
}

// OptionalReceipt creates a middleware that optionally verifies PEAC
// receipts. Requests without a receipt are passed through. Wrap with
// `echo.WrapMiddleware(...)` to attach.
func OptionalReceipt(issuer, audience string) func(http.Handler) http.Handler {
	return middleware.OptionalReceipt(issuer, audience)
}

// GetClaims retrieves the verified claims from the request context.
// In Echo handlers, call with `c.Request()`:
//
//	claims := peacecho.GetClaims(c.Request())
var GetClaims = middleware.GetClaims

// GetResult retrieves the full verify result from the request context.
// In Echo handlers, call with `c.Request()`.
var GetResult = middleware.GetResult

// ClaimsContextKey is the context key for verified claims.
const ClaimsContextKey = middleware.ClaimsContextKey

// ResultContextKey is the context key for the full verify result.
const ResultContextKey = middleware.ResultContextKey
