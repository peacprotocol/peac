# PEAC Verification Report Format (NORMATIVE)

Status: NORMATIVE
Report-Version: peac-verification-report/0.1
Last-Updated: 2026-02-05

This document defines the machine-readable verification report produced by PEAC verifiers. The report is designed to be portable, deterministic, safe, and policy-aware.

## 1. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

## 2. Design goals

- **Portable**: Shareable across organizations
- **Deterministic**: Reproducible given same inputs
- **Safe**: Bounded resource usage
- **Policy-aware**: Trust decisions are explicit

## 3. Determinism requirements

A verifier MUST be able to emit a report whose contents depend only on:

- The receipt bytes being verified
- The verifier policy configuration
- Issuer key material available under that policy

A verifier MUST NOT require wall-clock time to generate the core report fields.

If a UI wants a display timestamp, it MAY include a non-normative `meta.generated_at` field, but:

- `meta.generated_at` MUST be excluded from report hash calculations
- Tools MUST provide a "deterministic mode" that omits `meta`

## 4. Report structure

A report MUST be a JSON object (UTF-8) with these top-level fields:

| Field            | Type   | Required | Description                  |
| ---------------- | ------ | -------- | ---------------------------- |
| `report_version` | string | REQUIRED | Format version identifier    |
| `input`          | object | REQUIRED | What was verified            |
| `policy`         | object | REQUIRED | Policy used for verification |
| `result`         | object | REQUIRED | High-level outcome           |
| `checks`         | array  | REQUIRED | Ordered list of checks       |
| `artifacts`      | object | OPTIONAL | Additional outputs           |
| `meta`           | object | OPTIONAL | Non-deterministic fields     |

## 5. Field definitions

### 5.1 `report_version` (REQUIRED)

MUST equal `peac-verification-report/0.1` for this version.

```json
"report_version": "peac-verification-report/0.1"
```

### 5.2 `input` (REQUIRED)

Describes what was verified.

| Field            | Type   | Required | Description                           |
| ---------------- | ------ | -------- | ------------------------------------- |
| `type`           | string | REQUIRED | One of: `receipt_jws`, `bundle_entry` |
| `receipt_digest` | object | REQUIRED | Digest of receipt bytes               |

For bundles:

| Field                  | Type    | Required | Description                               |
| ---------------------- | ------- | -------- | ----------------------------------------- |
| `bundle`               | object  | OPTIONAL | Bundle context if `type = "bundle_entry"` |
| `bundle.bundle_digest` | object  | REQUIRED | Digest of bundle bytes                    |
| `bundle.entry_index`   | integer | REQUIRED | 0-based index                             |
| `bundle.entry_id`      | string  | OPTIONAL | Stable ID if available                    |

Digest object:

```json
{
  "alg": "sha-256",
  "value": "7d8f3d0c9d0b6aebd1c3b8d0ab8f7c1d..."
}
```

### 5.3 `policy` (REQUIRED)

Echoes the verification policy used. This makes trust decisions auditable.

| Field              | Type   | Required | Description                                            |
| ------------------ | ------ | -------- | ------------------------------------------------------ |
| `policy_version`   | string | REQUIRED | Policy schema version                                  |
| `mode`             | string | REQUIRED | `offline_only`, `offline_preferred`, `network_allowed` |
| `issuer_allowlist` | array  | OPTIONAL | Allowed issuer origins                                 |
| `pinned_keys`      | array  | OPTIONAL | Pinned key fingerprints                                |
| `limits`           | object | REQUIRED | Effective limits                                       |
| `network`          | object | REQUIRED | Network security settings                              |

Limits object:

```json
{
  "max_receipt_bytes": 262144,
  "max_jwks_bytes": 65536,
  "max_jwks_keys": 20,
  "max_redirects": 3,
  "fetch_timeout_ms": 5000,
  "max_extension_bytes": 65536
}
```

Network object:

```json
{
  "https_only": true,
  "block_private_ips": true,
  "allow_redirects": false
}
```

### 5.4 `result` (REQUIRED)

High-level outcome.

