package chi_test

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	coremw "github.com/peacprotocol/peac/sdks/go/middleware"
	peacchi "github.com/peacprotocol/peac/sdks/go/middleware/chi"
)

// TestConfigIsAlias asserts that peacchi.Config is an alias for the
// core middleware Config, not a new named type. This is the
// foundational invariant the parity harness relies on when it uses
// chi as the reference adapter.
func TestConfigIsAlias(t *testing.T) {
	var adapterCfg peacchi.Config
	var coreCfg coremw.Config
	if reflect.TypeOf(adapterCfg) != reflect.TypeOf(coreCfg) {
		t.Fatalf("peacchi.Config is not a type alias for coremw.Config")
	}
}

// TestDefaultConfigMatchesCore asserts adapter DefaultConfig returns
// the same struct as the core DefaultConfig. The parity harness asserts
// this across all stdlib-shaped adapters; this per-adapter test gives a
// localized failure if chi drifts from the core defaults.
func TestDefaultConfigMatchesCore(t *testing.T) {
	if !reflect.DeepEqual(peacchi.DefaultConfig(), coremw.DefaultConfig()) {
		t.Fatalf("peacchi.DefaultConfig() diverges from coremw.DefaultConfig()")
	}
}

// TestVerifierRequired401 confirms that the stdlib middleware returned
// by Verifier rejects requests without a PEAC-Receipt header when
// Optional is false. Mirrors the parity-corpus required-401 scenario.
func TestVerifierRequired401(t *testing.T) {
	cfg := peacchi.DefaultConfig()
	cfg.Issuer = "https://publisher.example"
	cfg.Audience = "https://agent.example"

	downstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatalf("downstream handler was reached when receipt was missing")
	})

	h := peacchi.Verifier(cfg)(downstream)
	req := httptest.NewRequest("GET", "/protected", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d; body=%s", rr.Code, rr.Body.String())
	}
}

// TestVerifierOptionalPassesThrough confirms Optional=true lets
// receipt-less requests through to the downstream handler. Mirrors
// the parity-corpus optional-passthrough scenario.
func TestVerifierOptionalPassesThrough(t *testing.T) {
	cfg := peacchi.DefaultConfig()
	cfg.Issuer = "https://publisher.example"
	cfg.Audience = "https://agent.example"
	cfg.Optional = true

	reached := false
	downstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	})

	h := peacchi.Verifier(cfg)(downstream)
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
