# PEAC Protocol Interoperability Guide

## Wire Protocol Version 0.9.14

PEAC v0.9.14 introduces simplified wire format with single header:

### JWS Header Format

All receipts use `typ: "peac.receipt/0.9"` in JWS header:

```json
{
  "alg": "EdDSA",
  "typ": "peac.receipt/0.9",
  "kid": "key-id"
}
```

### Single Header

Only `PEAC-Receipt` header is used (no more `peac-version`):

```http
PEAC-Receipt: eyJhbGciOiJFZERTQSI...
```

## Content Types and Media Types

### Success Responses

Successful PEAC operations return `application/peac+json`:

```http
HTTP/1.1 200 OK
Content-Type: application/peac+json
PEAC-Receipt: eyJhbGciOiJFZERTQSI...
```

### Error Responses

Errors use RFC 7807 Problem Details with `application/problem+json`:

```http
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json

{
  "type": "https://peacprotocol.org/problems/invalid-receipt",
  "title": "Invalid Receipt",
  "status": 400
}
```

## Receipt Mutation Policy

**CRITICAL**: No JWS mutation allowed. Receipts are immutable after signing:

- No adding claims after signing
- No modifying existing claims
- No re-signing with different keys
- No format transformations

## AIPREF Integration

AIPREF presence is REQUIRED (core or sidecar):

- Core: Snapshot effective preferences at enforcement time
- Sidecar: Reference to AIPREF service

## v0.9.14 Receipt Format

Receipts use these key fields:

- `iat`: Issued at time (Unix seconds)
- `payment.scheme`: Payment method ('stripe', 'l402', 'x402')
- `wire_version`: '0.9'
- `version`: '0.9.14'

## Cache Controls

Sensitive endpoints (`/enforce`, `/verify`):

```
Cache-Control: no-store, no-cache, must-revalidate, private
```

Health endpoints (cacheable):

```
Cache-Control: public, max-age=60
```

Metrics (no caching):

```
Cache-Control: no-cache
```

## Retry-After on 402

Payment required responses include actual provider timing:

```
Retry-After: 60
```

## Interop Matrix (Informative, evolving)

Adapters connect PEAC to external rails and protocols.

| Adapter                    | L0  | L1  | L2  | L3  | L4  |
| -------------------------- | :-: | :-: | :-: | :-: | :-: |
| x402                       |  ✓  |  ✓  |  ✓  |  ✓  |  -  |
| Payment provider (generic) |  ✓  |  ✓  |  ✓  |  ✓  |  -  |
| MCP / A2A                  |  ✓  |  ✓  |  -  |  -  |  -  |

Notes: x402 is the first-listed payment path; others are "any payment provider adapter" depending on deployment.
