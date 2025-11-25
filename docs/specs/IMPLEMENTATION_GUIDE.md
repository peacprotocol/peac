# PEAC Implementation Guide

**Status**: INFORMATIONAL

**Audience**: Implementers building PEAC support in Go, Rust, Python, or other languages

---

## 1. Overview

This guide provides practical guidance for implementing PEAC v0.9 in any programming language. It complements the normative specifications:

- JSON Schema (structure)
- PROTOCOL-BEHAVIOR.md (semantics)
- TEST_VECTORS.md (conformance tests)

---

## 2. JSON Canonicalization (JCS)

PEAC uses JSON Canonicalization Scheme (RFC 8785) for deterministic signing.

**Why JCS?**

- Ensures identical signatures across implementations
- Required for `policy_hash` computation
- Standard for cryptographic signing of JSON

**Requirements**:

- Unicode normalization
- Lexicographic key ordering
- No whitespace
- Minimal number encoding

**Reference implementations**:

- **JavaScript**: `canonicalize` npm package
- **Go**: `github.com/cyberphone/json-canonicalization/go/src/webpki.org/jsoncanonicalizer`
- **Rust**: `jcs` crate
- **Python**: `jcs` PyPI package

---

## 3. JSON Schema to Language Types

### TypeScript

- Use `json-schema-to-typescript` for type generation
- Schema is source of truth; generated types may need manual refinement

### Go

```go
// Example struct mapping from JSON Schema

type PEACEnvelope struct {
    Auth     AuthContext    `json:"auth"`
    Evidence *EvidenceBlock `json:"evidence,omitempty"`
    Meta     *MetadataBlock `json:"meta,omitempty"`
}

type AuthContext struct {
    Iss        string         `json:"iss"`
    Aud        string         `json:"aud"`
    Sub        string         `json:"sub"`
    Iat        int64          `json:"iat"`
    Exp        *int64         `json:"exp,omitempty"`
    Rid        string         `json:"rid"`
    PolicyHash string         `json:"policy_hash"`
    PolicyURI  string         `json:"policy_uri"`
    Control    *ControlBlock  `json:"control,omitempty"`
    // ... additional fields
}
```

### Rust

```rust
// Example with serde

#[derive(Serialize, Deserialize)]
struct PEACEnvelope {
    auth: AuthContext,
    #[serde(skip_serializing_if = "Option::is_none")]
    evidence: Option<EvidenceBlock>,
    #[serde(skip_serializing_if = "Option::is_none")]
    meta: Option<MetadataBlock>,
}
```

### Python

```python
# Example with dataclasses

from dataclasses import dataclass
from typing import Optional

@dataclass
class PEACEnvelope:
    auth: AuthContext
    evidence: Optional[EvidenceBlock] = None
    meta: Optional[MetadataBlock] = None
```

---

## 4. Error Model Mapping

### Go

```go
type PEACError struct {
    Code        string      `json:"code"`
    Category    string      `json:"category"`
    Severity    string      `json:"severity"`
    Retryable   bool        `json:"retryable"`
    HTTPStatus  *int        `json:"http_status,omitempty"`
    Pointer     *string     `json:"pointer,omitempty"`
    Remediation *string     `json:"remediation,omitempty"`
    Details     interface{} `json:"details,omitempty"`
}

func (e *PEACError) Error() string {
    return fmt.Sprintf("%s: %s", e.Code, e.Remediation)
}
```

### Rust

```rust
#[derive(Debug, Serialize, Deserialize)]
struct PEACError {
    code: String,
    category: String,
    severity: String,
    retryable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    http_status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pointer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    remediation: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<serde_json::Value>,
}

impl std::fmt::Display for PEACError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.remediation.as_deref().unwrap_or(""))
    }
}
```

---

## 5. Control Engine Adapter Pattern

### Minimal Interface

**TypeScript** (reference):

```typescript
interface ControlEngineAdapter {
  readonly engineId: string;
  readonly version?: string;
  evaluate(context: ControlEvaluationContext): Promise<ControlStep>;
}

interface ControlEvaluationContext {
  resource: string;
  method: string;
  amount?: number;
  currency?: string;
  policy: unknown; // Fetched from policy_uri
}
```

