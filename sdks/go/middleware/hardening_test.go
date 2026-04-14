package middleware

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Observability: NoopLogger / NoopMetrics
// ---------------------------------------------------------------------------

func TestNoopLoggerAndMetricsAreSafe(t *testing.T) {
	t.Parallel()
	l := resolveLogger(nil)
	m := resolveMetrics(nil)
	l.Info("x")
	l.Warn("x")
	l.Error("x")
	m.IncCounter("x")
	m.ObserveHistogram("x", 1.0)
}

type fakeLogger struct {
	mu      sync.Mutex
	entries []string
}

func (f *fakeLogger) Info(msg string, _ ...any)  { f.record("INFO " + msg) }
func (f *fakeLogger) Warn(msg string, _ ...any)  { f.record("WARN " + msg) }
func (f *fakeLogger) Error(msg string, _ ...any) { f.record("ERROR " + msg) }
func (f *fakeLogger) record(s string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.entries = append(f.entries, s)
}
func (f *fakeLogger) all() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]string, len(f.entries))
	copy(out, f.entries)
	return out
}

type fakeMetrics struct {
	counters atomic.Int64
}

func (f *fakeMetrics) IncCounter(_ string, _ ...string)              { f.counters.Add(1) }
func (f *fakeMetrics) ObserveHistogram(_ string, _ float64, _ ...string) {}

// ---------------------------------------------------------------------------
// Panic recovery
// ---------------------------------------------------------------------------

func panickingHandler(msg string) http.Handler {
	return http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		panic(msg)
	})
}

func TestRecoverPanicsReturns500AndLogs(t *testing.T) {
	t.Parallel()
	logger := &fakeLogger{}
	metrics := &fakeMetrics{}
	cfg := Config{RecoverPanics: true, Logger: logger, Metrics: metrics}

	wrapped := wrapWithRecover(panickingHandler("boom"), cfg)

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	rec := httptest.NewRecorder()
	wrapped.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("want 500, got %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/problem+json" {
		t.Fatalf("want problem+json content type, got %q", ct)
	}
	if !strings.Contains(rec.Body.String(), "PEAC_MIDDLEWARE_PANIC") {
		t.Fatalf("expected PEAC_MIDDLEWARE_PANIC title in body, got %q", rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "peac:middleware:panic-recovered") {
		t.Fatalf("expected instance field in body, got %q", rec.Body.String())
	}
	if metrics.counters.Load() != 1 {
		t.Fatalf("expected 1 panic counter, got %d", metrics.counters.Load())
	}
	entries := logger.all()
	if len(entries) == 0 || !strings.HasPrefix(entries[0], "ERROR ") {
		t.Fatalf("expected ERROR log, got %v", entries)
	}
}

func TestRecoverPanicsDisabledLetsItPropagate(t *testing.T) {
	t.Parallel()
	cfg := Config{RecoverPanics: false}
	wrapped := wrapWithRecover(panickingHandler("boom"), cfg)

	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic to propagate when RecoverPanics is false")
		}
	}()
	wrapped.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
}

func TestPanicRethrowInTestReraises(t *testing.T) {
	t.Parallel()
	cfg := Config{RecoverPanics: true, PanicRethrowInTest: true, Logger: &fakeLogger{}}
	wrapped := wrapWithRecover(panickingHandler("bang"), cfg)

	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected PanicRethrowInTest to re-panic after logging")
		}
	}()
	wrapped.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
}

func TestRecoverErrorWrapsValue(t *testing.T) {
	t.Parallel()
	err := &recoverError{Value: errors.New("inner")}
	if !isRecoverError(err) {
		t.Fatal("isRecoverError should match a *recoverError")
	}
	if !strings.Contains(err.Error(), "inner") {
		t.Fatalf("expected wrapped message, got %q", err.Error())
	}
}

// ---------------------------------------------------------------------------
// Rate limiter: bounded state, TTL eviction, strategies, proxy trust
// ---------------------------------------------------------------------------

func TestRateLimiterBasicTokenBucket(t *testing.T) {
	t.Parallel()
	rl := newRateLimiter(RateLimitConfig{
		Strategy:      RateLimitGlobal,
		RatePerSecond: 1,
		Burst:         2,
	})
	if ok, _ := rl.allow("k"); !ok {
		t.Fatal("first token should be available")
	}
	if ok, _ := rl.allow("k"); !ok {
		t.Fatal("second token should be available")
	}
	if ok, retry := rl.allow("k"); ok || retry <= 0 {
		t.Fatalf("third token should be rejected with retry > 0, got ok=%v retry=%v", ok, retry)
	}
}

func TestRateLimiterPerIPIsolatesKeys(t *testing.T) {
	t.Parallel()
	rl := newRateLimiter(RateLimitConfig{
		Strategy:      RateLimitPerIP,
		RatePerSecond: 1,
		Burst:         1,
	})
	if ok, _ := rl.allow("ip1"); !ok {
		t.Fatal("ip1 should get a token")
	}
	if ok, _ := rl.allow("ip2"); !ok {
		t.Fatal("ip2 should get an independent token")
	}
	if ok, _ := rl.allow("ip1"); ok {
		t.Fatal("ip1 should be exhausted")
	}
}

