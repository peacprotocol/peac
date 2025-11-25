# PEAC Test Vectors

**Status**: NORMATIVE

This document describes normative behavior using concrete JSON test vectors.

Each vector has:

- A filename and location
- A short description
- Expected validation result (`VALID` or specific `PEACError`)
- Key assertions that implementations MUST verify

---

## 1. Vector Directory Structure

```
tests/vectors/
├── golden/           # Valid receipts (positive cases)
├── negative/         # Envelope-level validation errors
└── http/             # HTTP-context specific cases (DPoP, etc.)
```

**Note**: `tests/vectors/http/` contains vectors that require HTTP context (method, URI, headers) for validation. Pure envelope validators MAY skip these vectors.

---

## 2. Golden Vectors (Positive Cases)

### 2.1 `receipt-minimal-no-payment.json`

**File**: [tests/vectors/golden/receipt-minimal-no-payment.json](../../tests/vectors/golden/receipt-minimal-no-payment.json)

**Description**:

- No payment evidence
- Single control step with `access-policy-service` engine
- Free-tier resource access (non-monetary)
- Shows that control can exist without payment

**Expected**: VALID

**Key assertions**:

- Envelope structure is valid (auth/evidence/meta)
- Control chain has exactly 1 step
- Control decision is `allow` (consistent with chain)
- Payment evidence is absent (`evidence.payment` is undefined)
- Control is optional when no payment present
- Meta block contains non-normative debug info

---

### 2.2 `receipt-payment-single-control.json`

**File**: [tests/vectors/golden/receipt-payment-single-control.json](../../tests/vectors/golden/receipt-payment-single-control.json)

**Description**:

- Payment present (x402 rail, Lightning Network)
- Single control step with `spend-control-service` engine
- DPoP transport binding present
- Shows canonical "typical agentic paid call"

**Expected**: VALID

**Key assertions**:

- Payment evidence is present with all required fields:
  - `rail`: "x402"
  - `reference`: Lightning invoice identifier
  - `amount`: 300 (cents)
  - `currency`: "USD"
  - `asset`: "BTC"
  - `env`: "live"
  - `network`: "lightning"
- Control block is present (REQUIRED when payment exists)
- Control chain has 1 step with `allow` result
- DPoP binding has `jkt` and `nonce`
- Limits snapshot shows per-transaction and per-day limits

---

### 2.3 `receipt-payment-multi-control-veto.json`

**File**: [tests/vectors/golden/receipt-payment-multi-control-veto.json](../../tests/vectors/golden/receipt-payment-multi-control-veto.json)

**Description**:

- Payment present (card-network rail)
- Three control steps: mandate-service (allow), risk-engine (allow), spend-control-service (deny)
- Combinator is `any_can_veto`
- Final decision is `deny` (one veto blocks entire transaction)
- Shows multi-party governance flow

**Expected**: VALID (but decision is `deny`)

**Key assertions**:

- Control chain has 3 steps
- Steps 1 and 2 have `result: "allow"`
- Step 3 has `result: "deny"` with budget exceeded reason
- Control decision is `deny` (consistent with `any_can_veto` semantics)
- Payment rail is `card-network` (vendor-neutral)
- Limits snapshot in step 3 shows monthly budget state

**Purpose**:

- Proves `any_can_veto` combinator semantics
- Proves that `decision` must match chain results
- Reference for enterprise policy flows (TAP/AP2-like patterns)

---

### 2.4 `receipt-http402-x402-single-control.json`

**File**: [tests/vectors/golden/receipt-http402-x402-single-control.json](../../tests/vectors/golden/receipt-http402-x402-single-control.json)

**Description**:

- HTTP 402 enforcement pattern
- Payment via x402 rail (Base USDC)
- Single control step with spend limits
- DPoP transport binding
- Demonstrates `enforcement.method = "http-402"` usage

**Expected**: VALID

**Key assertions**:

- `auth.enforcement.method` is `"http-402"`
- `evidence.payment.rail` is `"x402"`
- `evidence.payment.network` is `"base-mainnet"`
- `evidence.payment.asset` is `"USDC"`
- Control block is present (REQUIRED for http-402 enforcement)
- DPoP binding demonstrates transport security
- Rail-specific evidence includes tx_hash, block_number, chain_id

**Purpose**:

- Shows HTTP 402 as enforcement method (not baked into core)
- Demonstrates x402 rail with Base/USDC (primary GTM path)
- Shows how control requirement applies to enforcement.method=="http-402"

---

## 3. Negative Vectors (Envelope-Level Errors)

### 3.1 `receipt-payment-missing-control.json`

**File**: [tests/vectors/negative/receipt-payment-missing-control.json](../../tests/vectors/negative/receipt-payment-missing-control.json)

**Description**:

- Payment evidence is present
- Control block is intentionally omitted from `auth`
- Violates protocol invariant: payment requires control

**Expected**: INVALID with `E_CONTROL_REQUIRED`

**Expected error**:

```json
{
  "code": "E_CONTROL_REQUIRED",
  "category": "validation",
  "severity": "error",
  "retryable": false,
  "http_status": 400,
  "pointer": "/auth/control",
  "remediation": "Add a control block when payment evidence is present"
}
```

---

### 3.2 `receipt-control-inconsistent-decision.json`

**File**: [tests/vectors/negative/receipt-control-inconsistent-decision.json](../../tests/vectors/negative/receipt-control-inconsistent-decision.json)

**Description**:

- Control chain has 1 step with `result: "deny"`
- Control decision is `allow` (inconsistent)
- Violates protocol invariant: with `any_can_veto`, any deny must result in deny decision

**Expected**: INVALID with `E_INVALID_CONTROL_CHAIN`

**Expected error**:

