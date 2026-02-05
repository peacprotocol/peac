# PEAC Transport Profiles (NORMATIVE)

Status: NORMATIVE
Version: 0.1
Last-Updated: 2026-02-05

This document defines the three standard transport profiles for delivering PEAC receipts. Implementations MUST support at least one profile and SHOULD support fallback behavior.

## 1. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

## 2. Overview

PEAC defines three transport profiles:

| Profile | Use Case | Receipt Location |
|---------|----------|------------------|
| **Header** | Small receipts | `PEAC-Receipt` response header |
| **Body** | Large receipts, structured responses | JSON response body |
| **Pointer** | Very large receipts, decoupled delivery | Header with digest + URL |

All profiles MUST preserve **verification equivalence**: a receipt delivered via any profile MUST verify to the same claims regardless of transport mechanism.

## 3. Header Profile

### 3.1 Description

The header profile delivers receipts as HTTP response headers. This is the simplest integration path but has size constraints.

### 3.2 Header name

- Header name: `PEAC-Receipt`
- Case-insensitive per HTTP/1.1 (RFC 7230)
- Implementations SHOULD use canonical casing: `PEAC-Receipt`

### 3.3 Header value

- Value: JWS Compact Serialization (RFC 7515)
- Encoding: ASCII (base64url components)

Example:
```
PEAC-Receipt: eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMtcmVjZWlwdC8wLjEifQ.eyJpc3MiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSIsImlhdCI6MTcwNzEzNjYyNX0.abc123...
```

### 3.4 Size limits

| Limit | Recommended | Rationale |
|-------|-------------|-----------|
| Maximum header size | 4 KB | Safe across most proxies, CDNs, and load balancers |
| Absolute maximum | 8 KB | Some infrastructure supports up to 8 KB |

Implementations SHOULD:
- Warn if receipts approach 4 KB
- Fail or fallback if receipts exceed 8 KB

### 3.5 Fallback behavior

If a receipt exceeds the header size limit:
1. Issuer SHOULD use the Pointer profile (preferred) or Body profile
2. Issuer MAY return a `413` status with header `PEAC-Receipt-Too-Large: true`
3. Issuer MUST NOT truncate the receipt

### 3.6 Multiple receipts

Issuers SHOULD send **at most one** `PEAC-Receipt` header per response.

If multiple receipts are needed, issuers SHOULD use one of the following instead:

- **Body profile**: `peac_receipts` array in the response body
- **Pointer profile**: a single `PEAC-Receipt-Pointer` that references a receipt bundle

Verifiers MUST treat multiple occurrences of `PEAC-Receipt` (or `PEAC-Receipt-Pointer`) as **invalid transport** and MUST NOT attempt recovery by splitting on commas or performing any other header-value heuristics.

Rationale: many HTTP stacks coalesce repeated header fields into a single comma-separated value, and the Pointer profile uses a Structured Field Dictionary that itself contains commas. Accepting multiple receipts in headers is therefore ambiguous and non-portable.

## 4. Body Profile

### 4.1 Description

The body profile delivers receipts as part of the response body. This is suitable for:
- Large receipts exceeding header limits
- APIs that already return structured JSON
- Responses that need multiple receipts

### 4.2 Wrapper format

For APIs returning JSON, wrap the original response:

```json
{
  "data": { /* original response body */ },
  "peac_receipt": "eyJhbGciOiJFZERTQSIs..."
}
```

For multiple receipts:
```json
{
  "data": { /* original response body */ },
  "peac_receipts": [
    "eyJhbGciOiJFZERTQSIs...",
    "eyJhbGciOiJFZERTQSIs..."
  ]
}
```

### 4.3 Dedicated endpoint

Alternatively, provide a dedicated receipt endpoint:

```
GET /peac/receipts/{receipt_id}
Content-Type: application/jose

eyJhbGciOiJFZERTQSIs...
```

