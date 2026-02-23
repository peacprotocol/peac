# PEAC Issuer Configuration Specification

**Status**: NORMATIVE

**Version**: 0.1

**Wire Format**: `peac-issuer/0.1`

---

## 1. Introduction

This document defines the normative specification for PEAC Issuer Configuration, served at `/.well-known/peac-issuer.json`. Issuer configuration enables verifiers to discover cryptographic keys and verification endpoints for validating PEAC receipts.

**Key words**: The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174 (when, and only when, they appear in all capitals).

**Scope**: This specification covers issuer configuration only. For policy documents (access terms, purposes, receipts), see [PEAC-TXT.md](PEAC-TXT.md).

---

## 2. Discovery Location

### 2.1 Canonical Location

```text
https://{issuer}/.well-known/peac-issuer.json
```

Where `{issuer}` is the issuer URL from the receipt's `iss` claim.

### 2.2 Resolution Algorithm

```text
Input: issuer URL (from receipt iss claim)
Output: issuer configuration URL

1. Canonicalize issuer to origin: origin = new URL(issuer).origin
2. Validate origin uses HTTPS scheme
3. issuer_config_url = origin + "/.well-known/peac-issuer.json"
4. RETURN issuer_config_url
```

Canonicalization via `URL.origin` handles trailing slashes, paths, and default port elision. This ensures `https://api.example.com/`, `https://api.example.com/v1`, and `https://api.example.com:443` all resolve to the same configuration URL.

Example:

- Receipt `iss`: `https://api.example.com`
- Config URL: `https://api.example.com/.well-known/peac-issuer.json`

### 2.3 Scheme Requirements

- Implementations MUST require HTTPS
- HTTP MUST be rejected (no development exceptions for issuer config)
- Other schemes MUST be rejected

---

## 3. Document Model

### 3.1 Abstract Model

A PEAC Issuer Configuration is a JSON object with the following fields:

| Field              | Type     | Required | Description                                      |
| ------------------ | -------- | -------- | ------------------------------------------------ |
| `version`          | string   | Yes      | Configuration format version                     |
| `issuer`           | string   | Yes      | Issuer identifier URL (MUST match receipt `iss`) |
| `jwks_uri`         | string   | Yes      | JWKS endpoint URL                                |
| `verify_endpoint`  | string   | No       | Verification endpoint URL                        |
| `receipt_versions` | string[] | No       | Supported receipt versions                       |
| `algorithms`       | string[] | No       | Supported signing algorithms                     |
| `payment_rails`    | string[] | No       | Supported payment rails                          |
| `security_contact` | string   | No       | Security contact email/URL                       |

### 3.2 Version Field

The `version` field indicates the configuration format version:

- `peac-issuer/0.1` - Initial version

Implementations MUST reject configurations with unrecognized major versions.

### 3.3 Issuer Field

The `issuer` field MUST:

- Be an HTTPS URL
- Match the `iss` claim in receipts issued by this issuer
- Not include a trailing slash
- Be case-sensitive

### 3.4 JWKS URI Field

The `jwks_uri` field provides the location of the issuer's JSON Web Key Set:

- MUST be a valid URL
- MUST use the HTTPS scheme; verifiers MUST reject non-HTTPS `jwks_uri` values with error code `E_VERIFY_JWKS_URI_INVALID`
- MUST return a valid JWKS document (RFC 7517)
- SHOULD be cacheable with appropriate headers

**Normative key discovery chain**: Verifiers MUST resolve keys ONLY via the canonical discovery chain: `iss` claim -> `peac-issuer.json` -> `jwks_uri` -> JWKS. This is the single normative mechanism for key discovery in PEAC. JWKS endpoints are implementation artifacts of the issuer, not protocol-level discovery surfaces. Implementations MUST NOT:

- Embed keys directly in `peac-issuer.json` (no inline `keys` array)
- Fall back to direct `/.well-known/jwks.json` without first resolving `peac-issuer.json`
- Use `peac.txt` for key discovery (`peac.txt` is for policy only; see [PEAC-TXT.md](PEAC-TXT.md))
- Construct JWKS URLs by convention (e.g., appending `/.well-known/jwks.json` to the issuer origin)

### 3.5 Receipt Versions

Default if not specified: `["peac-receipt/0.1"]`

Well-known receipt versions:

| Version            | Description                |
| ------------------ | -------------------------- |
| `peac-receipt/0.1` | Current stable wire format |

### 3.6 Algorithms

Default if not specified: `["EdDSA"]`

Supported algorithms:

| Algorithm | Description                  |
| --------- | ---------------------------- |
| `EdDSA`   | Ed25519 (recommended)        |
| `ES256`   | ECDSA with P-256 and SHA-256 |

---

## 4. Serialization Format

Issuer configuration MUST be JSON. YAML is not supported.

### 4.1 Example