```json
{
  "code": "E_INVALID_CONTROL_CHAIN",
  "category": "validation",
  "severity": "error",
  "retryable": false,
  "http_status": 400,
  "pointer": "/auth/control/decision",
  "remediation": "Decision 'allow' inconsistent with chain; expected 'deny' for any_can_veto"
}
```

---

### 3.3 `receipt-expired.json`

**File**: [tests/vectors/negative/receipt-expired.json](../../tests/vectors/negative/receipt-expired.json)

**Description**:

- Receipt has `exp` claim set to 2021-01-01 (past)
- All other fields are valid
- Violates temporal validity

**Expected**: INVALID with `E_EXPIRED_RECEIPT`

**Expected error**:

```json
{
  "code": "E_EXPIRED_RECEIPT",
  "category": "validation",
  "severity": "error",
  "retryable": false,
  "http_status": 401,
  "pointer": "/auth/exp",
  "remediation": "Receipt has expired; use a current receipt"
}
```

---

### 3.4 `receipt-policy-ssrf-blocked.json`

**File**: [tests/vectors/negative/receipt-policy-ssrf-blocked.json](../../tests/vectors/negative/receipt-policy-ssrf-blocked.json)

**Description**:

- Receipt has `policy_uri` pointing to AWS metadata endpoint (169.254.169.254)
- Tests SSRF protection requirements
- Verifier must block request to private/metadata IP

**Expected**: INVALID with `E_SSRF_BLOCKED`

**Expected error**:

```json
{
  "code": "E_SSRF_BLOCKED",
  "category": "security",
  "severity": "error",
  "retryable": false,
  "remediation": "SSRF protection blocked request to private/metadata IP: 169.254.169.254"
}
```

**Test requirement**:

- Verifier MUST NOT fetch from metadata IPs
- Verifier MUST apply SSRF protections per PROTOCOL-BEHAVIOR.md Section 6

---

### 3.5 `receipt-invalid-signature.json`

**File**: [tests/vectors/negative/receipt-invalid-signature.json](../../tests/vectors/negative/receipt-invalid-signature.json)

**Description**:

- Structurally valid envelope
- JWS signature is invalid (will fail cryptographic verification)
- Tests signature validation

**Expected**: INVALID with `E_INVALID_SIGNATURE`

**Expected error**:

```json
{
  "code": "E_INVALID_SIGNATURE",
  "category": "security",
  "severity": "error",
  "retryable": false,
  "remediation": "JWS signature verification failed"
}
```

**Note**: This vector includes a JWS compact serialization with an intentionally invalid signature.

---

## 4. HTTP-Context Vectors (Transport-Specific)

These vectors require HTTP request context (method, URI, headers) for validation.

### 4.1 `http-dpop-replay.json`

**File**: [tests/vectors/http/http-dpop-replay.json](../../tests/vectors/http/http-dpop-replay.json)

**Description**:

- Valid DPoP proof structure
- Nonce has been used before (replay attack)
- Tests L3/L4 nonce replay protection

**Expected**: INVALID with `E_DPOP_REPLAY`

**Expected error**:

```json
{
  "code": "E_DPOP_REPLAY",
  "category": "security",
  "severity": "error",
  "retryable": false,
  "remediation": "DPoP nonce has already been used"
}
```

**Test requirement**:

- Verifier MUST track used nonces (in-memory or distributed cache)
- Verifier MUST reject reused nonces within TTL window (60 seconds)

---

### 4.2 `http-dpop-invalid-jkt.json`

**File**: [tests/vectors/http/http-dpop-invalid-jkt.json](../../tests/vectors/http/http-dpop-invalid-jkt.json)

**Description**:

- DPoP proof has `jkt` claim
- `jkt` does not match SHA-256 thumbprint of `jwk` in header
- Tests key thumbprint validation

**Expected**: INVALID with `E_DPOP_INVALID`

**Expected error**:

```json
{
  "code": "E_DPOP_INVALID",
  "category": "security",
  "severity": "error",
  "retryable": false,
  "remediation": "DPoP jkt does not match public key thumbprint"
}
```

**Test requirement**:

- Verifier MUST compute `jkt = base64url(SHA256(JCS(jwk)))`
- Verifier MUST compare computed jkt with claim value

---

## 5. Validator Implementation Guidance

### 5.1 Running Test Vectors

Validators MUST:

1. Load each golden vector and verify it returns `VALID` (no errors)
2. Load each negative vector and verify it returns the expected `PEACError`
3. Check that error `code`, `category`, `retryable`, and `pointer` match expectations

### 5.2 Envelope-Only vs Full Validators

**Envelope-only validators**:

- MUST validate `tests/vectors/golden/*.json`
- MUST validate `tests/vectors/negative/*.json`
- MAY skip `tests/vectors/http/*.json` (requires HTTP context)

**Full verifiers**:

- MUST validate all vectors including `tests/vectors/http/*.json`
- MUST implement DPoP verification per PROTOCOL-BEHAVIOR.md Section 7

### 5.3 Adding New Vectors

When adding new protocol features:

1. Create at least one golden vector demonstrating valid usage
2. Create at least one negative vector for each new validation rule
3. Update this document with descriptions and expected results
4. Wire vectors into CI test suite

### 5.4 Cross-Language Testing

These vectors are normative for all PEAC implementations (TypeScript, Go, Rust, Python, etc.).

Each implementation MUST:

- Parse all golden vectors successfully
- Reject all negative vectors with correct error codes
- Produce identical canonicalization (JCS) for signing
- Verify JWS signatures consistently

---

## 6. Version History

- **v0.9.15 (2025-01-18)**: Initial test vectors with envelope structure, control chain, structured errors, HTTP 402 enforcement, and security vectors (SSRF, DPoP, signature)
