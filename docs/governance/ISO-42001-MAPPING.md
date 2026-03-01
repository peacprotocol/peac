# ISO/IEC 42001 AI Management System Mapping

**Framework:** ISO/IEC 42001:2023 (AI Management System)
**Version:** 0.1
**Since:** v0.11.3

This document maps ISO/IEC 42001 AIMS requirements to PEAC Protocol capabilities.

## Framework Overview

ISO/IEC 42001 specifies requirements for establishing, implementing, maintaining, and continually improving an AI Management System (AIMS). PEAC provides the evidence infrastructure for demonstrating AIMS conformance.

## Clause Mapping

### Clause 4: Context of the Organization

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| 4.1 Understanding context | Purpose declaration surfaces | `@peac/protocol` |
| 4.2 Stakeholder needs | Policy documents (`peac.txt`) | `@peac/protocol` |
| 4.3 AIMS scope | Receipt kind and purpose constraints | `@peac/schema` |

### Clause 5: Leadership

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| 5.1 Management commitment | Treaty extension (commitment_class) | `@peac/schema` |
| 5.2 AI policy | `peac.txt` policy declaration | `@peac/protocol` |
| 5.3 Roles and responsibilities | ActorBinding with proof_type | `@peac/schema` |

### Clause 6: Planning

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| 6.1 Risk assessment | Risk signal observations | ZT Profile Pack |
| 6.2 AI objectives | Purpose header and policy constraints | `@peac/protocol` |

### Clause 7: Support

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| 7.1 Resources | Key rotation lifecycle (infrastructure) | `@peac/protocol` |
| 7.2 Competence | Not directly applicable | N/A |
| 7.5 Documented information | Structured receipts, dispute bundles, reconciliation reports | `@peac/audit`, `@peac/cli` |

### Clause 8: Operation

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| 8.1 Operational planning | Control chain with policy evaluation | `@peac/control` |
| 8.2 AI risk assessment | Risk signal and control action extensions | `@peac/schema` |
| 8.3 AI risk treatment | Key revocation, credential lifecycle events | `@peac/protocol`, `@peac/schema` |
| 8.4 AI system lifecycle | Credential event extension (issued, rotated, revoked, expired) | `@peac/schema` |

### Clause 9: Performance Evaluation

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| 9.1 Monitoring and measurement | Verification reports, interaction evidence | `@peac/protocol` |
| 9.2 Internal audit | Dispute bundles, reconciliation CLI | `@peac/audit`, `@peac/cli` |
| 9.3 Management review | Deterministic JSON reports | `@peac/cli` |

### Clause 10: Improvement

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| 10.1 Nonconformity and corrective action | Key revocation, credential rotation evidence | `@peac/protocol` |
| 10.2 Continual improvement | Receipt chaining across versions | `@peac/protocol` |

## Annex B: AI Controls Reference

| Control Area | PEAC Mechanism |
| ------------ | -------------- |
| B.2 Policies for AI | `peac.txt` + `peac-issuer.json` discovery surfaces |
| B.3 Internal organization | ActorBinding with organizational origin |
| B.5 Data management | Hash-first evidence, content signals |
| B.6 AI system lifecycle | Credential event lifecycle (issued -> rotated -> revoked) |
| B.7 Third-party relationships | Treaty extension with terms_ref |

## References

- ISO/IEC 42001:2023: Artificial Intelligence Management System
- [ZERO-TRUST-PROFILE-PACK.md](../specs/ZERO-TRUST-PROFILE-PACK.md)
- [AGENT-IDENTITY-PROFILE.md](../specs/AGENT-IDENTITY-PROFILE.md)
