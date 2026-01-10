# PEAC Go SDK

Go client library for PEAC protocol receipt issuance, verification, and policy evaluation.

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

### Issuing Receipts

```go
package main

import (
    "fmt"
    "log"

    peac "github.com/peacprotocol/peac/sdks/go"
)

func main() {
    // Create a signing key (in production, load from secure storage)
    signingKey, err := peac.GenerateSigningKey("my-key-id")
    if err != nil {
        log.Fatal(err)
    }

    result, err := peac.Issue(peac.IssueOptions{
        Issuer:     "https://publisher.example",
        Audience:   "https://agent.example",
        Amount:     1000,  // Amount in minor units (e.g., cents)
        Currency:   "USD",
        Rail:       "stripe",
        Reference:  "pi_abc123",
        SigningKey: signingKey,
    })
    if err != nil {
        log.Fatal(err)
    }

    fmt.Printf("Receipt JWS: %s\n", result.JWS)
    fmt.Printf("Receipt ID: %s\n", result.ReceiptID)
}
```

### Verifying Receipts

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

### Evaluating Policies

```go
package main

import (
    "fmt"
    "log"

    "github.com/peacprotocol/peac/sdks/go/policy"
)

func main() {
    doc := &policy.PolicyDocument{
        Version: policy.PolicyVersion,
        Rules: []policy.PolicyRule{
            {
                Name:     "allow-crawl",
                Decision: policy.Allow,
                Purpose:  policy.Purposes{policy.PurposeCrawl},
            },
            {
                Name:     "review-training",
                Decision: policy.Review,
                Purpose:  policy.Purposes{policy.PurposeTrain},
            },
        },
        Defaults: &policy.PolicyDefaults{
            Decision: policy.Deny,
            Reason:   "not explicitly allowed",
        },
    }

    result := policy.Evaluate(doc, &policy.EvaluationContext{
        Purpose: policy.PurposeCrawl,
    })

    fmt.Printf("Decision: %s\n", result.Decision)      // "allow"
    fmt.Printf("Matched: %s\n", result.MatchedRule)    // "allow-crawl"
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

- Ed25519 signature signing and verification
- Receipt issuance with UUIDv7 receipt IDs (v0.9.29+)
- Policy evaluation with first-match-wins semantics (v0.9.29+)
- JWKS discovery and caching
- Purpose claims support (v0.9.24+)
- Agent identity attestation support (v0.9.25+)
- Thread-safe JWKS cache with stale-while-revalidate
- Comprehensive error types with retry hints
- Evidence validation with DoS protection (v0.9.29+)

## API Reference

### Issue (v0.9.29+)

```go
func Issue(opts IssueOptions) (*IssueResult, error)
```

Creates a signed PEAC receipt JWS.

#### IssueOptions

| Field        | Type          | Description                                       |
| ------------ | ------------- | ------------------------------------------------- |
| `Issuer`     | `string`      | Issuer URL (required, must be https://)           |
| `Audience`   | `string`      | Audience URL (required, must be https://)         |
| `Amount`     | `int64`       | Amount in minor units (required, >= 0)            |
| `Currency`   | `string`      | ISO 4217 currency code (required, e.g., "USD")    |
| `Rail`       | `string`      | Payment rail identifier (required)                |
| `Reference`  | `string`      | Payment reference (required)                      |
| `SigningKey` | `*SigningKey` | Ed25519 signing key (required)                    |
| `Subject`    | `string`      | Subject URL (optional, must be https://)          |
| `Expiry`     | `int64`       | Unix timestamp for expiry (optional)              |
| `Env`        | `string`      | Environment: "live" or "test" (default: "test")   |
| `Network`    | `string`      | Payment network (optional)                        |
| `Evidence`   | `any`         | Additional evidence (optional, JSON-serializable) |

#### URL Restrictions

All URL fields (`Issuer`, `Audience`, `Subject`) must:

- Use the `https://` scheme
- Have a valid host
- **Not** contain URL fragments (e.g., `#section`)
- **Not** contain userinfo (e.g., `user:pass@`)

#### Evidence Structure

Evidence is placed in `payment.evidence` in the receipt claims (not at the top level):

```go
// Evidence is nested under payment
opts := peac.IssueOptions{
    // ...
    Evidence: map[string]any{"custom": "data"},
}

// In the resulting receipt claims:
// claims.payment.evidence = {"custom": "data"}
```

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

### Policy Evaluation (v0.9.29+)

```go
func Evaluate(policy *PolicyDocument, context *EvaluationContext) *EvaluationResult
```

Evaluates a policy against a context. Rules are evaluated in order; the first matching rule wins.

#### Nil Policy Behavior

If `policy` is nil, `Evaluate` returns a deny result:

```go
result := policy.Evaluate(nil, ctx)
// result.Decision == policy.Deny
// result.Reason == policy.ReasonNilPolicy ("nil policy")
// result.IsDefault == true
```

#### Policy Constants

```go
// Error codes for policy validation
const (
    ErrCodeInvalidPolicy        = "E_INVALID_POLICY"
    ErrCodeInvalidPolicyVersion = "E_INVALID_POLICY_VERSION"
    ErrCodeInvalidPolicyEnum    = "E_INVALID_POLICY_ENUM"
)

// Reason for nil policy evaluation
const ReasonNilPolicy = "nil policy"
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

#### Issue Error Codes (v0.9.29+)

| Code                    | Description                         |
| ----------------------- | ----------------------------------- |
| `E_INVALID_ISSUER`      | Invalid issuer URL                  |
| `E_INVALID_AUDIENCE`    | Invalid audience URL                |
| `E_INVALID_SUBJECT`     | Invalid subject URL                 |
| `E_INVALID_CURRENCY`    | Invalid currency code               |
| `E_INVALID_AMOUNT`      | Invalid amount (negative)           |
| `E_INVALID_EXPIRY`      | Invalid expiry (negative)           |
| `E_INVALID_ENV`         | Invalid env (must be "live"/"test") |
| `E_INVALID_RAIL`        | Missing payment rail                |
| `E_INVALID_REFERENCE`   | Missing payment reference           |
| `E_INVALID_EVIDENCE`    | Evidence validation failed          |
| `E_MISSING_SIGNING_KEY` | No signing key provided             |

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

## Development

### Local Verification

Run all CI checks locally before pushing:

```bash
./scripts/verify.sh
```

This runs: format check, build, test, race detection, middleware tests, and fuzz testing.

### Versioning

The Go SDK uses module-path versioning. Each module has its own tag:

| Module                                                | Tag Pattern                     |
| ----------------------------------------------------- | ------------------------------- |
| `github.com/peacprotocol/peac/sdks/go`                | `sdks/go/vX.Y.Z`                |
| `github.com/peacprotocol/peac/sdks/go/middleware/chi` | `sdks/go/middleware/chi/vX.Y.Z` |
| `github.com/peacprotocol/peac/sdks/go/middleware/gin` | `sdks/go/middleware/gin/vX.Y.Z` |

For example, v0.9.29 would have tags:

- `sdks/go/v0.9.29`
- `sdks/go/middleware/chi/v0.9.29`
- `sdks/go/middleware/gin/v0.9.29`

## Requirements

- Go 1.21 or later
- `golang.org/x/crypto` for Ed25519

## License

Apache-2.0 - see [LICENSE](../../LICENSE)
