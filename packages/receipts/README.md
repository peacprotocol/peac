# @peac/receipts

PEAC receipt builders, parsers, and validators with JSON and CBOR content negotiation.

## Installation

```bash
pnpm add @peac/receipts
```

## What It Does

`@peac/receipts` provides a fluent `ReceiptBuilder` for constructing valid PEAC receipts, validation functions for conditional field enforcement (such as payment fields for HTTP 402), and content negotiation support for JSON and CBOR serialization. It operates on the receipt payload structure before signing.

## How Do I Use It?

### Build a receipt with the fluent builder

```typescript
import { ReceiptBuilder } from '@peac/receipts';

const receipt = new ReceiptBuilder()
  .subject('https://example.com/article/123')
  .versions('0.9.14', '0.9.14', '0.9')
  .aipref('allowed')
  .purpose('inference')
  .enforcement('none')
  .crawlerType('agent')
  .kid('key-2026-03')
  .build();
```

### Validate conditional fields

```typescript
import { validateConditionalFields } from '@peac/receipts';

const result = validateConditionalFields(receipt);
if (!result.valid) {
  for (const err of result.errors) {
    console.log(`${err.path}: ${err.message}`);
  }
}
```

### Content negotiation

```typescript
import type { ContentNegotiation, ContentType } from '@peac/receipts';

const negotiation: ContentNegotiation = {
  contentType: 'application/cbor' as ContentType,
  profile: 'https://peacprotocol.org/profiles/commerce',
};
```

## Integrates With

- `@peac/kernel` (Layer 0): Wire format constants and type definitions
- `@peac/schema` (Layer 1): Zod-based receipt claim validation
- `@peac/crypto` (Layer 2): JWS signing of built receipts
- `@peac/protocol` (Layer 3): High-level issuance and verification API

## For Agent Developers

If you are building an AI agent or MCP server that needs evidence receipts:

- Start with [`@peac/mcp-server`](https://www.npmjs.com/package/@peac/mcp-server) for a ready-to-use MCP tool server
- Use `@peac/protocol` for programmatic receipt issuance and verification
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
