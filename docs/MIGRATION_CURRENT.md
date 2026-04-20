# Migration Guide

This guide covers migration paths for current PEAC Protocol surfaces.

## Documentation reorganization (v0.12.12)

The documentation surface has been reorganized around five new operator-facing docs and a curated solutions library. If you previously linked to sections of the monolithic developer guide, the following map applies:

- The **role-based entry point** is now [`docs/START_HERE.md`](START_HERE.md). It is the single top-level job selector; the README points to it first.
- **How PEAC works** (the publish / issue / verify / share loop and the distinction between the compact JWS `receipt`, the JOSE `typ`, and the HTTP body) is now at [`docs/HOW-IT-WORKS.md`](HOW-IT-WORKS.md).
- **The artifact taxonomy** (record, receipt, evidence, bundle, report) is now at [`docs/ARTIFACTS.md`](ARTIFACTS.md). These nouns each have one specific meaning; mixing them up loses information.
- **Where PEAC sits next to adjacent systems** (logs / traces / OpenTelemetry, runtime governance, payment rails, identity, native runtime attestations) is now at [`docs/WHERE-IT-FITS.md`](WHERE-IT-FITS.md).
- **Protocol scope and boundary** are summarized at [`docs/WHAT-PEAC-STANDARDIZES.md`](WHAT-PEAC-STANDARDIZES.md).
- **Outcome-led recipes** live under [`docs/SOLUTIONS/`](SOLUTIONS/): runtime evidence export, API receipt issuance, MCP tool-call receipts, commerce evidence bundle, and regulatory audit trail.
- **Self-host deployment recipes** for the reference verifier live under [`surfaces/reference-verifier/`](../surfaces/reference-verifier/): Dockerfile, docker-compose, a Cloudflare Worker variant, and a smoke script.

The long-form developer guide at [`docs/README_LONG.md`](README_LONG.md) is retained as the deep package catalog for contributors. It is no longer the recommended starting point for first-time readers.

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

## From legacy API `/verify` to `/v1/verify`

The legacy `/verify` endpoint is deprecated (Sunset: Nov 1, 2026). Migrate to the canonical `/v1/verify`. The `/api/v1/verify` path remains wired as a deprecated alias and resolves to the same handler; new code should use `/v1/verify`, which is the path documented in [`packages/schema/openapi/verify.yaml`](../packages/schema/openapi/verify.yaml) and [`docs/HOSTED_VERIFY_CONTRACT.md`](HOSTED_VERIFY_CONTRACT.md).

### Request

```bash
# Before
curl -X POST https://api.example.com/verify \
  -H "Content-Type: application/json" \
  -d '{"receipt": "<jws>"}'

# After (canonical)
curl -X POST https://api.example.com/v1/verify \
  -H "Content-Type: application/json" \
  -d '{"receipt": "<jws>"}'
```

### Response differences

| Aspect             | Legacy `/verify` | Current `/v1/verify`                                |
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
