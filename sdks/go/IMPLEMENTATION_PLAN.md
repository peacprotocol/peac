# Go SDK Implementation Plan - v0.9.29

Full Go SDK parity with TypeScript implementation.

**Last Updated:** 2026-01-10 (DOC SYNC with locked decisions)

---

## Locked Decisions (v0.9.29 - FINAL)

These decisions are FINAL and must be consistent across implementation, tests, and docs.

### Cross-Language Conformance

Conformance is **invariant-based**, NOT byte-equality. Go's `encoding/json` produces different output than JS `JSON.stringify`. Tests check semantic equivalence, not JWS token byte-equality.

### Key Material API

Accept EITHER `PrivateKey` (64 bytes) OR `PrivateKeySeed` (32 bytes), error if both or neither.

### JCS Usage

JCS (RFC 8785) is used ONLY for `policy_hash` computation, NOT for JWS payload signing.

### 402 Semantics

402 returned ONLY when `decision=review AND receiptVerified=false`. MUST include `WWW-Authenticate: PEAC realm="receipt", error="receipt_required"`.

### UUIDv7 Testing

Test parses + version==7. Do NOT assert lexicographic monotonicity.

### Policy Parsing

MUST reject unknown fields. Use `DisallowUnknownFields()` for JSON, `KnownFields(true)` for YAML.

### Evidence Validator

Limits: maxDepth=32, maxArrayLength=10k, maxObjectKeys=1k, maxStringLength=64KB, maxTotalNodes=100k. Sort map keys. Only `json.RawMessage` valid.

### Middleware

Optional middleware (chi, gin) in separate go.mod submodules.

### EnforceDecision Return Type

Returns `(int, http.Header)` not `map[string]string`.

See `reference/GO_SDK_IMPLEMENTATION_PLAN.md` for full decision rationale.

---

## Status

- **Verify()** - Implemented in v0.9.25
- ⏳ **Issue()** - Pending (this document)
- ⏳ **Policy Evaluation** - Pending (this document)

## Issue() Function

### Signature

```go
package peac

import (
	"context"
	"time"
)

// IssueOptions configures receipt issuance.
type IssueOptions struct {
	// Required fields
	Issuer    string  // Issuer URL (https://)
	Audience  string  // Audience / resource URL (https://)
	Amount    int64   // Amount in smallest currency unit
	Currency  string  // ISO 4217 currency code (uppercase)
	Rail      string  // Payment rail identifier
	Reference string  // Rail-specific payment reference

	// Private key for signing (REQUIRED)
	PrivateKey []byte  // Ed25519 private key (32 bytes)
	KeyID      string  // Key ID for JWKS (e.g., "2025-01-09T12:00:00Z")

	// Optional fields
	Asset          string                  // Asset transferred (defaults to Currency)
	Env            string                  // Environment ("live" or "test", default: "test")
	Network        string                  // Network identifier (SHOULD for crypto)
	FacilitatorRef string                  // Facilitator reference
	Evidence       map[string]interface{}  // Rail-specific evidence (JSON-safe)
	IdempotencyKey string                  // Idempotency key
	Metadata       map[string]interface{}  // Rail-specific metadata
	Subject        string                  // Subject URI
	Ext            map[string]interface{}  // Extensions
	ExpiresAt      int64                   // Expiry timestamp (Unix seconds)

	// v0.9.17+ Subject binding
	SubjectSnapshot *SubjectProfileSnapshot

	// v0.9.24+ Purpose tracking
	Purpose         []string  // Purposes declared by agent
	PurposeEnforced string    // Purpose enforced by policy
	PurposeReason   string    // Reason for enforcement decision

	// Context for the operation
	Context context.Context
}

// IssueResult contains the issued receipt and metadata.
type IssueResult struct {
	// JWS compact serialization (header.payload.signature)
	JWS string

	// Receipt ID (UUIDv7 generated)
	ReceiptID string

	// Issued at timestamp (Unix seconds)
	IssuedAt int64

	// Subject snapshot (if provided)
	SubjectSnapshot *SubjectProfileSnapshot

	// Performance metrics
	Perf *IssuePerf
}

// IssuePerf contains performance metrics for issuance.
type IssuePerf struct {
	SignMs  float64  // Time to sign (milliseconds)
	TotalMs float64  // Total time (milliseconds)
}

// Issue creates and signs a PEAC receipt.
//
// Example:
//
//	result, err := peac.Issue(peac.IssueOptions{
//	    Issuer:     "https://publisher.example",
//	    Audience:   "https://agent.example",
//	    Amount:     1000,
//	    Currency:   "USD",
//	    Rail:       "stripe",
//	    Reference:  "ch_abc123",
//	    PrivateKey: privateKey,
//	    KeyID:      "2025-01-09T12:00:00Z",
//	})
//	if err != nil {
//	    log.Fatal(err)
//	}
//	fmt.Printf("Receipt JWS: %s\n", result.JWS)
func Issue(opts IssueOptions) (*IssueResult, error) {
	// Implementation steps:
	// 1. Apply defaults (env: "test", asset: currency, etc.)
	// 2. Validate required fields (issuer, audience, amount, currency, rail, reference, privateKey, keyID)
	// 3. Validate URL formats (https://)
	// 4. Validate currency (uppercase ISO 4217)
	// 5. Validate amount (>= 0)
	// 6. Validate evidence (JSON-safe, no NaN/Infinity, max depth/size)
	// 7. Generate UUIDv7 receipt ID
	// 8. Create claims object
	// 9. Sign with Ed25519 (JWS compact serialization)
	// 10. Return IssueResult
	return nil, nil
}
```

