# PEAC Conformance Report Format (NORMATIVE)

Status: NORMATIVE
Report-Version: peac-conformance-report/0.1
Last-Updated: 2026-02-05

This document defines the machine-readable output of the PEAC conformance runner. The goal is to make interoperability correctness auditable and automatable.

## 1. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

## 2. Purpose

The conformance report:

- Proves an implementation passes the test suite
- Provides machine-readable results for automation
- Enables conformance badges and certification
- Supports debugging failed tests

## 3. Determinism requirements

A conformance runner MUST be able to emit a report whose contents depend only on:

- The input test vectors (by digest)
- The runner configuration (profiles enabled, strictness)
- The implementation-under-test (IUT) outputs

Reports MUST NOT require wall-clock time to be valid.

If a tool includes a timestamp, it MUST be placed in `meta.generated_at` and excluded from any canonical hash.

## 4. Report structure

A report MUST be a JSON object (UTF-8) with these top-level fields:

| Field            | Type   | Required | Description               |
| ---------------- | ------ | -------- | ------------------------- |
| `report_version` | string | REQUIRED | Format version identifier |
| `suite`          | object | REQUIRED | Test suite information    |
| `implementation` | object | REQUIRED | IUT information           |
| `summary`        | object | REQUIRED | High-level results        |
| `results`        | array  | REQUIRED | Per-test results          |
| `artifacts`      | object | OPTIONAL | Additional outputs        |
| `meta`           | object | OPTIONAL | Non-deterministic fields  |

## 5. Field definitions

### 5.1 `report_version` (REQUIRED)

MUST equal `peac-conformance-report/0.1` for this version.

```json
"report_version": "peac-conformance-report/0.1"
```

### 5.2 `suite` (REQUIRED)

Information about the test suite.

| Field            | Type   | Required | Description                                |
| ---------------- | ------ | -------- | ------------------------------------------ |
| `name`           | string | REQUIRED | Suite name (e.g., `peac-core-conformance`) |
| `version`        | string | REQUIRED | Suite version                              |
| `vectors_digest` | object | REQUIRED | Digest of test vector bundle               |
| `profiles`       | array  | REQUIRED | Enabled test profiles                      |

Profiles examples:

- `receipt.verify`
- `receipt.issue`
- `bundle.verify`
- `transport.header`
- `transport.pointer`
- `verifier.policy.offline_only`
- `privacy.strict`

```json
{
  "name": "peac-core-conformance",
  "version": "0.1.0",
  "vectors_digest": {
    "alg": "sha-256",
    "value": "b6d2b9f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8"
  },
  "profiles": [
    "receipt.verify",
    "bundle.verify",
    "transport.header",
    "verifier.policy.offline_only"
  ]
}
```

### 5.3 `implementation` (REQUIRED)

Information about the implementation under test.

| Field           | Type   | Required | Description             |
| --------------- | ------ | -------- | ----------------------- |
| `name`          | string | REQUIRED | Package/library name    |
| `version`       | string | REQUIRED | Version string          |
| `runtime`       | string | OPTIONAL | Runtime environment     |
| `commit`        | string | OPTIONAL | Git commit hash         |
| `config_digest` | object | OPTIONAL | Digest of runner config |

```json
{
  "name": "@peac/protocol",
  "version": "0.10.8",
  "runtime": "node-22.0.0",
  "commit": "abc123def456"
}
```

### 5.4 `summary` (REQUIRED)

High-level results.

| Field     | Type    | Required | Description                        |
| --------- | ------- | -------- | ---------------------------------- |
| `passed`  | integer | REQUIRED | Count of passed tests              |
| `failed`  | integer | REQUIRED | Count of failed tests              |
| `skipped` | integer | REQUIRED | Count of skipped tests             |
| `total`   | integer | REQUIRED | Total test count                   |
| `status`  | string  | REQUIRED | `pass` if failed == 0, else `fail` |

```json
{
  "passed": 142,
  "failed": 0,
  "skipped": 3,
  "total": 145,
  "status": "pass"
}
```

### 5.5 `results` (REQUIRED)

Array of per-test results. Order MUST be stable.

Each result entry:

| Field         | Type   | Required | Description            |
| ------------- | ------ | -------- | ---------------------- |
| `id`          | string | REQUIRED | Stable test identifier |
| `category`    | string | REQUIRED | Test category          |
| `status`      | string | REQUIRED | `pass`, `fail`, `skip` |
| `expected`    | object | OPTIONAL | Expected outcome       |
| `observed`    | object | OPTIONAL | Observed outcome       |
| `diagnostics` | object | OPTIONAL | Debug information      |

```json
{
  "id": "receipt.verify.signature.valid_001",
  "category": "receipt.verify.signature",
  "status": "pass",
  "expected": { "valid": true },
  "observed": { "valid": true }
}
```

### 5.6 `artifacts` (OPTIONAL)

Additional outputs for auditing.

| Field           | Type   | Description                    |
| --------------- | ------ | ------------------------------ |
| `logs_digest`   | object | Digest of separate log file    |
| `report_digest` | object | Digest of canonicalized report |

### 5.7 `meta` (OPTIONAL)

Non-deterministic fields ONLY.

| Field          | Type    | Description         |
| -------------- | ------- | ------------------- |
| `generated_at` | string  | RFC 3339 timestamp  |
| `runner`       | object  | Runner name/version |
| `duration_ms`  | integer | Total run time      |

## 6. Test categories

### 6.1 Standard categories

