# IEEE 7001 Transparency Mapping

**Framework:** IEEE 7001-2021 (Transparency of Autonomous Systems)
**Version:** 0.1
**Since:** v0.11.3

This document maps IEEE 7001 transparency requirements to PEAC Protocol capabilities.

## Framework Overview

IEEE 7001 provides a framework for measuring and achieving transparency in autonomous systems across five stakeholder groups. PEAC receipts serve as the verifiable evidence layer for transparency claims.

## Stakeholder Mapping

### Users

| Transparency Requirement | PEAC Mechanism | Package |
| ------------------------ | -------------- | ------- |
| What the system decided | Control chain with decision + reason | `@peac/control` |
| Why the system decided | Control action extension with policy_ref | `@peac/schema` |
| What data was used | Interaction evidence with hashed I/O | `@peac/schema` |
| Who is responsible | ActorBinding with organizational origin | `@peac/schema` |

### Operators

| Transparency Requirement | PEAC Mechanism | Package |
| ------------------------ | -------------- | ------- |
| System behavior logs | Receipt chains per interaction | `@peac/protocol` |
| Performance metrics | Interaction evidence (duration_ms, status) | `@peac/schema` |
| Anomaly detection | Risk signal extension | ZT Profile Pack |
| Key management status | Key rotation lifecycle, revoked_keys | `@peac/protocol` |

### Regulators

| Transparency Requirement | PEAC Mechanism | Package |
| ------------------------ | -------------- | ------- |
| Audit trail completeness | MVIS enforcement (5 required identity fields) | `@peac/schema` |
| Evidence integrity | EdDSA signature on every receipt | `@peac/crypto` |
| Offline verification | Local verification without network access | `@peac/protocol` |
| Deterministic reports | Reconcile CLI with `--format json` | `@peac/cli` |

### Certification Bodies

| Transparency Requirement | PEAC Mechanism | Package |
| ------------------------ | -------------- | ------- |
| Conformance evidence | Conformance fixtures and reports | `specs/conformance/` |
| Schema compliance | Zod 4 runtime validation | `@peac/schema` |
| Interoperability | Evidence Carrier Contract (5 transports) | Carrier adapters |

### General Public

| Transparency Requirement | PEAC Mechanism | Package |
| ------------------------ | -------------- | ------- |
| Content provenance | Content signals (robots.txt, AIPREF, tdmrep) | `@peac/mappings-content-signals` |
| Purpose declaration | PEAC-Purpose header | `@peac/protocol` |
| Policy accessibility | `peac.txt` at well-known location | `@peac/protocol` |

## Transparency Levels

IEEE 7001 defines transparency levels 0 through 4. PEAC primarily enables levels 2 through 4:

| Level | Description | PEAC Contribution |
| ----- | ----------- | ----------------- |
| 0 | No transparency | N/A |
| 1 | Basic information | Receipt existence (signed claim that interaction occurred) |
| 2 | Meaningful explanation | Control chain with reasons, interaction evidence |
| 3 | Detailed technical | Full receipt chain, dispute bundles, reconciliation |
| 4 | Complete verifiable | Offline-verifiable receipts with MVIS identity binding |

## References

- IEEE 7001-2021: Transparency of Autonomous Systems
- [ZERO-TRUST-PROFILE-PACK.md](../specs/ZERO-TRUST-PROFILE-PACK.md)
- [INTERACTION-EVIDENCE.md](../specs/INTERACTION-EVIDENCE.md)
