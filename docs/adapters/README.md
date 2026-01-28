# PEAC Adapters

PEAC adapters transform proof artifacts from various sources into canonical PEAC interaction records. Each adapter implements verification, normalization, and mapping for a specific proof source while producing interoperable records that can be verified, stored, and audited independently of the original source.

## Adapter Taxonomy

PEAC defines three adapter classes:

| Class         | Purpose                            | Output                    |
| ------------- | ---------------------------------- | ------------------------- |
| Payment Proof | Verify payment/settlement proofs   | PEAC record with evidence |
| Attestation   | Verify identity/attribution claims | Attestation record        |
| Policy        | Evaluate access/consent decisions  | Policy decision record    |

## Payment Proof Adapters

Payment proof adapters verify payment handshake artifacts (offers, receipts, settlement proofs) and map them to canonical PEAC records.

### Available Adapters

| Adapter           | Protocol | Status      | Package              |
| ----------------- | -------- | ----------- | -------------------- |
| [x402](./x402.md) | HTTP 402 | Implemented | `@peac/adapter-x402` |

### Planned Adapters

| Adapter   | Protocol       | Status  |
| --------- | -------------- | ------- |
| Stripe    | Card payments  | Planned |
| UPI       | India payments | Planned |
| Lightning | Bitcoin L2     | Planned |

## Attestation Adapters

Attestation adapters verify cryptographic claims about identity, attribution, or trust relationships.

### Available Adapters

| Adapter | Protocol | Status      | Package             |
| ------- | -------- | ----------- | ------------------- |
| EAS     | EAS      | Implemented | `@peac/adapter-eas` |

## Architecture

### Layer Position

Adapters are Layer 4 packages in the PEAC dependency graph:

```text
Layer 0: @peac/kernel (types, constants, errors)
Layer 1: @peac/schema (Zod schemas, validation)
Layer 2: @peac/crypto (signing, verification)
Layer 3: @peac/protocol, @peac/control (high-level APIs)
Layer 4: @peac/adapter-* (proof source adapters)  <-- adapters here
Layer 5: @peac/server, @peac/cli (applications)
Layer 6: @peac/sdk-js (consumer SDK)
```

### Shared Core

All adapters depend on `@peac/adapter-core` which provides:

- `Result<T, E>` type for error handling
- Common validators for amounts, currencies, networks
- Adapter error types and codes

### Verification Responsibility Model

PEAC adapters implement a layered verification model:

| Layer              | Responsibility        | Who                   |
| ------------------ | --------------------- | --------------------- |
| Structural         | Format validation     | Adapter (built-in)    |
| Cryptographic      | Signature validity    | Caller (pluggable)    |
| Term/claim binding | Semantic verification | Adapter (built-in)    |
| Settlement         | External confirmation | External (chain, API) |

This separation allows adapters to focus on semantic verification (term-matching, claim binding) while allowing callers to plug in appropriate cryptographic verification for their environment.

## Profile Identifiers

Each adapter defines a profile identifier for the records it produces:

```text
peac-{profile}/{version}
```

Examples:

- `peac-x402-offer-receipt/0.1` - x402 signed offer/receipt extension records
- `peac-x402/0.1` - Reserved for baseline x402 header-only mapping
- `peac-eas/0.1` - EAS attestation records

Profile identifiers are distinct from the core PEAC wire format (`peac-receipt/0.1`). Profiles define how specific proof sources map to canonical records.

## Vendor Neutrality

PEAC does not privilege any particular payment protocol, attestation scheme, or vendor. Adapters are:

- **Source-specific**: Implement the semantics of one proof source
- **Wire-format neutral**: Produce standard PEAC records
- **Interoperable**: Records can be verified without source-specific tooling

This design ensures PEAC remains the neutral evidence layer across multiple ecosystems.

### Neutral Field Naming

Adapters use domain-neutral field names in the core interface, mapping vendor-specific terms at the boundary:

| Neutral Field | Purpose                | Why Not `to`                                |
| ------------- | ---------------------- | ------------------------------------------- |
| `payee`       | Payment recipient      | `to` is overloaded (message routing, email) |
| `payer`       | Payment sender         | Consistent with `payee`                     |

**Rationale for `payee`:**

1. **Unambiguous**: "payee" means recipient of value across payments, accounting, and ISO terminology
2. **Machine-friendly**: Stable, searchable field name across adapters (unlike overloaded `to`)
3. **Human-readable**: In audits, `payee` immediately answers "who got paid"
4. **Vendor-neutral**: Avoids source-specific naming (`payTo`, `destination`, `merchant_account`)

**Adapter boundary mapping:**

```typescript
// x402 adapter maps "payTo" -> "payee"
evidence: {
  payee: offerPayload.payTo,  // Neutral naming
  // ... other fields
}
```

Future adapters (Stripe, UPI, etc.) map their terms to the same neutral `payee` field.

## Creating a New Adapter

To create a new payment proof adapter:

1. Create package at `packages/adapters/{name}/`
2. Depend on `@peac/adapter-core` and `@peac/schema`
3. Implement verification functions for the proof artifacts
4. Implement mapping to produce `X{Name}PeacRecord`
5. Define error codes following the taxonomy pattern
6. Add conformance vectors in `specs/conformance/fixtures/{name}/`
7. Document in `docs/adapters/{name}.md`

See the [x402 adapter](./x402.md) as a reference implementation.

## References

- [Adapter Core Package](../../packages/adapters/core/)
- [x402 Profile Spec](../specs/X402-PROFILE.md)
- [Conformance Vectors](../../specs/conformance/fixtures/)
