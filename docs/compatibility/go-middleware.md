# Go Middleware Production Hardening

**Since:** v0.12.11
**Package:** `github.com/peacprotocol/peac/sdks/go/middleware`

## Abstract

Promotes the Go HTTP middleware from experimental to a bounded, opt-in production hardening layer: panic recovery, a bounded token-bucket rate limiter, structured Logger and Metrics interfaces, opt-in proxy-aware client-IP extraction, a request-body cap, and a per-request timeout. All additions are opt-in via `Config`; existing callers continue to work with `DefaultConfig()` hardened defaults.

## Stability classes

| Adapter                           | Package                      | Class  |
| --------------------------------- | ---------------------------- | ------ |
| Core HTTP middleware (`http.go`)  | `.../sdks/go/middleware`     | Stable |
| `chi` adapter (`middleware/chi/`) | `.../sdks/go/middleware/chi` | Stable |
| `gin` adapter (`middleware/gin/`) | `.../sdks/go/middleware/gin` | Stable |

Submodule adapters for `echo` and `net/http` are tracked for a follow-up release; the core HTTP middleware is usable from any `http.Handler`-compatible router in the meantime.

## What hardening adds

### Panic recovery

When `Config.RecoverPanics` is true (the default), any panic in a downstream handler is caught, logged via `Logger` with the stable code `PEAC_MIDDLEWARE_PANIC`, counted via `Metrics.peac.middleware.panics`, and converted to an RFC 9457 problem-details response with `instance: peac:middleware:panic-recovered`. Stack traces are logged (not emitted over the wire) to avoid leaking internal detail.

Test harnesses can set `Config.PanicRethrowInTest = true` to log and re-panic so the original stack surfaces in test output.

### Bounded token-bucket rate limiter

`RateLimitConfig` selects one of three strategies:

| Strategy             | Key                                 |
| -------------------- | ----------------------------------- |
| `RateLimitGlobal`    | one bucket for the whole middleware |
| `RateLimitPerIP`     | one bucket per client IP (default)  |
| `RateLimitPerIssuer` | one bucket per verified `iss` claim |

The limiter is bounded by `MaxEntries` (default 10000) with an `IdleTTL` sweep (default 10 minutes) so long-lived processes cannot leak memory under identifier churn. On rejection the response is RFC 9457 problem-details with `Retry-After` in integer seconds per RFC 9110 and `instance: peac:middleware:rate-limit-exceeded`.

`RateLimitPerIssuer` falls back to the IP-based key when the limiter fires before receipt verification has populated claims.

### Observability hooks

`Logger` and `Metrics` are minimal interfaces the host application implements to plug in `slog`, `zap`, OpenTelemetry, Prometheus, or any similar tool. The middleware does not take a dependency on any specific library. `NoopLogger` and `NoopMetrics` are the defaults. Key names use the OpenTelemetry `peac.*` semantic-convention pattern (e.g. `peac.receipt.ref`, `peac.error.code`, `peac.verify.duration_ms`).

### Proxy trust (opt-in)

`Config.TrustProxyHeaders` defaults to **false**. Client-IP extraction then uses only `r.RemoteAddr`. When the host application terminates a trusted proxy chain before the middleware, callers can set `TrustProxyHeaders = true` to honor the rightmost hop of `X-Forwarded-For` and then `X-Real-IP`. Untrusted deployments must leave this off to prevent clients from spoofing their own rate-limit key.

### Body-size cap + request timeout

`Config.MaxBodyBytes` wraps `r.Body` with `http.MaxBytesReader` so downstream handlers that exceed the cap receive a bounded-read error instead of accepting unbounded payloads. `DefaultConfig()` sets this to 1 MiB.

`Config.RequestTimeout` installs a `context.WithTimeout` on the request so long-running downstream handlers cancel cleanly.

## Production-deployment notes

Recommended baseline for untrusted network exposure:

```go
cfg := middleware.Config{
    Issuer:              "https://your-service.example.com",
    Audience:            "your-audience",
    Logger:              yourLogger,
    Metrics:             yourMetrics,
    RecoverPanics:       true,
    RequestTimeout:      5 * time.Second,
    MaxBodyBytes:        1 << 20, // 1 MiB
    TrustProxyHeaders:   false,
    RateLimit: middleware.RateLimitConfig{
        Strategy:      middleware.RateLimitPerIP,
        RatePerSecond: 20,
        Burst:         40,
    },
}
```

Behind a trusted reverse proxy terminating TLS and a correct `X-Forwarded-For` chain, `TrustProxyHeaders = true` is appropriate; the middleware uses only the rightmost valid address and ignores upstream entries.

## Non-goals

- PEAC does not bind payment rails, schemes, or trust-score systems at the middleware layer.
- The rate limiter is a blast-radius control, not a billing primitive.
- The middleware does not implement a circuit breaker or retry loop; JWKS caching remains the responsibility of `@peac/jwks-cache`.

## See also

- [`sdks/go/middleware/http.go`](../../sdks/go/middleware/http.go)
- [`sdks/go/middleware/observability.go`](../../sdks/go/middleware/observability.go)
- [`sdks/go/middleware/recover.go`](../../sdks/go/middleware/recover.go)
- [`sdks/go/middleware/ratelimit.go`](../../sdks/go/middleware/ratelimit.go)
