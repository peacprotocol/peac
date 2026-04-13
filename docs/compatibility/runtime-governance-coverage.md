# Runtime Governance Record Coverage

**Snapshot date:** Microsoft AGT v3.1.0 pre-release state as of April 13, 2026.
For current upstream status, see
[microsoft/agent-governance-toolkit](https://github.com/microsoft/agent-governance-toolkit).

This document distinguishes three truth surfaces so readers can reason about
where a given capability lives. Collapsing them into one blended "supported"
statement leads to drift and overclaim. PEAC keeps them separate.

1. **Upstream AGT architecture** -- what Microsoft AGT ships as of v3.1.0
   pre-release, referenced to public source.
2. **PEAC adapter coverage** -- what `@peac/adapter-runtime-governance` maps,
   preserves, and intentionally does not cover.
3. **Verified interoperability** -- what PEAC CI proves end-to-end.

## Control-plane vs records-plane

| Dimension                 | AGT (control-plane)               | PEAC (records-plane)                                                    |
| ------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| Runtime enforcement       | Yes (allow/deny/warn)             | No (observational only)                                                 |
| Policy evaluation         | Yes (Rego/Cedar/YAML)             | No (records decisions, does not evaluate)                               |
| Trust scoring             | Yes (0-1000, computed)            | No (preserves upstream scores as opaque values)                         |
| Compliance assessment     | Yes (documentary self-assessment) | No (records assessments, does not determine)                            |
| Portable signed record    | No                                | Yes (Wire 0.2 `interaction-record+jwt`)                                 |
| Cross-vendor verification | No (requires AGT stack)           | Yes (any party with public key)                                         |
| Conformance suite         | No (0 executable vectors)         | Yes (217+ requirement IDs; runtime-governance IDs planned for v0.12.10) |

Both layers are needed. AGT governs inside the runtime; PEAC produces portable,
signed records across boundaries. A third-party auditor can verify a PEAC
receipt with a public key. A third-party auditor cannot verify an AGT decision
without access to the AGT runtime or its backing database.

PEAC validates the structure and signature of the PEAC record, not the truth
of the upstream governance decision or the operating effectiveness of the
upstream control plane.

## Truth Surface 1: Upstream AGT Architecture

As of v3.1.0 pre-release (April 11, 2026). All claims reference AGT public
documentation and source code. No endorsement or evaluation.

| Concept            | Notes                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| Policy enforcement | OPA Rego, Cedar, native YAML policy engines                                                     |
| Agent identity     | Ed25519 + ML-DSA-65 (quantum-safe). SPIFFE/SVID. `did:mesh:` bare string identifiers            |
| Trust scoring      | Exists (0-1000 scale); computed by the runtime, not portable                                    |
| Audit logging      | Merkle tree hash chain. CloudEvents export                                                      |
| Compliance mapping | SOC 2, NIST AI RMF, EU AI Act, OWASP; all internal self-assessment, not validated certification |
| Lifecycle          | Multi-state lifecycle model                                                                     |
| Status             | Public preview (not GA); breaking changes possible                                              |

AGT's own SOC 2 mapping states deployers remain responsible for operating
procedures, policies, and evidence collection. AGT's NIST RFI mapping is
described as automated static analysis of repository contents only.

## Truth Surface 2: PEAC Adapter Coverage

What `@peac/adapter-runtime-governance` maps, preserves, and does not cover.

| AGT Concept               | PEAC Family              | Coverage       | Notes                                                                           |
| ------------------------- | ------------------------ | -------------- | ------------------------------------------------------------------------------- |
| PolicyDecision            | `policy-decision`        | observational  | Decision recorded; not enforced                                                 |
| AuditEntry (Merkle chain) | `audit-entry`            | observational  | Merkle hashes preserved as opaque strings; PEAC does not verify chain integrity |
| AuthorityDecision         | `authority-scope`        | observational  | Scope narrowing recorded                                                        |
| LifecycleEvent (8-state)  | `lifecycle-event`        | observational  | All lifecycle types via `lifecycle_event_type` field                            |
| TrustRecord (0-1000)      | `trust-observation`      | observational  | Score and delta preserved; PEAC never computes or validates trust               |
| ComplianceReport          | `compliance-observation` | observational  | Framework, score, violation count; PEAC never makes compliance determinations   |
| CloudEvents types         | (correlation)            | reference-only | `source_cloud_event_type` field for cross-system tracing; not normative         |
| ML-DSA-65 / PQC           | (not applicable)         | not-applicable | PEAC signs Ed25519; upstream PQC preserved as opaque metadata                   |
| Privilege rings           | (not applicable)         | not-applicable | Runtime enforcement, not records                                                |
| Kill switch               | (not applicable)         | not-applicable | Runtime control, not records                                                    |
| MCP security scanner      | (not applicable)         | not-applicable | Runtime scanning, not records                                                   |
| Governance dashboard      | (not applicable)         | not-applicable | Runtime visualization, not records                                              |
| `agt doctor` CLI          | (not applicable)         | not-applicable | Runtime diagnostics, not records                                                |
| Agent Marketplace         | (not applicable)         | not-applicable | Plugin lifecycle, not governance records                                        |

## Truth Surface 3: Verified Interoperability

| Verification                                | Status                          | Method                                                    |
| ------------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| Issue + verifyLocal round-trip (6 families) | Planned for v0.12.10 adapter PR | Pinned AGT-shaped fixtures from v3.1.0 docs               |
| Session summary aggregation                 | Planned for v0.12.10 adapter PR | Mixed-family receipt decoding with deterministic ordering |
| Per-family normalization and validation     | Planned for v0.12.10 adapter PR | Discriminated union validation with malformed rejection   |
| Unknown upstream field containment          | Planned for v0.12.10 adapter PR | Unknown fields do not become extension keys               |
| Live AGT v3.1.0 runtime integration         | Not yet tested                  | Requires AGT runtime instance                             |
| Merkle chain integrity verification         | Not performed by PEAC           | Upstream runtime responsibility                           |
| ML-DSA-65 signature verification            | Not performed by PEAC           | PEAC signs with Ed25519 only                              |
