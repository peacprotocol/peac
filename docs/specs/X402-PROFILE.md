# x402 Adapter Profile

**Version:** peac-x402-offer-receipt/0.1
**Status:** Normative
**Package:** `@peac/adapter-x402`

This document specifies the PEAC adapter profile for the x402 Offer/Receipt extension. It defines how x402 signed offers and receipts are verified, normalized, and mapped to canonical PEAC interaction records.

**Note:** This profile targets the x402 **Offer/Receipt extension** (signed offers + signed receipts), NOT the baseline x402 header flow. The profile identifier `peac-x402/0.1` is RESERVED for future baseline header flow support.

## 1. Overview

x402 is a payment protocol built on HTTP 402. The Offer/Receipt extension provides signed offers (payment terms) and signed receipts (settlement proofs). PEAC provides the verification, normalization, and evidence layer above x402.

**Layer separation:**

| Layer                   | Owner | Responsibility                              |
| ----------------------- | ----- | ------------------------------------------- |
| Payment Handshake       | x402  | Signed offers, signed receipts, settlement  |
| Verification + Evidence | PEAC  | Term-matching, normalization, audit records |

## 2. Profile Identifiers

**This profile:** `peac-x402-offer-receipt/0.1`
**Reserved:** `peac-x402/0.1` (for baseline header flow)

The distinction is critical:

- **Offer/Receipt extension**: Signed payload artifacts with full verification
- **Baseline flow**: HTTP headers only, no signed payloads

## 3. Required Proofs

The adapter expects two signed artifacts from the x402 Offer/Receipt flow:

### 3.1 Signed Offer

```typescript
interface SignedOffer {
  payload: OfferPayload;
  signature: string;
  format: 'eip712' | 'jws';
}

interface OfferPayload {
  version: string; // Schema version (e.g., "1")
  validUntil: number; // Expiry as Unix epoch seconds
  network: string; // CAIP-2 identifier (e.g., "eip155:8453")
  asset: string; // Payment asset (e.g., "USDC")
  amount: string; // Minor units as string (non-negative integer)
  payTo: string; // Recipient address
  scheme?: string; // Optional payment scheme
}
```

### 3.2 Signed Receipt

```typescript
interface SignedReceipt {
  payload: ReceiptPayload;
  signature: string;
  format: 'eip712' | 'jws';
}

interface ReceiptPayload {
  version: string; // Schema version
  network: string; // Settlement network (CAIP-2)
  txHash: string; // On-chain transaction hash
  // Note: amount, asset, payTo intentionally omitted (privacy)
}
```

## 4. Input Validation (Normative)

### 4.1 DoS Protection

Implementations MUST enforce these limits to prevent denial-of-service:

