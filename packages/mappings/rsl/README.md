# @peac/mappings-rsl

Minimal RSL (Robots Specification Layer) 1.0 to PEAC CAL mapping.

## Scope

Maps RSL 1.0 usage tokens (`all`, `ai-all`, `ai-train`, `ai-input`, `ai-index`, `search`) to PEAC `ControlPurpose` values. Provides lenient handling: unknown tokens log a warning but do not throw.

**RSL 1.0 Specification**: [rslstandard.org/rsl](https://rslstandard.org/rsl)

**Media Type**: `application/rsl+xml` (for RSL files)

## Non-goals (v0.9.18)

- No OLP/CAP/EMS support
- No RSL-specific envelope fields
- No live robots.txt discovery or XML parsing
- No hardcoded license server endpoints

## Installation

```bash
pnpm add @peac/mappings-rsl
```

## Usage

```ts
import { rslUsageTokensToControlPurposes } from '@peac/mappings-rsl';

const result = rslUsageTokensToControlPurposes(['ai-train', 'ai-input']);
// result.purposes = ['train', 'ai_input']

const allAi = rslUsageTokensToControlPurposes(['ai-all']);
// result.purposes = ['train', 'ai_input', 'ai_index']
```

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
