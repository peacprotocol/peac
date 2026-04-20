package gin_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	peacgin "github.com/peacprotocol/peac/sdks/go/middleware/gin"
)

// Gin's Config is a dedicated struct (not a type alias) because gin's
// handler type (gin.HandlerFunc) differs from stdlib http.Handler.
// These tests assert behavioral parity with the chi / echo / nethttp
// parity corpus even though the Config type itself cannot be a Go
// type alias. Scenarios mirror sdks/go/middleware/paritytest/parity_test.go
// so the four adapters agree on visible behavior.

func init() {
	gin.SetMode(gin.TestMode)
}

func defaultCfg() peacgin.Config {
	return peacgin.Config{
		Issuer:   "https://publisher.example",
		Audience: "https://agent.example",
	}
}

func newEngine(mw gin.HandlerFunc, hit *bool) *gin.Engine {
	e := gin.New()
	e.Use(mw)
	e.GET("/protected", func(c *gin.Context) {
		if hit != nil {
			*hit = true
		}
		c.Header("X-Downstream-Reached", "1")
		c.String(http.StatusOK, "ok")
	})
	return e
}

// TestDefaultConfigShape asserts Gin's DefaultConfig sets the same
// ClockSkew, MaxAge, and HeaderName as the core middleware DefaultConfig.
// Gin's Config struct is separate because it carries a gin-specific
// ErrorHandler signature, so field-by-field reflect equality is not
// the right check; value equality on the shared behavioral fields is.
func TestDefaultConfigShape(t *testing.T) {
	cfg := peacgin.DefaultConfig()
	if cfg.HeaderName != "PEAC-Receipt" {
		t.Fatalf("HeaderName=%q want PEAC-Receipt", cfg.HeaderName)
	}
	if cfg.MaxAge != time.Hour {
		t.Fatalf("MaxAge=%v want 1h", cfg.MaxAge)
	}
	if cfg.ClockSkew != 30*time.Second {
		t.Fatalf("ClockSkew=%v want 30s", cfg.ClockSkew)
	}
	if cfg.Optional {
		t.Fatalf("Optional default must be false")
	}
}

// TestVerifierRequired401 mirrors the parity-harness case:
// no-receipt with Optional=false returns 401.
func TestVerifierRequired401(t *testing.T) {
	cfg := defaultCfg()
	hit := false
	e := newEngine(peacgin.Verifier(cfg), &hit)

	req := httptest.NewRequest("GET", "/protected", nil)
	rr := httptest.NewRecorder()
	e.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d; body=%s", rr.Code, rr.Body.String())
	}
	if hit {
		t.Fatalf("downstream reached despite 401")
	}
}

// TestVerifierOptionalPassesThrough mirrors the parity-harness case:
// no-receipt with Optional=true passes through to the handler.
func TestVerifierOptionalPassesThrough(t *testing.T) {
	cfg := defaultCfg()
	cfg.Optional = true
	hit := false
	e := newEngine(peacgin.Verifier(cfg), &hit)

	req := httptest.NewRequest("GET", "/protected", nil)
	rr := httptest.NewRecorder()
	e.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rr.Code)
	}
	if !hit {
		t.Fatalf("optional middleware did not reach downstream")
	}
}

// TestMalformedReceipt400 mirrors the parity-harness case:
// a malformed receipt returns 400 (E_INVALID_FORMAT) and does not
// reach the downstream handler.
func TestMalformedReceipt400(t *testing.T) {
	cfg := defaultCfg()
	hit := false
	e := newEngine(peacgin.Verifier(cfg), &hit)

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("PEAC-Receipt", "not-a-jws")
	rr := httptest.NewRecorder()
	e.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d; body=%s", rr.Code, rr.Body.String())
	}
	if hit {
		t.Fatalf("downstream reached despite 400")
	}
}

// TestCaseInsensitivePeacReceiptHeader mirrors the parity-harness case:
// the lowercase form `peac-receipt` is treated identically to the
// canonical `PEAC-Receipt`. HTTP headers are case-insensitive by
// RFC 9110; the adapter must not special-case the letter casing.
func TestCaseInsensitivePeacReceiptHeader(t *testing.T) {
	cfg := defaultCfg()
	hit := false
	e := newEngine(peacgin.Verifier(cfg), &hit)

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("peac-receipt", "not-a-jws")
	rr := httptest.NewRecorder()
	e.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400 (malformed), got %d; body=%s", rr.Code, rr.Body.String())
	}
	if hit {
		t.Fatalf("downstream reached despite 400")
	}
}
