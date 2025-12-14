# Policy Kit Quickstart

PEAC Policy Kit lets you define access policies for AI agents in a simple YAML file, then compile them into deployable artifacts that crawlers and agents can discover.

**Flow:** `peac-policy.yaml` -> validate -> generate -> deploy artifacts

## Install

```bash
# From the PEAC monorepo
pnpm add @peac/cli

# Or use directly from the repo
pnpm --filter @peac/cli build
```

## Quick Start

### 1. Initialize a Policy File

```bash
peac policy init
```

This creates `peac-policy.yaml` with a minimal open policy.

### 2. Edit Your Policy

```yaml
# peac-policy.yaml
version: 'peac-policy/0.1'

defaults:
  decision: allow # or "deny" for restrictive default

rules:
  - name: block-training
    purpose: train
    decision: deny

  - name: allow-search-bots
    subject:
      type: agent
      labels: [search-bot]
    purpose: [crawl, index]
    decision: allow
```

### 3. Validate the Policy

```bash
peac policy validate peac-policy.yaml

# Verbose output
peac policy validate peac-policy.yaml --verbose
```

### 4. Preview Generated Artifacts

```bash
peac policy generate peac-policy.yaml --well-known --dry-run
```

This shows what would be generated without writing files.

### 5. Generate Artifacts

```bash
peac policy generate peac-policy.yaml --well-known --out dist/peac
```

### 6. Deploy

Copy the generated files to your web server:

```bash
cp dist/peac/.well-known/peac.txt /.well-known/peac.txt
```

## Generated Artifacts

| File                    | Purpose                     | Deploy To               |
| ----------------------- | --------------------------- | ----------------------- |
| `.well-known/peac.txt`  | Authoritative policy signal | `/.well-known/peac.txt` |
| `robots-ai-snippet.txt` | Robots.txt additions        | Append to `/robots.txt` |
| `aipref-headers.json`   | AIPREF-compatible headers   | HTTP middleware         |
| `ai-policy.md`          | Human-readable summary      | Documentation           |

**Note:** `peac.txt` is the source of truth. Other artifacts are for compatibility.

## Common Recipes

### Open Policy (Allow Everything)

```yaml
version: 'peac-policy/0.1'
defaults:
  decision: allow
rules: []
```

Generated `peac.txt`:

```
version: 0.9
usage: open
receipts: optional
```

### Conditional Policy (Deny by Default)

```yaml
version: 'peac-policy/0.1'
defaults:
  decision: deny

rules:
  - name: allow-search
    purpose: [crawl, index, search]
    decision: allow

  - name: allow-inference-with-receipt
    purpose: inference
    decision: allow
```

Generated `peac.txt`:

```
version: 0.9
usage: conditional
purposes: [crawl, index, inference, search]
receipts: required
```

### Require Receipts

```bash
peac policy generate peac-policy.yaml --receipts required
```

Or override in the command:

```bash
peac policy generate peac-policy.yaml --receipts optional
peac policy generate peac-policy.yaml --receipts omit
```

### Add Rate Limiting

```bash
peac policy generate peac-policy.yaml --rate-limit "100/hour"
```

### Add Negotiation URL

```bash
peac policy generate peac-policy.yaml --negotiate "https://example.com/negotiate"
```

### Add Contact Info

```bash
peac policy generate peac-policy.yaml --contact "licensing@example.com"
```

## Debugging

### Explain a Specific Rule Match

```bash
# What decision applies for an agent doing training?
peac policy explain peac-policy.yaml --subject-type agent --purpose train

# What about a human doing inference?
peac policy explain peac-policy.yaml --subject-type human --purpose inference
```

### Common Validation Errors

| Error                 | Cause                          | Fix                                                                            |
| --------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| `Invalid version`     | Missing or wrong version field | Use `version: "peac-policy/0.1"`                                               |
| `Unknown purpose`     | Typo in purpose name           | Use: `crawl`, `index`, `train`, `inference`, `ai_input`, `ai_search`, `search` |
| `Duplicate rule name` | Two rules with same name       | Use unique names for each rule                                                 |

### What `--dry-run` Shows

```
=== DRY RUN ===
Would write: dist/peac/.well-known/peac.txt
---
version: 0.9
usage: conditional
purposes: [crawl, index, train]
receipts: required
---

Would write: dist/peac/robots-ai-snippet.txt
...
```

## Safety Notes

1. **Rule order matters** - First matching rule wins (like firewall rules)
2. **Robots snippet is conservative** - Review before appending to `robots.txt`
3. **AIPREF output is for compatibility** - `peac.txt` is the authoritative source
4. **Test with `--dry-run` first** - Always preview before writing files

## Next Steps

- [Policy Kit API Reference](../api-reference.md)
- [PROTOCOL-BEHAVIOR.md](../specs/PROTOCOL-BEHAVIOR.md) - Protocol specification
- [README](../../README.md) - Full documentation
