# PEAC Protocol Evolution

**Status**: INFORMATIONAL

**Purpose**: Documents planned features, reserved fields, and future directions for PEAC

---

## 1. Versioning Strategy

### 1.1 Wire Format Versions

PEAC uses `typ` claim in JWS header to indicate wire format version:

- **v0.9.x** (current): `typ: "peac.receipt/0.9"`
- **v1.0** (future): `typ: "peac.receipt/1.0"`

**v0.9 series** (v0.9.15 → v0.9.21):
- Wire format frozen at `peac.receipt/0.9`
- Additive changes only (new fields, new error codes)
- No breaking structural changes
- Flip to v1.0 when protocol is "earned" (proven in production)

**v1.0**:
- Wire format becomes `peac.receipt/1.0`
- Stable, production-ready
- Candidate for IETF RFC submission

### 1.2 Semantic Versioning

- **Major** (x.0.0): Breaking wire format changes
- **Minor** (0.x.0): Additive features (new fields, new semantics)
- **Patch** (0.0.x): Bug fixes, clarifications, non-breaking updates

---

## 2. Reserved Fields (Non-Functional in v0.9.x)

The following fields are present in the schema but have **no normative semantics** in v0.9.x:

### 2.1 Multi-Payment (`evidence.payments[]`)

**Current status**: RESERVED

**Schema**:
```json
{
  "evidence": {
    "payments": [
      { "rail": "...", "amount": 100, ... },
      { "rail": "...", "amount": 50, ... }
    ]
  }
}
```

**Warning**: Do NOT rely on `payments[]` for correctness in v0.9.x. Only `evidence.payment` (singular) is normative.

**Planned semantics** (v0.9.16+):
- Split payment across multiple rails (e.g., 70% card, 30% crypto)
- Control chain applies to **aggregate amount**, not per-payment
- All payments MUST succeed atomically, or transaction fails
- Each payment has separate `evidence` block with rail-specific details

**Open questions**:
- How to handle partial failures?
- Should each payment have its own control step?
- How to represent facilitator coordination across rails?

---

### 2.2 Receipt Chaining

**Current status**: RESERVED

**Fields**:
- `auth.parent_rid`: Parent receipt ID (for hierarchical relationships)
- `auth.supersedes_rid`: Superseded receipt ID (for replacements/refunds)
- `auth.delegation_chain`: Array of receipt IDs for delegation chains

**Planned semantics** (v0.9.17+):

#### Use case: Subscription → Usage
```json
{
  "auth": {
    "rid": "01USAGE123...",
    "parent_rid": "01SUBSCRIPTION456...",
    ...
  }
}
```

#### Use case: Refund
```json
{
  "auth": {
    "rid": "01REFUND789...",
    "supersedes_rid": "01PAYMENT123...",
    ...
  }
}
```

#### Use case: Delegation
```json
{
  "auth": {
    "rid": "01DELEGATE...",
    "delegation_chain": ["01AGENT1...", "01AGENT2..."],
    ...
  }
}
```

**Validation rules** (future):
- Verifiers SHOULD validate chains by fetching parent receipts
- Chains MUST NOT form loops (detect via BFS/DFS)
- Chains MUST have finite depth (recommend max 10 hops)
- Delegation chains MUST respect policy constraints

---

## 3. Planned Features

### 3.1 Additional Control Combinators (v0.9.16)

**Current**: Only `any_can_veto` supported

**Planned**:
- `all_must_allow`: All steps must result in "allow" (unanimous)
- `majority`: >50% of steps must allow
- `weighted`: Steps have weights, weighted majority required
- `custom`: Custom combinator logic (opaque to protocol)

**Rationale**: Enterprise governance needs more flexible voting logic.

---

### 3.2 Policy Schema (v1.0)

**Current status**: Policy structure is informational only

**Planned**: Normative policy schema defining:
- Policy format and required fields
- Control engine configuration
- Payment rail restrictions
- Rate limits and quotas
- Compliance/attribution requirements

**Example skeleton**:
```json
{
  "version": "peac.policy/1.0",
  "issuer": "https://api.example.com",
  "engines": [
    {
      "engine": "spend-control-service",
      "policy_id": "default",
      "config": { ... }
    }
  ],
  "payment_constraints": {
    "allowed_rails": ["x402", "card-network"],
    "max_amount": { "amount": 10000, "currency": "USD" }
  }
}
```

