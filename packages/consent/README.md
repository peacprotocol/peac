# @peac/consent

PEAC consent pillar: reserved package for consent evidence types and data-subject preference tracking.

## Installation

```bash
pnpm add @peac/consent
```

## What It Does

`@peac/consent` is a reserved pillar package for consent evidence in the PEAC protocol. Consent evidence records that a data subject granted, denied, or withdrew consent for a specific purpose, with cryptographic proof of the decision. This package is currently a namespace placeholder; consent-related schemas and typed extension groups are available today in `@peac/schema`.

## How Do I Use It?

Consent evidence types and extension groups are available from `@peac/schema`:

### Use the consent extension group

```typescript
import { getConsentExtension } from '@peac/schema';

const consent = getConsentExtension(receipt.ext);
// { purpose: 'training', granted: true, basis: 'explicit', ... }
```

### Use consent-related receipt types

```typescript
import { REGISTERED_RECEIPT_TYPES } from '@peac/kernel';

// Consent pillar receipt type: 'org.peacprotocol/consent'
```

### Issue consent evidence with the protocol layer

```typescript
import { issueWire02 } from '@peac/protocol';

const receipt = await issueWire02({
  type: 'org.peacprotocol/consent',
  kind: 'evidence',
  pillars: ['consent'],
  // ...
});
```

## Integrates With

- `@peac/schema` (Layer 1): Consent extension group schema and accessor (`getConsentExtension()`)
- `@peac/protocol` (Layer 3): Receipt issuance and verification
- `@peac/pref`: AIPREF resolver for content-usage preferences (related signal source)
- `@peac/kernel` (Layer 0): Consent pillar constants and error codes

## For Agent Developers

If you are building an AI agent or MCP server that needs consent evidence receipts:

- Start with [`@peac/mcp-server`](https://www.npmjs.com/package/@peac/mcp-server) for a ready-to-use MCP tool server
- Use `@peac/protocol` for programmatic receipt issuance and verification
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
