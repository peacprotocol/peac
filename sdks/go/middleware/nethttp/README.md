# @peac/middleware-nethttp (Go)

PEAC receipt verification middleware for the Go standard library
`net/http` package.

## Install

```bash
go get github.com/peacprotocol/peac/sdks/go/middleware/nethttp
```

This is a separate Go module that re-exports the core PEAC middleware
under a framework-specific path. It carries no additional dependencies
beyond the core SDK, so using the named net/http adapter is equivalent
to using the core middleware directly; the separate module exists so
the adapter-per-framework pattern (chi, gin, echo, nethttp) is uniform.

## Usage

```go
import (
    "net/http"
    peacnethttp "github.com/peacprotocol/peac/sdks/go/middleware/nethttp"
)

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/protected", protected)

    verified := peacnethttp.Verifier(peacnethttp.Config{
        Issuer:   "https://publisher.example",
        Audience: "https://agent.example",
    })(mux)

    http.ListenAndServe(":8080", verified)
}

func protected(w http.ResponseWriter, r *http.Request) {
    claims := peacnethttp.GetClaims(r)
    _ = claims // use claims.Subject, claims.Purpose, etc.
    w.WriteHeader(200)
}
```

## Parity with chi, gin, and echo adapters

| Aspect                                      | Contract                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `type Config = middleware.Config`           | identical across all adapters                                                                                         |
| `DefaultConfig()`                           | identical hardened defaults (panic recovery on, 1 MiB body cap, `TrustProxyHeaders` off)                              |
| `Verifier(cfg Config)`                      | returns `func(http.Handler) http.Handler`; identical verifier semantics                                               |
| Header behavior                             | `PEAC-Receipt` precedence; rail-x402 `PAYMENT-RESPONSE` / `X-PAYMENT-RESPONSE` honored; case-insensitive header names |
| Timeout / body limit / trust-proxy defaults | identical across all adapters                                                                                         |
| Error / status mapping                      | 401 / 400 / 503 taxonomy matches chi and gin exactly                                                                  |

The parity contract is enforced by a shared request-corpus test harness
under `sdks/go/middleware/paritytest/` that runs the same requests
against every adapter and asserts identical responses.

## Related documents

- [Hosted Verify contract](../../../../docs/HOSTED_VERIFY_CONTRACT.md)
- [Threat model](../../../../docs/THREAT_MODEL.md)
- [Stability contract](../../../../docs/STABILITY-CONTRACT.md)
- [Compatibility matrix for Go middleware](../../../../docs/compatibility/go-middleware.md)