**Go**:

```go
type ControlEngineAdapter interface {
    EngineID() string
    Version() string
    Evaluate(ctx context.Context, evalCtx ControlEvaluationContext) (ControlStep, error)
}
```

**Rust**:

```rust
#[async_trait]
trait ControlEngineAdapter {
    fn engine_id(&self) -> &str;
    fn version(&self) -> Option<&str>;
    async fn evaluate(&self, context: &ControlEvaluationContext) -> Result<ControlStep, Error>;
}
```

---

## 6. Payment Rail Adapter Pattern

**Note**: No `@peac/rails-core` package exists yet. This is suggested interface based on common patterns.

### Suggested Interface

**TypeScript**:

```typescript
interface PaymentRailAdapter {
  readonly railId: string;
  verify(payment: PaymentEvidence): Promise<PaymentVerificationResult>;
  initiate(request: PaymentRequest): Promise<PaymentEvidence>;
}
```

**Go**:

```go
type PaymentRailAdapter interface {
    RailID() string
    Verify(ctx context.Context, payment PaymentEvidence) (PaymentVerificationResult, error)
    Initiate(ctx context.Context, request PaymentRequest) (PaymentEvidence, error)
}
```

---

## 7. Crypto Implementation

### EdDSA (Ed25519) Signing

- Use RFC 8032 compliant libraries
- PEAC uses `alg: "EdDSA"` in JWS header

**Libraries**:

- **JavaScript**: `@noble/ed25519` or `tweetnacl`
- **Go**: `crypto/ed25519` (stdlib)
- **Rust**: `ed25519-dalek`
- **Python**: `cryptography` or `PyNaCl`

### JWS Compact Serialization

Format: `{base64url(header)}.{base64url(payload)}.{base64url(signature)}`

---

## 8. Test Vector Validation

All implementations MUST:

1. Parse all golden vectors successfully
2. Reject all negative vectors with correct error codes
3. Pass HTTP-context vectors if implementing full verifier

**Example test structure**:

```
tests/
├── golden_tests.rs      # Load and validate golden/*.json
├── negative_tests.rs    # Load and expect errors from negative/*.json
└── http_tests.rs        # Validate http/*.json with HTTP context
```

---

## 9. Performance Targets

From PROTOCOL-BEHAVIOR.md:

- Signature verification: p95 ≤ 10ms (local, no network)
- Envelope validation: p95 ≤ 5ms (schema + control chain)
- Policy fetch + verification: p95 ≤ 500ms (with caching)

---

## 10. Common Pitfalls

### Pitfall 1: Not enforcing control requirements

**Problem**: Allowing receipts with payment but no control
**Solution**: Implement check from PROTOCOL-BEHAVIOR.md Section 3

### Pitfall 2: Incomplete SSRF protection

**Problem**: Only blocking 169.254.169.254, missing other metadata IPs
**Solution**: Implement full IP blocklist from PROTOCOL-BEHAVIOR.md Section 6

### Pitfall 3: Timestamp milliseconds vs seconds

**Problem**: Using JavaScript `Date.now()` (milliseconds) for `iat`/`exp`
**Solution**: Use seconds: `Math.floor(Date.now() / 1000)`

### Pitfall 4: Missing JCS canonicalization

**Problem**: Computing policy_hash without JCS
**Solution**: Always canonicalize before hashing

---

## 11. Resources

- RFC 8785 (JCS): https://www.rfc-editor.org/rfc/rfc8785
- RFC 8032 (EdDSA): https://www.rfc-editor.org/rfc/rfc8032
- RFC 7519 (JWT): https://www.rfc-editor.org/rfc/rfc7519
- RFC 9449 (DPoP): https://www.rfc-editor.org/rfc/rfc9449

---

## 12. Contributing

To propose additions to this guide:

1. Open GitHub issue with suggested content
2. Provide example code in target language
3. Reference relevant section of normative spec
