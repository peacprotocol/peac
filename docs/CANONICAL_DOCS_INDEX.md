# PEAC Protocol - Canonical Documentation Index

**Status:** Authoritative

This document defines which documentation files are the canonical, up-to-date references for the PEAC Protocol. The PEAC Interaction Record format is the current record format; its current wire version is Wire 0.2, identified by `typ: "interaction-record+jwt"` and `peac_version: "0.2"`. Wire 0.1 is frozen legacy. Version and release state live in [releases/facts.json](releases/facts.json) and [SPEC_INDEX.md](SPEC_INDEX.md); this index does not restate a version number.

---

## Definitions

| Status            | Meaning                                          |
| ----------------- | ------------------------------------------------ |
| **Normative**     | Defines behavior implementations MUST follow     |
| **Authoritative** | Single source of truth for a topic               |
| **Reference**     | Supporting material, not primary source          |
| **Frozen legacy** | Retained for compatibility; not the current path |

---

## Canonical Documents

### Normative Specifications

| Document                                                             | Status        | Purpose                                           |
| -------------------------------------------------------------------- | ------------- | ------------------------------------------------- |
| [SPEC_INDEX.md](SPEC_INDEX.md)                                       | **Normative** | Entry point for implementers                      |
| [specs/WIRE-0.2.md](specs/WIRE-0.2.md)                               | **Normative** | Current Interaction Record format (Wire 0.2)      |
| [specs/PROTOCOL-BEHAVIOR.md](specs/PROTOCOL-BEHAVIOR.md)             | **Normative** | Issue, verify, discovery flows                    |
| [specs/KERNEL-CONSTRAINTS.md](specs/KERNEL-CONSTRAINTS.md)           | **Normative** | Kernel constraints enforced at issue and verify   |
| [specs/ERRORS.md](specs/ERRORS.md)                                   | **Normative** | Error codes and HTTP mappings                     |
| [specs/REGISTRIES.md](specs/REGISTRIES.md)                           | **Normative** | Receipt types, extension groups, rails, protocols |
| [specs/RESOURCE-LIMITS.md](specs/RESOURCE-LIMITS.md)                 | **Normative** | Size caps and bounded-validation limits           |
| [specs/SECURITY-CONSIDERATIONS.md](specs/SECURITY-CONSIDERATIONS.md) | **Normative** | Cryptographic and JOSE-hardening requirements     |
| [specs/VERIFIER-SECURITY-MODEL.md](specs/VERIFIER-SECURITY-MODEL.md) | **Normative** | Verifier modes, size limits, error categories     |
| [specs/CONFORMANCE-MATRIX.md](specs/CONFORMANCE-MATRIX.md)           | **Normative** | Conformance requirement catalogue                 |
| [specs/TEST_VECTORS.md](specs/TEST_VECTORS.md)                       | **Normative** | Conformance test cases                            |
| `specs/kernel/*.json`                                                | **Normative** | Machine-readable constants, registries, errors    |

### Architecture & Process

| Document                                               | Status            | Purpose                                 |
| ------------------------------------------------------ | ----------------- | --------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)                     | **Authoritative** | Kernel-first DAG, layering              |
| [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md)     | **Authoritative** | Wire format, runtime, SDK parity        |
| [SUPPORTED_ENVIRONMENTS.md](SUPPORTED_ENVIRONMENTS.md) | **Authoritative** | Supported runtimes and floors           |
| [CI_BEHAVIOR.md](CI_BEHAVIOR.md)                       | **Authoritative** | CI pipeline behavior                    |
| [RELEASING.md](RELEASING.md)                           | **Authoritative** | Release process                         |
| [MIGRATION_CURRENT.md](MIGRATION_CURRENT.md)           | **Authoritative** | Upgrade paths and code migration        |
| [DEPRECATION_POLICY.md](DEPRECATION_POLICY.md)         | **Authoritative** | Surface lifecycle and removal windows   |
| [STANDARDS_LEDGER.md](STANDARDS_LEDGER.md)             | **Authoritative** | External standards cited or implemented |

### Profiles (Informative)

| Document                                                       | Status        | Purpose                                |
| -------------------------------------------------------------- | ------------- | -------------------------------------- |
| [specs/REPLAY-GUARD-PROFILE.md](specs/REPLAY-GUARD-PROFILE.md) | **Reference** | Optional bounded replay-guard guidance |

### Frozen Legacy

| Document                                                                   | Status            | Purpose              |
| -------------------------------------------------------------------------- | ----------------- | -------------------- |
| [specs/PEAC-RECEIPT-SCHEMA-v0.1.json](specs/PEAC-RECEIPT-SCHEMA-v0.1.json) | **Frozen legacy** | Wire 0.1 JSON Schema |

---

## Key Frozen Values

These values are stable for the current protocol line:

| Value                           | Definition               | Location                    |
| ------------------------------- | ------------------------ | --------------------------- |
| `typ: "interaction-record+jwt"` | Current record JOSE type | specs/WIRE-0.2.md           |
| `alg: "EdDSA"`                  | Signature algorithm      | specs/kernel/constants.json |
| `PEAC-Receipt`                  | HTTP header name         | specs/kernel/constants.json |

Frozen legacy: `typ: "peac-receipt/0.1"` identifies the Wire 0.1 record type and is retained only for compatibility.

---

## Reading Order

### For Protocol Implementers

1. [SPEC_INDEX.md](SPEC_INDEX.md)
2. [specs/WIRE-0.2.md](specs/WIRE-0.2.md)
3. [specs/PROTOCOL-BEHAVIOR.md](specs/PROTOCOL-BEHAVIOR.md)
4. [specs/KERNEL-CONSTRAINTS.md](specs/KERNEL-CONSTRAINTS.md)
5. [specs/ERRORS.md](specs/ERRORS.md) and [specs/REGISTRIES.md](specs/REGISTRIES.md)
6. [specs/TEST_VECTORS.md](specs/TEST_VECTORS.md) and [specs/CONFORMANCE-MATRIX.md](specs/CONFORMANCE-MATRIX.md)
7. [ARCHITECTURE.md](ARCHITECTURE.md)

### For Contributors

1. [ARCHITECTURE.md](ARCHITECTURE.md)
2. [CI_BEHAVIOR.md](CI_BEHAVIOR.md)
3. [RELEASING.md](RELEASING.md)

---

## Summary

| Category     | Canonical Doc                     |
| ------------ | --------------------------------- |
| Specs        | SPEC_INDEX.md → specs/WIRE-0.2.md |
| Architecture | ARCHITECTURE.md                   |
| CI           | CI_BEHAVIOR.md                    |
| Standards    | STANDARDS_LEDGER.md               |
