# Migration: v0.9.14 → v0.9.15 (Envelope + Control + Errors)

## 1. Overview

v0.9.15 introduces:

- **2-layer envelope** (`auth`, `evidence`, `meta`) replacing flat JWT claims
- **Composable control chain** with multi-party governance (`any_can_veto`)
- **Structured error model** with registry-based error codes
- **Vendor-neutral schema** for payment and control (no hardcoded vendor names)
- **Placeholders for future features** (multi-payment, receipt chaining)

This is a **breaking change** for any v0.9.14 consumers.

**Migration status**: Since v0.9.14 had no external adopters, this is a clean break. No backward compatibility layer is provided.

---

## 2. Claim Shape Changes

### 2.1 Old (flat) → New (envelope)

**Before (v0.9.14)**:

```json
{
  "iss": "https://api.example.net",
  "aud": "https://client.example.net",
  "sub": "user:123",
  "iat": 1737139200,
  "exp": 1737142800,
  "rid": "01HQZK3V7G4M2NQXPJYF8RBWHT",
  "payment": {
    "scheme": "stripe",
    "reference": "pi_123",
    "amount": 1000,
    "currency": "USD"
  },
  "ext": {
    "control": {
      "engine": "locus",
      "decision": "allow"
    }
  }
}
```

**After (v0.9.15)**:

```json
{
  "auth": {
    "iss": "https://api.example.net",
    "aud": "https://client.example.net",
    "sub": "user:123",
    "iat": 1737139200,
    "exp": 1737142800,
    "rid": "01HQZK3V7G4M2NQXPJYF8RBWHT",
    "policy_hash": "mP9Jf1Yuk84Ow1BY1o3x-6RjIAHx4A3v2gY2w2i8aM4",
    "policy_uri": "https://api.example.net/.well-known/aipref.json",
    "control": {
      "chain": [
        {
          "engine": "spend-control-service",
          "version": "1.0.0",
          "policy_id": "default-policy",
          "result": "allow",
          "reason": "Within budget limits"
        }
      ],
      "decision": "allow",
      "combinator": "any_can_veto"
    },
    "ctx": {
      "resource": "https://api.example.net/v1/resource",
      "method": "POST"
    }
  },
  "evidence": {
    "payment": {
      "scheme": "card-network",
      "reference": "pi_123",
      "amount": 1000,
      "currency": "USD",
      "asset": "USD",
      "env": "live",
      "evidence": {
        "provider": "stripe",
        "payment_intent": "pi_123"
      }
    }
  },
  "meta": {
    "redactions": [],
    "privacy_budget": {},
    "debug": {}
  }
}
```

### 2.2 Mapping table

| v0.9.14 field          | v0.9.15 field                  | Notes                                                 |
| ---------------------- | ------------------------------ | ----------------------------------------------------- |
| `iss`                  | `auth.iss`                     | Standard JWT issuer claim                             |
| `aud`                  | `auth.aud`                     | Standard JWT audience claim                           |
| `sub`                  | `auth.sub`                     | Standard JWT subject claim                            |
| `iat`                  | `auth.iat`                     | Standard JWT issued-at claim                          |
| `exp`                  | `auth.exp`                     | Standard JWT expiration claim                         |
| `rid`                  | `auth.rid`                     | Receipt ID (ULID)                                     |
| `payment`              | `evidence.payment`             | Moved to evidence block                               |
| `payment.scheme`       | `evidence.payment.scheme`      | Now opaque string (vendor-neutral)                    |
| `ext.control`          | `auth.control`                 | Promoted to normative field                           |
| `ext.control.engine`   | `auth.control.chain[0].engine` | Now part of chain                                     |
| `ext.control.decision` | `auth.control.decision`        | Separated from chain                                  |
| (new)                  | `auth.policy_hash`             | **NEW**: Policy binding                               |
| (new)                  | `auth.policy_uri`              | **NEW**: Policy location                              |
| (new)                  | `auth.control.combinator`      | **NEW**: Chain combinator (v0.9: only `any_can_veto`) |
| (new)                  | `evidence.payment.asset`       | **NEW**: Required asset identifier                    |
| (new)                  | `evidence.payment.env`         | **NEW**: Required environment (live/test)             |
| (new)                  | `meta`                         | **NEW**: Non-normative metadata block                 |

