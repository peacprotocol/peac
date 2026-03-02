# Content Signals Observation Example

Demonstrates the PEAC content signal observation model: parse robots.txt, Content-Usage headers (AIPREF, Structured Fields Dictionary per RFC 9651), and tdmrep.json (EU TDM Directive 2019/790), resolve conflicts by source precedence, and issue a receipt with the observation attached via `ext[]`.

## Quick Start

```bash
pnpm install
pnpm demo
```

## What It Does

1. **Parses** content signals from three sources (pre-fetched, no network I/O per DD-55)
2. **Resolves** conflicts using DD-137 source precedence
3. **Issues** a PEAC receipt with the observation attached via `ext["org.peacprotocol/content_signal"]` (example extension key; not yet registered in registries.json)
4. **Verifies** the receipt offline and confirms the observation is present in ext[]

## Three-State Model (DD-136)

Each content purpose resolves to one of three states:

| State         | Meaning                              |
| ------------- | ------------------------------------ |
| `allow`       | Source explicitly permits this use   |
| `deny`        | Source explicitly prohibits this use |
| `unspecified` | No signal found for this use         |

Signals record observations. They never enforce policy.

## Source Precedence (DD-137)

When multiple sources have signals for the same purpose, the highest-priority source wins:

1. `tdmrep.json` (highest; EU TDM Directive 2019/790, Art. 4)
2. `Content-Signal` header (reserved for future implementation)
3. `Content-Usage` header (AIPREF; Structured Fields Dictionary per RFC 9651, token values)
4. `robots.txt` (lowest; RFC 9309)

Three of four sources are implemented in `@peac/mappings-content-signals` v0.11.3.

## Signal Sources

### Content-Usage (AIPREF)

The `Content-Usage` header is a Structured Fields Dictionary (RFC 9651). Values are tokens per the AIPREF vocabulary: `y` (allow), `n` (deny). Example: `Content-Usage: train-ai=n, search=y`.

### tdmrep.json (EU TDM Directive)

The parser supports the single-object (site-wide) form:

- `{"tdm-reservation": 0, "tdm-policy": "https://..."}`

The W3C spec also defines an array form for path-specific rules (`[{"location": "/articles", "tdm-reservation": 1}]`); array support is reserved for future implementation.

Values: `tdm-reservation: 0` (allow TDM), `tdm-reservation: 1` (deny TDM).

### robots.txt

Parsed per RFC 9309. AI-relevant user-agents (GPTBot, ClaudeBot, etc.) are mapped to content purposes.

## References

- [Content Signals Mapping](../../packages/mappings/content-signals/README.md)
- [PEAC Protocol](https://www.peacprotocol.org)
