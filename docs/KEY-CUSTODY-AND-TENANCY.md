# Key custody and tenancy

> Status: Current

This document describes the key custody architecture, tenancy guarantees, and procurement model for organizations evaluating or deploying the PEAC Protocol.

For the full index of trust artifacts (SLO, stability contract, threat model, security operations), see [Trust artifacts](TRUST-ARTIFACTS.md).

## Key Custody Model

PEAC is a bring-your-own-key (BYO key) protocol. The protocol never generates, stores, or transmits private signing keys.

| Aspect           | Policy                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key generation   | Performed by the deploying organization using its own tooling                                                                                           |
| Key storage      | Organization-managed; HSM, KMS, or filesystem per operator policy                                                                                       |
| Key access       | `@peac/crypto` accepts `Uint8Array` private keys at call time; no ambient discovery                                                                     |
| Key rotation     | 5-state lifecycle (pending, active, rotating, revoked, expired); 30-day overlap window; see [Security Considerations](specs/SECURITY-CONSIDERATIONS.md) |
| Key revocation   | Revoked keys tracked in `revoked_keys[]`; `kid` reuse detection prevents substitution                                                                   |
| Originary access | Originary (the protocol steward) never holds, escrows, or has access to any deployer signing keys                                                       |

### HSM and KMS readiness

The signing interface (`signWire02()`) accepts raw Ed25519 private keys. Organizations using hardware security modules or cloud KMS services perform signing externally and pass the resulting key material. No protocol code accesses key storage directly.

## Tenancy Architecture

### Self-hosted deployment

When organizations run `@peac/protocol` or `@peac/mcp-server` locally, all cryptographic operations execute in-process. There is no shared state, no external network calls during signing, and no multi-tenant surface.

### Self-hosted verify API (`apps/api`)

The reference verify API is self-hosted and tenantless: one process serves every caller, with no tenant isolation.

| Boundary           | Behavior                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verification state | Process-wide; the in-memory JWKS caches and rate-limit counters are shared by all callers                                                                                   |
| Logs               | Request contents are not logged                                                                                                                                             |
| Rate limits        | Coarse built-in limits that are not a security control; deploy the API behind a gateway that authenticates callers and enforces rate limits. Requests are not authenticated |
| Cache              | In-memory JWKS cache with TTL-bound expiry, shared by all callers                                                                                                           |
| Data retention     | Nothing is written to storage; caches and counters live in process memory                                                                                                   |

See [Hosted Verify Contract](HOSTED_VERIFY_CONTRACT.md) for the HTTP contract.

## Procurement

### License

Apache-2.0. No contributor license agreement (CLA) required. No dual licensing.

### Stewardship

PEAC Protocol is maintained by Originary. No formal foundation governance exists today. The protocol is designed for stewardship transfer: all normative specs, conformance fixtures, and test vectors are self-contained in the repository.

### Support model

| Tier        | Scope                                  | SLA         |
| ----------- | -------------------------------------- | ----------- |
| Open source | GitHub Issues, community contributions | Best-effort |

### Compliance alignment

The protocol's evidence model is designed to support compliance workflows, but PEAC itself is not a compliance product:

- Receipts provide portable, offline-verifiable evidence of interaction terms
- Extension groups cover consent, privacy, safety, compliance, provenance, and attribution
- The protocol does not enforce policy; it records what terms applied

Organizations must evaluate PEAC within their own compliance frameworks (GDPR, CCPA, EU AI Act, SOC 2, ISO 27001) based on their specific use of the evidence artifacts.

### Vendor neutrality

Core packages (`@peac/kernel`, `@peac/schema`, `@peac/crypto`, `@peac/protocol`) contain no vendor names, no proprietary dependencies, and no vendor-specific configuration. Vendor-specific integration lives exclusively in adapter packages (`@peac/adapter-*`).

## Related Documents

- [Trust artifacts](TRUST-ARTIFACTS.md): Single index over every trust artifact
- [SECURITY.md](../SECURITY.md): Vulnerability reporting, supported versions, supply chain
- [Security operations](SECURITY-OPERATIONS.md): Support windows, incident handling, logging, data residency
- [Threat model](THREAT_MODEL.md): Consolidated threat catalog with per-threat test coverage
- [Stability contract](STABILITY-CONTRACT.md): Classification of every public surface
- [SLO](SLO.md) and [Benchmark methodology](BENCHMARK-METHODOLOGY.md)
- [Architecture](ARCHITECTURE.md): Package layering, dependency DAG, wire formats
- [Security Considerations](specs/SECURITY-CONSIDERATIONS.md): Signing model, JOSE hardening, key lifecycle
- [Hosted Verify Contract](HOSTED_VERIFY_CONTRACT.md): API design, tenant isolation, threat mitigations
- [Compatibility Matrix](COMPATIBILITY_MATRIX.md): Runtime support, wire format support, deprecation schedule
- [Deprecation Policy](DEPRECATION_POLICY.md): Support windows, archive protocol
