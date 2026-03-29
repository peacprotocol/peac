# @peac/access

PEAC access pillar: reserved package for access-control evidence types and utilities.

## Installation

```bash
pnpm add @peac/access
```

## What It Does

`@peac/access` is a reserved pillar package for access-control evidence in the PEAC protocol. Access evidence records who was granted or denied access to a resource, under what conditions, and with what cryptographic proof. This package is currently a namespace placeholder; access-related schemas and typed extension groups are available today in `@peac/schema`.

## How Do I Use It?

Access evidence types and extension groups are available from `@peac/schema`:

### Use the access extension group

```typescript
import { getAccessExtension } from '@peac/schema';

const access = getAccessExtension(receipt.ext);
// { resource: 'https://api.example.com/data', granted: true, ... }
```

### Use access-related receipt types

```typescript
import { REGISTERED_RECEIPT_TYPES } from '@peac/kernel';

// Access pillar receipt type: 'org.peacprotocol/access'
```

### Issue access evidence with the protocol layer

```typescript
import { issueWire02 } from '@peac/protocol';

const receipt = await issueWire02({
  type: 'org.peacprotocol/access',
  kind: 'evidence',
  pillars: ['access'],
  // ...
});
```

## Integrates With

- `@peac/schema` (Layer 1): Access extension group schema and accessor (`getAccessExtension()`)
- `@peac/protocol` (Layer 3): Receipt issuance and verification
- `@peac/control` (Layer 3): Control engine for access constraints
- `@peac/mcp-server` (Layer 5): MCP tool server with access evidence

## For Agent Developers

If you are building an AI agent or MCP server that needs access evidence receipts:

- Start with [`@peac/mcp-server`](https://www.npmjs.com/package/@peac/mcp-server) for a ready-to-use MCP tool server
- Use `@peac/protocol` for programmatic receipt issuance and verification
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
