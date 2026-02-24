# @peac/mappings-content-signals

Content use policy signal parsing for PEAC Protocol.

Parses signals from multiple sources and resolves them using priority precedence (DD-137). Signals record observations; they never enforce (DD-136, DD-95).

## Supported Sources

| Source        | Standard                                                                              | Priority |
| ------------- | ------------------------------------------------------------------------------------- | -------- |
| tdmrep.json   | EU Directive 2019/790, Art. 4                                                         | Highest  |
| Content-Usage | AIPREF attach draft (draft-ietf-aipref-attach-04), vocab (draft-ietf-aipref-vocab-03) | 2        |
| robots.txt    | RFC 9309                                                                              | Lowest   |

Content-Signal header support is reserved for a future version.

### Scope (v0.11.2)

This package provides **header and file parsing only**. Each parser receives pre-fetched content as a string; there is no network I/O. The Content-Usage parser handles the HTTP header exclusively; it does not parse robots.txt directives or any other signal source.

## Usage

```typescript
import { createObservation } from '@peac/mappings-content-signals';

const observation = createObservation({
  target_uri: 'https://example.com/article',
  robots_txt: robotsTxtContent,
  tdmrep_json: tdmrepContent,
  content_usage: 'train-ai=n, search=y',
});

for (const signal of observation.signals) {
  console.log(`${signal.purpose}: ${signal.decision} (from ${signal.source})`);
}
```

### Detailed Content-Usage Parse Result

The `parseContentUsage()` function returns a structured result preserving all parse pipeline stages:

```typescript
import { parseContentUsage } from '@peac/mappings-content-signals';

const result = parseContentUsage('train-ai=n, search=y, x-custom=y');

result.raw; // original header string
result.parsed; // all SF Dictionary members (SfDictionaryMember[])
result.entries; // mapped ContentSignalEntry[] for known AIPREF keys
result.extensions; // unrecognized dictionary members (forward-compatible)
```

## Content-Usage Parsing (AIPREF)

The Content-Usage header is parsed as an RFC 9651 Structured Fields Dictionary with AIPREF vocabulary keys:

| AIPREF Key    | PEAC Purpose    | Role           | Values              |
| ------------- | --------------- | -------------- | ------------------- |
| `bots`        | (parent only)   | Hierarchy root | `y`=allow, `n`=deny |
| `train-ai`    | `ai-training`   | Leaf           | `y`=allow, `n`=deny |
| `train-genai` | `ai-generative` | Leaf           | `y`=allow, `n`=deny |
| `search`      | `ai-search`     | Leaf           | `y`=allow, `n`=deny |

`bots` is a parent-only key used for hierarchy propagation (Section 5.2 of vocab-03). It does not produce its own output entry; its preference propagates to child keys when they have no explicit value.

Values are SF Tokens (not Booleans). Bare keys (`train-ai` without `=y`/`=n`), String values (`"n"`), and Boolean values (`?1`/`?0`) all produce `unspecified`.

Hierarchy propagation: `bots` -> `train-ai` -> `train-genai`, `bots` -> `search`. When a child key has no explicit preference, it inherits from its parent.

Unknown dictionary keys are stored in `extensions` (never dropped), enabling forward-compatible parsing as the AIPREF vocabulary evolves.

## Design Principles

1. **Observation only**: signals record what was observed, never enforce policy
2. **No fetch**: all parsers receive pre-fetched content; callers handle SSRF-safe fetching
3. **Three-state**: each purpose resolves to `allow`, `deny`, or `unspecified`
4. **EU TDM ready**: includes tdmrep.json parser for EU AI Act compliance
5. **Forward-compatible**: unknown Content-Usage keys are preserved as extensions

## License

Apache-2.0
