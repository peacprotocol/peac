// Package gin provides Gin framework middleware for PEAC receipt verification.
//
// This is a separate module to avoid pulling gin as a dependency for users
// who don't use the Gin framework. Install with:
//
//	go get github.com/peacprotocol/peac/sdks/go/middleware/gin
//
// Usage:
//
//	import (
//	    "github.com/gin-gonic/gin"
//	    peacgin "github.com/peacprotocol/peac/sdks/go/middleware/gin"
//	)
//
//	r := gin.Default()
//	r.Use(peacgin.Verifier(peacgin.Config{
//	    Issuer:   "https://publisher.example",
//	    Audience: "https://agent.example",
//	}))
package gin

import (
	"github.com/gin-gonic/gin"
	peac "github.com/peacprotocol/peac/sdks/go"
	"github.com/peacprotocol/peac/sdks/go/jwks"
	"github.com/peacprotocol/peac/sdks/go/middleware"
	"net/http"
	"strings"
	"time"
)

// Config configures the PEAC middleware for Gin.
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
	Optional bool

	// JWKSCache is an optional shared JWKS cache.
	JWKSCache *jwks.Cache

	// ErrorHandler is called when verification fails.
	ErrorHandler func(c *gin.Context, err error)
}

// DefaultConfig returns the default middleware configuration.
func DefaultConfig() Config {
	return Config{
		MaxAge:     time.Hour,
		ClockSkew:  30 * time.Second,
		HeaderName: "PEAC-Receipt",
		Optional:   false,
	}
}

// Verifier creates a Gin-compatible PEAC verification middleware.
func Verifier(cfg Config) gin.HandlerFunc {
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

	return func(c *gin.Context) {
		receipt := c.GetHeader(cfg.HeaderName)

		// Handle missing receipt
		if receipt == "" {
			if cfg.Optional {
				c.Next()
				return
			}
			err := peac.NewPEACError(peac.ErrIdentityMissing, "PEAC-Receipt header is required")
			cfg.ErrorHandler(c, err)
			c.Abort()
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
			Context:   c.Request.Context(),
		})

		if err != nil {
			cfg.ErrorHandler(c, err)
			c.Abort()
			return
		}

		// Add claims to context
		c.Set(string(middleware.ClaimsContextKey), result.Claims)
		c.Set(string(middleware.ResultContextKey), result)

		c.Next()
	}
}

// RequireReceipt creates a middleware that requires a valid PEAC receipt.
func RequireReceipt(issuer, audience string) gin.HandlerFunc {
	return Verifier(Config{
		Issuer:   issuer,
		Audience: audience,
		Optional: false,
	})
}

// OptionalReceipt creates a middleware that optionally verifies PEAC receipts.
func OptionalReceipt(issuer, audience string) gin.HandlerFunc {
	return Verifier(Config{
		Issuer:   issuer,
		Audience: audience,
		Optional: true,
	})
}

// GetClaims retrieves the verified claims from the Gin context.
func GetClaims(c *gin.Context) *peac.PEACReceiptClaims {
	claims, ok := c.Get(string(middleware.ClaimsContextKey))
	if !ok {
		return nil
	}
	return claims.(*peac.PEACReceiptClaims)
}

// GetResult retrieves the full verify result from the Gin context.
func GetResult(c *gin.Context) *peac.VerifyResult {
	result, ok := c.Get(string(middleware.ResultContextKey))
	if !ok {
		return nil
	}
	return result.(*peac.VerifyResult)
}

// defaultErrorHandler sends a JSON error response.
func defaultErrorHandler(c *gin.Context, err error) {
	status := http.StatusUnauthorized
	code := "UNKNOWN_ERROR"
	message := err.Error()

	if peacErr, ok := err.(*peac.PEACError); ok {
		status = peacErr.HTTPStatus()
		code = string(peacErr.Code)
		message = peacErr.Message
	}

	resp := gin.H{
		"type":   "https://peacprotocol.org/errors/" + strings.ToLower(code),
		"title":  code,
		"status": status,
		"detail": message,
	}

	if peacErr, ok := err.(*peac.PEACError); ok && len(peacErr.Details) > 0 {
		resp["peac_error"] = peacErr.Details
	}

	c.JSON(status, resp)
}