---

## 3. Control Block Changes

### 3.1 Old control (single engine)

**v0.9.14**:

```json
{
  "ext": {
    "control": {
      "engine": "locus",
      "decision": "allow",
      "mandate": {
        "type": "budget",
        "max_amount": 10000,
        "currency": "USD"
      }
    }
  }
}
```

### 3.2 New control (composable chain)

**v0.9.15**:

```json
{
  "auth": {
    "control": {
      "chain": [
        {
          "engine": "spend-control-service",
          "version": "1.0.0",
          "policy_id": "budget-policy-123",
          "result": "allow",
          "reason": "Requested 3.00 USD <= 100.00 USD per-call limit",
          "limits_snapshot": {
            "per_txn_max": { "amount": 10000, "currency": "USD" },
            "per_day_max": { "amount": 100000, "currency": "USD" },
            "per_day_current": { "amount": 3000, "currency": "USD" }
          }
        }
      ],
      "decision": "allow",
      "combinator": "any_can_veto"
    }
  }
}
```

### 3.3 Key changes

1. **Composable chain**: Control is now a `chain[]` array, allowing multiple engines
2. **Explicit combinator**: `any_can_veto` is the only v0.9 combinator (future: `all_must_allow`, `majority`, etc.)
3. **Vendor-neutral engine names**: `locus` → `spend-control-service` (generic)
4. **Separated decision**: `decision` is computed from chain, not stored per-step
5. **Limits snapshot**: Opaque `limits_snapshot` field replaces hardcoded mandate structure

---

## 4. Payment Evidence Changes

### 4.1 New required fields

v0.9.15 requires:

- **`asset`**: The actual asset being transferred (e.g., "USD", "USDC", "BTC")
- **`env`**: Environment indicator (`"live"` or `"test"`)

Optional but recommended:

- **`network`**: For crypto payments (e.g., "lightning", "ethereum", "polygon")
- **`facilitator_ref`**: For multi-party payment flows

### 4.2 Vendor-neutral scheme

**v0.9.14** had hardcoded union:

```typescript
type PaymentScheme = 'stripe' | 'razorpay' | 'x402';
```

**v0.9.15** uses opaque string:

```typescript
type PaymentScheme = string;
```

**Migration**:

- Use generic scheme names: `stripe` → `card-network`, `razorpay` → `upi`
- Store vendor-specific details in `payment.evidence` object
- Consult [docs/specs/registries.json](specs/registries.json) for recommended scheme identifiers

---

## 5. Error Handling Changes

### 5.1 Old errors (free-form)

**v0.9.14**:

```json
{
  "error": "Invalid payment",
  "message": "Payment amount must be positive"
}
```

### 5.2 New errors (structured)

**v0.9.15**:

```json
{
  "code": "E_INVALID_PAYMENT",
  "category": "validation",
  "severity": "error",
  "retryable": false,
  "http_status": 400,
  "pointer": "/evidence/payment/amount",
  "remediation": "Ensure payment amount is a positive integer",
  "details": {
    "provided_amount": -100,
    "minimum_amount": 1
  }
}
```

### 5.3 Error registry

All error codes are documented in [docs/specs/ERRORS.md](specs/ERRORS.md).

**New error codes**:

- `E_CONTROL_REQUIRED`: Payment present but no control block
- `E_INVALID_CONTROL_CHAIN`: Control chain is invalid or inconsistent
- `E_INVALID_PAYMENT`: Payment evidence is malformed
- `E_INVALID_POLICY_HASH`: Policy hash does not match policy content
- `E_EXPIRED_RECEIPT`: Receipt exp claim is in the past
- `E_SSRF_BLOCKED`: SSRF protection blocked request
- `E_DPOP_REPLAY`: DPoP nonce has already been used