### Implementation Details

#### 1. Validation

- **Required fields:** issuer, audience, amount, currency, rail, reference, privateKey, keyID
- **URL validation:** issuer and audience MUST be `https://` URLs
- **Currency validation:** MUST be uppercase ISO 4217 (3 letters)
- **Amount validation:** MUST be >= 0 (int64)
- **Evidence validation:** MUST be JSON-safe (no NaN, Infinity, circular refs)
  - Use iterative validation (no recursion)
  - Enforce limits: maxDepth=32, maxArrayLength=10k, maxObjectKeys=1k, maxStringLength=64KB, maxTotalNodes=100k

#### 2. UUIDv7 Generation

Use `github.com/google/uuid` or similar for UUIDv7:

```go
import "github.com/google/uuid"

receiptID := uuid.NewV7().String()  // Returns "rcpt_01JGABC123XYZ"
```

#### 3. Claims Construction

```go
claims := PEACReceiptClaims{
	ReceiptID: receiptID,
	Issuer:    opts.Issuer,
	Audience:  []string{opts.Audience},
	IssuedAt:  time.Now().Unix(),
	ExpiresAt: opts.ExpiresAt,  // Optional
	Subject: &Subject{
		URI: opts.Subject,
	},
	Payment: &Payment{
		Rail:           opts.Rail,
		Reference:      opts.Reference,
		Amount:         opts.Amount,
		Currency:       opts.Currency,
		Asset:          opts.Asset,       // defaults to Currency
		Env:            opts.Env,         // defaults to "test"
		Network:        opts.Network,
		FacilitatorRef: opts.FacilitatorRef,
		Evidence:       opts.Evidence,
		IdempotencyKey: opts.IdempotencyKey,
		Metadata:       opts.Metadata,
	},
	Extensions: opts.Ext,
}

// v0.9.24+ Purpose tracking
if len(opts.Purpose) > 0 {
	claims.PurposeDeclared = opts.Purpose
}
if opts.PurposeEnforced != "" {
	claims.PurposeEnforced = &opts.PurposeEnforced
}
if opts.PurposeReason != "" {
	claims.PurposeReason = &opts.PurposeReason
}
```

#### 4. JWS Signing

Use Ed25519 signing from `jws` package:

```go
import "github.com/peacprotocol/peac-go/jws"

header := jws.Header{
	Type:      "peac.receipt/0.9",
	Algorithm: "EdDSA",
	KeyID:     opts.KeyID,
}

jwsString, err := jws.Sign(header, claims, opts.PrivateKey)
if err != nil {
	return nil, NewPEACError(ErrSigningFailed, err.Error())
}
```

#### 5. Performance Metrics

Track signing time:

```go
startTime := time.Now()
signStartTime := time.Now()
jwsString, err := jws.Sign(...)
signMs := float64(time.Since(signStartTime).Microseconds()) / 1000
totalMs := float64(time.Since(startTime).Microseconds()) / 1000

perf := &IssuePerf{
	SignMs:  signMs,
	TotalMs: totalMs,
}
```

