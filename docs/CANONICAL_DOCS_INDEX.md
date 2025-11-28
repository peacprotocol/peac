# PEAC Protocol - Canonical Documentation Index

**Version:** 0.9.15
**Status:** Authoritative

This document defines which documentation files are the canonical, up-to-date references for the PEAC Protocol.

---

## Definitions

| Status            | Meaning                                              |
| ----------------- | ---------------------------------------------------- |
| **Normative**     | Defines behavior implementations MUST follow         |
| **Authoritative** | Single source of truth for a topic                   |
| **Reference**     | Supporting material, not primary source              |
| **Planning**      | Strategy/roadmap docs in separate planning workspace |

---

## Canonical Documents

### Normative Specifications

| Document                                                                   | Status        | Purpose                        |
| -------------------------------------------------------------------------- | ------------- | ------------------------------ |
| [SPEC_INDEX.md](SPEC_INDEX.md)                                             | **Normative** | Entry point for implementers   |
| [specs/PEAC-RECEIPT-SCHEMA-v0.9.json](specs/PEAC-RECEIPT-SCHEMA-v0.9.json) | **Normative** | Wire format JSON Schema        |
| [specs/PROTOCOL-BEHAVIOR.md](specs/PROTOCOL-BEHAVIOR.md)                   | **Normative** | Issue, verify, discovery flows |
| [specs/ERRORS.md](specs/ERRORS.md)                                         | **Normative** | Error codes and HTTP mappings  |
| [specs/REGISTRIES.md](specs/REGISTRIES.md)                                 | **Normative** | Payment rails, agent protocols |
| [specs/PEAC-HTTP402-PROFILE.md](specs/PEAC-HTTP402-PROFILE.md)             | **Normative** | HTTP 402 integration           |
| [specs/EVOLUTION.md](specs/EVOLUTION.md)                                   | **Normative** | Wire format versioning         |
| [specs/TEST_VECTORS.md](specs/TEST_VECTORS.md)                             | **Normative** | Conformance test cases         |
| `specs/kernel/*.json`                                                      | **Normative** | Machine-readable constants     |

### Architecture & Process

| Document                                                     | Status            | Purpose                    |
| ------------------------------------------------------------ | ----------------- | -------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)                           | **Authoritative** | Kernel-first DAG, layering |
| [CI_BEHAVIOR.md](CI_BEHAVIOR.md)                             | **Authoritative** | CI pipeline behavior       |
| [CODING_STANDARDS_PROTOCOL.md](CODING_STANDARDS_PROTOCOL.md) | Authoritative     | Development guidelines     |

### Release & Migration

| Document                                                           | Status            | Purpose                     |
| ------------------------------------------------------------------ | ----------------- | --------------------------- |
| [PEAC_v0.9.15_ACTUAL_SCOPE.md](PEAC_v0.9.15_ACTUAL_SCOPE.md)       | Authoritative     | What shipped in v0.9.15     |
| [MIGRATION_v0.9.14_to_v0.9.15.md](MIGRATION_v0.9.14_to_v0.9.15.md) | Authoritative     | Migration guide             |
| [NEXT_STEPS_v0.9.15_TO_v1.0.md](NEXT_STEPS_v0.9.15_TO_v1.0.md)     | Authoritative     | Future development guide    |
| [PEAC_NORMATIVE_DECISIONS_LOG.md](PEAC_NORMATIVE_DECISIONS_LOG.md) | **Authoritative** | All architectural decisions |

---

## Key Frozen Values

These values NEVER change until v1.0:

| Value                     | Definition          | Location                    |
| ------------------------- | ------------------- | --------------------------- |
| `typ: "peac.receipt/0.9"` | Wire format type    | ARCHITECTURE.md, specs/     |
| `alg: "EdDSA"`            | Signature algorithm | specs/kernel/constants.json |
| `PEAC-Receipt`            | HTTP header name    | specs/kernel/constants.json |

---

## Reading Order

### For Protocol Implementers

1. [SPEC_INDEX.md](SPEC_INDEX.md)
2. [specs/PROTOCOL-BEHAVIOR.md](specs/PROTOCOL-BEHAVIOR.md)
3. [specs/PEAC-RECEIPT-SCHEMA-v0.9.json](specs/PEAC-RECEIPT-SCHEMA-v0.9.json)
4. [specs/TEST_VECTORS.md](specs/TEST_VECTORS.md)
5. [ARCHITECTURE.md](ARCHITECTURE.md)

### For Contributors

1. [ARCHITECTURE.md](ARCHITECTURE.md)
2. [CODING_STANDARDS_PROTOCOL.md](CODING_STANDARDS_PROTOCOL.md)
3. [CI_BEHAVIOR.md](CI_BEHAVIOR.md)
4. [PEAC_NORMATIVE_DECISIONS_LOG.md](PEAC_NORMATIVE_DECISIONS_LOG.md)

---

## Planning Documents

Strategy, roadmap, and masterplan documents are maintained in a separate planning workspace and are not included in this repository. They include:

- **Masterplan:** 6-pillar strategy (v1.2 Universal Omni Protocol)
- **Roadmap:** v0.9.15 → v0.9.21 feature inventory
- **Execution:** 12-week milestone plan
- **Ecosystem:** Protocol interop mappings (MCP, ACP, A2A, x402)

These are reference materials for project leadership and do not affect implementation.

---

## Summary

| Category     | Canonical Doc                   |
| ------------ | ------------------------------- |
| Specs        | SPEC_INDEX.md → specs/\*        |
| Architecture | ARCHITECTURE.md                 |
| CI           | CI_BEHAVIOR.md                  |
| Decisions    | PEAC_NORMATIVE_DECISIONS_LOG.md |
| Migration    | MIGRATION_v0.9.14_to_v0.9.15.md |
| Scope        | PEAC_v0.9.15_ACTUAL_SCOPE.md    |
