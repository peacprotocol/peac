# PEAC Diagram Generation

## Overview

The PEAC proof flow diagram exists in two forms:

1. **Mermaid source** (`peac-proof-flow.mmd`) - Canonical, version-controlled, animated on GitHub
2. **SVG export** (`peac-proof-flow.svg`) - Static fallback for npm, PyPI, docs sites

## Why Both?

- **GitHub** renders Mermaid natively with animation support
- **npm, PyPI, static docs** do not run Mermaid JavaScript
- **Diffs** are cleaner on `.mmd` text than binary SVG

## Generating SVG

### Option 1: Mermaid CLI (Local)

```bash
# Install
npm install -g @mermaid-js/mermaid-cli

# Generate
./scripts/generate-diagram.sh

# Output: docs/diagrams/peac-proof-flow.svg
```

### Option 2: Docker (No Install)

```bash
docker run --rm -v "$PWD:/data" minlag/mermaid-cli \
  -i /data/docs/diagrams/peac-proof-flow.mmd \
  -o /data/docs/diagrams/peac-proof-flow.svg \
  -t neutral \
  -b transparent
```

### Option 3: Mermaid Live Editor

1. Copy contents of `peac-proof-flow.mmd`
2. Paste into https://mermaid.live
3. Export as SVG (neutral theme, transparent background)
4. Save to `docs/diagrams/peac-proof-flow.svg`

## Using the SVG in README

### Current Approach (GitHub-optimized)

````markdown
## The model

```mermaid
<mermaid source>
```
````

````

**Pros:** Animation works, source is diffable
**Cons:** Doesn't render on npm

### Universal Approach (Use SVG + Mermaid in details)

```markdown
## The model

![PEAC proof flow](docs/diagrams/peac-proof-flow.svg)

<details>
<summary>View animated version (GitHub only)</summary>

```mermaid
<mermaid source>
````

</details>
```

**Pros:** Works everywhere, GitHub users can see animation
**Cons:** SVG must be regenerated when diagram changes

## CI Integration (Optional)

Add to `.github/workflows/ci.yml` to ensure SVG stays in sync:

```yaml
- name: Diagram drift check
  run: |
    npm install -g @mermaid-js/mermaid-cli
    ./scripts/generate-diagram.sh
    if ! git diff --exit-code docs/diagrams/peac-proof-flow.svg; then
      echo "FAIL: SVG is out of sync with .mmd source"
      echo "Run: ./scripts/generate-diagram.sh"
      exit 1
    fi
```

## Accessibility

The Mermaid source includes:

- `accTitle`: Short diagram title for screen readers
- `accDescr`: Detailed flow description

These are preserved in SVG export and improve accessibility.

## Maintenance

1. Edit `peac-proof-flow.mmd` when diagram changes
2. Regenerate SVG with `./scripts/generate-diagram.sh`
3. Commit both files together
4. SVG diffs show visual changes (review in GitHub PR view)
