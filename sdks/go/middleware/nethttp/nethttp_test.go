package nethttp_test

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	coremw "github.com/peacprotocol/peac/sdks/go/middleware"
	peacnethttp "github.com/peacprotocol/peac/sdks/go/middleware/nethttp"
)

func TestConfigIsAlias(t *testing.T) {
	var adapterCfg peacnethttp.Config
	var coreCfg coremw.Config
	if reflect.TypeOf(adapterCfg) != reflect.TypeOf(coreCfg) {
		t.Fatalf("peacnethttp.Config is not a type alias for coremw.Config")
	}
}

func TestDefaultConfigMatchesCore(t *testing.T) {
	if !reflect.DeepEqual(peacnethttp.DefaultConfig(), coremw.DefaultConfig()) {
		t.Fatalf("peacnethttp.DefaultConfig() diverges from coremw.DefaultConfig()")
	}
}

func TestVerifierRequired401(t *testing.T) {
	cfg := peacnethttp.DefaultConfig()
	cfg.Issuer = "https://publisher.example"
	cfg.Audience = "https://agent.example"

	downstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatalf("downstream handler was reached when receipt was missing")
	})

	h := peacnethttp.Verifier(cfg)(downstream)
	req := httptest.NewRequest("GET", "/protected", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d; body=%s", rr.Code, rr.Body.String())
	}
}

func TestVerifierOptionalPassesThrough(t *testing.T) {
	cfg := peacnethttp.DefaultConfig()
	cfg.Issuer = "https://publisher.example"
	cfg.Audience = "https://agent.example"
	cfg.Optional = true

	reached := false
	downstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	})

	h := peacnethttp.Verifier(cfg)(downstream)
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