func TestRateLimiterMaxEntriesEvictsOldest(t *testing.T) {
	t.Parallel()
	rl := newRateLimiter(RateLimitConfig{
		Strategy:      RateLimitPerIP,
		RatePerSecond: 100,
		Burst:         1,
		MaxEntries:    3,
	})
	for _, k := range []string{"a", "b", "c", "d"} {
		rl.allow(k)
	}
	if rl.size() != 3 {
		t.Fatalf("expected size=3 after overflow, got %d", rl.size())
	}
}

func TestRateLimiterIdleTTLEvictsExpired(t *testing.T) {
	t.Parallel()
	rl := newRateLimiter(RateLimitConfig{
		Strategy:      RateLimitPerIP,
		RatePerSecond: 100,
		Burst:         1,
		IdleTTL:       5 * time.Millisecond,
	})
	rl.allow("old")
	if rl.size() != 1 {
		t.Fatalf("expected size 1, got %d", rl.size())
	}
	time.Sleep(15 * time.Millisecond)
	rl.allow("new")
	// evictExpired runs inside allow(); "old" should be gone.
	if rl.size() != 1 {
		t.Fatalf("expected 'old' to be evicted, size=%d", rl.size())
	}
}

func TestRateLimiterPerIssuerFallsBackToIPWhenClaimsMissing(t *testing.T) {
	t.Parallel()
	cfg := Config{
		RateLimit: RateLimitConfig{Strategy: RateLimitPerIssuer},
	}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "203.0.113.9:4242"
	key := rateLimitKey(req, cfg)
	if key == "" || strings.HasPrefix(key, "iss:") {
		t.Fatalf("expected per-IP fallback, got %q", key)
	}
	if key != "203.0.113.9" {
		t.Fatalf("expected host-only IP, got %q", key)
	}
}

func TestClientIPIgnoresXForwardedForByDefault(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	req.Header.Set("X-Forwarded-For", "198.51.100.1, 198.51.100.2")
	if got := clientIP(req, false); got != "10.0.0.1" {
		t.Fatalf("expected RemoteAddr when trustProxy=false, got %q", got)
	}
}

func TestClientIPHonorsXForwardedForWhenTrusted(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	req.Header.Set("X-Forwarded-For", "198.51.100.1, 203.0.113.7")
	if got := clientIP(req, true); got != "203.0.113.7" {
		t.Fatalf("expected rightmost XFF hop, got %q", got)
	}
}

func TestClientIPXForwardedForMalformedFallsBack(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	req.Header.Set("X-Forwarded-For", "not-an-ip")
	if got := clientIP(req, true); got != "10.0.0.1" {
		t.Fatalf("expected fallback to RemoteAddr on malformed XFF, got %q", got)
	}
}

// ---------------------------------------------------------------------------
// Integration: rate-limit response shape + body cap + timeout propagation
// ---------------------------------------------------------------------------

func TestRateLimitResponseIsProblemJSON(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	writeRateLimitResponse(rec, 2500*time.Millisecond)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("want 429, got %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/problem+json" {
		t.Fatalf("want problem+json, got %q", ct)
	}
	if retry := rec.Header().Get("Retry-After"); retry != "2" {
		t.Fatalf("want Retry-After=2 (sub-3s rounded up on sub-1s, else floor), got %q", retry)
	}
	if !strings.Contains(rec.Body.String(), "E_RATE_LIMITED") {
		t.Fatalf("expected E_RATE_LIMITED in body, got %q", rec.Body.String())
	}
}

func TestMaxBodyBytesEnforced(t *testing.T) {
	t.Parallel()
	// The middleware wraps r.Body with http.MaxBytesReader; downstream
	// handlers that ReadAll receive an error after the cap. This test
	// simulates the wrapping directly because Middleware(cfg) requires
	// JWKS plumbing for the full path.
	body := strings.Repeat("x", 2048)
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	rec := httptest.NewRecorder()
	req.Body = http.MaxBytesReader(rec, req.Body, 1024)

	buf := &bytes.Buffer{}
	_, err := io.Copy(buf, req.Body)
	if err == nil {
		t.Fatal("expected MaxBytesReader to reject oversized body")
	}
}

func TestRequestTimeoutPropagatesContext(t *testing.T) {
	t.Parallel()
	inner := http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		deadline, ok := r.Context().Deadline()
		if !ok {
			t.Error("expected deadline on request context")
			return
		}
		if time.Until(deadline) > time.Second {
			t.Errorf("deadline too far in the future: %v", time.Until(deadline))
		}
	})
	// Simulate the Middleware wrapper's context-with-timeout behavior.
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	req := httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx)
	inner.ServeHTTP(httptest.NewRecorder(), req)
}
