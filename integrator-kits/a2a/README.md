# PEAC Integration Kit: Agent-to-Agent Protocol (A2A)

Carry signed receipts across A2A agent flows: declare PEAC support in your Agent Card, attach receipts to task metadata, and extract/verify them on the receiving side.

## Overview

PEAC integrates with A2A at the metadata layer. Receipts travel as Evidence Carriers inside A2A TaskStatus metadata, declared in the Agent Card under the canonical extension URI `https://www.peacprotocol.org/ext/traceability/v1`. No A2A protocol changes are required; PEAC uses the standard metadata extension mechanism.

**Compatibility:** `@peac/mappings-a2a` targets A2A v1.0.0 only (shipped in v0.12.3; deprecated v0.3.0 compat shim removed in v0.13.0 per DD-186).

## Prerequisites

- Node.js >= 22.0.0
- `@peac/mappings-a2a`, `@peac/protocol`, `@peac/crypto`

```bash
pnpm add @peac/mappings-a2a @peac/protocol @peac/crypto
```

## Quick Start: Attach a Receipt to a Task

```typescript
import { generateKeypair } from '@peac/crypto';
import { issue } from '@peac/protocol';
import { attachReceiptToTaskStatus, type A2ATaskStatusLike } from '@peac/mappings-a2a';
import { computeReceiptRef } from '@peac/schema';

const { publicKey, privateKey } = await generateKeypair();

// Issue a receipt
const { jws } = await issue({
  iss: 'https://gateway.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/payment',
  extensions: {
    'org.peacprotocol/commerce': {
      payment_rail: 'stripe',
      amount_minor: '5000',
      currency: 'USD',
    },
  },
  privateKey,
  kid: 'gateway-key',
});

// Attach to A2A TaskStatus
const taskStatus: A2ATaskStatusLike = { state: 'completed', metadata: {} };
const ref = await computeReceiptRef(jws);
attachReceiptToTaskStatus(taskStatus, [{ receipt_ref: ref, receipt_jws: jws }]);
// taskStatus.metadata now contains the PEAC carrier
```

## Use Case 1: Gateway Issues Receipts per State Transition

A gateway agent issues one receipt per A2A task state transition (submitted, working, completed), building a verifiable chain.

See [examples/a2a-gateway-pattern](../../examples/a2a-gateway-pattern/) for the full runnable demo.

## Use Case 2: Consumer Extracts and Verifies Receipts

```typescript
import { extractReceiptFromTaskStatusAsync } from '@peac/mappings-a2a';
import { verifyLocal } from '@peac/protocol';

const extracted = await extractReceiptFromTaskStatusAsync(taskStatus);
if (extracted) {
  for (const carrier of extracted.receipts) {
    if (!carrier.receipt_jws) continue;
    const result = await verifyLocal(carrier.receipt_jws, publicKey);
    console.log(result.valid ? 'Verified' : `Failed: ${result.code}`);
  }
}
```

## Use Case 3: Declare PEAC in Your Agent Card

Add the PEAC extension to your A2A Agent Card so peers know you support receipts:

```json
{
  "name": "My Agent",
  "supportedInterfaces": [
    {
      "url": "https://agent.example.com",
      "protocolBinding": "http+json",
      "protocolVersion": "1.0"
    }
  ],
  "capabilities": {
    "extensions": [
      {
        "uri": "https://www.peacprotocol.org/ext/traceability/v1",
        "required": false,
        "description": "PEAC evidence receipts for verifiable interaction records"
      }
    ]
  }
}
```

Check for PEAC support: `hasPeacExtension(agentCard)` returns `true` if declared. The card MUST conform to A2A v1.0.0 shape (top-level `supportedInterfaces[]` array; the v0.3.0 top-level `url` field was removed in v0.13.0 per DD-186 and `normalizeAgentCard()` will reject cards lacking `supportedInterfaces[]`).

## Configuration

| Option        | Type     | Required | Description                                             |
| ------------- | -------- | -------- | ------------------------------------------------------- |
| `receipt_ref` | `string` | Yes      | SHA-256 hash of the compact JWS (`computeReceiptRef()`) |
| `receipt_jws` | `string` | Yes      | The compact JWS receipt                                 |
| `receipt_url` | `string` | No       | Optional HTTPS locator hint (not auto-fetched)          |

Transport size limit: 64 KB for MCP/A2A/UCP embed.

## Troubleshooting

**No receipts found after extraction:**
Verify the Agent Card declares the canonical extension URI `https://www.peacprotocol.org/ext/traceability/v1` under `capabilities.extensions[]` (not the bare reverse-DNS prefix `org.peacprotocol`, which is not the extension URI). Check `hasPeacExtension()` on the normalized agent card.

**Receipt ref mismatch:**
The `receipt_ref` must equal `sha256(receipt_jws)`. Use `computeReceiptRef()` from `@peac/schema`.

**Verification fails with E_ISS_NOT_CANONICAL:**
The `iss` field must be `https://` (ASCII, RFC 3986) or `did:` (DID Core). No other schemes are accepted.

## Next Steps

- [Agent Identity](../../examples/agent-identity/) for ActorBinding and proof types
- [Workflow Correlation](../../examples/workflow-correlation/) for multi-step DAG linking
- [Evidence Carrier Contract](../../docs/specs/EVIDENCE-CARRIER-CONTRACT.md) for transport details
- [A2A Protocol](https://a2a-protocol.org) for the upstream specification
