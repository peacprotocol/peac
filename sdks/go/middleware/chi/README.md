# @peac/middleware-chi (Go)

PEAC receipt verification middleware for the Chi router
(`github.com/go-chi/chi/v5`).

## Install

```bash
go get github.com/peacprotocol/peac/sdks/go/middleware/chi
```

This is a separate Go module from the core `sdks/go/middleware` package so
consumers who do not use Chi do not pay for a Chi transitive in their
dependency graph. The adapter itself carries no Chi dependency; it
exposes the stdlib-compatible `func(http.Handler) http.Handler` that
Chi's `r.Use(...)` accepts natively.

Applications that do not already depend on Chi should also add
`github.com/go-chi/chi/v5`; the PEAC adapter module intentionally does
not depend on Chi directly.

## Usage

```go
import (
    "encoding/json"
    "net/http"

    "github.com/go-chi/chi/v5"
    peacchi "github.com/peacprotocol/peac/sdks/go/middleware/chi"
)

func main() {
    r := chi.NewRouter()
    r.Use(peacchi.Verifier(peacchi.Config{
        Issuer:   "https://publisher.example",
        Audience: "https://agent.example",
    }))

    r.Get("/protected", protected)

    http.ListenAndServe(":8080", r)
}

func protected(w http.ResponseWriter, r *http.Request) {
    claims := peacchi.GetClaims(r)
    _ = claims // use claims.Subject, claims.Purpose, etc.
    w.WriteHeader(200)
}
```

## Parity with echo, gin, and nethttp adapters

| Aspect                                      | Contract                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `type Config = middleware.Config`           | identical across all adapters                                                                                         |
| `DefaultConfig()`                           | identical hardened defaults (panic recovery on, 1 MiB body cap, `TrustProxyHeaders` off)                              |
| `Verifier(cfg Config)`                      | returns `func(http.Handler) http.Handler`; identical verifier semantics                                               |
| Header behavior                             | `PEAC-Receipt` precedence; rail-x402 `PAYMENT-RESPONSE` / `X-PAYMENT-RESPONSE` honored; case-insensitive header names |
| Timeout / body limit / trust-proxy defaults | identical across all adapters                                                                                         |
| Error / status mapping                      | 401 / 400 / 503 taxonomy matches echo, gin, and nethttp exactly                                                       |

The parity contract is enforced by a shared request-corpus test harness
under `sdks/go/middleware/paritytest/` that runs the same requests
against every adapter and asserts identical responses. The chi adapter
is used as the reference adapter in that harness, so per-adapter tests
under this module assert the localized invariants (Config alias,
DefaultConfig match, required 401, optional pass-through) that the
parity harness composes against.

## Reading verified claims inside a Chi handler

```go
r.Get("/receipt-info", func(w http.ResponseWriter, r *http.Request) {
    claims := peacchi.GetClaims(r)
    if claims == nil {
        http.Error(w, "no claims", http.StatusUnauthorized)
        return
    }
    json.NewEncoder(w).Encode(claims)
})
```

## Related documents

- [Hosted Verify contract](../../../../docs/HOSTED_VERIFY_CONTRACT.md)
- [Threat model](../../../../docs/THREAT_MODEL.md)
- [Stability contract](../../../../docs/STABILITY-CONTRACT.md)
- [Compatibility matrix for Go middleware](../../../../docs/compatibility/go-middleware.md)
