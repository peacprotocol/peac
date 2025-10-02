# @peac/parsers-universal

Universal policy parser with P0 format support and deny-safe precedence merging.

## Overview

The Universal Parser orchestrates discovery and parsing of AI policy documents across multiple standard formats. It implements priority-based execution with deny-safe merging, ensuring that any explicit deny from any source overrides allows from lower-priority sources.

## Supported Formats (P0)

| Format            | Priority | Spec                                                                  | Notes                             |
| ----------------- | -------- | --------------------------------------------------------------------- | --------------------------------- |
| agent-permissions | 100      | [CIP-4](https://github.com/ai-content-id/specs)                       | Per-agent crawl/train permissions |
| AIPREF            | 80       | [AIPREF](https://aipref.org)                                          | Preference-based AI policy        |
| ai.txt            | 60       | [ai.txt](https://site.spawning.ai/spawning-ai-txt)                    | OpenAI/Google AI crawler control  |
| peac.txt          | 50       | PEAC Protocol                                                         | PEAC discovery document           |
| robots.txt        | 40       | [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html)               | Traditional crawler directives    |
| ACP               | 10       | [Augmentation Consent Protocol](https://github.com/ai-robots-txt/acp) | Training consent signals          |

## Usage

```typescript
import { UniversalParser } from '@peac/parsers-universal';

const parser = new UniversalParser();
const policy = await parser.parseAll('https://example.com');

console.log(policy);
// {
//   origin: 'https://example.com',
//   agents: {
//     GPTBot: { crawl: false, train: false }
//   },
//   globalCrawl: false,
//   globalTrain: false,
//   sources: ['agent-permissions', 'aipref']
// }
```

## Precedence and Deny-Safe Merging

The parser executes formats in priority order (highest first). Policies are merged using deny-safe logic:

1. **Any deny wins**: If any source denies an action, the final policy denies it.
2. **All allow required**: Allow only if no source denies and at least one allows.
3. **Priority order**: Higher priority denies override lower priority allows.

### Examples

#### Example 1: High-priority deny wins

```typescript
// agent-permissions (priority 100): deny
// AIPREF (priority 80): allow
// Result: deny (higher priority wins)
```

#### Example 2: All sources allow

```typescript
// agent-permissions (priority 100): allow
// AIPREF (priority 80): allow
// ai.txt (priority 60): allow
// Result: allow (no denies present)
```

#### Example 3: Mixed signals

```typescript
// agent-permissions (priority 100): allow crawl, deny train
// AIPREF (priority 80): allow crawl, allow train
// Result: allow crawl (no deny), deny train (any deny wins)
```

## SSRF Protection

All parsers use `@peac/safe-fetch` with comprehensive SSRF blocking:

- **Blocked schemes**: `file:`, `data:`, `ftp:`, `gopher:`, `javascript:`, `mailto:`, `chrome:`, `about:`, `ws:`, `wss:`, `ssh:`, `tel:`
- **Blocked IPv4 ranges**: 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10 (CGNAT), 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.0.0.0/24, 192.0.2.0/24, 192.168.0.0/16, 198.18.0.0/15, 198.51.100.0/24, 203.0.113.0/24, 224.0.0.0/4 (multicast), 240.0.0.0/4 (reserved)
- **Blocked IPv6 ranges**: ::1, ::, ::ffff:0:0/96 (v4-mapped), fc00::/7 (ULA), fe80::/10 (link-local), 2001:db8::/32 (docs), ff00::/8 (multicast)

## Edge Runtime Behavior

### Cloudflare Workers

- **DNS Resolution**: CF Workers resolve DNS before fetch; SSRF protection relies on hostname/IP checks
- **Egress**: Outbound requests subject to CF egress rules; may block certain IPs regardless of safe-fetch
- **Timeout**: Default 30s CPU time limit; set `PEAC_DISCOVERY_TIMEOUT_MS` to 3000 for safety

### Vercel Edge Functions

- **DNS Rebinding**: Edge runtime resolves DNS per request; hostname checks may miss time-of-check-time-of-use attacks
- **Fetch Sandboxing**: Vercel Edge restricts `file:` and other local schemes at runtime level
- **Concurrency**: Edge functions handle concurrent parser execution efficiently; no special handling needed

### Bun

- **Native fetch**: Bun uses native HTTP implementation; SSRF checks apply before request
- **DNS caching**: Bun caches DNS lookups; safe-fetch re-validates on each call
- **Performance**: Typically 2-3x faster than Node.js for parallel parser execution

### Deno

- **Permissions**: Deno requires `--allow-net` flag for network access
- **Fetch API**: Standards-compliant; SSRF checks integrate seamlessly
- **Security**: Deno's permission model provides additional SSRF defense layer

### Recommendation

For production edge deployments:

1. Use `PEAC_DISCOVERY_TIMEOUT_MS=3000` to prevent runaway requests
2. Set `PEAC_DISCOVERY_MAX_REDIRECTS=3` to limit redirect chains
3. Monitor SSRF block count via `getSSRFBlockCount()` from `@peac/safe-fetch`
4. Test cross-runtime with golden determinism suite: `tests/determinism/parsers.golden.test.js`

## Environment Variables

Configure discovery behavior via environment variables:

| Variable                       | Default                 | Description                         |
| ------------------------------ | ----------------------- | ----------------------------------- |
| `PEAC_DISCOVERY_TIMEOUT_MS`    | 3000                    | HTTP request timeout (milliseconds) |
| `PEAC_DISCOVERY_MAX_REDIRECTS` | 3                       | Maximum redirect follow count       |
| `PEAC_DISCOVERY_MAX_BYTES`     | 1048576                 | Maximum response size (1MB)         |
| `PEAC_DISCOVERY_USER_AGENT`    | `peac-discovery/0.9.15` | User-Agent header                   |

## Testing

```bash
pnpm test
```

Test suites:

- `tests/determinism.test.js`: Order-independent merging (100 iterations)
- `tests/precedence.test.js`: Deny-safe merge validation

## Integration

Wire into core enforcement:

```typescript
import { discoverPolicy, discoverAndEnforce } from '@peac/core';

// Discover all policies and compute policy_hash
const result = await discoverPolicy('https://example.com');
console.log(result.policy_hash); // SHA-256 base64url

// Enforce specific agent action
const enforcement = await discoverAndEnforce('https://example.com', 'GPTBot', 'train');
console.log(enforcement.allowed); // false
console.log(enforcement.reason); // "Agent GPTBot explicitly denied for train"
```

## Architecture

```
UniversalParser
├── getDefaultParsers() → [Parser]
├── parseAll(origin, fetcher) → UnifiedPolicy
└── mergePartial(accumulator, partial) → UnifiedPolicy (deny-safe)

Parser Interface
├── name: string
├── priority: number
├── test(url: URL) → Promise<boolean>
└── parse(url: URL, fetcher) → Promise<PartialPolicy | null>
```

## License

Apache-2.0
