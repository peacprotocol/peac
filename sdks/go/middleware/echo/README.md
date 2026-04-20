# @peac/middleware-echo (Go)

PEAC receipt verification middleware for the Echo web framework
(`github.com/labstack/echo/v4`).

## Install

```bash
go get github.com/peacprotocol/peac/sdks/go/middleware/echo
```

This is a separate Go module from the core `sdks/go/middleware` package so
consumers who do not use Echo do not pay for an Echo transitive in their
dependency graph. The adapter itself carries no Echo dependency; it
exposes the stdlib-compatible `func(http.Handler) http.Handler` that
`echo.WrapMiddleware` accepts.

## Usage

```go
import (
    "github.com/labstack/echo/v4"
    peacecho "github.com/peacprotocol/peac/sdks/go/middleware/echo"
)

func main() {
    e := echo.New()
    e.Use(echo.WrapMiddleware(peacecho.Verifier(peacecho.Config{
        Issuer:   "https://publisher.example",
        Audience: "https://agent.example",
    })))

    e.GET("/protected", func(c echo.Context) error {
        claims := peacecho.GetClaims(c.Request())
        _ = claims // use claims.Subject, claims.Purpose, etc.
        return c.String(200, "ok")
    })

    e.Logger.Fatal(e.Start(":8080"))
}
```

## Parity with chi, gin, and nethttp adapters

| Aspect                                      | Contract                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `type Config = middleware.Config`           | identical across all adapters                                                                                         |
| `DefaultConfig()`                           | identical hardened defaults across all adapters (panic recovery on, 1 MiB body cap, `TrustProxyHeaders` off)          |
| `Verifier(cfg Config)`                      | returns `func(http.Handler) http.Handler`; identical verifier semantics                                               |
| Header behavior                             | `PEAC-Receipt` precedence; rail-x402 `PAYMENT-RESPONSE` / `X-PAYMENT-RESPONSE` honored; case-insensitive header names |
| Timeout / body limit / trust-proxy defaults | identical across all adapters                                                                                         |
| Error / status mapping                      | 401 / 400 / 503 taxonomy matches chi and gin exactly                                                                  |

The parity contract is enforced by a shared request-corpus test harness
under `sdks/go/middleware/paritytest/` that runs the same requests
against every adapter and asserts identical responses.

## Reading verified claims inside an Echo handler

```go
e.GET("/receipt-info", func(c echo.Context) error {
    claims := peacecho.GetClaims(c.Request())
    if claims == nil {
        return c.String(401, "no claims")
    }
    return c.JSON(200, claims)
})
```

## Related documents

- [Hosted Verify contract](../../../../docs/HOSTED_VERIFY_CONTRACT.md)
- [Threat model](../../../../docs/THREAT_MODEL.md)
- [Stability contract](../../../../docs/STABILITY-CONTRACT.md)
- [Compatibility matrix for Go middleware](../../../../docs/compatibility/go-middleware.md)