| Field          | Type    | Required | Description                  |
| -------------- | ------- | -------- | ---------------------------- |
| `valid`        | boolean | REQUIRED | Overall verification result  |
| `reason`       | string  | REQUIRED | Stable reason code           |
| `severity`     | string  | REQUIRED | `info`, `warning`, `error`   |
| `receipt_type` | string  | REQUIRED | Receipt wire format          |
| `issuer`       | string  | OPTIONAL | Normalized issuer origin     |
| `kid`          | string  | OPTIONAL | Key ID used for verification |

Reason codes:

- `ok` - Verification passed
- `receipt_too_large` - Receipt exceeds size limit
- `malformed_receipt` - Cannot parse JWS
- `signature_invalid` - Signature verification failed
- `issuer_not_allowed` - Issuer not in allowlist
- `key_not_found` - No matching key found
- `key_fetch_blocked` - SSRF protection blocked fetch
- `key_fetch_failed` - Network error fetching keys
- `pointer_fetch_blocked` - SSRF protection blocked pointer fetch
- `pointer_fetch_failed` - Network error fetching pointer target
- `pointer_fetch_timeout` - Timeout fetching pointer target
- `pointer_fetch_too_large` - Pointer target exceeds size limit
- `jwks_too_large` - JWKS exceeds size limit
- `jwks_too_many_keys` - JWKS has too many keys
- `expired` - Receipt past expiration
- `not_yet_valid` - Receipt not yet valid
- `audience_mismatch` - Audience claim mismatch
- `schema_invalid` - Claims schema validation failed
- `policy_violation` - Other policy check failed

### 5.5 `checks` (REQUIRED)

An ordered list of checks performed. Order MUST be stable and documented.

Each check entry:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | REQUIRED | Stable check identifier |
| `status` | string | REQUIRED | `pass`, `fail`, `skip` |
| `detail` | object | OPTIONAL | Machine-readable details |
| `error_code` | string | OPTIONAL | Stable error code |

Standard check IDs (in order):

1. `jws.parse` - Parse JWS structure
2. `limits.receipt_bytes` - Check receipt size
3. `jws.protected_header` - Validate protected header
4. `claims.schema_unverified` - Pre-signature schema check
5. `issuer.trust_policy` - Check issuer allowlist/pins
6. `issuer.discovery` - Fetch JWKS (if network mode)
7. `key.resolve` - Resolve signing key by kid
8. `jws.signature` - Verify signature
9. `claims.time_window` - Check iat/exp
10. `extensions.limits` - Check extension sizes
11. `transport.profile_binding` - Verify transport profile (optional)
12. `policy.binding` - Verify policy binding (DD-49; always `skip` for Wire 0.1)

**Append-only contract**: The check list is APPEND-ONLY. New checks MUST only be appended to the end of this list. Existing entries MUST NOT be removed, reordered, or renamed. Downstream consumers (conformance fixtures, report builders, dashboards) depend on stable indices. Breaking this contract invalidates all existing verification reports and conformance vectors.

### 5.6 `artifacts` (OPTIONAL)

Additional outputs for auditing.

| Field                      | Type   | Description                    |
| -------------------------- | ------ | ------------------------------ |
| `issuer_jwks_digest`       | object | Digest of JWKS used            |
| `normalized_claims_digest` | object | Digest of canonicalized claims |
| `receipt_pointer`          | object | Pointer resolution details     |

### 5.7 `meta` (OPTIONAL)

Non-deterministic fields ONLY. MUST be excluded from report hashes.

| Field          | Type   | Description                  |
| -------------- | ------ | ---------------------------- |
| `generated_at` | string | RFC 3339 timestamp           |
| `verifier`     | object | Verifier implementation info |

## 6. Canonicalization

When computing a digest of the report:

- Serialize using RFC 8785 JCS
- Exclude `meta` field
- Use SHA-256, lowercase hex output

## 7. Examples

### 7.1 Successful verification

