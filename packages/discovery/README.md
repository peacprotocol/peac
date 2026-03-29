# @peac/disc

PEAC issuer discovery: ABNF-compliant `.well-known/peac.txt` parser, generator, and remote fetcher.

## Installation

```bash
pnpm add @peac/disc
```

## What It Does

`@peac/disc` parses and generates `.well-known/peac.txt` discovery documents that allow verifiers to find an issuer's public keys and policy information. It enforces the normative 20-line limit, validates document structure against the ABNF grammar, and provides a convenience `discover()` function for remote resolution.

## How Do I Use It?

### Parse a discovery document

```typescript
import { parse, validate } from '@peac/disc';

const result = parse(`
version: peac/0.1
issuer: https://example.com
jwks: https://example.com/.well-known/jwks.json
`);

if (result.valid) {
  console.log(result.discovery.issuer); // 'https://example.com'
}
```

### Generate a discovery document

```typescript
import { emit } from '@peac/disc';

const txt = emit({
  version: 'peac/0.1',
  issuer: 'https://example.com',
  jwks_uri: 'https://example.com/.well-known/jwks.json',
});

// Serve at /.well-known/peac.txt
```

### Fetch and parse from a remote origin

```typescript
import { discover, WELL_KNOWN_PATH } from '@peac/disc';

const result = await discover('https://example.com');
if (result.valid) {
  console.log(result.discovery);
}

console.log(WELL_KNOWN_PATH); // '/.well-known/peac.txt'
```

## Integrates With

- `@peac/policy-kit`: Policy compilation generates `peac.txt` artifacts
- `@peac/protocol` (Layer 3): Issuer resolution during receipt verification
- `@peac/jwks-cache`: Fetches JWKS from the URI discovered via `peac.txt`

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
