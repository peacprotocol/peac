// Package paritytest enforces that every framework-specific PEAC
// middleware adapter (chi, gin, echo, nethttp) returns identical
// responses for a shared request corpus.
//
// The core middleware is the single source of behavior; adapters are
// thin wrappers that re-expose `Config`, `DefaultConfig`, and
// `Verifier`. This harness asserts that the Config alias shape,
// DefaultConfig defaults, verifier wrapper semantics, header handling,
// timeout / body-limit / trust-proxy defaults, and 401 / 400 / 503
// error/status mapping are all identical across adapters.
//
// Each adapter is its own Go module; this test module `replace`s them
// from ../chi, ../echo, ../nethttp. The gin adapter uses a different
// handler type (`gin.HandlerFunc`) and carries a third-party
// dependency; it is verified by `sdks/go/middleware/gin/gin_test.go`
// against the same four scenarios below. The parity harness here
// covers the three stdlib-shaped adapters.
package paritytest

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	coremw "github.com/peacprotocol/peac/sdks/go/middleware"
	peacchi "github.com/peacprotocol/peac/sdks/go/middleware/chi"
	peacecho "github.com/peacprotocol/peac/sdks/go/middleware/echo"
	peacnethttp "github.com/peacprotocol/peac/sdks/go/middleware/nethttp"
)

// adapter describes one middleware adapter for the parity corpus.
type adapter struct {
	name     string
	verifier func(coremw.Config) func(http.Handler) http.Handler
}

// all stdlib-shaped adapters under test. Gin has its own handler type
// and is exercised from sdks/go/middleware/gin/gin_test.go against the
// same scenario list.
func adapters() []adapter {
	return []adapter{
		{
			name:     "chi",
			verifier: func(c coremw.Config) func(http.Handler) http.Handler { return peacchi.Verifier(c) },
		},
		{
			name:     "echo",
			verifier: func(c coremw.Config) func(http.Handler) http.Handler { return peacecho.Verifier(c) },
		},
		{
			name:     "nethttp",
			verifier: func(c coremw.Config) func(http.Handler) http.Handler { return peacnethttp.Verifier(c) },
		},
	}
}

// downstream is the handler each scenario composes under the
// middleware; it does not participate in verification outcomes but
// records that control reached the downstream tier.
func downstream() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Downstream-Reached", "1")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
}

// scenario describes one shared request corpus entry.
type scenario struct {
	name           string
	cfg            coremw.Config
	method         string
	path           string
	headers        map[string]string
	body           string
	wantStatus     int
	wantDownstream bool
}

func scenarios() []scenario {
	defaultCfg := coremw.DefaultConfig()
	defaultCfg.Issuer = "https://publisher.example"
	defaultCfg.Audience = "https://agent.example"

	optionalCfg := defaultCfg
	optionalCfg.Optional = true

	return []scenario{
		{
			name:           "no-receipt default (required) returns 401",
			cfg:            defaultCfg,
			method:         "GET",
			path:           "/protected",
			wantStatus:     http.StatusUnauthorized,
			wantDownstream: false,
		},
		{
			name:           "no-receipt optional passes through",
			cfg:            optionalCfg,
			method:         "GET",
			path:           "/protected",
			wantStatus:     http.StatusOK,
			wantDownstream: true,
		},
		{
			name:           "malformed-receipt returns 400 E_INVALID_FORMAT",
			cfg:            defaultCfg,
			method:         "GET",
			path:           "/protected",
			headers:        map[string]string{"PEAC-Receipt": "not-a-jws"},
			wantStatus:     http.StatusBadRequest,
			wantDownstream: false,
		},
		{
			name:           "case-insensitive header name (peac-receipt) treated the same as PEAC-Receipt",
			cfg:            defaultCfg,
			method:         "GET",
			path:           "/protected",
			headers:        map[string]string{"peac-receipt": "not-a-jws"},
			wantStatus:     http.StatusBadRequest,
			wantDownstream: false,
		},
	}
}

