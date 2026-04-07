# Migration Guide

This guide covers migration paths for current PEAC Protocol surfaces.

## From Wire 0.1 to Wire 0.2

Wire 0.1 (`peac-receipt/0.1`) is frozen legacy. Wire 0.2 (`interaction-record+jwt`) is the current stable format.

### Issuance

```typescript
// Before (Wire 0.1, deprecated)
import { issueWire01 } from '@peac/protocol';
const jws = await issueWire01({ iss, aud, sub, iat, evidence, ... }, privateKey);

// After (Wire 0.2, current)
import { issue } from '@peac/protocol';
const jws = await issue({
  iss: 'https://example.com',   // canonical iss: https:// or did: only
  kind: 'evidence',             // 'evidence' or 'challenge'
  type: 'org.peacprotocol/commerce',
  pillars: ['commerce'],
  ext: { commerce: { ... } },   // typed extension groups
}, privateKey);
```

### Verification

```typescript
// Before (Wire 0.1, deprecated)
import { verifyReceipt } from '@peac/core';
const result = await verifyReceipt(jws, publicKey);

// After (Wire 0.2, current)
import { verifyLocal } from '@peac/protocol';
const result = await verifyLocal(jws, publicKey);
// result.verified: boolean
// result.claims: Wire02Claims (typed)
// result.warnings: VerificationWarning[]
// result.policy_binding?: 'verified' | 'failed' | 'unavailable'
```

### Key differences

| Aspect           | Wire 0.1           | Wire 0.2                                                              |
| ---------------- | ------------------ | --------------------------------------------------------------------- |
| JWS `typ` header | `peac-receipt/0.1` | `interaction-record+jwt`                                              |
| Structural kinds | None               | `evidence` or `challenge` (required)                                  |
| Semantic type    | Implicit           | Required, reverse-DNS or URI                                          |
| Pillars          | None               | Optional multi-valued, 10-pillar taxonomy                             |
| Extension groups | None               | 12 typed groups (commerce, access, identity, ...)                     |
| `iss` format     | Loose              | Canonical: `https://` or `did:` only                                  |
| Policy binding   | None               | JCS (RFC 8785) + SHA-256, 3-state result                              |
| JOSE hardening   | Basic              | Strict: embedded keys rejected, `crit` rejected, `b64:false` rejected |

## From `@peac/core` to `@peac/protocol`

`@peac/core` is deprecated (removal: v0.13.0). Migrate to the kernel-first packages.

### Import changes

```typescript
// Before
import { sign, verifyReceipt, WIRE_VERSION } from '@peac/core';

// After
import { issue, verifyLocal } from '@peac/protocol';
import { WIRE_01_JWS_TYP, WIRE_02_JWS_TYP } from '@peac/kernel';
import { generateKeypair, verify } from '@peac/crypto';
```

### Function mapping

| `@peac/core`      | Replacement                                | Package                    |
| ----------------- | ------------------------------------------ | -------------------------- |
| `sign()`          | `issue()`                                  | `@peac/protocol`           |
| `verifyReceipt()` | `verifyLocal()`                            | `@peac/protocol`           |
| `WIRE_VERSION`    | `WIRE_01_JWS_TYP` / `WIRE_02_JWS_TYP`      | `@peac/kernel`             |
| `enforce()`       | Use middleware: `@peac/middleware-express` | `@peac/middleware-express` |
| `discover()`      | `discoverIssuer()`                         | `@peac/disc`               |

## From legacy API `/verify` to `/api/v1/verify`

The legacy `/verify` endpoint is deprecated (Sunset: Nov 1, 2026). Migrate to `/api/v1/verify`.

### Request

```bash
# Before
curl -X POST https://api.example.com/verify \
  -H "Content-Type: application/json" \
  -d '{"receipt": "<jws>"}'

# After
curl -X POST https://api.example.com/api/v1/verify \
  -H "Content-Type: application/json" \
  -d '{"receipt": "<jws>"}'
```

### Response differences

| Aspect             | Legacy `/verify` | Current `/api/v1/verify`                            |
| ------------------ | ---------------- | --------------------------------------------------- |
| Error format       | Custom JSON      | RFC 9457 Problem Details                            |
| Rate limiting      | None             | `RateLimit-*` headers                               |
| Deprecation signal | None             | `Sunset` + `Deprecation` headers on legacy endpoint |

## From `@peac/sdk` to `@peac/protocol`

`@peac/sdk` is archived. Use `@peac/protocol` directly.

```typescript
// Before
import { PeacClient } from '@peac/sdk';
const client = new PeacClient();
const result = await client.verifyLocal(jws, publicKey);

// After
import { verifyLocal } from '@peac/protocol';
const result = await verifyLocal(jws, publicKey);
```

`@peac/protocol` re-exports all crypto utilities needed for a complete workflow: `generateKeypair`, `base64urlDecode`, `base64urlEncode`, `sha256Hex`, `verify`, `jwkToPublicKeyBytes`, `computeJwkThumbprint`.
