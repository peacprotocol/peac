# @peac/compliance

PEAC compliance pillar: reserved package for compliance and governance evidence types.

## Installation

```bash
pnpm add @peac/compliance
```

## What It Does

`@peac/compliance` is a reserved pillar package for compliance and governance evidence in the PEAC protocol. Compliance evidence records that an interaction was evaluated against a governance framework (such as ISO 42001 or NIST AI RMF) and what the outcome was. This package is currently a namespace placeholder; compliance-related schemas and typed extension groups are available today in `@peac/schema`.

## How Do I Use It?

Compliance evidence types and extension groups are available from `@peac/schema`:

### Use the compliance extension group

```typescript
import { getComplianceExtension } from '@peac/schema';

const compliance = getComplianceExtension(receipt.ext);
// { framework: 'iso-42001', control_ref: 'A.5.2', status: 'passed', ... }
```

### Use compliance-related receipt types

```typescript
import { REGISTERED_RECEIPT_TYPES } from '@peac/kernel';

// Compliance pillar receipt type: 'org.peacprotocol/compliance'
```

### Issue compliance evidence with the protocol layer

```typescript
import { issueWire02 } from '@peac/protocol';

const receipt = await issueWire02({
  type: 'org.peacprotocol/compliance',
  kind: 'evidence',
  pillars: ['compliance'],
  // ...
});
```

## Integrates With

- `@peac/schema` (Layer 1): Compliance extension group schema and accessor (`getComplianceExtension()`)
- `@peac/protocol` (Layer 3): Receipt issuance and verification
- `@peac/kernel` (Layer 0): Compliance pillar constants and error codes

## For Agent Developers

If you are building an AI agent or MCP server that needs compliance evidence receipts:

- Start with [`@peac/mcp-server`](https://www.npmjs.com/package/@peac/mcp-server) for a ready-to-use MCP tool server
- Use `@peac/protocol` for programmatic receipt issuance and verification
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