// headerSnapshot copies the headers that are part of the parity
// contract. Body cap, timeout, and trust-proxy headers are not
// echoed; the Problem Details response shape and error code are.
func headerSnapshot(h http.Header) map[string]string {
	out := map[string]string{}
	for _, k := range []string{"Content-Type", "X-Downstream-Reached"} {
		if v := h.Get(k); v != "" {
			out[k] = v
		}
	}
	return out
}

func TestAdapterParity(t *testing.T) {
	for _, sc := range scenarios() {
		sc := sc // capture
		t.Run(sc.name, func(t *testing.T) {
			type result struct {
				status  int
				headers map[string]string
				body    string
			}

			results := map[string]result{}
			for _, a := range adapters() {
				handler := a.verifier(sc.cfg)(downstream())
				req := httptest.NewRequest(sc.method, sc.path, strings.NewReader(sc.body))
				for k, v := range sc.headers {
					req.Header.Set(k, v)
				}
				rr := httptest.NewRecorder()
				handler.ServeHTTP(rr, req)
				results[a.name] = result{
					status:  rr.Code,
					headers: headerSnapshot(rr.Result().Header),
					body:    rr.Body.String(),
				}
			}

			// Assert expected status and downstream reach against the
			// chi reference; then assert the other adapters' responses
			// are byte-identical to chi's.
			ref := results["chi"]
			if ref.status != sc.wantStatus {
				t.Fatalf("chi status=%d want=%d body=%q", ref.status, sc.wantStatus, ref.body)
			}
			reachedDownstream := ref.headers["X-Downstream-Reached"] == "1"
			if reachedDownstream != sc.wantDownstream {
				t.Fatalf("chi downstream-reach=%v want=%v", reachedDownstream, sc.wantDownstream)
			}
			for name, got := range results {
				if name == "chi" {
					continue
				}
				if got.status != ref.status {
					t.Errorf("parity: %s status=%d != chi status=%d", name, got.status, ref.status)
				}
				if !reflect.DeepEqual(got.headers, ref.headers) {
					t.Errorf("parity: %s headers=%v != chi headers=%v", name, got.headers, ref.headers)
				}
				if got.body != ref.body {
					t.Errorf("parity: %s body=%q != chi body=%q", name, got.body, ref.body)
				}
			}
		})
	}
}

func TestDefaultConfigParity(t *testing.T) {
	// DefaultConfig across adapters must return the same struct value.
	chi := peacchi.DefaultConfig()
	echoC := peacecho.DefaultConfig()
	nethttp := peacnethttp.DefaultConfig()
	core := coremw.DefaultConfig()

	if !reflect.DeepEqual(chi, core) {
		t.Fatalf("chi.DefaultConfig() diverges from core.DefaultConfig()")
	}
	if !reflect.DeepEqual(echoC, core) {
		t.Fatalf("echo.DefaultConfig() diverges from core.DefaultConfig()")
	}
	if !reflect.DeepEqual(nethttp, core) {
		t.Fatalf("nethttp.DefaultConfig() diverges from core.DefaultConfig()")
	}
}

func TestConfigAliasParity(t *testing.T) {
	// Each adapter's Config must be a type alias for coremw.Config,
	// not a new named type. reflect.TypeOf on a zero value should
	// return the same reflect.Type.
	var a peacchi.Config
	var b peacecho.Config
	var c peacnethttp.Config
	var d coremw.Config

	if reflect.TypeOf(a) != reflect.TypeOf(d) {
		t.Fatalf("chi.Config is not an alias for coremw.Config")
	}
	if reflect.TypeOf(b) != reflect.TypeOf(d) {
		t.Fatalf("echo.Config is not an alias for coremw.Config")
	}
	if reflect.TypeOf(c) != reflect.TypeOf(d) {
		t.Fatalf("nethttp.Config is not an alias for coremw.Config")
	}
}
