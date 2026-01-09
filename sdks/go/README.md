# PEAC Go SDK

Go client library for PEAC protocol receipt verification.

## Installation

```bash
go get github.com/peacprotocol/peac/sdks/go
```

## Middleware

Framework-specific middleware packages are available as separate modules to avoid pulling unnecessary dependencies:

```bash
# Chi router
go get github.com/peacprotocol/peac/sdks/go/middleware/chi

# Gin framework
go get github.com/peacprotocol/peac/sdks/go/middleware/gin
```

## Quick Start

```go
package main

import (
    "fmt"
    "log"
    "time"

    peac "github.com/peacprotocol/peac/sdks/go"
)

func main() {
    receiptJWS := "eyJhbGciOiJFZERTQSIsImtpZCI6Ii4uLiJ9..."

    result, err := peac.Verify(receiptJWS, peac.VerifyOptions{
        Issuer:   "https://publisher.example",
        Audience: "https://agent.example",
        MaxAge:   time.Hour,
    })
    if err != nil {
        log.Fatal(err)
    }

    fmt.Printf("Receipt ID: %s\n", result.Claims.ReceiptID)
    fmt.Printf("Issued At: %d\n", result.Claims.IssuedAt)
    fmt.Printf("Purpose: %v\n", result.Claims.PurposeDeclared)
}
```

## Module Versioning

This SDK uses Go module versioning with path prefixes for nested modules. Tags follow the pattern `sdks/go/vX.Y.Z`:

| Module         | Tag Pattern                     | Example                          |
| -------------- | ------------------------------- | -------------------------------- |
| Core SDK       | `sdks/go/vX.Y.Z`                | `sdks/go/v0.9.29`                |
| Chi middleware | `sdks/go/middleware/chi/vX.Y.Z` | `sdks/go/middleware/chi/v0.9.29` |
| Gin middleware | `sdks/go/middleware/gin/vX.Y.Z` | `sdks/go/middleware/gin/v0.9.29` |

This tagging strategy allows `go get` to resolve nested modules correctly from the monorepo.

## Local Development

For local development, use Go workspaces:

```bash
cd sdks/go
go work sync
go test ./...
```

The workspace file (`go.work`) links all modules for seamless local development without modifying `go.mod` files.

## Features

- Ed25519 signature verification
- JWKS discovery and caching
- Purpose claims support (v0.9.24+)
- Agent identity attestation support (v0.9.25+)
- Thread-safe JWKS cache with stale-while-revalidate
- Comprehensive error types with retry hints

## API Reference

### Verify

```go
func Verify(receiptJWS string, opts VerifyOptions) (*VerifyResult, error)
```

Verifies a PEAC receipt JWS and returns the verified claims.

#### VerifyOptions

| Field       | Type              | Description                           |
| ----------- | ----------------- | ------------------------------------- |
| `Issuer`    | `string`          | Expected issuer (required)            |
| `Audience`  | `string`          | Expected audience (required)          |
| `MaxAge`    | `time.Duration`   | Maximum receipt age (default: 1 hour) |
| `ClockSkew` | `time.Duration`   | Clock skew tolerance (default: 30s)   |
| `JWKSURL`   | `string`          | Explicit JWKS URL (optional)          |
| `KeySet`    | `*jwks.KeySet`    | Pre-loaded key set (optional)         |
| `JWKSCache` | `*jwks.Cache`     | JWKS cache instance (optional)        |
| `Context`   | `context.Context` | Request context                       |

#### VerifyResult

```go
type VerifyResult struct {
    Claims          *PEACReceiptClaims
    SubjectSnapshot *SubjectProfileSnapshot
    KeyID           string
    Algorithm       string
    Perf            *VerifyPerf
}
```

### JWKS Caching

For production use, create a shared JWKS cache:

```go
cache := jwks.NewCache(jwks.CacheOptions{
    TTL:                  5 * time.Minute,
    StaleWhileRevalidate: true,
})

result, err := peac.Verify(receiptJWS, peac.VerifyOptions{
    Issuer:    "https://publisher.example",
    Audience:  "https://agent.example",
    JWKSCache: cache,
})
```

### Error Handling

All errors are of type `*PEACError` with structured information:

```go
result, err := peac.Verify(receiptJWS, opts)
if err != nil {
    if peacErr, ok := err.(*peac.PEACError); ok {
        fmt.Printf("Error Code: %s\n", peacErr.Code)
        fmt.Printf("HTTP Status: %d\n", peacErr.HTTPStatus())
        fmt.Printf("Retriable: %v\n", peacErr.IsRetriable())
    }
}
```

#### Error Codes

| Code                  | HTTP | Description                   |
| --------------------- | ---- | ----------------------------- |
| `E_INVALID_SIGNATURE` | 400  | Signature verification failed |
| `E_INVALID_FORMAT`    | 400  | Invalid JWS format            |
| `E_EXPIRED`           | 401  | Receipt has expired           |
| `E_NOT_YET_VALID`     | 401  | Receipt not yet valid         |
| `E_INVALID_ISSUER`    | 400  | Issuer mismatch               |
| `E_INVALID_AUDIENCE`  | 400  | Audience mismatch             |
| `E_JWKS_FETCH_FAILED` | 503  | Failed to fetch JWKS          |
| `E_KEY_NOT_FOUND`     | 400  | Key ID not in JWKS            |

#### Identity Error Codes (v0.9.25+)

| Code                     | HTTP | Description                  |
| ------------------------ | ---- | ---------------------------- |
| `E_IDENTITY_MISSING`     | 401  | No identity attestation      |
| `E_IDENTITY_SIG_INVALID` | 401  | Identity signature invalid   |
| `E_IDENTITY_EXPIRED`     | 401  | Identity attestation expired |
| `E_IDENTITY_KEY_UNKNOWN` | 401  | Identity key not found       |

## Claims Structure

```go
type PEACReceiptClaims struct {
    // Standard JWT claims
    Issuer    string   `json:"iss"`
    Subject   string   `json:"sub,omitempty"`
    Audience  []string `json:"aud,omitempty"`
    IssuedAt  int64    `json:"iat"`
    ExpiresAt int64    `json:"exp,omitempty"`
    JWTID     string   `json:"jti"`

    // PEAC claims
    ReceiptID       string   `json:"receipt_id"`
    PurposeDeclared []string `json:"purpose_declared,omitempty"`
    PurposeEnforced string   `json:"purpose_enforced,omitempty"`
    Decision        string   `json:"decision,omitempty"`

    // Evidence
    Payment      *PaymentEvidence `json:"payment,omitempty"`
    Attestations []Attestation    `json:"attestations,omitempty"`
}
```

## Agent Identity (v0.9.25+)

The SDK supports agent identity attestations:

```go
type AgentIdentityEvidence struct {
    AgentID         string      `json:"agent_id"`
    ControlType     string      `json:"control_type"`  // "operator" or "user-delegated"
    Capabilities    []string    `json:"capabilities,omitempty"`
    DelegationChain []string    `json:"delegation_chain,omitempty"`
    Proof           *AgentProof `json:"proof,omitempty"`
}
```

## Requirements

- Go 1.21 or later
- `golang.org/x/crypto` for Ed25519

## License

MIT License - see [LICENSE](../../LICENSE)
