// Bounded token-bucket rate limiter for the PEAC middleware.
//
// Production-grade properties:
//
//   - Bounded state. The per-IP / per-issuer map has a hard MaxEntries cap
//     and an IdleTTL eviction sweep so long-lived processes cannot be made
//     to leak memory by rotating identifiers.
//   - Three strategies: Global (one bucket for the whole middleware),
//     PerIP (one bucket per client address), PerIssuer (one bucket per
//     verified receipt issuer).
//   - Proxy-aware client-IP extraction is opt-in via
//     Config.TrustProxyHeaders; the safe default uses r.RemoteAddr only.
//   - RFC 9457 problem-details response on rejection with a Retry-After
//     header derived from the bucket's refill rate.
//
// No external dependencies: a tiny inline token-bucket implementation
// keeps the middleware module free of extra imports.

package middleware

import (
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// RateLimitStrategy selects what the limiter keys its buckets on.
type RateLimitStrategy string

const (
	// RateLimitGlobal uses a single bucket for every request.
	RateLimitGlobal RateLimitStrategy = "global"
	// RateLimitPerIP uses one bucket per client IP.
	RateLimitPerIP RateLimitStrategy = "per_ip"
	// RateLimitPerIssuer uses one bucket per verified issuer claim.
	RateLimitPerIssuer RateLimitStrategy = "per_issuer"
)

// RateLimitConfig configures the bounded token-bucket rate limiter. A zero
// value disables the limiter. When enabled, RatePerSecond and Burst are
// required; all other fields default to safe values.
type RateLimitConfig struct {
	// Strategy selects the key dimension (default: RateLimitPerIP).
	Strategy RateLimitStrategy

	// RatePerSecond is the refill rate in tokens per second (required).
	RatePerSecond float64

	// Burst is the bucket capacity (required).
	Burst int

	// IdleTTL evicts a bucket that has been idle for this long (default:
	// 10 minutes). Eviction runs on demand during Allow() and keeps
	// memory usage bounded under identifier churn.
	IdleTTL time.Duration

	// MaxEntries caps the per-key map size (default: 10000). On overflow
	// the oldest (least-recently-used-by-touch) entry is evicted.
	MaxEntries int
}

type bucket struct {
	tokens  float64
	last    time.Time
	touched time.Time
}

type rateLimiter struct {
	strategy      RateLimitStrategy
	ratePerSecond float64
	burst         float64
	idleTTL       time.Duration
	maxEntries    int

	mu      sync.Mutex
	buckets map[string]*bucket
	global  *bucket
}

func newRateLimiter(cfg RateLimitConfig) *rateLimiter {
	if cfg.Strategy == "" {
		cfg.Strategy = RateLimitPerIP
	}
	if cfg.IdleTTL == 0 {
		cfg.IdleTTL = 10 * time.Minute
	}
	if cfg.MaxEntries == 0 {
		cfg.MaxEntries = 10000
	}
	rl := &rateLimiter{
		strategy:      cfg.Strategy,
		ratePerSecond: cfg.RatePerSecond,
		burst:         float64(cfg.Burst),
		idleTTL:       cfg.IdleTTL,
		maxEntries:    cfg.MaxEntries,
		buckets:       make(map[string]*bucket),
	}
	if cfg.Strategy == RateLimitGlobal {
		now := time.Now()
		rl.global = &bucket{tokens: float64(cfg.Burst), last: now, touched: now}
	}
	return rl
}

// allow returns (true, 0) if a token is available, or (false, retryAfter) if
// not. retryAfter is the duration until the next token becomes available.
func (rl *rateLimiter) allow(key string) (bool, time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b := rl.getOrCreate(key, now)
	elapsed := now.Sub(b.last).Seconds()
	b.tokens += elapsed * rl.ratePerSecond
	if b.tokens > rl.burst {
		b.tokens = rl.burst
	}
	b.last = now
	b.touched = now

	if b.tokens >= 1 {
		b.tokens -= 1
		return true, 0
	}
	deficit := 1 - b.tokens
	retry := time.Duration(deficit / rl.ratePerSecond * float64(time.Second))
	return false, retry
}

func (rl *rateLimiter) getOrCreate(key string, now time.Time) *bucket {
	if rl.strategy == RateLimitGlobal {
		return rl.global
	}
	if b, ok := rl.buckets[key]; ok {
		return b
	}
	rl.evictExpired(now)
	if len(rl.buckets) >= rl.maxEntries {
		rl.evictOldest()
	}
	b := &bucket{tokens: rl.burst, last: now, touched: now}
	rl.buckets[key] = b
	return b
}

func (rl *rateLimiter) evictExpired(now time.Time) {
	cutoff := now.Add(-rl.idleTTL)
	for k, b := range rl.buckets {
		if b.touched.Before(cutoff) {
			delete(rl.buckets, k)
		}
	}
}

func (rl *rateLimiter) evictOldest() {
	var oldestKey string
	var oldestAt time.Time
	first := true
	for k, b := range rl.buckets {
		if first || b.touched.Before(oldestAt) {
			oldestKey = k
			oldestAt = b.touched
			first = false
		}
	}
	if !first {
		delete(rl.buckets, oldestKey)
	}
}

// size returns the current bucket-map size. Intended for tests.
func (rl *rateLimiter) size() int {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	return len(rl.buckets)
}

// rateLimitKey derives the bucket key for the supplied request under the
// configured strategy. It honors cfg.TrustProxyHeaders for client-IP
// resolution: when false (the default), only r.RemoteAddr is consulted;
// when true, the first valid IP from X-Forwarded-For (rightmost trusted
// hop) wins, falling back to X-Real-IP, then r.RemoteAddr. Per-issuer
// strategy pulls the verified claim from the request context (requires a
// successful upstream verify before the limiter decision).
func rateLimitKey(r *http.Request, cfg Config) string {
	switch cfg.RateLimit.Strategy {
	case RateLimitGlobal:
		return "__global__"
	case RateLimitPerIssuer:
		if claims := GetClaims(r); claims != nil && claims.Issuer != "" {
			return "iss:" + claims.Issuer
		}
		// Fall back to client IP if the limiter runs before verification.
		return clientIP(r, cfg.TrustProxyHeaders)
	default:
		return clientIP(r, cfg.TrustProxyHeaders)
	}
}

func clientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if v := r.Header.Get("X-Forwarded-For"); v != "" {
			parts := strings.Split(v, ",")
			// Rightmost entry is the closest trusted hop when multiple
			// proxies prepend themselves. Callers must ensure their proxy
			// chain is terminated before the middleware.
			candidate := strings.TrimSpace(parts[len(parts)-1])
			if ip := net.ParseIP(candidate); ip != nil {
				return candidate
			}
		}
		if v := strings.TrimSpace(r.Header.Get("X-Real-IP")); v != "" {
			if ip := net.ParseIP(v); ip != nil {
				return v
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// writeRateLimitResponse emits an RFC 9457 problem-details response for a
// rate-limit rejection. Retry-After uses integer seconds per RFC 9110.
func writeRateLimitResponse(w http.ResponseWriter, retryAfter time.Duration) {
	seconds := int(retryAfter.Seconds())
	if seconds < 1 {
		seconds = 1
	}
	w.Header().Set("Retry-After", strconv.Itoa(seconds))
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(http.StatusTooManyRequests)
	resp := map[string]any{
		"type":     "https://www.peacprotocol.org/errors/rate_limited",
		"title":    "E_RATE_LIMITED",
		"status":   http.StatusTooManyRequests,
		"detail":   "rate limit exceeded",
		"instance": "peac:middleware:rate-limit-exceeded",
	}
	_ = json.NewEncoder(w).Encode(resp)
}