Or as JSON:
```
GET /peac/receipts/{receipt_id}
Content-Type: application/json

{
  "receipt": "eyJhbGciOiJFZERTQSIs...",
  "receipt_id": "abc123",
  "issued_at": "2026-02-05T10:23:45Z"
}
```

### 4.4 Content-Type

- For raw JWS: `application/jose` or `application/jose+json`
- For wrapped JSON: `application/json`

### 4.5 Size limits

| Limit | Recommended | Rationale |
|-------|-------------|-----------|
| Maximum receipt size | 256 KB | Prevents resource exhaustion |
| Maximum body overhead | 1 KB | Wrapper fields should be minimal |

## 5. Pointer Profile

### 5.1 Description

The pointer profile decouples receipt delivery from the original response. The response includes a pointer (digest + URL), and the verifier fetches the full receipt separately.

This is ideal for:
- Very large receipts (e.g., with extensive interaction evidence)
- Immutable receipt storage
- CDN-friendly caching

### 5.2 Header format

The `PEAC-Receipt-Pointer` header is an RFC 8941 Structured Field **Dictionary** with quoted string members:

```
PEAC-Receipt-Pointer: sha256="<hex>", url="<https-url>"
```

Components:

- `sha256="<hex>"`: SHA-256 of the receipt JWS bytes, lowercase hex (64 characters), quoted
- `url="<https-url>"`: HTTPS URL where the receipt can be fetched, quoted

The RFC 8941 Dictionary format with quoted strings ensures URLs are safe even if they contain `;` or `,`, and parsing is consistent across languages.

Example:
```
PEAC-Receipt-Pointer: sha256="7d8f3d0c9d0b6aebd1c3b8d0ab8f7c1d8c7f1d2b0b2a3f4e5d6c7b8a9f0e1d2c", url="https://receipts.example.com/abc123"
```

### 5.3 Digest binding (NORMATIVE)

The digest MUST bind the pointer to the exact receipt bytes. This section defines the canonical computation:

**Algorithm:** SHA-256 (FIPS 180-4)

**Input canonicalization:**

- Input: The JWS Compact Serialization string (header.payload.signature)
- Encoding: UTF-8 (the JWS is ASCII, but UTF-8 encoding is used for consistency)
- No whitespace, no BOM, no normalization - the exact bytes of the JWS string

**Output encoding:**

- Format: Lowercase hexadecimal
- Length: 64 characters (256 bits / 4 bits per hex char)
- No prefix (no "0x")
- No separators (no colons, dashes, or spaces)

**Example computation (pseudocode):**

```text
receipt = "eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMtcmVjZWlwdC8wLjEifQ.eyJpc3MiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSJ9.abc123..."
bytes = utf8_encode(receipt)
hash = sha256(bytes)
digest = lowercase_hex(hash)  // e.g., "7d8f3d0c9d0b6aebd1c3b8d0ab8f7c1d8c7f1d2c"
```

Verifiers MUST:
1. Fetch the URL
2. Compute SHA-256 of the fetched bytes using the same canonicalization
3. Compare to the declared digest (case-insensitive comparison allowed, but lowercase RECOMMENDED)
4. Reject if mismatch with error `pointer_digest_mismatch`

### 5.4 Pointer URL requirements

| Requirement | Value | Rationale |
|-------------|-------|-----------|
| Scheme | HTTPS only | Security |
| Immutability | Content MUST NOT change for a given URL | Digest binding |
| Availability | SHOULD be highly available | Verification depends on it |
| Caching | SHOULD support HTTP caching headers | Performance |
| Authentication | MAY require auth (but digest still binds) | Access control |

### 5.5 Fetch limits

Verifiers MUST enforce limits when fetching pointer URLs:

| Limit | Recommended | Rationale |
|-------|-------------|-----------|
| Timeout | 5 seconds | DoS prevention (matches VERIFIER-SECURITY-MODEL) |
| Max size | 256 KB | Resource exhaustion (matches VERIFIER-SECURITY-MODEL) |
| Redirects | 0-3 | SSRF prevention |
| Schemes | HTTPS only | Security |

