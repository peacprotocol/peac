# PEAC Go SDK

Go library for PEAC interaction record issuance, local verification, and policy evaluation
(Wire 0.2, `interaction-record+jwt`).

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

### Issuing records

```go
package main

import (
    "fmt"
    "log"

    peac "github.com/peacprotocol/peac/sdks/go"
    "github.com/peacprotocol/peac/sdks/go/jws"
)

func main() {
    // Create a signing key (in production, load from secure storage).
    // The key ID becomes the JWS `kid` header.
    signingKey, err := jws.GenerateSigningKey("https://api.example.com/keys/1")
    if err != nil {
        log.Fatal(err)
    }

    result, err := peac.Issue(peac.IssueOptions{
        Iss:     "https://api.example.com",
        Kind:    peac.KindEvidence,
        Type:    "org.peacprotocol/payment",
        Pillars: []string{"commerce"},
        Extensions: map[string]any{
            "org.peacprotocol/commerce": map[string]any{
                "payment_rail": "x402",
                "amount_minor": "1000",
                "currency":     "USD",
            },
        },
        SigningKey: signingKey,
    })
    if err != nil {
        log.Fatal(err)
    }

    fmt.Printf("Record JWS: %s\n", result.JWS)
    fmt.Printf("Record ID: %s\n", result.ReceiptID)
}
```

### Verifying records locally

Verification runs entirely locally against a supplied public key. No network request, JWKS
discovery, or issuer callback is made.

```go
package main

import (
    "fmt"
    "log"

    peac "github.com/peacprotocol/peac/sdks/go"
    "github.com/peacprotocol/peac/sdks/go/jws"
)

func main() {
    recordJWS := "eyJhbGciOiJFZERTQSIsInR5cCI6ImludGVyYWN0aW9uLXJlY29yZCtqd3QiLCJraWQiOiIuLi4ifQ..."

    // The verifier needs only the issuer's 32-byte Ed25519 public key.
    publicKey, err := jws.ParsePublicKeyFromBytes(rawPublicKeyBytes())
    if err != nil {
        log.Fatal(err)
    }

    result := peac.VerifyLocal(recordJWS, peac.VerifyLocalOptions{
        PublicKey: publicKey,
        Issuer:    "https://api.example.com", // optional: iss must match when set
    })
    if !result.Valid {
        log.Fatalf("verification failed: %s: %s", result.ErrorCode, result.ErrorMessage)
    }

    fmt.Printf("Issuer: %s\n", result.Claims.Iss)
    fmt.Printf("Kind: %s, Type: %s\n", result.Claims.Kind, result.Claims.Type)
    fmt.Printf("Key ID: %s, Wire: %s\n", result.Kid, result.WireVersion)
}

// rawPublicKeyBytes returns the issuer's raw 32-byte Ed25519 public key, for example
// decoded from the base64url `x` member of the issuer's public JWK.
func rawPublicKeyBytes() []byte { /* ... */ return nil }
```

A valid result establishes that the record was signed by the private key matching the supplied
public key and has not changed since. It does not establish that the key or its holder should be
trusted, or that the statements inside the record are true.

### Binding a policy document

A record may carry a `policy` block whose `digest` is the JCS (RFC 8785) SHA-256 digest of a policy
document. A verifier that holds its own copy of that document can check the binding:

```go
policyJSON := []byte(`{"version":"peac-policy/0.1","rules":[]}`)

digest, err := peac.ComputePolicyDigest(policyJSON) // "sha256:<hex>" over RFC 8785 JCS bytes
if err != nil {
    log.Fatal(err)
}

issued, err := peac.Issue(peac.IssueOptions{
    Iss:        "https://api.example.com",
    Kind:       peac.KindEvidence,
    Type:       "org.peacprotocol/api-call",
    Policy:     &peac.PolicyBlock{Digest: digest, URI: "https://api.example.com/.well-known/peac.txt"},
    SigningKey: signingKey,
})
if err != nil {
    log.Fatal(err)
}

result := peac.VerifyLocal(issued.JWS, peac.VerifyLocalOptions{
    PublicKey:   signingKey.PublicKey(),
    PolicyBytes: policyJSON, // the verifier's own copy of the policy document
})
fmt.Printf("Policy binding: %s\n", result.PolicyBinding) // verified, failed, or unavailable
```

A `verified` binding means the digest in the record matches the digest of the bytes the verifier
supplied. It binds bytes, not events: it does not establish that the policy was applied.

### Evaluating policies

