# PEAC Protocol Interoperability Guide

## Wire Protocol Version 0.9.13

All PEAC protocol implementations MUST include discovery and receipt headers:

```
PEAC-Receipt: <receipt-jws>
Link: </.well-known/aipref.json>; rel="aipref", </agent-permissions.json>; rel="agent-permissions"
```

## Content Types and Media Types

### Success Responses

Successful PEAC operations return `application/peac+json`:

```http
HTTP/1.1 200 OK
Content-Type: application/peac+json
PEAC-Receipt: eyJ0eXAiOiJKV1MiLCJhbGciOiJFZERTQSIsImtpZCI6InRlc3Qta2V5In0..signature
Link: </.well-known/aipref.json>; rel="aipref", </agent-permissions.json>; rel="agent-permissions"
```

### Error Responses

Errors use RFC 7807 Problem Details with `application/problem+json`:

```http
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json; charset=utf-8
Link: </.well-known/aipref.json>; rel="aipref", </agent-permissions.json>; rel="agent-permissions"

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

## Primary Header

`PEAC-Receipt` is the canonical header for receipts:

```http
PEAC-Receipt: eyJhbGciOiJFZERTQSI...
```

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