#### 6. Error Codes

| Code                      | Description                      | HTTP |
| ------------------------- | -------------------------------- | ---- |
| `ErrMissingRequiredField` | Required field not provided      | 400  |
| `ErrInvalidURL`           | Invalid URL format               | 400  |
| `ErrInvalidCurrency`      | Invalid currency code            | 400  |
| `ErrInvalidAmount`        | Amount < 0                       | 400  |
| `ErrEvidenceNotJSON`      | Evidence contains non-JSON types | 400  |
| `ErrEvidenceTooLarge`     | Evidence exceeds size limits     | 400  |
| `ErrSigningFailed`        | JWS signing failed               | 500  |

## Policy Evaluation

### Signature

```go
package peac

// PolicyDocument represents a PEAC policy file (peac-policy/0.1).
type PolicyDocument struct {
	Version string        `json:"version" yaml:"version"`
	Name    string        `json:"name" yaml:"name"`
	Rules   []PolicyRule  `json:"rules" yaml:"rules"`
}

// PolicyRule represents a single policy rule (first-match-wins).
type PolicyRule struct {
	Name    string          `json:"name" yaml:"name"`
	Match   SubjectMatcher  `json:"match" yaml:"match"`
	Purpose []string        `json:"purpose" yaml:"purpose"`
	Allow   string          `json:"allow" yaml:"allow"`  // "allow", "deny", "review"
	Require *Requirements   `json:"require,omitempty" yaml:"require,omitempty"`
}

// SubjectMatcher defines criteria for matching subjects.
type SubjectMatcher struct {
	Type   []string          `json:"type,omitempty" yaml:"type,omitempty"`
	Labels map[string]string `json:"labels,omitempty" yaml:"labels,omitempty"`
	ID     []string          `json:"id,omitempty" yaml:"id,omitempty"`
}

// Requirements specifies enforcement requirements.
type Requirements struct {
	Receipt    string  `json:"receipt,omitempty" yaml:"receipt,omitempty"`  // "required", "optional", "omit"
	Licensing  []string `json:"licensing,omitempty" yaml:"licensing,omitempty"`
	LicenseURL string  `json:"license_url,omitempty" yaml:"license_url,omitempty"`
}

// EvaluationContext provides input for policy evaluation.
type EvaluationContext struct {
	SubjectType      string
	SubjectID        string
	SubjectLabels    map[string]string
	Purpose          string
	LicensingMode    string
	ReceiptVerified  bool
}

// Decision represents a policy decision.
type Decision struct {
	Allow           string  // "allow", "deny", "review"
	Rule            string  // Matched rule name
	ReceiptRequired bool    // Whether receipt is required
	Licensing       []string // Required licensing modes
	LicenseURL      string  // License URL (if specified)
}

// LoadPolicy loads a policy document from YAML or JSON.
func LoadPolicy(data []byte) (*PolicyDocument, error) {
	// Implementation:
	// 1. Detect format (YAML vs JSON)
	// 2. Parse document
	// 3. Validate schema (version, rules, etc.)
	// 4. Return PolicyDocument
	return nil, nil
}

// Evaluate evaluates a policy document against the given context.
//
// Returns the first matching rule's decision (first-match-wins).
// If no rules match, returns implicit deny.
//
// Example:
//
//	decision, err := policy.Evaluate(EvaluationContext{
//	    SubjectType:   "agent",
//	    SubjectID:     "agent:abc123",
//	    Purpose:       "train",
//	    ReceiptVerified: true,
//	})
//	if err != nil {
//	    log.Fatal(err)
//	}
//	if decision.Allow == "deny" {
//	    return http.StatusForbidden
//	}
func (p *PolicyDocument) Evaluate(ctx EvaluationContext) (*Decision, error) {
	// Implementation:
	// 1. Iterate through rules in order
	// 2. For each rule, check if it matches context:
	//    - Type matches (if specified)
	//    - Labels match (if specified)
	//    - ID matches (if specified, supports wildcards)
	//    - Purpose matches (if specified)
	// 3. If match found, apply rule decision:
	//    - Map allow value to Decision
	//    - Check requirements (receipt, licensing)
	// 4. If no match, return implicit deny
	return nil, nil
}

// EnforceDecision converts a policy decision to an HTTP response.
func EnforceDecision(decision *Decision) (int, map[string]string) {
	// Implementation:
	// 1. Map decision.Allow to HTTP status:
	//    - "allow" -> 200
	//    - "review" without receipt -> 402
	//    - "review" with receipt -> 200
	//    - "deny" -> 403
	// 2. Build WWW-Authenticate header for 402:
	//    - WWW-Authenticate: PEAC realm="receipt", error="receipt_required"
	// 3. Return (status, headers)
	return 0, nil
}
```

