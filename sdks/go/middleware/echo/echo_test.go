package echo_test

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	coremw "github.com/peacprotocol/peac/sdks/go/middleware"
	peacecho "github.com/peacprotocol/peac/sdks/go/middleware/echo"
)

// TestConfigIsAlias asserts that peacecho.Config is an alias for the
// core middleware Config, not a new named type.
func TestConfigIsAlias(t *testing.T) {
	var adapterCfg peacecho.Config
	var coreCfg coremw.Config
	if reflect.TypeOf(adapterCfg) != reflect.TypeOf(coreCfg) {
		t.Fatalf("peacecho.Config is not a type alias for coremw.Config")
	}
}

// TestDefaultConfigMatchesCore asserts adapter DefaultConfig returns
// the same struct as the core DefaultConfig.
func TestDefaultConfigMatchesCore(t *testing.T) {
	if !reflect.DeepEqual(peacecho.DefaultConfig(), coremw.DefaultConfig()) {
		t.Fatalf("peacecho.DefaultConfig() diverges from coremw.DefaultConfig()")
	}
}

// TestVerifierRequired401 confirms that the stdlib middleware returned
// by Verifier rejects requests without a PEAC-Receipt header when
// Optional is false.
func TestVerifierRequired401(t *testing.T) {
	cfg := peacecho.DefaultConfig()
	cfg.Issuer = "https://publisher.example"
	cfg.Audience = "https://agent.example"

	downstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatalf("downstream handler was reached when receipt was missing")
	})

	h := peacecho.Verifier(cfg)(downstream)
	req := httptest.NewRequest("GET", "/protected", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d; body=%s", rr.Code, rr.Body.String())
	}
}

// TestVerifierOptionalPassesThrough confirms Optional=true lets
// receipt-less requests through to the downstream handler.
func TestVerifierOptionalPassesThrough(t *testing.T) {
	cfg := peacecho.DefaultConfig()
	cfg.Issuer = "https://publisher.example"
	cfg.Audience = "https://agent.example"
	cfg.Optional = true

	reached := false
	downstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	})

	h := peacecho.Verifier(cfg)(downstream)
	req := httptest.NewRequest("GET", "/protected", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if !reached {
		t.Fatalf("optional middleware did not reach downstream handler")
	}
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rr.Code)
	}
}
