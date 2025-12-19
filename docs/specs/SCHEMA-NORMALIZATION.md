# PEAC Schema Normalization Specification

**Status**: NORMATIVE

**Version**: 0.9.18

**Wire Format**: `peac.receipt/0.9`

---

## 1. Introduction

This document defines the normative schema normalization semantics for PEAC receipts. Schema normalization enables byte-identical comparison of receipts regardless of how they were created (via x402, TAP, RSL, ACP, or direct issuance).

**Key words**: The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

**Implementation requirement**: Implementations that need to compare receipts for equivalence MUST use the normalization algorithm defined in this document.

---

## 2. Core Claims

### 2.1 Definition

Core claims are the minimal set of fields that represent the semantic meaning of a receipt. All other fields (rail-specific evidence, extended metadata, etc.) are considered non-semantic for comparison purposes.

### 2.2 Core Claim Fields

The following fields comprise the core claims:

| Field     | Type              | Required | Description                      |
| --------- | ----------------- | -------- | -------------------------------- |
| `iss`     | string            | YES      | Issuer URL                       |
| `aud`     | string            | YES      | Audience/resource URL            |
| `rid`     | string            | YES      | Receipt ID                       |
| `iat`     | number            | YES      | Issued-at timestamp              |
| `exp`     | number            | NO       | Expiry timestamp                 |
| `amt`     | number            | YES      | Amount in smallest currency unit |
| `cur`     | string            | YES      | ISO 4217 currency code           |
| `payment` | NormalizedPayment | YES      | Normalized payment evidence      |
| `subject` | Subject           | NO       | Subject of the receipt           |
| `control` | NormalizedControl | NO       | Normalized control block         |

### 2.3 Normalized Payment

The `NormalizedPayment` structure contains only the semantic payment fields:

| Field        | Type             | Required | Description             |
| ------------ | ---------------- | -------- | ----------------------- |
| `rail`       | string           | YES      | Payment rail identifier |
| `reference`  | string           | YES      | Payment reference       |
| `amount`     | number           | YES      | Amount in smallest unit |
| `currency`   | string           | YES      | ISO 4217 currency code  |
| `asset`      | string           | YES      | Asset transferred       |
| `env`        | "live" \| "test" | YES      | Environment             |
| `network`    | string           | NO       | Network identifier      |
| `aggregator` | string           | NO       | Aggregator identifier   |
| `routing`    | string           | NO       | Routing mode            |

**Important**: The `evidence` field from `PaymentEvidence` is NOT included in `NormalizedPayment`. This field contains rail-specific details that vary between implementations and MUST be excluded from core claims comparison.

### 2.4 Normalized Control

The `NormalizedControl` structure contains only the semantic control fields:

| Field   | Type                    | Description               |
| ------- | ----------------------- | ------------------------- |
| `chain` | NormalizedControlStep[] | Array of normalized steps |

Each `NormalizedControlStep` contains:

| Field    | Type   | Description               |
| -------- | ------ | ------------------------- |
| `engine` | string | Control engine identifier |
| `result` | string | Decision result           |

**Important**: The following `ControlStep` fields are NOT included in normalization:

- `version` - Engine version tracking
- `policy_id` - Engine-specific policy identifier
- `reason` - Human-readable explanation
- `purpose` - Access purpose
- `licensing_mode` - Commercial arrangement
- `scope` - Resource scope
- `limits_snapshot` - Engine-specific limits
- `evidence_ref` - External evidence link

These fields provide context but do not affect the semantic meaning of the receipt for comparison purposes.

---

## 3. Normalization Algorithm

### 3.1 toCoreClaims Algorithm

**Input**: `PEACReceiptClaims claims`

**Output**: `CoreClaims`

**Algorithm**:

```
1. Initialize result object with required fields:
   result = {
     iss: claims.iss,
     aud: claims.aud,
     rid: claims.rid,
     iat: claims.iat,
     amt: claims.amt,
     cur: claims.cur,
     payment: normalizePayment(claims.payment)
   }

2. Add optional exp if present:
   IF claims.exp is defined AND claims.exp is not undefined:
     result.exp = claims.exp

3. Add optional subject if present:
   IF claims.subject is defined AND claims.subject is not undefined:
     result.subject = { uri: claims.subject.uri }

4. Add optional control if present:
   IF claims.ext.control is defined:
     result.control = normalizeControl(claims.ext.control)

5. RETURN result
```

### 3.2 normalizePayment Algorithm

**Input**: `PaymentEvidence payment`

**Output**: `NormalizedPayment`

**Algorithm**:

```
1. Initialize result with required fields:
   result = {
     rail: payment.rail,
     reference: payment.reference,
     amount: payment.amount,
     currency: payment.currency,
     asset: payment.asset,
     env: payment.env
   }

2. Add optional fields if defined:
   IF payment.network is defined:
     result.network = payment.network
   IF payment.aggregator is defined:
     result.aggregator = payment.aggregator
   IF payment.routing is defined:
     result.routing = payment.routing

3. NOTE: payment.evidence is EXCLUDED
4. NOTE: payment.splits is EXCLUDED
5. NOTE: payment.facilitator_ref is EXCLUDED

6. RETURN result
```