### Implementation Details

#### 1. Policy Loading

Support both YAML and JSON formats:

```go
import (
	"encoding/json"
	"gopkg.in/yaml.v3"
)

func LoadPolicy(data []byte) (*PolicyDocument, error) {
	// Try JSON first
	var doc PolicyDocument
	if err := json.Unmarshal(data, &doc); err == nil {
		return &doc, validatePolicy(&doc)
	}

	// Try YAML
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, NewPEACError(ErrInvalidPolicy, "failed to parse policy")
	}

	return &doc, validatePolicy(&doc)
}

func validatePolicy(doc *PolicyDocument) error {
	// Validate version
	if doc.Version != "peac-policy/0.1" {
		return NewPEACError(ErrInvalidPolicyVersion, "unsupported version")
	}

	// Validate rules (at least one rule required)
	if len(doc.Rules) == 0 {
		return NewPEACError(ErrInvalidPolicy, "policy must have at least one rule")
	}

	return nil
}
```

#### 2. Rule Matching

Implement first-match-wins semantics:

```go
func (p *PolicyDocument) Evaluate(ctx EvaluationContext) (*Decision, error) {
	for _, rule := range p.Rules {
		if matchesRule(rule, ctx) {
			return applyRule(rule, ctx), nil
		}
	}

	// No match -> implicit deny
	return &Decision{
		Allow: "deny",
		Rule:  "implicit-deny",
	}, nil
}

func matchesRule(rule PolicyRule, ctx EvaluationContext) bool {
	// Check type match
	if len(rule.Match.Type) > 0 && !contains(rule.Match.Type, ctx.SubjectType) {
		return false
	}

	// Check labels match
	for key, value := range rule.Match.Labels {
		if ctx.SubjectLabels[key] != value {
			return false
		}
	}

	// Check ID match (supports wildcards)
	if len(rule.Match.ID) > 0 {
		matched := false
		for _, pattern := range rule.Match.ID {
			if matchesPattern(pattern, ctx.SubjectID) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}

	// Check purpose match
	if len(rule.Purpose) > 0 && !contains(rule.Purpose, ctx.Purpose) {
		return false
	}

	return true
}

func applyRule(rule PolicyRule, ctx EvaluationContext) *Decision {
	decision := &Decision{
		Allow: rule.Allow,
		Rule:  rule.Name,
	}

	if rule.Require != nil {
		decision.ReceiptRequired = rule.Require.Receipt == "required"
		decision.Licensing = rule.Require.Licensing
		decision.LicenseURL = rule.Require.LicenseURL
	}

	// Apply review -> allow transition if receipt verified
	if decision.Allow == "review" && ctx.ReceiptVerified {
		decision.Allow = "allow"
	}

	return decision
}
```

#### 3. HTTP Enforcement

```go
func EnforceDecision(decision *Decision) (int, map[string]string) {
	headers := make(map[string]string)

	switch decision.Allow {
	case "allow":
		return 200, headers

	case "deny":
		return 403, headers

	case "review":
		if decision.ReceiptRequired {
			headers["WWW-Authenticate"] = `PEAC realm="receipt", error="receipt_required"`
			return 402, headers
		}
		return 403, headers

	default:
		return 500, headers
	}
}
```

## Testing

### Issue() Tests

```go
func TestIssue(t *testing.T) {
	// Generate Ed25519 keypair
	publicKey, privateKey, _ := ed25519.GenerateKey(nil)

	// Test: Successful issuance
	result, err := Issue(IssueOptions{
		Issuer:     "https://publisher.example",
		Audience:   "https://agent.example",
		Amount:     1000,
		Currency:   "USD",
		Rail:       "stripe",
		Reference:  "ch_abc123",
		PrivateKey: privateKey,
		KeyID:      "2025-01-09T12:00:00Z",
	})
	assert.NoError(t, err)
	assert.NotEmpty(t, result.JWS)
	assert.NotEmpty(t, result.ReceiptID)
	assert.True(t, strings.HasPrefix(result.ReceiptID, "rcpt_"))

	// Verify the issued receipt
	verifyResult, err := Verify(result.JWS, VerifyOptions{
		Issuer:   "https://publisher.example",
		Audience: "https://agent.example",
		KeySet:   &jwks.KeySet{Keys: map[string][]byte{"2025-01-09T12:00:00Z": publicKey}},
	})
	assert.NoError(t, err)
	assert.Equal(t, result.ReceiptID, verifyResult.Claims.ReceiptID)
}
```

