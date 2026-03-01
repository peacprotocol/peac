# EU AI Act Evidence Mapping

**Framework:** EU Artificial Intelligence Act (Regulation 2024/1689)
**Version:** 0.1
**Since:** v0.11.3

This document maps EU AI Act requirements to PEAC Protocol evidence capabilities.

## Framework Overview

The EU AI Act classifies AI systems by risk level and imposes requirements on high-risk systems. PEAC provides the evidence infrastructure for compliance documentation, audit trails, and transparency obligations.

## Article Mapping

### Article 9: Risk Management System

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| Risk identification and analysis | Risk signal extension, interaction evidence | ZT Profile Pack |
| Risk estimation and evaluation | Verification reports with structured results | `@peac/protocol` |
| Testing and validation records | Conformance fixtures, dispute bundles | `@peac/audit` |
| Continuous monitoring | Receipt chains with trace context correlation | ZT Profile Pack |

### Article 12: Record-Keeping

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| Automatic logging | Receipt issuance per interaction | `@peac/protocol` |
| Traceability | Workflow correlation, trace context extension | `@peac/protocol` |
| Monitoring capability | Structured verification reports | `@peac/protocol` |
| Log retention | Dispute bundles with hash-chain integrity | `@peac/audit` |

### Article 14: Human Oversight

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| Understand system capabilities | Purpose declaration and policy surfaces | `@peac/protocol` |
| Monitor operation | Real-time receipt verification | `@peac/protocol` |
| Intervene or halt | Control action extension (deny, escalate) | `@peac/schema` |
| Override decisions | Control chain with manual_review trigger | `@peac/control` |

### Article 18: Corrective Actions

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| Withdraw non-conforming systems | Key revocation in issuer config | `@peac/protocol` |
| Inform authorities | Structured dispute bundles | `@peac/audit` |
| Document corrective actions | Credential event extension (rotated, revoked) | `@peac/schema` |

### Article 19: CE Marking (via Records)

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| Conformity documentation | Conformance reports (deterministic JSON) | `@peac/protocol` |
| Technical documentation | Spec references in receipt extensions | `@peac/schema` |

### Article 50: Transparency Obligations

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| AI-generated content disclosure | Content signals observation model | `@peac/mappings-content-signals` |
| Interaction disclosure | Agent identity in receipt `sub` claim | `@peac/kernel` |
| Deep fake marking | Hash-first evidence (SHA-256 digests) | `@peac/schema` |

## Evidence Chain

For EU AI Act compliance, a complete evidence chain consists of:

1. **Policy declaration**: `peac.txt` at publisher origin
2. **Identity binding**: ActorBinding with proof type in receipt
3. **Action logging**: Interaction evidence per tool invocation
4. **Decision audit**: Control action with trigger and policy_ref
5. **Risk monitoring**: Risk signal observations
6. **Dispute resolution**: Reconciled bundles with deterministic output

## References

- EU Regulation 2024/1689 (EU AI Act)
- [ZERO-TRUST-PROFILE-PACK.md](../specs/ZERO-TRUST-PROFILE-PACK.md)
- [INTERACTION-EVIDENCE.md](../specs/INTERACTION-EVIDENCE.md)
