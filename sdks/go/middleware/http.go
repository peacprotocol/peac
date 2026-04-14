// Package middleware provides HTTP middleware for PEAC receipt verification.
package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	peac "github.com/peacprotocol/peac/sdks/go"
	"github.com/peacprotocol/peac/sdks/go/jwks"
)

// ContextKey is the type for context keys.
type ContextKey string

const (
	// ClaimsContextKey is the context key for verified claims.
	ClaimsContextKey ContextKey = "peac_claims"

	// ResultContextKey is the context key for the full verify result.
	ResultContextKey ContextKey = "peac_result"
)

// Config configures the PEAC middleware.
type Config struct {
	// Issuer is the expected receipt issuer (required).
	Issuer string

	// Audience is the expected audience (required).
	Audience string

	// MaxAge is the maximum age of receipts (default: 1 hour).
	MaxAge time.Duration

	// ClockSkew is the clock skew tolerance (default: 30 seconds).
	ClockSkew time.Duration

	// HeaderName is the header containing the receipt (default: "PEAC-Receipt").
	HeaderName string

	// Optional enables optional receipt verification.
	// If true, requests without receipts are allowed through.
	// If false (default), requests without receipts return 401.
	Optional bool

	// JWKSCache is an optional shared JWKS cache.
	JWKSCache *jwks.Cache

	// ErrorHandler is called when verification fails.
	// If nil, a default JSON error response is sent.
	ErrorHandler func(w http.ResponseWriter, r *http.Request, err error)

	// SuccessHandler is called after successful verification.
	// If nil, the next handler is called with claims in context.
	SuccessHandler func(w http.ResponseWriter, r *http.Request, result *peac.VerifyResult)

	// Logger is a structured logger for middleware events. When nil,
	// NoopLogger is used.
	Logger Logger

	// Metrics is a metrics sink for middleware counters and histograms.
	// When nil, NoopMetrics is used.
	Metrics Metrics

	// RateLimit configures an optional bounded token-bucket rate limiter.
	// A zero value disables rate limiting.
	RateLimit RateLimitConfig

	// RequestTimeout bounds the downstream handler's execution time.
	// Zero disables the timeout (default behavior).
	RequestTimeout time.Duration

	// MaxBodyBytes caps the request body size the middleware will allow
	// downstream handlers to read. Zero means no cap (default: 1 MiB
	// applied in DefaultConfig()).
	MaxBodyBytes int64

	// RecoverPanics wraps downstream handlers with a recover() guard
	// that converts panics into RFC 9457 problem responses, logs via
	// Logger, and increments Metrics.panics. Default: true.
	RecoverPanics bool

	// PanicRethrowInTest re-panics after logging instead of writing a
	// 500 response. Test harnesses can set this so failures surface as
	// real stack traces. Default: false.
	PanicRethrowInTest bool

	// TrustProxyHeaders controls proxy-aware client-IP extraction used
	// by the rate limiter. Default: false. When false, only r.RemoteAddr
	// is consulted. When true, X-Forwarded-For (rightmost hop) and
	// X-Real-IP are honored; callers MUST ensure their proxy chain is
	// terminated before the middleware.
	TrustProxyHeaders bool
}

// DefaultConfig returns the default middleware configuration. Hardened
// defaults: panic recovery on, 1 MiB body cap, TrustProxyHeaders off.
func DefaultConfig() Config {
	return Config{
		MaxAge:        time.Hour,
		ClockSkew:     30 * time.Second,
		HeaderName:    "PEAC-Receipt",
		Optional:      false,
		RecoverPanics: true,
		MaxBodyBytes:  1 << 20, // 1 MiB
	}
}

