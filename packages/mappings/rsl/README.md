# @peac/mappings-rsl

Minimal RSL (Robots Specification Layer) to PEAC CAL mapping.

## Scope

Maps RSL usage tokens (`ai-train`, `ai-input`, `ai-search`, `search`, `ai-all`) to PEAC `ControlPurpose` values. Provides lenient handling: unknown tokens log a warning but do not throw.

## Non-goals (v0.9.17)

- No OLP/CAP/EMS support
- No RSL-specific envelope fields
- No live robots.txt discovery or XML parsing
- No hardcoded license server endpoints

## Usage

```ts
import { rslUsageTokensToControlPurposes } from '@peac/mappings-rsl';

const result = rslUsageTokensToControlPurposes(['ai-train', 'ai-input']);
// result.purposes = ['train', 'ai_input']
```