```json
{
  "version": "peac-issuer/0.1",
  "issuer": "https://api.example.com",
  "jwks_uri": "https://api.example.com/.well-known/jwks.json",
  "verify_endpoint": "https://api.example.com/verify",
  "receipt_versions": ["peac-receipt/0.1"],
  "algorithms": ["EdDSA"],
  "payment_rails": ["x402", "stripe"],
  "security_contact": "security@example.com"
}
```

### 4.2 Content-Type

Servers MUST set:

```http
Content-Type: application/json; charset=utf-8
```

---

## 5. Parsing Rules

### 5.1 Strict JSON Parsing

Implementations MUST:

- Use strict JSON parsing (RFC 8259)
- Reject trailing commas
- Reject comments
- Reject duplicate keys
- Accept only UTF-8 encoding

### 5.2 Unknown Fields

Implementations MUST ignore unknown fields for forward compatibility.

---

## 6. Size and Security Limits

### 6.1 Hard Limits

| Limit                 | Value    | Reason         |
| --------------------- | -------- | -------------- |
| Maximum bytes         | 64 KiB   | DoS protection |
| Maximum nesting depth | 4 levels | Stack safety   |

### 6.2 Timeout

Implementations MUST enforce fetch timeouts:

- Connection timeout: 5 seconds
- Total timeout: 10 seconds

---

## 7. Validation Requirements

### 7.1 Required Field Validation

Implementations MUST reject configurations that:

- Missing `version` field
- Missing `issuer` field
- Missing `jwks_uri` field
- Have `issuer` not matching expected issuer
- Have `jwks_uri` not HTTPS

### 7.2 Issuer Origin Canonicalization

Implementations MUST canonicalize issuer URLs to their origin (scheme + host + port) using URL parsing (e.g., `new URL(issuer).origin`). Origin canonicalization is normative for three operations:

1. **Discovery URL derivation**: `origin + "/.well-known/peac-issuer.json"`
2. **Issuer equality comparison**: `canonical(receipt.iss) == canonical(config.issuer)`
3. **Cache key derivation**: cache entries MUST be keyed by the canonical origin

This ensures that `https://api.example.com/`, `https://api.example.com/v1`, and `https://api.example.com:443` all resolve to the same issuer identity `https://api.example.com`.

### 7.3 Issuer Matching

When verifying a receipt:

```text
Input: receipt.iss, config.issuer
Output: boolean

1. Canonicalize both URLs to their origin (scheme + host + port)
   using URL parsing (handles trailing slashes, paths, default port elision)
2. Compare case-sensitively
3. RETURN (canonical_iss == canonical_issuer)
```

Mismatch MUST result in verification failure with error code `E_VERIFY_ISSUER_MISMATCH`.

Implementations MUST compare canonical origins, not raw strings. Two issuer URLs that differ only in path, trailing slash, or default port MUST be treated as the same issuer.

---

## 8. Caching

### 8.1 Cache Requirements

Issuer configuration is verification-critical and frequently accessed. Implementations MUST:

- Cache successful responses keyed by canonical origin (Section 7.2)
- Honor `Cache-Control` headers
- Implement conditional requests (`If-None-Match`, `If-Modified-Since`)
- Use a minimum cache TTL of 5 minutes
- Use a maximum cache TTL of 24 hours
- Enforce bounded cache size (LRU eviction RECOMMENDED)

### 8.2 Server Headers

Servers SHOULD set:

```http
Cache-Control: public, max-age=3600
ETag: "v1-abc123"
```

### 8.3 Cache Invalidation

On verification failure due to unknown key ID:

1. Attempt cache refresh (conditional GET)
2. If new config, retry verification
3. If same config, fail verification

---

## 9. SSRF Protection

### 9.1 Blocked Ranges

Implementations MUST block:

| Range           | Reason             |
| --------------- | ------------------ |
| 10.0.0.0/8      | Private (RFC 1918) |
| 172.16.0.0/12   | Private (RFC 1918) |
| 192.168.0.0/16  | Private (RFC 1918) |
| 127.0.0.0/8     | Loopback           |
| ::1             | IPv6 loopback      |
| 169.254.0.0/16  | Link-local         |
| 169.254.169.254 | Cloud metadata     |
| fe80::/10       | IPv6 link-local    |

### 9.2 Redirect Handling

Implementations MUST:

- Follow redirects (max 3 hops)
- Validate each redirect target against SSRF rules
- Reject cross-scheme redirects (HTTPS -> HTTP)

---

## 10. Error Handling

### 10.1 Fetch Errors

| Condition        | Behavior                      |
| ---------------- | ----------------------------- |
| Network error    | Retry with backoff, then fail |
| 404 Not Found    | Fail (issuer not configured)  |
| 5xx Server Error | Retry with backoff            |
| Timeout          | Fail with timeout error       |
| Invalid JSON     | Fail with parse error         |

### 10.2 Error Codes

