# ADR-0004: Universal Parser Precedence and Deny-Safe Merging

**Status**: Accepted
**Date**: 2025-10-01
**Deciders**: jithinraj
**Context**: Phase 2 Universal Parser implementation (v0.9.15)

## Context

Multiple AI policy standards exist (agent-permissions, AIPREF, ai.txt, robots.txt, ACP, peac.txt), each expressing consent signals for crawling and training. Origins may publish multiple formats simultaneously, creating conflicting or overlapping policies. The PEAC Protocol requires a deterministic, security-conservative merge strategy that respects format authority and prevents permission escalation.

## Decision

Implement **priority-based deny-safe merging** for universal policy discovery.

### 1. Format Priority Order

Formats execute in descending priority order:

| Format            | Priority | Rationale                                          |
| ----------------- | -------- | -------------------------------------------------- |
| agent-permissions | 100      | Explicit per-agent opt-out, highest signal clarity |
| AIPREF            | 80       | Preference-based standard with broad adoption      |
| ai.txt            | 60       | OpenAI/Google-specific, explicit AI targeting      |
| peac.txt          | 50       | PEAC native discovery format                       |
| robots.txt        | 40       | Legacy standard, less AI-specific                  |
| ACP               | 10       | Augmentation consent, lowest priority              |

**Rationale**:

- More explicit formats take precedence over general-purpose ones
- Agent-specific rules override global rules
- Newer AI-targeted formats supersede legacy crawler standards

**Why Deny > Allow > Pay**:

Deny-safe merging ensures security-conservative policy enforcement. This design:

1. **Honors explicit opt-outs** from any source, preventing unintended consent
2. **Prevents permission escalation** when lower-priority formats allow but higher deny
3. **Respects origin intent** when multiple signals conflict
4. **Fails safe** by defaulting to allow only when no denies exist
5. **Enables pay-for-access** (future) as fallback when all sources deny but origin offers payment option

### 2. Deny-Safe Merge Rules

When merging policies from multiple sources:

1. **Any deny wins**: If any source denies an action (crawl or train) for an agent or globally, the final policy denies it.
2. **All allow required**: Allow only if:
   - No source denies the action
   - At least one source explicitly allows it
3. **Default to allow**: If no sources provide a signal, default to allow (permissive fallback).

**Merge function** (pseudocode):

```typescript
function mergePartial(accumulator: UnifiedPolicy, partial: PartialPolicy): UnifiedPolicy {
  // Agent-specific rules
  for (const [agent, rules] of partial.agents) {
    if (rules.crawl === false) accumulator.agents[agent].crawl = false;
    else if (rules.crawl === true && accumulator.agents[agent].crawl !== false) {
      accumulator.agents[agent].crawl = true;
    }
    // Same logic for train
  }

  // Global rules
  if (partial.globalCrawl === false) accumulator.globalCrawl = false;
  else if (partial.globalCrawl === true && accumulator.globalCrawl !== false) {
    accumulator.globalCrawl = true;
  }
  // Same logic for globalTrain

  return accumulator;
}
```

### 3. Determinism Guarantees

- **Order independence**: Parsing order does not affect final policy_hash
- **Canonical representation**: Policies canonicalized via RFC 8785 JCS + SHA-256
- **No race conditions**: Synchronous merge with priority-ordered execution

### 4. Examples

#### Example A: High-priority deny overrides low-priority allow

Sources:

- `agent-permissions` (P100): `{ GPTBot: { crawl: false } }`
- `aipref` (P80): `{ crawl: 'yes' }`

Result: `{ globalCrawl: true, agents: { GPTBot: { crawl: false } } }`

**Reasoning**: Agent-specific deny (P100) beats global allow (P80).

#### Example B: All sources agree (allow)

Sources:

- `agent-permissions` (P100): `{ GPTBot: { train: true } }`
- `aipref` (P80): `{ 'train-ai': 'yes' }`
- `ai.txt` (P60): `Allow: /`

Result: `{ globalTrain: true, agents: { GPTBot: { train: true } } }`

**Reasoning**: No denies present, all sources allow.

#### Example C: Mixed signals (one deny)

Sources:

- `agent-permissions` (P100): `{ GPTBot: { crawl: true, train: false } }`
- `aipref` (P80): `{ crawl: 'yes', 'train-ai': 'yes' }`

Result: `{ globalCrawl: true, globalTrain: true, agents: { GPTBot: { crawl: true, train: false } } }`

**Reasoning**: Deny for train (P100) wins. Allow for crawl (P100) beats lower-priority allow (P80).

#### Example D: No sources (default allow)

Sources: (none found)

Result: `{ globalCrawl: true, globalTrain: true, agents: {} }`

**Reasoning**: Permissive default when no policy signals exist.

## Consequences

### Positive

- **Security-conservative**: Denies always respected, preventing unintended permission grants
- **Deterministic**: Policy hash stable across discovery runs
- **Format agnostic**: New formats integrate without breaking existing logic
- **Origin-friendly**: Explicit denies honored regardless of format proliferation

### Negative

- **Complexity**: Six parsers with priority-based orchestration
- **Performance**: Sequential fetch overhead for all formats (mitigated by parallel fetch in future)
- **Default-allow risk**: Permissive fallback may surprise origins expecting default-deny

### Mitigations

- **SSRF protection**: All fetchers use `@peac/safe-fetch` with CIDR blocking
- **Testing**: 100-iteration determinism tests + precedence validation suite
- **Observability**: `policy.sources[]` records which formats contributed

## Alternatives Considered

### 1. First-match wins

**Rejected**: Allows lower-priority formats to set policy if higher-priority formats are absent. Creates ambiguity when formats disagree.

### 2. Require unanimous consent

**Rejected**: Too restrictive. A single outlier deny would block all access even if all other formats allow.

### 3. Weighted voting

**Rejected**: Complex, non-deterministic across implementations. Priority-based is simpler and more predictable.

## References

- [CIP-4: Agent Permissions](https://github.com/ai-content-id/specs)
- [AIPREF Specification](https://aipref.org)
- [RFC 9309: Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html)
- [RFC 8785: JSON Canonicalization Scheme (JCS)](https://www.rfc-editor.org/rfc/rfc8785.html)

## Implementation

- **Package**: `@peac/parsers-universal` v0.9.15
- **Tests**: `tests/determinism.test.js`, `tests/precedence.test.js`
- **Integration**: `@peac/core` via `discoverPolicy()` and `discoverAndEnforce()`
