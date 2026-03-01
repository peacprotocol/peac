# Content Signals Observation Example

Demonstrates the PEAC content signal observation model: parse robots.txt, Content-Usage headers, and tdmrep.json, resolve conflicts by source precedence, and issue a receipt recording the observation.

## Quick Start

```bash
pnpm install
pnpm demo
```

## What It Does

1. **Parses** content signals from three sources (pre-fetched, no network I/O)
2. **Resolves** conflicts using DD-137 source precedence: tdmrep.json > Content-Usage > robots.txt
3. **Issues** a PEAC receipt recording the observation
4. **Verifies** the receipt offline

## Three-State Model

Each content purpose resolves to one of three states:

| State | Meaning |
| ----- | ------- |
| `allow` | Source explicitly permits this use |
| `deny` | Source explicitly prohibits this use |
| `unspecified` | No signal found for this use |

Signals record observations. They never enforce policy.

## Source Precedence (DD-137)

When multiple sources have signals for the same purpose, the highest-priority source wins:

1. `tdmrep.json` (highest)
2. `Content-Usage` header (AIPREF)
3. `robots.txt` (lowest)

## References

- [Content Signals Mapping](../../packages/mappings/content-signals/README.md)
- [PEAC Protocol](https://www.peacprotocol.org)
