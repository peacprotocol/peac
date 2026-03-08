# PEAC Protocol Agent Context

## Overview

PEAC Protocol provides cryptographically signed, offline-verifiable receipts for automated interactions. Wire format: `peac-receipt/0.1` (frozen). Signing: Ed25519 (EdDSA).

## Package Layering

```text
Layer 0: @peac/kernel   (types, constants, errors)
Layer 1: @peac/schema   (Zod schemas, validation)
Layer 2: @peac/crypto   (signing, verification)
Layer 3: @peac/protocol (high-level APIs: issue, verify)
Layer 4: @peac/mappings-*, @peac/adapter-* (protocol adapters)
Layer 5: @peac/cli, @peac/mcp-server (applications)
```

Dependencies flow down only.

## Key APIs

```typescript
// Issue a receipt
import { issue, verifyLocal } from '@peac/protocol';
import { generateKeypair } from '@peac/crypto';

const { publicKey, privateKey } = await generateKeypair();
const { jws } = await issue({ iss, kind: 'evidence', type, pillars, extensions, privateKey, kid });
const result = await verifyLocal(jws, publicKey);
```

## MCP Tools

| Tool                 | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `peac_verify`        | Verify receipt signature and claims       |
| `peac_inspect`       | Inspect receipt without full verification |
| `peac_decode`        | Decode raw JWS structure                  |
| `peac_issue`         | Issue a signed receipt (requires key)     |
| `peac_create_bundle` | Create evidence bundle                    |

## Rules

- Always verify before trusting receipt claims
- Use `receipt_ref` (`sha256:<hex64>`) for references
- Wire format `peac-receipt/0.1` is frozen
- PEAC records evidence; it does not enforce behavior
