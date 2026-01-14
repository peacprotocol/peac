# PEAC Policy Document Specification

**Status**: NORMATIVE

**Version**: 0.1

**Wire Format**: `peac-policy/0.1`

---

## 1. Introduction

This document defines the normative specification for PEAC Policy Documents, served at `/.well-known/peac.txt`. Policy documents declare machine-readable terms for automated interactions: allowed purposes, receipt requirements, rate limits, and payment terms.

**Key words**: The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

**Scope**: This specification covers policy documents only. For issuer configuration (JWKS, verification endpoints), see [PEAC-ISSUER.md](PEAC-ISSUER.md).

---

## 2. Discovery Locations

### 2.1 Primary Location

```
https://{domain}/.well-known/peac.txt
```

Implementations MUST check this location first.

### 2.2 Fallback Location

```
https://{domain}/peac.txt
```

Implementations MAY check this location if the primary returns 404.

### 2.3 Scheme Requirements

- Implementations MUST use HTTPS in production
- HTTP MAY be accepted only for localhost/127.0.0.1 in development environments
- Other schemes (file://, ftp://, etc.) MUST be rejected

---

## 3. Document Model

### 3.1 Abstract Model

A PEAC Policy Document is a structured object with the following fields:

| Field              | Type     | Required | Description                                                |
| ------------------ | -------- | -------- | ---------------------------------------------------------- |
| `version`          | string   | Yes      | Policy format version (e.g., `peac-policy/0.1`)            |
| `usage`            | enum     | Yes      | Access model: `open` or `conditional`                      |
| `purposes`         | string[] | No       | Allowed purposes (e.g., `crawl`, `index`, `train`)         |
| `receipts`         | enum     | No       | Receipt requirement: `required`, `optional`, or `omit`     |
| `attribution`      | enum     | No       | Attribution requirement: `required`, `optional`, or `none` |
| `rate_limit`       | string   | No       | Rate limit (e.g., `100/hour`, `unlimited`)                 |
| `daily_limit`      | number   | No       | Daily request limit                                        |
| `negotiate`        | string   | No       | Negotiation endpoint URL                                   |
| `contact`          | string   | No       | Contact email or URL                                       |
| `license`          | string   | No       | License identifier (e.g., `Apache-2.0`)                    |
| `price`            | number   | No       | Price per request (minor units)                            |
| `currency`         | string   | No       | Currency code (ISO 4217)                                   |
| `payment_methods`  | string[] | No       | Supported payment rails                                    |
| `payment_endpoint` | string   | No       | Payment endpoint URL                                       |

### 3.2 Version Field

The `version` field indicates the policy format version using the pattern `peac-policy/<major>.<minor>`:

- `peac-policy/0.1` - Current stable format

Implementations MUST:

- Reject versions that do not start with `peac-policy/`
- Reject unknown major versions
- MAY accept higher minor versions if all invariants hold

### 3.3 Usage Field

| Value         | Description                                      |
| ------------- | ------------------------------------------------ |
| `open`        | Default allow; receipts optional                 |
| `conditional` | Default deny/review; receipts typically required |

### 3.4 Purpose Tokens

Well-known purpose tokens:

| Token         | Description                         |
| ------------- | ----------------------------------- |
| `crawl`       | Web crawling/scraping               |
| `index`       | Search engine indexing              |
| `train`       | AI/ML model training                |
| `inference`   | AI/ML inference/generation          |
| `ai_input`    | RAG/grounding (content as AI input) |
| `ai_index`    | AI-powered search/indexing          |
| `search`      | Traditional search                  |
| `user_action` | Direct user-initiated action        |

Custom purpose tokens MUST match the grammar: `/^[a-z][a-z0-9_]*(?::[a-z][a-z0-9_]*)?$/`

### 3.5 Forward Compatibility

Implementations MUST ignore unknown fields rather than rejecting them. This enables forward-compatible evolution of the policy format.

---

## 4. Serialization Formats

Policy documents MAY be serialized as YAML or JSON.

### 4.1 YAML Serialization

```yaml
# Example: Open documentation policy
version: 'peac-policy/0.1'
usage: open
purposes: [crawl, index, search]
attribution: optional
receipts: optional
rate_limit: unlimited
license: Apache-2.0
```

### 4.2 JSON Serialization

```json
{
  "version": "peac-policy/0.1",
  "usage": "open",
  "purposes": ["crawl", "index", "search"],
  "attribution": "optional",
  "receipts": "optional",
  "rate_limit": "unlimited",
  "license": "Apache-2.0"
}
```

### 4.3 Content-Type

Servers SHOULD set appropriate Content-Type headers:

- YAML: `text/plain; charset=utf-8` or `text/yaml; charset=utf-8`
- JSON: `application/json; charset=utf-8`

---

## 5. Parsing Rules

### 5.1 Format Detection Algorithm

```
Input: response (HTTP response with body)
Output: parsed policy object or error

1. Check Content-Type header:
   IF Content-Type contains "application/json":
     PARSE as JSON
     RETURN parsed object

2. Examine first non-whitespace character:
   first_char = body.trimStart()[0]
   IF first_char == '{':
     PARSE as JSON
   ELSE:
     PARSE as YAML

3. RETURN parsed object
```

### 5.2 YAML Subset Restrictions

When parsing YAML, implementations MUST enforce these restrictions:

| Feature                | Rule                      | Reason                                 |
| ---------------------- | ------------------------- | -------------------------------------- |
| Anchors (`&`)          | MUST reject               | Prevents exponential expansion attacks |
| Aliases (`*`)          | MUST reject               | Prevents exponential expansion attacks |
| Merge keys (`<<`)      | MUST reject               | Avoids ambiguous merge semantics       |
| Custom tags (`!tag`)   | MUST reject               | Security and portability               |
| Non-core schemas       | MUST reject               | Deterministic parsing                  |
| Multi-document (`---`) | MUST reject (after first) | Single document only                   |
| Encoding               | MUST be UTF-8             | Interoperability                       |
| Mapping keys           | MUST be strings           | JSON compatibility                     |

### 5.3 JSON Restrictions

When parsing JSON, implementations MUST:

- Use strict JSON parsing (no trailing commas, no comments)
- Reject duplicate keys at the same level
- Accept only UTF-8 encoding

---

## 6. Size and Depth Limits

### 6.1 Hard Limits (MUST enforce)

| Limit                 | Value         | Reason         |
| --------------------- | ------------- | -------------- |
| Maximum bytes         | 256 KiB       | DoS protection |
| Maximum nesting depth | 8 levels      | Stack safety   |
| Maximum array length  | 1000 elements | Memory bounds  |
| Maximum string length | 64 KiB        | Memory bounds  |

### 6.2 Recommended Limits

| Limit              | Value     | Reason          |
| ------------------ | --------- | --------------- |
| Maximum line count | 100 lines | Readability     |
| Maximum purposes   | 50 tokens | Practical limit |

---

## 7. Validation Requirements

### 7.1 Required Field Validation

Implementations MUST reject documents that:

- Missing `version` field
- Missing `usage` field
- Have `usage` not in `[open, conditional]`
- Have `version` with unrecognized major version

### 7.2 Type Validation

| Field         | Type Constraint                        |
| ------------- | -------------------------------------- |
| `version`     | Non-empty string                       |
| `usage`       | String in `[open, conditional]`        |
| `purposes`    | Array of strings                       |
| `receipts`    | String in `[required, optional, omit]` |
| `attribution` | String in `[required, optional, none]` |
| `rate_limit`  | String matching rate limit grammar     |
| `price`       | Non-negative number                    |
| `currency`    | 3-letter ISO 4217 code                 |

### 7.3 Rate Limit Grammar

```
rate_limit = "unlimited" | count "/" period
count      = 1*DIGIT
period     = "second" | "minute" | "hour" | "day"
```

Examples: `100/hour`, `1000/day`, `unlimited`

---

## 8. Caching and Freshness

### 8.1 Cache Headers

Servers SHOULD set cache headers:

```http
Cache-Control: public, max-age=3600
ETag: "abc123"
```

### 8.2 Client Behavior

Clients SHOULD:

- Cache policy documents for at least 1 hour
- Honor `Cache-Control` and `ETag` headers
- Implement conditional requests (`If-None-Match`)

---

## 9. Security Considerations

### 9.1 Trust Model

Policy documents are publisher assertions, not verified claims. Clients MUST NOT treat policy fields as authorization grants.

### 9.2 SSRF Protection

When fetching policy documents, implementations MUST:

- Block private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Block loopback (127.0.0.0/8, ::1)
- Block link-local (169.254.0.0/16, fe80::/10)
- Block metadata endpoints (169.254.169.254)
- Enforce HTTPS in production
- Set reasonable timeouts (5-10 seconds)

### 9.3 Input Validation

All parsed fields MUST be validated before use. Never trust user-controlled input from policy documents for:

- URL construction (SSRF)
- File path construction (path traversal)
- Command construction (injection)

---

## 10. Examples

### 10.1 Open Documentation

```yaml
version: 'peac-policy/0.1'
usage: open
purposes: [crawl, index, search, ai_index]
attribution: optional
receipts: optional
rate_limit: unlimited
license: Apache-2.0
contact: docs@example.com
```

### 10.2 Conditional API Access

```yaml
version: 'peac-policy/0.1'
usage: conditional
purposes: [inference, ai_input]
receipts: required
rate_limit: 100/hour
daily_limit: 1000
price: 10
currency: USD
payment_methods: [x402, stripe]
payment_endpoint: https://api.example.com/pay
negotiate: https://api.example.com/negotiate
contact: api-support@example.com
```

### 10.3 News Media (No Training)

```yaml
version: 'peac-policy/0.1'
usage: conditional
purposes: [crawl, index, search]
receipts: required
attribution: required
rate_limit: 60/minute
contact: licensing@news.example.com
```

---

## 11. Relationship to Other Specifications

| Specification                                | Relationship                              |
| -------------------------------------------- | ----------------------------------------- |
| [PEAC-ISSUER.md](PEAC-ISSUER.md)             | Issuer configuration (JWKS, verification) |
| [PROTOCOL-BEHAVIOR.md](PROTOCOL-BEHAVIOR.md) | Receipt issuance and verification         |
| robots.txt                                   | Complementary crawl directives            |
| ai.txt / llm.txt                             | Complementary AI usage signals            |

---

## 12. Conformance

### 12.1 L0 Conformance (Parser)

An L0-conformant implementation MUST:

1. Fetch policy from well-known locations
2. Detect YAML vs JSON format
3. Parse with subset restrictions
4. Enforce size limits
5. Validate required fields
6. Ignore unknown fields

### 12.2 L1 Conformance (Evaluator)

An L1-conformant implementation MUST also:

1. Evaluate purpose matching
2. Apply rate limit parsing
3. Resolve receipt requirements
4. Handle caching correctly

---

## 13. Version History

| Version | Date       | Changes               |
| ------- | ---------- | --------------------- |
| 0.1     | 2026-01-14 | Initial specification |

---

## 14. References

- RFC 2119 - Key words for use in RFCs
- RFC 8259 - The JavaScript Object Notation (JSON) Data Interchange Format
- YAML 1.2 - YAML Ain't Markup Language
- RFC 8615 - Well-Known Uniform Resource Identifiers (URIs)