| Limit                     | Value  | Rationale                            |
| ------------------------- | ------ | ------------------------------------ |
| `MAX_ACCEPT_ENTRIES`      | 128    | Bounds O(n) scan to O(128)           |
| `MAX_TOTAL_ACCEPTS_BYTES` | 262144 | 256 KiB - prevents memory exhaustion |
| `MAX_ENTRY_BYTES`         | 2048   | 2 KiB per entry - bounds settlement  |
| `MAX_FIELD_BYTES`         | 256    | Per-field limit (UTF-8 bytes)        |
| `MAX_AMOUNT_LENGTH`       | 78     | uint256 max (Ethereum's largest)     |

When limits are exceeded, return `accept_too_many_entries` or `accept_entry_invalid`.

**Implementation notes:**

- Size checks use bounded traversal (stack-based byte counting) to avoid allocating full JSON strings
- Shape validation runs before byte checks to prevent crashes from malformed JSON
- Uses `TextEncoder` for portable UTF-8 byte length (works in Node.js and edge runtimes)

### 4.2 Amount Validation

Amount strings MUST be validated as non-negative integers:

```
Regex: ^(0|[1-9][0-9]*)$
```

Invalid amounts:

- Negative: `-100` (fails regex)
- Decimal: `100.50` (fails regex)
- Leading zeros: `0100` (fails regex)
- Non-numeric: `abc` (fails regex)

When validation fails, return `amount_invalid`.

### 4.3 Network Validation

Network strings MUST match CAIP-2 format when strict validation is enabled.

Per [CAIP-2 spec](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md):

- **Namespace**: 3-8 lowercase characters, starting with a letter, may contain digits and hyphens
- **Reference**: 1-64 characters, starting with alphanumeric, may contain letters, digits, hyphens, underscores

```text
Namespace regex: ^[a-z][a-z0-9-]{2,7}$
Reference regex: ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$
```

Valid examples: `eip155:8453`, `solana:mainnet`, `cosmos:cosmoshub-4`
Invalid examples: `ethereum-mainnet`, `ETH`, `8453`

When validation fails, return `network_invalid`.

## 5. Binding Rules (Normative)

### 5.1 acceptIndex as Untrusted Hint

**CRITICAL:** `acceptIndex` is an unsigned envelope field in x402. It is outside the signed payload and can be modified in transit without invalidating the signature.

Verifiers **MUST NOT** treat `acceptIndex` as authoritative for binding.

### 5.2 Term-Matching is the Binding

Verifiers **MUST** perform term-matching between:

1. The signed offer payload fields, AND
2. The accept entry at `accepts[acceptIndex]` (if provided), OR a full scan of `accepts[]`

The following fields **MUST** match exactly:

- `network`
- `asset`
- `amount`
- `payTo`
- `scheme` (if present in both)

### 5.3 Verification Algorithm

```
1. DoS Guards
   - accepts.length <= MAX_ACCEPT_ENTRIES
   - JSON.stringify(accepts).length <= MAX_TOTAL_ACCEPTS_KB
   - offer.payload.amount.length <= MAX_AMOUNT_LENGTH

2. Amount Validation (if strictAmountValidation enabled)
   - offer.payload.amount matches ^(0|[1-9][0-9]*)$

3. Network Validation (if strictNetworkValidation enabled)
   - offer.payload.network matches CAIP-2 regex

4. Structural Validation
   - Offer has payload, signature, format
   - Payload has all required fields (version, validUntil, network, asset, amount, payTo)
   - Signature format matches declared format

5. Version Check
   - payload.version is in supported versions list (default: ["1"])

6. Expiry Check
   - payload.validUntil > (now - clockSkewSeconds)
   - Default clockSkewSeconds: 60

7. Signature Format Validation
   - EIP-712: 0x-prefixed, 130 hex chars (65 bytes)
   - JWS: header.payload.signature (compact serialization)

8. Accept Selection (term-matching)

   IF acceptIndex provided:
     - Bounds check: 0 <= acceptIndex < accepts.length
     - Term-match: accepts[acceptIndex] vs signed payload

     IF mismatchPolicy == 'fail':
       - REJECT if mismatch (accept_term_mismatch)
     ELSE IF mismatchPolicy == 'warn_and_scan':
       - Log warning, set mismatchDetected flag
       - Continue with scan (step 8b below)
     ELSE IF mismatchPolicy == 'ignore_and_scan':
       - Skip hint, proceed to scan

   ELSE (no acceptIndex):
     - Scan all accepts[] for matches
     - REQUIRE exactly 1 match
     - REJECT if 0 matches (accept_no_match)
     - REJECT if 2+ matches (accept_ambiguous)
```

### 5.4 Error Taxonomy

| Code                          | HTTP | Description                                      |
| ----------------------------- | ---- | ------------------------------------------------ |
| `offer_invalid_format`        | 400  | Offer structure is malformed                     |
| `offer_expired`               | 400  | `validUntil` is in the past                      |
| `offer_version_unsupported`   | 400  | Version not in supported list                    |
| `offer_signature_invalid`     | 401  | Signature format is structurally invalid         |
| `receipt_invalid_format`      | 400  | Receipt structure is malformed                   |
| `receipt_signature_invalid`   | 401  | Receipt signature format is structurally invalid |
| `receipt_version_unsupported` | 400  | Receipt version not in supported list            |
| `accept_index_out_of_range`   | 400  | acceptIndex exceeds accepts array bounds         |
| `accept_no_match`             | 400  | No accept entry matches signed payload           |
| `accept_ambiguous`            | 400  | Multiple entries match; index needed             |
| `accept_term_mismatch`        | 400  | acceptIndex entry does not match payload         |
| `accept_too_many_entries`     | 400  | Accepts array exceeds MAX_ACCEPT_ENTRIES         |
| `payload_missing_field`       | 400  | Required payload field is missing                |
| `payload_tampered`            | 401  | RESERVED: Cryptographic integrity check failed   |
| `amount_invalid`              | 400  | Amount is not a valid non-negative integer       |
| `network_invalid`             | 400  | Network does not match CAIP-2 format             |

**Note on `payload_tampered`:** This error code is reserved for implementations that perform cryptographic signature verification. The base adapter performs structural validation only.

## 6. PEAC Record Mapping

### 6.1 Record Structure

```typescript
interface X402PeacRecord {
  version: 'peac-x402-offer-receipt/0.1';

  proofs: {
    x402: {
      offer: SignedOffer; // Raw artifact for audit
      receipt: SignedReceipt; // Raw artifact for audit
    };
  };

  evidence: {
    validUntil: number; // From offer.payload (signed)
    network: string; // From offer.payload (signed)
    payee: string; // From offer.payload.payTo (signed, neutral name)
    asset: string; // From offer.payload (signed)
    amount: string; // From offer.payload (signed)
    txHash: string; // From receipt.payload (signed)
    offerVersion: string; // From offer.payload (signed)
    receiptVersion?: string; // From receipt.payload (signed)
  };

  hints: {
    acceptIndex?: {
      value: number;
      untrusted: true; // ALWAYS true - acceptIndex is unsigned
      mismatchDetected?: boolean; // true if warn_and_scan detected mismatch
    };
    resourceUrl?: string; // Informational only
    verification?: VerificationStatus; // What verification was performed
  };

  digest?: string; // JCS+SHA-256 hash
  createdAt: string; // ISO 8601 timestamp
}
```

### 6.2 Verification Status

The `hints.verification` field documents what verification was performed:

```typescript
interface VerificationStatus {
  /** Structural validation always performed by this adapter */
  structural: true;

  /** Cryptographic signature verification status */
  cryptographic: {
    /** Whether crypto verification was performed */
    verified: boolean;
    /** Why crypto wasn't verified (if not verified) */
    reason?: 'not_checked' | 'verifier_not_supplied' | 'verifier_failed';
    /** Signature format */
    format?: 'eip712' | 'jws';
    /** Signer identity (if verified and available) */
    signer?: string;
  };

  /** Term-matching verification status */
  termMatching: {
    /** Whether a matching accept entry was found */
    matched: boolean;
    /** Method used: 'hint' (acceptIndex) or 'scan' (full scan) */
    method: 'hint' | 'scan';
    /** Index of matched accept entry */
    matchedIndex?: number;
  };
}
```

**IMPORTANT:** `valid: true` from `verifyOffer()` does NOT imply cryptographic signature validity unless `hints.verification.cryptographic.verified` is also `true`.

### 6.3 Mapping Table

| x402 Source                | PEAC Record Field         | Notes                               |
| -------------------------- | ------------------------- | ----------------------------------- |
| `offer.payload.validUntil` | `evidence.validUntil`     | Epoch seconds (signed)              |
| `offer.payload.network`    | `evidence.network`        | CAIP-2 identifier (signed)          |
| `offer.payload.payTo`      | `evidence.payee`          | Recipient (signed, neutral name)    |
| `offer.payload.asset`      | `evidence.asset`          | Payment asset (signed)              |
| `offer.payload.amount`     | `evidence.amount`         | Minor units (signed)                |
| `receipt.payload.txHash`   | `evidence.txHash`         | On-chain tx hash (signed)           |
| `offer.payload.version`    | `evidence.offerVersion`   | Schema version (signed)             |
| `receipt.payload.version`  | `evidence.receiptVersion` | Schema version (signed)             |
| `acceptIndex`              | `hints.acceptIndex.value` | UNSIGNED - marked `untrusted: true` |
| `resourceUrl`              | `hints.resourceUrl`       | Informational only                  |
| Full offer                 | `proofs.x402.offer`       | Preserved for audit                 |
| Full receipt               | `proofs.x402.receipt`     | Preserved for audit                 |

**Note on `payee`:** The PEAC record uses the vendor-neutral term `payee` instead of x402's `payTo`. This enables consistent evidence fields across payment adapters.

## 7. Cryptographic Verification

### 7.1 Verification Responsibility Model

This adapter implements a **layered verification model**:

| Layer         | Responsibility        | Who                     |
| ------------- | --------------------- | ----------------------- |
| Structural    | Format validation     | This adapter (built-in) |
| Cryptographic | Signature validity    | Caller (pluggable)      |
| Term-matching | Payload-to-terms bind | This adapter (built-in) |
| Settlement    | On-chain confirmation | External (chain RPC)    |

### 7.2 Structural Validation (Built-in)

The adapter performs structural signature validation:

- EIP-712: Verifies 0x-prefixed 65-byte hex format (130 chars)
- JWS: Verifies compact serialization format (header.payload.signature)

### 7.3 Cryptographic Validation (Pluggable)

**Cryptographic** signature verification (EIP-712 ecrecover, JWS key verification) is the **caller's responsibility**. The adapter assumes artifacts have already been cryptographically verified before being passed to it.

Implementations MAY provide optional crypto verification by:

1. Defining a `CryptoVerifier` interface
2. Injecting verification functions via configuration
3. Using the `payload_tampered` error code for failures

### 7.4 Mismatch Policy

Implementations support configurable mismatch handling:

| Policy            | Behavior                                         | Use Case             |
| ----------------- | ------------------------------------------------ | -------------------- |
| `fail`            | Reject on mismatch (default, recommended)        | Production           |
| `warn_and_scan`   | Log warning, continue with scan, record in hints | Debugging, migration |
| `ignore_and_scan` | Skip hint check entirely, always scan            | Legacy compatibility |

When `warn_and_scan` detects a mismatch, the PEAC record includes:

```typescript
hints: {
  acceptIndex: {
    value: number;
    untrusted: true;
    mismatchDetected: true; // Indicates hint was incorrect
  }
}
```

## 8. Forward Compatibility

### 8.1 Extensions Field

The settlement response MAY include an `extensions` field for forward compatibility:

```typescript
interface X402SettlementResponse {
  receipt: SignedReceipt;
  resourceUrl?: string;
  offerRef?: string;
  extensions?: Record<string, unknown>; // Unknown fields from x402 evolution
}
```

Unknown fields are preserved in `proofs.x402` but NOT copied to normalized `evidence`. This allows the adapter to tolerate additions from upstream x402 PRs without breaking.

## 9. Conformance

Conformance vectors are provided in `specs/conformance/fixtures/x402/`.

### 9.1 Valid Scenarios

- `valid-with-hint.json` - Verification with acceptIndex
- `valid-scan.json` - Verification via full scan
- `valid-jws.json` - JWS signature format

### 9.2 Invalid Scenarios (MUST Fail)

- `expired-offer.json` - validUntil in past
- `accept-index-out-of-range.json` - acceptIndex >= accepts.length
- `accept-term-mismatch.json` - acceptIndex points to non-matching entry
- `accept-no-match.json` - No accept entry matches
- `accept-ambiguous.json` - Multiple entries match without index
- `invalid-signature-format.json` - Malformed signature
- `missing-payload-fields.json` - Required fields missing
- `unsupported-version.json` - Unknown version
- `invalid-amount-negative.json` - Negative amount
- `invalid-amount-decimal.json` - Decimal amount
- `invalid-amount-leading-zero.json` - Leading zeros in amount
- `invalid-network-format.json` - Non-CAIP-2 network

### 9.3 Edge Cases

- `clock-skew-tolerance.json` - Within tolerance should pass
- `acceptindex-ignored-scan.json` - Scan finds match without index
- `mismatch-warn-and-scan.json` - warn_and_scan policy behavior

### 9.4 DoS Protection (Dynamic)

- `dos-too-many-accepts.json` - Documents constraint (requires dynamic generation)

## 10. Security Considerations

### 10.1 acceptIndex Attack

Because `acceptIndex` is unsigned, an attacker could:

1. Intercept an x402 response
2. Modify `acceptIndex` to point to a different accept entry
3. Attempt to make the victim pay different terms

**Mitigation:** Term-matching verification. PEAC compares the signed payload fields against the accept entry, rejecting mismatches regardless of `acceptIndex` value.

### 10.2 DoS via Large Accepts Array

An attacker could send a massive `accepts[]` array to exhaust CPU/memory.

**Mitigation:** DoS guards (MAX_ACCEPT_ENTRIES=128, MAX_TOTAL_ACCEPTS_KB=256).

### 10.3 Amount Overflow

Malformed amount strings could cause parsing issues or overflow.

**Mitigation:** Strict amount validation (non-negative integer string, max 78 chars).

### 10.4 Replay Protection

Receipts bind to unique transaction hashes. Chain-level replay protection applies.

### 10.5 Expiry Bypass

`validUntil` is inside the signed payload. Attackers cannot extend offer validity without invalidating the signature.

## 11. Profile Classification

### 11.1 PEAC Adapter Taxonomy

This profile is classified as a **Payment Proof Adapter**:

| Adapter Class | Purpose                           | Examples                     |
| ------------- | --------------------------------- | ---------------------------- |
| Payment Proof | Verify payment/settlement proofs  | x402, Stripe, UPI, Lightning |
| Attestation   | Verify identity/attribution/trust | EAS, Agent Identity          |
| Policy        | Evaluate access/consent decisions | Policy Kit, AIPREF           |

### 11.2 Profile Identifier Convention

PEAC profile identifiers follow the pattern:

```text
peac-{source}-{variant}/{version}
```

For x402:

- `peac-x402-offer-receipt/0.1` (this profile - extension flow)
- `peac-x402/0.1` (RESERVED - baseline header flow)

### 11.3 Vendor Neutrality

This profile is:

- **Vendor-specific**: Implements x402 protocol semantics
- **Wire-format neutral**: Produces standard PEAC records
- **Interoperable**: Records can be verified without x402-specific tooling

PEAC does not privilege any particular payment protocol. x402 is one proof source among many.

## 12. References

- [x402 Protocol](https://github.com/coinbase/x402)
- [x402 Offer/Receipt Extension](https://github.com/coinbase/x402) (draft specification)
- [CAIP-2: Blockchain ID Specification](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md)
- [RFC 8785: JSON Canonicalization Scheme (JCS)](https://datatracker.ietf.org/doc/html/rfc8785)
- [PEAC Protocol](https://peacprotocol.org)