| Code                               | HTTP | Description                                                |
| ---------------------------------- | ---- | ---------------------------------------------------------- |
| `E_VERIFY_ISSUER_CONFIG_MISSING`   | 502  | peac-issuer.json not found or not fetchable                |
| `E_VERIFY_ISSUER_CONFIG_INVALID`   | 502  | peac-issuer.json not valid JSON or fails schema validation |
| `E_VERIFY_ISSUER_MISMATCH`         | 403  | issuer field does not match expected issuer origin         |
| `E_VERIFY_JWKS_URI_INVALID`        | 502  | jwks_uri is not a valid HTTPS URL                          |
| `E_VERIFY_INSECURE_SCHEME_BLOCKED` | 403  | Non-HTTPS URL in issuer discovery                          |
| `E_VERIFY_JWKS_INVALID`            | 502  | JWKS response not valid JSON or missing keys array         |
| `E_VERIFY_KEY_FETCH_BLOCKED`       | 403  | SSRF protection blocked the fetch                          |
| `E_VERIFY_KEY_FETCH_FAILED`        | 502  | Network error during key fetch                             |
| `E_VERIFY_KEY_FETCH_TIMEOUT`       | 504  | Key fetch timed out                                        |

---

## 11. Security Considerations

### 11.1 Trust Model

Issuer configuration is trusted for key discovery only. It does not grant authorization or validate receipt claims beyond signature verification.

### 11.2 Key Rotation

Issuers SHOULD:

- Include multiple keys in JWKS for rotation
- Use key IDs (`kid`) to identify keys
- Deprecate old keys gradually (grace period)

Verifiers SHOULD:

- Refresh JWKS on unknown `kid`
- Cache keys by `kid` for efficiency

### 11.3 TLS Requirements

- TLS 1.2 or higher REQUIRED
- Certificate validation REQUIRED
- HSTS RECOMMENDED

---

## 12. Dual-Role Origins

When an origin is both a publisher (issues receipts) and a content provider (has access terms), it MUST host the canonical trio of discovery surfaces:

| Surface                           | Purpose                           | Specification              |
| --------------------------------- | --------------------------------- | -------------------------- |
| `/.well-known/peac.txt`           | Policy: access terms and purposes | [PEAC-TXT.md](PEAC-TXT.md) |
| `/.well-known/peac-issuer.json`   | Issuer: config and key discovery  | This document              |
| `{jwks_uri}` (from issuer config) | Keys: JWKS for signature verify   | RFC 7517                   |

These are independent documents serving different purposes. `peac.txt` is for policy only; `peac-issuer.json` is for verification key discovery only. Implementations MUST NOT conflate the two.

---

## 13. Conformance

### 13.1 Issuer Conformance

An issuer implementation MUST:

1. Serve configuration at canonical location
2. Return valid JSON with required fields
3. Ensure `issuer` matches receipt `iss` claims
4. Serve JWKS at `jwks_uri`
5. Set appropriate cache headers

### 13.2 Verifier Conformance

A verifier implementation MUST:

1. Resolve configuration from issuer URL via `/.well-known/peac-issuer.json`
2. Validate configuration format
3. Validate issuer field matches expected
4. Fetch JWKS from `jwks_uri` (MUST NOT assume JWKS location without resolving issuer config)
5. Cache JWKS with appropriate TTL
6. Verify receipts using discovered keys
7. Handle errors appropriately

---

## 14. Examples

### 14.1 Minimal Configuration

```json
{
  "version": "peac-issuer/0.1",
  "issuer": "https://api.example.com",
  "jwks_uri": "https://api.example.com/.well-known/jwks.json"
}
```

### 14.2 Full Configuration

```json
{
  "version": "peac-issuer/0.1",
  "issuer": "https://api.example.com",
  "jwks_uri": "https://api.example.com/.well-known/jwks.json",
  "verify_endpoint": "https://api.example.com/peac/verify",
  "receipt_versions": ["peac-receipt/0.1"],
  "algorithms": ["EdDSA", "ES256"],
  "payment_rails": ["x402", "stripe", "razorpay"],
  "security_contact": "https://api.example.com/.well-known/security.txt"
}
```

---

## 15. Version History

| Version | Date       | Changes               |
| ------- | ---------- | --------------------- |
| 0.1     | 2026-01-14 | Initial specification |

---

## 16. References

- RFC 2119 - Key words for use in RFCs
- RFC 7517 - JSON Web Key (JWK)
- RFC 7518 - JSON Web Algorithms (JWA)
- RFC 8174 - Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words
- RFC 8259 - The JavaScript Object Notation (JSON) Data Interchange Format
- RFC 8615 - Well-Known Uniform Resource Identifiers (URIs)
- [PEAC-TXT.md](PEAC-TXT.md) - Policy Document Specification
- [PROTOCOL-BEHAVIOR.md](PROTOCOL-BEHAVIOR.md) - Receipt Verification