---

### 3.3 Post-Quantum Cryptography (PQC) (v1.0+)

**Current**: EdDSA (Ed25519) only

**Planned**: Add PQC algorithm support for future-proofing:
- **Dilithium** (NIST standard, lattice-based)
- **SPHINCS+** (hash-based, conservative)
- **Falcon** (lattice-based, compact signatures)

**Migration path**:
- v0.9.x: EdDSA only
- v1.0: Add PQC as optional `alg` values
- v2.0: Potentially deprecate non-PQC algorithms (long-term)

**Alg identifiers**:
```json
{
  "alg": "EdDSA",           // Current
  "alg": "DILITHIUM3",      // Future PQC
  "alg": "SPHINCS+-SHA256"  // Future PQC
}
```

---

### 3.4 Attestation Evidence (v0.9.16)

**Current**: `AttestationEvidence` defined but rarely used

**Planned enhancements**:
- Add attestation formats to registries (tpm2.0, sgx, nitro, etc.)
- Define verification procedures for common formats
- Integrate with control engines (e.g., "only allow calls from attested agents")

---

### 3.5 Receipt Compression (v0.9.18)

**Problem**: Receipts can be large (5-10KB with full chains)

**Solutions**:
- **JWS compression**: gzip or brotli compress payload before base64url
- **Selective disclosure**: Redact non-essential fields
- **Receipt references**: Store full receipt externally, include hash/URI only

---

## 4. Ecosystem Evolution

### 4.1 Adapter Packages

As ecosystem grows, expect:
- `@peac/rails-core`: Shared rail adapter interface (v0.9.16)
- `@peac/rails-ach`: ACH payment rail
- `@peac/rails-wire`: Wire transfer rail
- `@peac/rails-crypto-*`: Onchain rails (Ethereum, Solana, etc.)
- `@peac/mappings-acp`: ACP protocol mapping
- `@peac/mappings-evmauth`: EVMAuth integration

### 4.2 Language Implementations

Target: Official implementations in multiple languages:
- **TypeScript** (reference)
- **Go** (v0.9.16)
- **Rust** (v0.9.17)
- **Python** (v0.9.18)

All implementations MUST pass same test vectors.

---

## 5. Standards Track

### 5.1 IETF Process

Potential path:
1. **v0.9.x**: Iterate, stabilize, gather feedback
2. **v1.0**: Production-ready, stable wire format
3. **Internet-Draft**: Submit to IETF (OAuth WG or new WG)
4. **RFC**: Standardize as RFC if adopted

**Advantages of RFC**:
- Vendor-neutral governance
- IANA registries for rails/engines
- Broader adoption (standards bodies, regulators)

### 5.2 W3C / Web Standards

Potential W3C activities:
- Browser API for PEAC receipt storage/verification
- Integration with Web Payments API
- Agentic Web standardization (PEAC as receipt layer)

---

## 6. Compatibility Guarantees

### 6.1 Forward Compatibility

**v0.9.x implementations** reading future receipts:
- MUST ignore unknown fields
- MUST validate known fields per spec version
- MAY warn about unrecognized `typ` versions

### 6.2 Backward Compatibility

**Future implementations** reading v0.9.x receipts:
- MUST support `typ: "peac.receipt/0.9"`
- MUST validate per v0.9 semantics
- MAY apply stricter validation if safe

---

## 7. Deprecation Policy

### 7.1 Fields

Deprecated fields will:
1. Be marked deprecated in schema (annotation)
2. Remain functional for at least 2 minor versions
3. Be removed in next major version

### 7.2 Error Codes

Error codes are stable. New codes may be added; old codes will NOT be removed.

---

## 8. Questions for Future Versions

**Q1**: Should we support receipt aggregation (many receipts → one summary)?

**Q2**: How to handle multi-currency receipts (payment in BTC, accounting in USD)?

**Q3**: Should policy documents be signed/versioned separately from receipts?

**Q4**: How to handle time-delayed settlements (authorize now, settle later)?

**Q5**: Should we define a "receipt request" format (pre-issuance negotiation)?

---

## 9. Contributing to Evolution

To propose new features:
1. Open GitHub issue with use case and motivation
2. Provide example receipts demonstrating feature
3. Discuss compatibility and migration path
4. Submit PR with spec updates and test vectors

---

## 10. Version History

- **v0.9.15 (2025-01-18)**: Initial evolution roadmap