// Middleware creates a new PEAC verification middleware.
func Middleware(cfg Config) func(http.Handler) http.Handler {
	// Apply defaults
	if cfg.HeaderName == "" {
		cfg.HeaderName = "PEAC-Receipt"
	}
	if cfg.MaxAge == 0 {
		cfg.MaxAge = time.Hour
	}
	if cfg.ClockSkew == 0 {
		cfg.ClockSkew = 30 * time.Second
	}
	if cfg.ErrorHandler == nil {
		cfg.ErrorHandler = defaultErrorHandler
	}

	// One rate limiter instance per middleware instance when enabled.
	var limiter *rateLimiter
	if cfg.RateLimit.RatePerSecond > 0 && cfg.RateLimit.Burst > 0 {
		limiter = newRateLimiter(cfg.RateLimit)
	}
	logger := resolveLogger(cfg.Logger)
	metrics := resolveMetrics(cfg.Metrics)

	return func(next http.Handler) http.Handler {
		// Panic recovery is the outermost layer so it also covers
		// failures inside verify, rate-limit, and other wrappers.
		wrapped := wrapWithRecover(next, cfg)

		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Body size cap (read-side only; headers already parsed).
			if cfg.MaxBodyBytes > 0 && r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, cfg.MaxBodyBytes)
			}

			// Optional per-request timeout.
			if cfg.RequestTimeout > 0 {
				ctx, cancel := context.WithTimeout(r.Context(), cfg.RequestTimeout)
				defer cancel()
				r = r.WithContext(ctx)
			}

			// Rate limit (before verify so we do not spend CPU on
			// rejected traffic). PerIssuer strategy falls back to IP
			// when claims are not yet verified.
			if limiter != nil {
				ok, retry := limiter.allow(rateLimitKey(r, cfg))
				if !ok {
					logger.Warn(
						"peac middleware rate limit exceeded",
						"peac.error.code", "E_RATE_LIMITED",
						"peac.retry_after_ms", int(retry.Milliseconds()),
						"http.method", r.Method,
						"http.target", r.URL.Path,
					)
					metrics.IncCounter("peac.middleware.rate_limit_exceeded")
					writeRateLimitResponse(w, retry)
					return
				}
			}

			receipt := r.Header.Get(cfg.HeaderName)

			// Handle missing receipt
			if receipt == "" {
				if cfg.Optional {
					wrapped.ServeHTTP(w, r)
					return
				}
				err := peac.NewPEACError(peac.ErrIdentityMissing, "PEAC-Receipt header is required")
				cfg.ErrorHandler(w, r, err)
				return
			}

			// Remove "Bearer " prefix if present
			receipt = strings.TrimPrefix(receipt, "Bearer ")

			// Verify the receipt
			result, err := peac.Verify(receipt, peac.VerifyOptions{
				Issuer:    cfg.Issuer,
				Audience:  cfg.Audience,
				MaxAge:    cfg.MaxAge,
				ClockSkew: cfg.ClockSkew,
				JWKSCache: cfg.JWKSCache,
				Context:   r.Context(),
			})

			if err != nil {
				cfg.ErrorHandler(w, r, err)
				return
			}

			// Call success handler if set
			if cfg.SuccessHandler != nil {
				cfg.SuccessHandler(w, r, result)
			}

			// Add claims to context
			ctx := context.WithValue(r.Context(), ClaimsContextKey, result.Claims)
			ctx = context.WithValue(ctx, ResultContextKey, result)

			wrapped.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetClaims retrieves the verified claims from the request context.
func GetClaims(r *http.Request) *peac.PEACReceiptClaims {
	claims, ok := r.Context().Value(ClaimsContextKey).(*peac.PEACReceiptClaims)
	if !ok {
		return nil
	}
	return claims
}

// GetResult retrieves the full verify result from the request context.
func GetResult(r *http.Request) *peac.VerifyResult {
	result, ok := r.Context().Value(ResultContextKey).(*peac.VerifyResult)
	if !ok {
		return nil
	}
	return result
}

// defaultErrorHandler sends a JSON error response.
func defaultErrorHandler(w http.ResponseWriter, r *http.Request, err error) {
	status := http.StatusUnauthorized
	code := "UNKNOWN_ERROR"
	message := err.Error()

	if peacErr, ok := err.(*peac.PEACError); ok {
		status = peacErr.HTTPStatus()
		code = string(peacErr.Code)
		message = peacErr.Message
	}

	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)

	resp := map[string]interface{}{
		"type":   "https://www.peacprotocol.org/errors/" + strings.ToLower(code),
		"title":  code,
		"status": status,
		"detail": message,
	}

	if peacErr, ok := err.(*peac.PEACError); ok && len(peacErr.Details) > 0 {
		resp["peac_error"] = peacErr.Details
	}

	_ = json.NewEncoder(w).Encode(resp) // Error intentionally ignored in error handler
}

// RequireReceipt creates a middleware that requires a valid PEAC receipt.
// This is a convenience function for common use cases.
func RequireReceipt(issuer, audience string) func(http.Handler) http.Handler {
	return Middleware(Config{
		Issuer:   issuer,
		Audience: audience,
		Optional: false,
	})
}

// OptionalReceipt creates a middleware that optionally verifies PEAC receipts.
// Requests without receipts are allowed through.
func OptionalReceipt(issuer, audience string) func(http.Handler) http.Handler {
	return Middleware(Config{
		Issuer:   issuer,
		Audience: audience,
		Optional: true,
	})
}
