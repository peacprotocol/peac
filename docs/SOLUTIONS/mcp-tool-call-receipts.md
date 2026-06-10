# MCP tool-call records

> **Outcome:** Your MCP server emits a signed record for every tool call so downstream agents, auditors, or counterparties can verify what tool ran, what arguments were used, and what the result was — offline, with just your public key.
>
> **Audience:** MCP server operator.
>
> **Time:** About 5 minutes from a clean clone.

## The problem

An MCP server hosts tools that agents call. When the tool executes, the MCP client has local state for the call; another party in the chain has nothing. For paid tools, audit-relevant tools, or tools that produce durable artifacts, a portable signed record of the call is the only way to carry provenance across boundaries.

PEAC attaches a signed record to the MCP tool-call response via the `_meta` carrier keys `org.peacprotocol/receipt_jws` and `org.peacprotocol/receipt_ref` (up to 64 KiB embed per the Evidence Carrier Contract).

## What you'll use

PEAC packages:

- `@peac/mcp-server` — MCP server with built-in record tools (`peac_verify`, `peac_inspect`, `peac_decode`, `peac_issue`, `peac_create_bundle`).
- `@peac/mappings-mcp` — MCP `_meta` carrier mapping.
- `@peac/protocol` — issuance and offline verification.
- `@peac/crypto` — Ed25519 signing.

Prerequisites: Node 22+, pnpm 8+. An MCP client to call the server (the shipped examples use the MCP SDK stdio transport).

## Type URI used in this recipe

`org.peacprotocol/mcp-tool-call` is an example custom type URI used by the MCP recipe. It is not a registered PEAC extension group or registered receipt type. The reference public verifier (`@peac/protocol.verifyLocal()`) emits a `type_unregistered` warning for unregistered type values, which downstream policy logic may treat as informational. Operators who want a registered MCP-specific receipt type should propose a dedicated PEAC profile and registry entry before relying on it as a registered type.

## Step-by-step

1. Install dependencies:

   ```bash
   pnpm add @peac/mcp-server @peac/mappings-mcp @peac/protocol @peac/crypto
   ```

2. Start the server for local exploration:

   ```bash
   npx -y @peac/mcp-server --help
   ```

3. Attach a record to a tool response from your own server. The mapping helper writes the record into `_meta` per the Evidence Carrier Contract:

   ```typescript
   import { issue } from '@peac/protocol';
   import { computeReceiptRef } from '@peac/schema';
   import { attachReceiptToMeta } from '@peac/mappings-mcp';

   async function handleToolCall(toolName, args, ctx) {
     const result = await runTool(toolName, args);

     // Minimal record: issuer, kind, type, and signature. For production
     // tool-call facts (tool name, argument digests), use a registered
     // extension group via the `extensions` option rather than ad-hoc
     // fields; never include raw arguments or secrets in a record.
     const { jws } = await issue({
       iss: 'https://mcp.example.com',
       kind: 'evidence',
       type: 'org.peacprotocol/mcp-tool-call',
       pillars: ['attribution'],
       privateKey: ctx.privateKey,
       kid: ctx.kid,
     });

     // receipt_ref is sha256(receipt_jws); attachReceiptToMeta writes both
     // into top-level _meta under the org.peacprotocol/ carrier keys,
     // preserving the rest of the MCP result untouched.
     const receipt_ref = await computeReceiptRef(jws);

     return attachReceiptToMeta(
       {
         content: result.content,
         structuredContent: result.structuredContent,
         isError: result.isError,
       },
       { receipt_ref, receipt_jws: jws }
     );
   }
   ```

   The runnable example is the source of truth for exact imports and execution: see [`examples/mcp-tool-call/`](../../examples/mcp-tool-call/).

4. Verify the record from the MCP client:

   ```typescript
   import { extractReceiptFromMetaAsync } from '@peac/mappings-mcp';
   import { verifyLocal } from '@peac/protocol';

   // extractReceiptFromMetaAsync also checks receipt_ref == sha256(receipt_jws).
   const extracted = await extractReceiptFromMetaAsync(response);
   const carrier = extracted?.receipts[0];
   if (!carrier?.receipt_jws) throw new Error('no PEAC receipt in _meta');

   const result = await verifyLocal(carrier.receipt_jws, publicKey, {
     issuer: 'https://mcp.example.com',
   });
   console.log(result.valid, result.claims?.type, result.claims?.kind);
   ```

5. Explore a runnable example:

   ```bash
   pnpm install && pnpm build
   cd examples/mcp-tool-call && pnpm demo
   ```

## Evidence of output

A tool-call response carrying a PEAC record looks like this (MCP content + `_meta`):

```json
{
  "content": [{ "type": "text", "text": "Tool executed. Result attached." }],
  "_meta": {
    "org.peacprotocol/receipt_jws": "eyJhbGciOiJFZERTQSIsInR5cCI6ImludGVyYWN0aW9uLXJlY29yZCtqd3QifQ...",
    "org.peacprotocol/receipt_ref": "sha256:abcd..."
  }
}
```

Decoded, the record carries the `kind: evidence` / `type: org.peacprotocol/mcp-tool-call` shape. Production deployments can add tool-call facts (tool name, argument digests) through a registered extension group via the `extensions` option; see the runnable example for an extension-carrying record. The MCP server ran the tool; PEAC recorded what happened.

## Validated with

```bash
pnpm install && pnpm build
pnpm --filter @peac/mcp-server test
pnpm --filter @peac/mappings-mcp test
pnpm --filter @peac/example-mcp-tool-call demo
```

The MCP server and mapping test suites cover the `_meta` carrier path; `examples/mcp-tool-call` exercises the paid-tool flow end-to-end.

## Where to go from here

- [MCP composition with PEAC records](mcp-composition.md) — composition guide covering MCP auth observations, conformance discipline, schema evolution, deprecated MCP surfaces, and the PEAC-vs-MCP boundary.
- [MCP Integration Kit](../../integrator-kits/mcp/README.md) — full MCP setup guide.
- [`packages/mcp-server/`](../../packages/mcp-server/) — server reference (5 MCP record tools).
- [`packages/mappings/mcp/`](../../packages/mappings/mcp/) — `_meta` carrier mapping reference.
- [`docs/specs/EVIDENCE-CARRIER-CONTRACT.md`](../specs/EVIDENCE-CARRIER-CONTRACT.md) — MCP / A2A / UCP carrier budgets and key names.
- [`docs/compatibility/COMPATIBILITY_MATRIX.md`](../COMPATIBILITY_MATRIX.md) — Adapter Readiness for `@peac/mcp-server` and `@peac/mappings-mcp`.
