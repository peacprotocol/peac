# npm Package README Template

This document defines the standard README format for all `@peac/*` packages published to npm.

## Template

Every published package must have a `README.md` that follows this structure:

```markdown
# @peac/<package-name>

<One-line description - no marketing language>

## Installation

\`\`\`bash
pnpm add @peac/<package-name>
\`\`\`

## Documentation

See [peacprotocol.org](https://www.peacprotocol.org) for full documentation.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
```

## Requirements

### 1. Package Name

- Must be `@peac/<package-name>` (exact match)
- No marketing taglines or badges

### 2. Description

- One line only
- Factual, not promotional
- Describes what the package does

**Examples:**

- "PEAC protocol kernel - normative constants, errors, and registries"
- "PEAC cryptographic primitives - signing, verification, and key management"
- "x402 payment proof adapter - offer/receipt verification and term-matching"

### 3. Deprecation Notice (if applicable)

If a package is deprecated, add immediately after the package name:

```markdown
# @peac/core

DEPRECATED - Use @peac/kernel, @peac/schema, @peac/crypto, @peac/protocol instead
```

- Plain text, no drama
- List replacement packages

### 4. Installation Command

- Must use the correct package name: `pnpm add @peac/<this-package>`
- Do NOT copy from another package

### 5. Links

All links must be correct and consistent:

| Link | URL |
|------|-----|
| Docs | `https://www.peacprotocol.org` |
| GitHub | `https://github.com/peacprotocol/peac` |
| Originary | `https://www.originary.xyz` |

## Validation

The CI guard script `scripts/check-readme-consistency.sh` validates:

1. README.md exists for each public package
2. Contains correct install command for that package
3. Contains required links
4. No malformed URLs

## Package-Specific Additions

Some packages may have additional sections between "Installation" and "Documentation":

### Usage Example (optional)

Brief code example (5-10 lines max):

```markdown
## Usage

\`\`\`typescript
import { verify } from '@peac/protocol';

const result = await verify(receipt, { jwksUrl: 'https://...' });
\`\`\`
```

### Quick Start (optional)

For packages with complex setup:

```markdown
## Quick Start

1. Install the package
2. Configure your JWKS endpoint
3. Call verify() on incoming receipts
```

## Common Mistakes to Avoid

1. **Wrong install command**: `pnpm add @peac/core` when package is `@peac/kernel`
2. **Missing deprecation notice**: Old packages must clearly state deprecated
3. **Broken links**: `htttps://` typos, wrong domains
4. **Marketing language**: "Revolutionary", "best-in-class", etc.
5. **Badges and shields**: No need for badges - keep it clean
6. **Different structure**: All packages should follow the same template

## Validation Script

Run before publishing to check all READMEs:

```bash
./scripts/check-readme-consistency.sh
```

This script checks:

- README exists
- Contains `pnpm add @peac/<correct-package>`
- Contains peacprotocol.org link
- Contains originary.xyz link
- Contains GitHub link
- No obvious typos in URLs

## Example: @peac/kernel

```markdown
# @peac/kernel

PEAC protocol kernel - normative constants, errors, and registries

## Installation

\`\`\`bash
pnpm add @peac/kernel
\`\`\`

## Documentation

See [peacprotocol.org](https://www.peacprotocol.org) for full documentation.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
```

## Example: @peac/core (Deprecated)

```markdown
# @peac/core

DEPRECATED - Use @peac/kernel, @peac/schema, @peac/crypto, @peac/protocol instead

## Installation

\`\`\`bash
pnpm add @peac/core
\`\`\`

## Documentation

See [peacprotocol.org](https://www.peacprotocol.org) for full documentation.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
```