### 3.3 normalizeControl Algorithm

**Input**: `ControlBlock control`

**Output**: `NormalizedControl`

**Algorithm**:

```
1. Initialize result:
   result = { chain: [] }

2. For each step in control.chain:
   normalizedStep = {
     engine: step.engine,
     result: step.result
   }
   result.chain.push(normalizedStep)

3. RETURN result
```

---

## 4. Canonical Comparison

### 4.1 JCS Canonicalization (REQUIRED)

**CRITICAL**: To produce byte-identical output for comparison, implementations MUST use JSON Canonicalization Scheme (JCS) as defined in RFC 8785. No other canonicalization scheme is permitted.

This specification does NOT provide a standalone comparison function. Comparison MUST be performed as:

```
isEqual = canonicalize(toCoreClaims(A)) === canonicalize(toCoreClaims(B))
```

Where `canonicalize` is a conformant RFC 8785 implementation.

**Comparison Algorithm**:

```
1. coreA = toCoreClaims(receiptA)
2. coreB = toCoreClaims(receiptB)
3. canonicalA = jcsCanonalize(coreA)
4. canonicalB = jcsCanonalize(coreB)
5. RETURN canonicalA == canonicalB (byte comparison)
```

### 4.2 Properties

The normalization algorithm guarantees:

1. **Determinism**: The same receipt always produces the same core claims
2. **Source Independence**: Receipts created from different sources (x402, TAP, RSL, ACP) with the same semantic content produce identical core claims
3. **Evidence Isolation**: Rail-specific evidence does not affect comparison
4. **Optional Field Handling**: Undefined optional fields are omitted (not null)

---

## 5. Non-Goals

The following are explicitly **NOT** goals of this specification:

1. **Standalone comparison function**: This specification provides `toCoreClaims()` for projection only. Comparison MUST use RFC 8785 canonicalization from `@peac/crypto` or equivalent. Implementations MUST NOT provide non-RFC8785 comparison utilities.

2. **Full receipt equivalence**: Core claims represent semantic equivalence, not byte-identical receipts. Two receipts with identical core claims may have different signatures, timestamps, or rail-specific evidence.

3. **Cryptographic verification**: Normalization is for comparison only. Receipt authenticity MUST be verified via JWS signature verification before any comparison.

4. **Evidence preservation**: Rail-specific evidence is intentionally excluded. Systems requiring evidence access MUST use the original receipt claims, not normalized core claims.

---

## 6. Cross-Mapping Parity

### 6.1 Requirement

Implementations that create receipts from different sources MUST ensure that semantically equivalent receipts produce byte-identical JCS-canonicalized core claims.

### 6.2 Example

Given an ACP checkout event and an x402 payment that represent the same transaction:

```typescript
// ACP-derived receipt
const acpReceipt = fromACPCheckoutSuccess({
  checkout_id: 'checkout_abc',
  resource_uri: 'https://example.com/article/1',
  total_amount: 500,
  currency: 'USD',
  payment_rail: 'x402',
  payment_reference: 'pay_123',
});

// Direct x402 receipt
const x402Receipt = {
  iss: 'https://issuer.example.com',
  aud: 'https://example.com/article/1',
  rid: 'receipt-001',
  iat: 1703000000,
  amt: 500,
  cur: 'USD',
  payment: {
    rail: 'x402',
    reference: 'pay_123',
    amount: 500,
    currency: 'USD',
    asset: 'USD',
    env: 'live',
    evidence: { payment_intent: 'pi_xyz' },
  },
};

// After normalization, if core fields match:
canonicalize(toCoreClaims(acpReceipt)) === canonicalize(toCoreClaims(x402Receipt));
```

---

## 7. Implementation Notes

### 7.1 TypeScript Reference

The reference implementation is in `@peac/schema`:

```typescript
import { toCoreClaims } from '@peac/schema';
import { canonicalize } from '@peac/crypto';

// Extract core claims
const core = toCoreClaims(receiptClaims);

// Compare two receipts via JCS canonicalization (REQUIRED)
const coreA = toCoreClaims(receiptA);
const coreB = toCoreClaims(receiptB);
const isEqual = canonicalize(coreA) === canonicalize(coreB);
```

### 7.2 Testing Requirements

Implementations MUST include parity tests that verify:

1. Receipts with different field ordering produce identical canonical output
2. Receipts with different rail-specific evidence produce identical core claims
3. Receipts from different mapping sources (ACP, TAP, RSL) produce consistent normalization

---

## 8. Changelog

### v0.9.18

- Initial specification
- Defined CoreClaims, NormalizedPayment, NormalizedControl
- Defined normalization algorithms
- Defined JCS canonical comparison requirements
- Added non-goals section (Section 5)
- Removed coreClaimsEqual() - comparison MUST use RFC 8785 canonicalization