```go
package main

import (
    "fmt"

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

- Ed25519 signing and verification (RFC 8032, PEAC admissibility profile)
- Interaction record issuance (Wire 0.2, `interaction-record+jwt`) with UUIDv7 record IDs
- Local verification with a supplied public key (`VerifyLocal`); no network access
- RFC 7493 I-JSON admission applied on both issuance and verification
- JWS `kid` bounded by UTF-8 byte length (at most 256 UTF-8 bytes) on issuance and verification
- Policy digest computation and three-state policy binding (RFC 8785 JCS + SHA-256)
- Policy evaluation with first-match-wins semantics
- Evidence validation with DoS protection limits on extension values
- JWKS fetch and caching helpers (`jwks` package)

## API Reference

### Issue

```go
func Issue(opts IssueOptions) (*IssueResult, error)
func IssueJWS(opts IssueOptions) (string, error)
```

Creates a signed interaction record in the current stable format (`interaction-record+jwt`).
Validates all inputs, generates a UUIDv7 record ID, and signs with Ed25519.

#### IssueOptions

| Field            | Type                 | Description                                                                               |
| ---------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| `Iss`            | `string`             | Issuer URI (required; must start with `https://` or `did:`)                               |
| `Kind`           | `string`             | Structural kind (required): `peac.KindEvidence` or `peac.KindChallenge`                   |
| `Type`           | `string`             | Semantic type (required), reverse-DNS or URI, e.g. `org.peacprotocol/mcp-tool-call`       |
| `SigningKey`     | `*jws.SigningKey`    | Ed25519 signing key (required); its key ID becomes the JWS `kid` header                   |
| `Kid`            | `string`             | Deprecated. Leave empty or equal to `SigningKey.KeyID()`; a conflicting value is rejected |
| `Sub`            | `string`             | Optional subject URI                                                                      |
| `Exp`            | `int64`              | Optional expiration (Unix seconds)                                                        |
| `Pillars`        | `[]string`           | Optional pillar values from the closed 10-pillar taxonomy (`peac.ValidPillars`)           |
| `Actor`          | `*ActorBinding`      | Optional top-level actor binding                                                          |
| `Extensions`     | `map[string]any`     | Optional extension map (`ext` claim)                                                      |
| `Policy`         | `*PolicyBlock`       | Optional policy binding block (`digest`, `uri`, `version`)                                |
| `Clock`          | `Clock`              | Optional clock for timestamp generation (system clock if nil)                             |
| `IDGen`          | `ReceiptIDGenerator` | Optional record-ID generator (UUIDv7 if nil)                                              |
| `EvidenceLimits` | `evidence.Limits`    | Optional DoS-protection limits on extension values (defaults if zero)                     |

#### IssueResult

| Field       | Type     | Description                                    |
| ----------- | -------- | ---------------------------------------------- |
| `JWS`       | `string` | Compact JWS serialization of the signed record |
| `ReceiptID` | `string` | Generated UUIDv7 record identifier             |
| `IssuedAt`  | `int64`  | Issuance time (Unix seconds)                   |

#### Issue error codes

Issuance failures return `*IssueError` with `Code`, `Message`, and `Field`:

| Code                   | Description                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| `MISSING_ISSUER`       | `Iss` is empty                                                           |
| `INVALID_ISSUER`       | `Iss` does not start with `https://` or `did:`                           |
| `MISSING_KIND`         | `Kind` is empty                                                          |
| `INVALID_KIND`         | `Kind` is not `evidence` or `challenge`                                  |
| `MISSING_TYPE`         | `Type` is empty                                                          |
| `INVALID_TYPE`         | `Type` is malformed                                                      |
| `INVALID_PILLAR`       | A pillar value is outside the closed taxonomy                            |
| `MISSING_SIGNING_KEY`  | No signing key provided                                                  |
| `KEY_ID_MISMATCH`      | `Kid` set to a value that differs from the signing key's own key ID      |
| `INVALID_KEY_ID`       | Key ID violates the Wire 0.2 `kid` rule (UTF-8, at most 256 UTF-8 bytes) |
| `INVALID_UTF8`         | A caller-controlled claim string is not valid UTF-8                      |
| `INVALID_JSON_PROFILE` | The marshaled payload fails the raw JSON admission profile               |
| `SIGN_FAILED`          | Signing failed                                                           |
| `ID_GEN_FAILED`        | Record-ID generation failed                                              |

### VerifyLocal

```go
func VerifyLocal(receiptJWS string, opts VerifyLocalOptions) *VerifyLocalResult
```

Verifies a signed interaction record locally with a supplied public key. Enforces the current
stable format (`interaction-record+jwt`; the full media-type form of `typ` is accepted and
normalized). Never fetches keys.

#### VerifyLocalOptions

| Field          | Type                | Description                                                                                |
| -------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| `PublicKey`    | `ed25519.PublicKey` | 32-byte Ed25519 public key (required)                                                      |
| `Issuer`       | `string`            | Expected issuer URI (optional; when set, `iss` must match)                                 |
| `MaxClockSkew` | `time.Duration`     | Clock skew tolerance (default 30s)                                                         |
| `RequireExp`   | `bool`              | Require the `exp` claim                                                                    |
| `PolicyBytes`  | `[]byte`            | Local policy document; when set, its JCS + SHA-256 digest is compared with `policy.digest` |

