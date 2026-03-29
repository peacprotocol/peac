# @peac/pref

AIPREF resolver with robots.txt bridge: resolves content-usage preferences from multiple sources with strict merge order.

## Installation

```bash
pnpm add @peac/pref
```

## What It Does

`@peac/pref` resolves AI content-usage preferences (AIPREF) for a given URI by checking multiple sources in priority order: request headers, AIPREF JSON, `peac.txt`, and `robots.txt`. It normalizes these signals into a unified `AIPrefPolicy` with a computed digest. The package also provides a `robotsToPeacStarter()` migration helper that converts `robots.txt` rules into a starter PEAC policy document.

## How Do I Use It?

### Resolve preferences for a URI

```typescript
import { resolveAIPref } from '@peac/pref';

const policy = await resolveAIPref('https://example.com/article');

console.log(policy.status); // 'active' | 'not_found' | 'error'
console.log(policy.snapshot); // { crawl: true, 'train-ai': false, commercial: false }
console.log(policy.source); // 'header' | 'aipref' | 'peac' | 'robots' | 'default'
```

### Use the PrefResolver class for repeated lookups

```typescript
import { PrefResolver } from '@peac/pref';

const resolver = new PrefResolver();
const policy = await resolver.resolve({
  uri: 'https://example.com/article',
  headers: { 'Content-Usage': 'no-train' },
});

console.log(policy.snapshot?.['train-ai']); // false
```

### Convert robots.txt to a starter PEAC policy

```typescript
import { robotsToPeacStarter } from '@peac/pref';

const result = robotsToPeacStarter(`
User-agent: GPTBot
Disallow: /

User-agent: *
Allow: /
`);

console.log(result.hasAiRestrictions); // true
console.log(result.policy.rules); // [{ name: 'deny-gptbot', decision: 'deny', ... }]
console.log(result.notes); // advisory notes about the conversion
```

## Integrates With

- `@peac/policy-kit`: Policy document types used by `robotsToPeacStarter()`
- `@peac/schema` (Layer 1): Content signal schemas and AIPREF version constants
- `@peac/consent`: Consent pillar for data-subject preference evidence

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