### 5.6 Fallback

If the pointer URL is unreachable:

- Verifier MUST fail with `pointer_fetch_failed` or equivalent
- Verifier MUST NOT use cached receipts without digest validation

## 6. Profile selection guidance

### 6.1 Issuer guidance

| Scenario | Recommended Profile |
|----------|---------------------|
| Receipt < 4 KB | Header |
| Receipt 4-256 KB | Body or Pointer |
| Receipt > 256 KB | Pointer |
| Streaming response | Pointer |
| Gateway/edge issuance | Pointer (easier to implement) |
| Simple API integration | Header |
| Already returning JSON | Body |

### 6.2 Verifier guidance

Verifiers SHOULD support all three profiles:
1. Check for `PEAC-Receipt` header first
2. Check for `PEAC-Receipt-Pointer` header second
3. Check response body for `peac_receipt` / `peac_receipts` last

## 7. Verification equivalence

A receipt delivered via any profile MUST verify identically:
- Same JWS bytes
- Same signature validation
- Same claims extraction
- Same verification report

Implementations MUST NOT add profile-specific verification logic that affects the outcome.

## 8. Error handling

### 8.1 Header profile errors

| Error | Response |
|-------|----------|
| Receipt too large | 413 with `PEAC-Receipt-Too-Large: true` |
| Encoding error | Omit header, log error |

### 8.2 Body profile errors

| Error | Response |
|-------|----------|
| Receipt too large | Use pointer profile |
| Invalid JSON | 500 with error details |

### 8.3 Pointer profile errors

| Error | Response |
|-------|----------|
| Storage unavailable | 503 with retry guidance |
| Digest mismatch | Verifier rejects with `pointer_digest_mismatch` |
| Fetch timeout | Verifier rejects with `pointer_fetch_timeout` |

## 9. Security considerations

### 9.1 Header injection

Issuers MUST sanitize receipt bytes before header inclusion:
- No newlines (CR, LF)
- No control characters
- The value MUST be valid **JWS Compact Serialization** (three base64url segments separated by `.`)

### 9.2 SSRF via pointer URLs

Verifiers MUST:
- Block private IP ranges
- Block link-local addresses
- Enforce HTTPS only
- Limit redirects

### 9.3 Cache poisoning

Pointer URLs SHOULD use content-addressable storage where the URL includes the digest, making cache poisoning detectable.

Example:
```
https://receipts.example.com/sha256/7d8f3d0c9d0b6aebd1c3b8d0ab8f7c1d...
```

## 10. Examples

### 10.1 Header profile example

Request:
```http
GET /api/data HTTP/1.1
Host: api.example.com
```

Response:
```http
HTTP/1.1 200 OK
Content-Type: application/json
PEAC-Receipt: eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMtcmVjZWlwdC8wLjEifQ.eyJpc3MiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSIsImlhdCI6MTcwNzEzNjYyNX0.abc123

{"items": ["a", "b", "c"]}
```

### 10.2 Body profile example

Response:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "data": {"items": ["a", "b", "c"]},
  "peac_receipt": "eyJhbGciOiJFZERTQSIs..."
}
```

### 10.3 Pointer profile example

Response:
```http
HTTP/1.1 200 OK
Content-Type: application/json
PEAC-Receipt-Pointer: sha256="7d8f3d0c9d0b6aebd1c3b8d0ab8f7c1d8c7f1d2b0b2a3f4e5d6c7b8a9f0e1d2c", url="https://receipts.example.com/abc123"

{"items": ["a", "b", "c"]}
```

Verifier fetches:
```http
GET /abc123 HTTP/1.1
Host: receipts.example.com
```

```http
HTTP/1.1 200 OK
Content-Type: application/jose
Cache-Control: public, max-age=31536000, immutable

eyJhbGciOiJFZERTQSIs...
```
