# Key custody and tenancy

> Version: 0.12.12 | Status: Current

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

### Hosted Verify (planned, v0.12.8)

The Hosted Verify API uses per-API-key tenant isolation:

| Boundary           | Isolation guarantee                                             |
| ------------------ | --------------------------------------------------------------- |
| Verification state | No shared state between API keys                                |
| Logs               | Tenant-scoped; `receipt_ref` only by default                    |
| Rate limits        | Per-tenant; configurable; default 100 req/min                   |
| Cache              | Per-tenant JWKS cache with TTL-bound expiry                     |
| Data retention     | Configurable per tenant; default 30-day log, 90-day receipt_ref |

Cross-tenant data leakage is prevented by design: each API key resolves to an isolated verification context with no shared mutable state. See [Hosted Verify Contract](HOSTED_VERIFY_CONTRACT.md) for the full API design.

## Procurement

### License

Apache-2.0. No contributor license agreement (CLA) required. No dual licensing.

### Stewardship

PEAC Protocol is maintained by Originary. No formal foundation governance exists today. The protocol is designed for stewardship transfer: all normative specs, conformance fixtures, and test vectors are self-contained in the repository.

### Support model

| Tier                    | Scope                                  | SLA          |
| ----------------------- | -------------------------------------- | ------------ |
| Open source             | GitHub Issues, community contributions | Best-effort  |
| Hosted Verify (planned) | API uptime, verification correctness   | Per-contract |

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
