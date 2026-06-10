# MCP Tool Call Example

Demonstrates MCP (Model Context Protocol) tool integration with PEAC records using the `_meta` Evidence Carrier Contract.

## What This Shows

1. **Record issuance**: the server issues a signed record for a paid tool call
2. **Carrier attachment**: the record travels in top-level MCP `_meta` keys (`org.peacprotocol/receipt_ref` + `org.peacprotocol/receipt_jws`)
3. **Offline verification**: the client extracts the carrier, checks `receipt_ref` consistency, and verifies the Ed25519 signature with the issuer public key
4. **Tamper detection**: a modified carrier fails the `receipt_ref` consistency check; a modified payload fails signature verification (`E_INVALID_SIGNATURE`)

## Running the Demo

```bash
pnpm demo
```

## Key Concepts

### Carrier Attachment

The record is attached to the MCP tool result via top-level `_meta`:

```typescript
import { computeReceiptRef } from '@peac/schema';
import { attachReceiptToMeta } from '@peac/mappings-mcp';

const receipt_ref = await computeReceiptRef(jws);
const response = attachReceiptToMeta(
  { content, structuredContent },
  { receipt_ref, receipt_jws: jws }
);
```

### Extraction and Verification

```typescript
import { extractReceiptFromMetaAsync } from '@peac/mappings-mcp';
import { verifyLocal } from '@peac/protocol';

const extracted = await extractReceiptFromMetaAsync(response);
// extracted.violations is non-empty if receipt_ref does not match the JWS

const result = await verifyLocal(extracted.receipts[0].receipt_jws, publicKey, {
  issuer: 'https://mcp-provider.example.com',
});
```

The record uses the integrator-defined type URI `org.peacprotocol/mcp-tool-call`; verification surfaces an informational `type_unregistered` warning for type values outside the registry.

## Files

- `demo.ts` - Main demonstration script
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
