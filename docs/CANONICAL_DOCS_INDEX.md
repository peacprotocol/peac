# PEAC Protocol - Canonical Documentation Index

**Version:** 0.9.17
**Status:** Authoritative

This document defines which documentation files are the canonical, up-to-date references for the PEAC Protocol.

---

## Definitions

| Status            | Meaning                                      |
| ----------------- | -------------------------------------------- |
| **Normative**     | Defines behavior implementations MUST follow |
| **Authoritative** | Single source of truth for a topic           |
| **Reference**     | Supporting material, not primary source      |

---

## Canonical Documents

### Normative Specifications

| Document                                                                   | Status        | Purpose                        |
| -------------------------------------------------------------------------- | ------------- | ------------------------------ |
| [SPEC_INDEX.md](SPEC_INDEX.md)                                             | **Normative** | Entry point for implementers   |
| [specs/PEAC-RECEIPT-SCHEMA-v0.1.json](specs/PEAC-RECEIPT-SCHEMA-v0.1.json) | **Normative** | Wire format JSON Schema        |
| [specs/PROTOCOL-BEHAVIOR.md](specs/PROTOCOL-BEHAVIOR.md)                   | **Normative** | Issue, verify, discovery flows |
| [specs/ERRORS.md](specs/ERRORS.md)                                         | **Normative** | Error codes and HTTP mappings  |
| [specs/REGISTRIES.md](specs/REGISTRIES.md)                                 | **Normative** | Payment rails, agent protocols |
| [specs/PEAC-HTTP402-PROFILE.md](specs/PEAC-HTTP402-PROFILE.md)             | **Normative** | HTTP 402 integration           |
| [specs/TEST_VECTORS.md](specs/TEST_VECTORS.md)                             | **Normative** | Conformance test cases         |
| `specs/kernel/*.json`                                                      | **Normative** | Machine-readable constants     |

### Architecture & Process

| Document                           | Status            | Purpose                    |
| ---------------------------------- | ----------------- | -------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | **Authoritative** | Kernel-first DAG, layering |
| [CI_BEHAVIOR.md](CI_BEHAVIOR.md)   | **Authoritative** | CI pipeline behavior       |
| [QA.md](QA.md)                     | **Reference**     | Manual QA checklist        |
| [deps-policy.md](deps-policy.md)   | **Reference**     | Dependency update policy   |

### Policy Kit

| Document                                             | Status            | Purpose                    |
| ---------------------------------------------------- | ----------------- | -------------------------- |
| [policy-kit/quickstart.md](policy-kit/quickstart.md) | **Authoritative** | Policy Kit getting started |

---

## Key Frozen Values

These values NEVER change until v1.0:

| Value                     | Definition          | Location                    |
| ------------------------- | ------------------- | --------------------------- |
| `typ: "peac-receipt/0.1"` | Wire format type    | ARCHITECTURE.md, specs/     |
| `alg: "EdDSA"`            | Signature algorithm | specs/kernel/constants.json |
| `PEAC-Receipt`            | HTTP header name    | specs/kernel/constants.json |

---

## Reading Order

### For Protocol Implementers

1. [SPEC_INDEX.md](SPEC_INDEX.md)
2. [specs/PROTOCOL-BEHAVIOR.md](specs/PROTOCOL-BEHAVIOR.md)
3. [specs/PEAC-RECEIPT-SCHEMA-v0.1.json](specs/PEAC-RECEIPT-SCHEMA-v0.1.json)
4. [specs/TEST_VECTORS.md](specs/TEST_VECTORS.md)
5. [ARCHITECTURE.md](ARCHITECTURE.md)

### For Contributors

1. [ARCHITECTURE.md](ARCHITECTURE.md)
2. [CI_BEHAVIOR.md](CI_BEHAVIOR.md)

---

## Summary

| Category     | Canonical Doc          |
| ------------ | ---------------------- |
| Specs        | SPEC_INDEX.md → specs/ |
| Architecture | ARCHITECTURE.md        |
| CI           | CI_BEHAVIOR.md         |