```json
{
  "report_version": "peac-verification-report/0.1",
  "input": {
    "type": "receipt_jws",
    "receipt_digest": {
      "alg": "sha-256",
      "value": "7d8f3d0c9d0b6aebd1c3b8d0ab8f7c1d8c7f1d2b0b2a3f4e5d6c7b8a9f0e1d2c"
    }
  },
  "policy": {
    "policy_version": "peac-verifier-policy/0.1",
    "mode": "offline_only",
    "issuer_allowlist": ["https://api.example.com"],
    "pinned_keys": [
      {
        "issuer": "https://api.example.com",
        "kid": "prod-2026-02",
        "jwk_thumbprint_sha256": "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs"
      }
    ],
    "limits": {
      "max_receipt_bytes": 262144,
      "max_jwks_bytes": 65536,
      "max_jwks_keys": 20,
      "max_redirects": 0,
      "fetch_timeout_ms": 0,
      "max_extension_bytes": 65536
    },
    "network": {
      "https_only": true,
      "block_private_ips": true,
      "allow_redirects": false
    }
  },
  "result": {
    "valid": true,
    "reason": "ok",
    "severity": "info",
    "receipt_type": "peac-receipt/0.1",
    "issuer": "https://api.example.com",
    "kid": "prod-2026-02"
  },
  "checks": [
    { "id": "jws.parse", "status": "pass" },
    { "id": "limits.receipt_bytes", "status": "pass" },
    { "id": "jws.protected_header", "status": "pass" },
    { "id": "claims.schema_unverified", "status": "pass" },
    { "id": "issuer.trust_policy", "status": "pass" },
    { "id": "issuer.discovery", "status": "skip" },
    { "id": "key.resolve", "status": "pass", "detail": { "source": "pinned_keys" } },
    { "id": "jws.signature", "status": "pass" },
    { "id": "claims.time_window", "status": "pass" },
    { "id": "extensions.limits", "status": "pass" }
  ]
}
```

### 7.2 Failed verification (SSRF blocked)

```json
{
  "report_version": "peac-verification-report/0.1",
  "input": {
    "type": "receipt_jws",
    "receipt_digest": {
      "alg": "sha-256",
      "value": "a3f1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1"
    }
  },
  "policy": {
    "policy_version": "peac-verifier-policy/0.1",
    "mode": "network_allowed",
    "limits": {
      "max_receipt_bytes": 262144,
      "max_jwks_bytes": 65536,
      "max_jwks_keys": 20,
      "max_redirects": 3,
      "fetch_timeout_ms": 5000,
      "max_extension_bytes": 65536
    },
    "network": {
      "https_only": true,
      "block_private_ips": true,
      "allow_redirects": false
    }
  },
  "result": {
    "valid": false,
    "reason": "key_fetch_blocked",
    "severity": "error",
    "receipt_type": "peac-receipt/0.1",
    "issuer": "https://internal.example.com"
  },
  "checks": [
    { "id": "jws.parse", "status": "pass" },
    { "id": "limits.receipt_bytes", "status": "pass" },
    { "id": "jws.protected_header", "status": "pass" },
    { "id": "claims.schema_unverified", "status": "pass" },
    { "id": "issuer.trust_policy", "status": "pass" },
    {
      "id": "issuer.discovery",
      "status": "fail",
      "error_code": "E_VERIFY_KEY_FETCH_BLOCKED",
      "detail": {
        "blocked_reason": "private_ip_range",
        "url": "https://internal.example.com/.well-known/peac-issuer.json"
      }
    },
    { "id": "key.resolve", "status": "skip" },
    { "id": "jws.signature", "status": "skip" }
  ]
}
```

## 8. Implementation notes

### 8.1 Report size limits

Reports SHOULD be bounded:

- Maximum total size: 64 KB
- Maximum `detail` per check: 4 KB
- Truncate or omit large details

### 8.2 Sensitive data

Reports MUST NOT include:

- Private key material
- Full receipt claims (reference by digest)
- Secrets from error messages

### 8.3 Caching

Reports MAY be cached by receipt digest + policy digest:

- Same receipt + same policy = same report
- Policy changes invalidate cache