#### VerifyLocalResult

| Field           | Type                       | Description                             |
| --------------- | -------------------------- | --------------------------------------- |
| `Valid`         | `bool`                     | Whether every verification check passed |
| `Claims`        | `*InteractionRecordClaims` | Verified claims (nil when invalid)      |
| `Kid`           | `string`                   | Key ID from the JWS header              |
| `Algorithm`     | `string`                   | Always `EdDSA`                          |
| `Warnings`      | `[]VerificationWarning`    | Non-fatal warnings                      |
| `PolicyBinding` | `PolicyBindingStatus`      | `verified`, `failed`, or `unavailable`  |
| `WireVersion`   | `string`                   | `0.2`                                   |
| `ReceiptRef`    | `string`                   | `sha256:<hex>` of the compact JWS bytes |
| `ErrorCode`     | `string`                   | Error code when `Valid` is false        |
| `ErrorMessage`  | `string`                   | Error message when `Valid` is false     |

#### VerifyLocal error codes

| Code                         | Description                                                |
| ---------------------------- | ---------------------------------------------------------- |
| `E_INVALID_FORMAT`           | Malformed JWS, header, or payload                          |
| `E_IJSON_*`                  | Raw header or payload bytes fail RFC 7493 I-JSON admission |
| `E_JWS_MISSING_KID`          | Protected header has no `kid`                              |
| `E_UNSUPPORTED_WIRE_VERSION` | `typ` or `peac_version` is not Wire 0.2                    |
| `E_INVALID_SIGNATURE`        | Signature does not verify under the supplied key           |
| `E_NOT_YET_VALID`            | `iat` is in the future beyond the skew tolerance           |
| `E_EXPIRED`                  | `exp` has passed                                           |
| `E_INVALID_ISSUER`           | `iss` does not match `Issuer`                              |
| `E_CONSTRAINT_VIOLATION`     | A required claim or constraint is missing or invalid       |
| `E_POLICY_BINDING_FAILED`    | `policy.digest` does not match the supplied policy bytes   |

### Policy binding helpers

```go
func ComputePolicyDigest(policyJSON []byte) (string, error)
func CheckPolicyBinding(receiptDigest, localDigest string) PolicyBindingStatus
```

`ComputePolicyDigest` returns `sha256:<hex>` over the RFC 8785 JCS canonicalization of the input,
matching the TypeScript `computePolicyDigestJcs()`. `CheckPolicyBinding` returns `verified` when both
digests are present and equal, `failed` when both are present and differ, and `unavailable` when
either is absent.

### Keys (`jws` package)

```go
func GenerateSigningKey(keyID string) (*SigningKey, error)
func NewSigningKey(privateKey ed25519.PrivateKey, keyID string) (*SigningKey, error)
func NewSigningKeyFromSeed(seed []byte, keyID string) (*SigningKey, error)
func ParsePublicKeyFromBytes(data []byte) (ed25519.PublicKey, error)
```

`SigningKey.KeyID()` returns the key identifier used as the JWS `kid`; `SigningKey.PublicKey()`
returns the corresponding Ed25519 public key. `ParsePublicKeyFromBytes` accepts a raw 32-byte
Ed25519 public key.

### Policy Evaluation

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

### Legacy Wire 0.1 API (deprecated)

`Verify`, `VerifyWithContext`, `VerifyOptions`, `VerifyResult`, `PEACReceiptClaims`, `ErrorCode`,
and `PEACError` remain exported so existing middleware compiles, but they support Wire 0.1 only and
are deprecated. `Verify` does not verify current records: it returns `E_INVALID_FORMAT` with the
message "Wire 0.1 Verify() is deprecated; use VerifyLocal() for Interaction Record format". Use
`VerifyLocal` for all current records.

## Claims Structure

```go
type InteractionRecordClaims struct {
    Iss         string         `json:"iss"`
    Sub         string         `json:"sub,omitempty"`
    Iat         int64          `json:"iat"`
    Exp         int64          `json:"exp,omitempty"`
    Rid         string         `json:"rid"`
    Kind        string         `json:"kind"`
    Type        string         `json:"type"`
    PeacVersion string         `json:"peac_version"`
    Pillars     []string       `json:"pillars,omitempty"`
    Actor       *ActorBinding  `json:"actor,omitempty"`
    Ext         map[string]any `json:"ext,omitempty"`
    Peac        *PolicyBlock   `json:"policy,omitempty"`
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

- Go 1.26 or later

## License

Apache-2.0 - see [LICENSE](../../LICENSE)
