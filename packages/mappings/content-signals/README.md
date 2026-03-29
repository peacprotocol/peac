# @peac/mappings-content-signals

Content use policy signal parsing for PEAC: maps robots.txt, tdmrep.json, and Content-Usage (AIPREF) headers to observable content signals with source precedence resolution.

## Installation

```bash
pnpm add @peac/mappings-content-signals
```

## What It Does

`@peac/mappings-content-signals` parses content use policy signals from multiple sources and resolves them using a defined source precedence chain: `tdmrep.json` > `Content-Usage` header (AIPREF) > `robots.txt`. Signals record observations, never enforce; every signal has a three-state decision of `allow`, `deny`, or `unspecified`. All parsers receive pre-fetched content and perform no network I/O.

## How Do I Use It?

### Create a complete observation from all available sources

```typescript
import { createObservation } from '@peac/mappings-content-signals';

const observation = createObservation({
  target_uri: 'https://example.com/article',
  robots_txt: 'User-agent: GPTBot\nDisallow: /',
  content_usage: 'train-ai=n, search=y',
  tdmrep_json: JSON.stringify({ 'tdm-reservation': 0 }),
});

for (const signal of observation.signals) {
  console.log(`${signal.purpose}: ${signal.decision} (from ${signal.source})`);
}

console.log(observation.sources_checked);
// ['tdmrep-json', 'content-usage-header', 'robots-txt']
```

### Parse robots.txt for AI-relevant signals

```typescript
import { parseRobotsTxt } from '@peac/mappings-content-signals';

const entries = parseRobotsTxt('User-agent: GPTBot\nDisallow: /\n');
for (const entry of entries) {
  console.log(entry.purpose, entry.decision);
  // 'ai-training' 'deny'
  // 'ai-inference' 'deny'
}
```

### Parse a Content-Usage header (AIPREF)

```typescript
import { parseContentUsage } from '@peac/mappings-content-signals';

const result = parseContentUsage('train-ai=n, search=y');
for (const entry of result.entries) {
  console.log(entry.purpose, entry.decision);
  // 'ai-training' 'deny'
  // 'ai-search' 'allow'
}
// Unrecognized keys are preserved as extensions
console.log(result.extensions);
```

### Resolve signals from multiple sources using precedence

```typescript
import {
  parseRobotsTxt,
  parseContentUsage,
  resolveSignals,
  getDecisionForPurpose,
} from '@peac/mappings-content-signals';

const robotsEntries = parseRobotsTxt('User-agent: GPTBot\nDisallow: /');
const aiprefResult = parseContentUsage('train-ai=y');

const resolved = resolveSignals([...robotsEntries, ...aiprefResult.entries]);

// Content-Usage has higher precedence than robots.txt
const decision = getDecisionForPurpose(resolved, 'ai-training');
console.log(decision); // 'allow' (Content-Usage wins over robots.txt)
```

### Parse tdmrep.json for EU TDM reservation signals

```typescript
import { parseTdmrep } from '@peac/mappings-content-signals';

const entries = parseTdmrep(JSON.stringify({ 'tdm-reservation': 1 }));
for (const entry of entries) {
  console.log(entry.purpose, entry.decision);
  // 'tdm' 'deny'
  // 'ai-training' 'deny'
}
```

## Integrates With

- `@peac/kernel` (Layer 0): Content signal types and purpose tokens
- `@peac/schema` (Layer 1): Signal schema validation
- `@peac/protocol` (Layer 3): Receipt issuance with content signal evidence

## For Agent Developers

If you are building an AI agent that needs to observe and record content use policies:

- Use `createObservation()` for a one-call workflow that parses all available sources and resolves precedence automatically
- Use individual parsers (`parseRobotsTxt`, `parseTdmrep`, `parseContentUsage`) when you need fine-grained control
- Use `resolveSignals()` to combine entries from multiple sources; the highest-priority source with a definitive signal wins
- Use `getDecisionForPurpose()` to query the resolved decision for a specific purpose such as `ai-training` or `ai-search`
- All functions accept pre-fetched content; the package performs no network I/O

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