---

## 6. Implementation Steps

### 6.1 For Issuers

1. **Update envelope structure**:
   - Wrap claims in `auth` block
   - Move payment to `evidence` block
   - Add `meta` block (can be empty)

2. **Add policy binding**:
   - Compute `policy_hash = base64url(sha256(jcs(policy)))`
   - Include `policy_uri` pointing to policy document

3. **Update control**:
   - Convert single control to `chain[]` array
   - Add `combinator: "any_can_veto"`
   - Compute `decision` from chain results

4. **Update payment evidence**:
   - Add `asset` field (required)
   - Add `env` field (required)
   - Consider adding `network` for crypto
   - Use vendor-neutral `scheme` names

5. **Update signing**:
   - Sign entire envelope (not just auth block)
   - Use JCS (RFC 8785) for canonicalization
   - Use EdDSA (Ed25519) for signatures

### 6.2 For Verifiers

1. **Update parsing**:
   - Expect `auth`, `evidence`, `meta` top-level fields
   - Validate envelope structure before signature verification

2. **Add control validation**:
   - Check `chain.length >= 1`
   - Verify `decision` matches chain results with combinator logic
   - If payment present, require control block

3. **Add policy validation**:
   - Fetch policy from `policy_uri`
   - Compute policy hash and compare with `policy_hash`
   - Validate control chain against policy

4. **Update error handling**:
   - Return structured `PEACError` objects
   - Use error codes from registry
   - Include `pointer` (RFC 6901 JSON Pointer) to problematic field

5. **Add SSRF protection**:
   - Block private/metadata IPs when fetching JWKS/policy
   - Use allowlist for trusted domains

### 6.3 Cross-language Impact

All non-TypeScript implementations should:

1. **Migrate directly to v0.9.15 envelope** (no v0.9.14 compat layer)
2. **Use JSON Schema as source of truth**: [docs/specs/PEAC-RECEIPT-SCHEMA-v0.9.json](specs/PEAC-RECEIPT-SCHEMA-v0.9.json)
3. **Implement JCS canonicalization**: RFC 8785
4. **Implement EdDSA signing**: RFC 8032
5. **Validate against test vectors**: [docs/specs/TEST_VECTORS.md](specs/TEST_VECTORS.md)

---

## 7. Breaking Changes Summary

| Area                | v0.9.14              | v0.9.15                             | Breaking? |
| ------------------- | -------------------- | ----------------------------------- | --------- |
| Envelope structure  | Flat JWT claims      | 3-layer (auth/evidence/meta)        | **YES**   |
| Control             | Single engine        | Composable chain                    | **YES**   |
| Payment scheme      | Hardcoded union      | Opaque string                       | **YES**   |
| Payment fields      | No asset/env         | Requires asset/env                  | **YES**   |
| Error model         | Free-form            | Structured `PEACError`              | **YES**   |
| Policy binding      | None                 | Required `policy_hash`/`policy_uri` | **YES**   |
| Control requirement | Optional             | Required when payment present       | **YES**   |
| Signing             | JWS over flat claims | JWS over envelope                   | **YES**   |

---

## 8. Timeline

- **v0.9.14**: Archived, no longer supported
- **v0.9.15**: Current development version (wire format: `peac.receipt/0.9`)
- **v0.9.16-v0.9.21**: Incremental improvements, wire format frozen
- **v1.0**: GA release (wire format: `peac.receipt/1.0`)

---

## 9. Support

For migration questions or issues:

- File issue: https://github.com/peacprotocol/peac/issues
- Consult docs: [docs/SPEC_INDEX.md](SPEC_INDEX.md)
- Review test vectors: [docs/specs/TEST_VECTORS.md](specs/TEST_VECTORS.md)

---

## 10. Version History

- **2025-01-18**: Initial migration guide for v0.9.15