| Category                   | Description            |
| -------------------------- | ---------------------- |
| `receipt.verify.signature` | Signature verification |
| `receipt.verify.claims`    | Claims validation      |
| `receipt.verify.time`      | Time window checks     |
| `receipt.issue`            | Receipt issuance       |
| `bundle.verify`            | Bundle verification    |
| `bundle.offline`           | Offline verification   |
| `transport.header`         | Header profile         |
| `transport.body`           | Body profile           |
| `transport.pointer`        | Pointer profile        |
| `policy.allowlist`         | Issuer allowlisting    |
| `policy.pinning`           | Key pinning            |
| `security.ssrf`            | SSRF protections       |
| `security.limits`          | Resource limits        |
| `privacy.redaction`        | Privacy redaction      |

### 6.2 Test ID format

Test IDs SHOULD follow the pattern:

```
<category>.<subcategory>.<test_name>_<sequence>
```

Examples:

- `receipt.verify.signature.valid_001`
- `receipt.verify.signature.invalid_wrong_key_001`
- `security.ssrf.block_private_ip_001`

## 7. Diagnostics

### 7.1 Purpose

Diagnostics help debug failures without exposing sensitive data.

### 7.2 Constraints

- Maximum size: 64 KB per test case
- MUST NOT include secrets
- MUST NOT include full receipt content (use digests)

### 7.3 Standard diagnostic fields

| Field           | Description                             |
| --------------- | --------------------------------------- |
| `error_code`    | Stable error code                       |
| `error_message` | Human-readable message                  |
| `stack_trace`   | Stack trace (optional, may truncate)    |
| `input_digest`  | Digest of test input                    |
| `diff`          | Structured diff of expected vs observed |

## 8. Examples

### 8.1 Passing suite

```json
{
  "report_version": "peac-conformance-report/0.1",
  "suite": {
    "name": "peac-core-conformance",
    "version": "0.1.0",
    "vectors_digest": {
      "alg": "sha-256",
      "value": "b6d2b9f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8"
    },
    "profiles": ["receipt.verify", "bundle.verify"]
  },
  "implementation": {
    "name": "@peac/protocol",
    "version": "0.10.8",
    "runtime": "node"
  },
  "summary": {
    "passed": 100,
    "failed": 0,
    "skipped": 5,
    "total": 105,
    "status": "pass"
  },
  "results": [
    {
      "id": "receipt.verify.signature.valid_001",
      "category": "receipt.verify.signature",
      "status": "pass"
    },
    {
      "id": "receipt.verify.signature.valid_002",
      "category": "receipt.verify.signature",
      "status": "pass"
    },
    {
      "id": "bundle.verify.offline_001",
      "category": "bundle.verify",
      "status": "skip",
      "diagnostics": {
        "skip_reason": "profile not enabled"
      }
    }
  ]
}
```

### 8.2 Failing suite

```json
{
  "report_version": "peac-conformance-report/0.1",
  "suite": {
    "name": "peac-core-conformance",
    "version": "0.1.0",
    "vectors_digest": {
      "alg": "sha-256",
      "value": "b6d2b9f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8"
    },
    "profiles": ["receipt.verify"]
  },
  "implementation": {
    "name": "vendor-x-peac",
    "version": "1.2.3"
  },
  "summary": {
    "passed": 95,
    "failed": 5,
    "skipped": 0,
    "total": 100,
    "status": "fail"
  },
  "results": [
    {
      "id": "receipt.verify.time.expired_001",
      "category": "receipt.verify.time",
      "status": "fail",
      "expected": { "valid": false, "reason": "expired" },
      "observed": { "valid": true },
      "diagnostics": {
        "error_code": "CONFORMANCE_MISMATCH",
        "error_message": "Expected receipt to be rejected as expired, but it was accepted",
        "input_digest": {
          "alg": "sha-256",
          "value": "a1b2c3..."
        }
      }
    }
  ]
}
```

## 9. CLI usage

### 9.1 Running conformance

```bash
# Run against local implementation
peac conformance run --implementation @peac/protocol

# Run against remote issuer
peac conformance run --issuer https://api.example.com

# Specify profiles
peac conformance run --profiles receipt.verify,bundle.verify

# Output formats
peac conformance run --output json > report.json
peac conformance run --output summary  # Human-readable
```

### 9.2 Validating a report

```bash
# Verify report integrity
peac conformance validate report.json

# Check against specific suite version
peac conformance validate report.json --suite-version 0.1.0
```

## 10. Conformance badge

### 10.1 Badge criteria

An implementation MAY claim conformance if:

- All tests in enabled profiles pass
- Report is reproducible
- Report is signed or verifiable

### 10.2 Badge levels

| Level          | Requirement                             |
| -------------- | --------------------------------------- |
| **Basic**      | `receipt.verify` profile passes         |
| **Standard**   | Basic + `bundle.verify` + `transport.*` |
| **Full**       | All profiles pass                       |
| **Enterprise** | Full + `security.*` + `privacy.*`       |

### 10.3 Badge format

```
PEAC Conformant: [Level]
Suite: peac-core-conformance v0.1.0
Date: 2026-02-05
Report: https://example.com/conformance/report.json
```

## 11. Canonicalization

When computing a digest of the report:

- Serialize using RFC 8785 JCS
- Exclude `meta` field
- Use SHA-256, lowercase hex output

## 12. Security considerations

### 12.1 Report authenticity

For official conformance claims:

- Reports SHOULD be signed
- Reports SHOULD include commit hash
- Reports SHOULD be reproducible

### 12.2 Test vector integrity

- Suite vectors are identified by digest
- Modifying vectors invalidates reports
- Official vectors are published at known locations

## 13. Implementation notes

### 13.1 Test isolation

Each test SHOULD be independent:

- No shared state between tests
- Deterministic ordering
- Parallelizable where possible

### 13.2 Timeout handling

- Tests SHOULD have reasonable timeouts
- Timeout failures count as failures
- Timeout duration SHOULD be configurable