### Policy Tests

```go
func TestPolicyEvaluation(t *testing.T) {
	policyYAML := `
version: "peac-policy/0.1"
name: test-policy
rules:
  - name: allow-bots
    match:
      type: [bot]
    purpose: [crawl, index]
    allow: allow
    require:
      receipt: required
`

	policy, err := LoadPolicy([]byte(policyYAML))
	assert.NoError(t, err)

	// Test: Bot with receipt -> allow
	decision, err := policy.Evaluate(EvaluationContext{
		SubjectType:     "bot",
		Purpose:         "crawl",
		ReceiptVerified: true,
	})
	assert.NoError(t, err)
	assert.Equal(t, "allow", decision.Allow)

	// Test: Bot without receipt -> review (402)
	decision, err = policy.Evaluate(EvaluationContext{
		SubjectType:     "bot",
		Purpose:         "crawl",
		ReceiptVerified: false,
	})
	assert.NoError(t, err)
	assert.Equal(t, "review", decision.Allow)
	assert.True(t, decision.ReceiptRequired)
}
```

## Dependencies

```go
// go.mod additions
require (
	github.com/google/uuid v1.6.0           // UUIDv7 generation
	gopkg.in/yaml.v3 v3.0.1                // YAML parsing
	github.com/stretchr/testify v1.8.4     // Testing (already present)
)
```

## Performance Targets

- **Issue() P95 latency:** < 10ms
- **Policy.Evaluate() P95 latency:** < 1ms
- **LoadPolicy() P95 latency:** < 5ms

## Migration Guide

### From TypeScript to Go

**TypeScript:**

```typescript
import { issue } from '@peac/protocol';

const result = await issue(
  {
    iss: 'https://publisher.example',
    aud: 'https://agent.example',
    amt: 1000,
    cur: 'USD',
    rail: 'stripe',
    reference: 'ch_abc123',
  },
  privateKey,
  keyID
);
```

**Go:**

```go
import "github.com/peacprotocol/peac-go"

result, err := peac.Issue(peac.IssueOptions{
	Issuer:     "https://publisher.example",
	Audience:   "https://agent.example",
	Amount:     1000,
	Currency:   "USD",
	Rail:       "stripe",
	Reference:  "ch_abc123",
	PrivateKey: privateKey,
	KeyID:      "2025-01-09T12:00:00Z",
})
if err != nil {
	log.Fatal(err)
}
```

## Implementation Priority

1. **Issue()** (P0) - Core issuance function
2. **Policy loading** (P0) - YAML/JSON parsing + validation
3. **Policy evaluation** (P0) - Rule matching + decision logic
4. **HTTP enforcement** (P1) - Status code + header mapping
5. **Tests** (P0) - Comprehensive test coverage

## Acceptance Criteria

- [ ] Issue() function implemented with all required fields
- [ ] UUIDv7 receipt ID generation
- [ ] Ed25519 JWS signing
- [ ] Evidence validation (JSON-safe, limits enforced)
- [ ] Policy loading from YAML/JSON
- [ ] Policy evaluation with first-match-wins
- [ ] HTTP enforcement (200/402/403 mapping)
- [ ] 100+ tests covering all functions
- [ ] Cross-language conformance with TypeScript SDK
- [ ] Performance benchmarks meet targets
- [ ] Documentation in README.md

## Timeline Estimate

- **Issue():** 2-3 days (validation, signing, UUIDv7, tests)
- **Policy:** 2-3 days (loading, evaluation, enforcement, tests)
- **Total:** 4-6 days

## References

- TypeScript implementation: [packages/protocol/src/issue.ts](../../packages/protocol/src/issue.ts)
- TypeScript policy: [packages/policy-kit/src/](../../packages/policy-kit/src/)
- Go verify implementation: [verify.go](./verify.go)
