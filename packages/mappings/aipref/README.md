# @peac/mappings-aipref

IETF AIPREF vocabulary mapping for PEAC.

Maps IETF AIPREF Content-Usage header keys to PEAC CanonicalPurpose values using a key-preserving approach: unknown keys are preserved, not dropped.

## Installation

```bash
pnpm add @peac/mappings-aipref
```

## Usage

### Map AIPREF keys to PEAC purposes

```typescript
import { aiprefKeyToCanonicalPurpose, mapAiprefKeys } from '@peac/mappings-aipref';

// Single key mapping
const result = aiprefKeyToCanonicalPurpose('train-ai');
// { canonical: 'train', preserved: 'train-ai' }

// Unknown keys are preserved
const unknown = aiprefKeyToCanonicalPurpose('custom-key');
// { canonical: null, preserved: 'custom-key', mapping_note: 'Unknown AIPREF key' }

// Batch mapping
const batch = mapAiprefKeys(['train-ai', 'search', 'custom']);
// {
//   purposes: ['train', 'search'],
//   preserved: ['train-ai', 'search', 'custom'],
//   unknown: ['custom'],
//   notes: ['Unknown AIPREF key: custom']
// }
```

### Parse Content-Usage header

```typescript
import { parseContentUsageHeader, contentUsageToCanonicalPurposes } from '@peac/mappings-aipref';

// Parse RFC 8941 structured fields
const parsed = parseContentUsageHeader('train-ai=?1, search=?0');
// { entries: Map { 'train-ai' => true, 'search' => false }, valid: true }

// Convert to PEAC purposes (only includes allowed)
const purposes = contentUsageToCanonicalPurposes('train-ai=?1, search=?0');
// { purposes: ['train'], preserved: ['train-ai'], unknown: [], notes: [] }
```

### Generate Content-Usage header

```typescript
import { canonicalPurposesToContentUsage } from '@peac/mappings-aipref';

// From PEAC purposes
const header = canonicalPurposesToContentUsage(['train', 'search']);
// 'train-ai=?1, search=?1'

// With explicit denials
const headerWithDeny = canonicalPurposesToContentUsage(['train'], { search: false });
// 'train-ai=?1, search=?0'
```

## Vocabulary Mapping

### Standard Keys (IETF Normative)

| AIPREF Key | PEAC CanonicalPurpose |
| ---------- | --------------------- |
| `train-ai` | `train`               |
| `search`   | `search`              |

### Extension Keys (Deployed in Wild)

| AIPREF Key    | PEAC CanonicalPurpose | Notes         |
| ------------- | --------------------- | ------------- |
| `train-genai` | `train`               | Extension key |
| `ai`          | `train`               | Legacy key    |

### PEAC Purposes Without AIPREF Equivalent

- `user_action` - No direct AIPREF mapping
- `inference` - No direct AIPREF mapping
- `index` - No direct AIPREF mapping

## Key-Preserving Approach

This package uses a key-preserving approach for forward compatibility:

- Unknown AIPREF keys are **preserved** in `preserved` field
- Unknown keys return `canonical: null` (not an error)
- Extension keys include `mapping_note` for audit trail
- Round-trip mapping preserves all original keys

## License

Apache-2.0

---

Part of [PEAC Protocol](https://peacprotocol.org)
