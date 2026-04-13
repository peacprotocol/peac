# Runtime Governance Profile

**Status:** Draft
**Since:** v0.12.10
**Extension Namespace:** `org.peacprotocol/runtime-governance`
**Package:** `@peac/adapter-runtime-governance` (planned, lands with adapter PR)
**Spec:** [RUNTIME-GOVERNANCE-PROFILE.md](../specs/RUNTIME-GOVERNANCE-PROFILE.md)

## Abstract

Records governance decisions, audit entries, authority scope changes, lifecycle
transitions, trust signals, and compliance assessments from managed runtimes as
signed PEAC Interaction Records. Observational only: PEAC records what the
runtime reported; PEAC does not enforce, compute, or determine.

## Use case

An operator running a managed runtime (Microsoft AGT, Claude Managed Agents,
OpenAI ACP-backed runtime, or similar) wants portable, signed records of
governance actions that a third party can verify without accessing the
runtime's backing database.

## Package / Function

The adapter package `@peac/adapter-runtime-governance` is planned for v0.12.10.
The API below is the proposed design; it is not yet runnable.

```typescript
// Proposed API (lands with adapter package in v0.12.10)
import { issueRuntimeGovernanceRecord, mapAgtEvent } from '@peac/adapter-runtime-governance';
```

## Mapping

| Input (upstream governance artifact)  | PEAC Record Field                                                | Semantics                                                   |
| ------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Governance decision (allow/deny/warn) | Extension: `action`                                              | Observational; not enforced by PEAC                         |
| Matched policy rule                   | Extension: `matched_rule`                                        | Preserved as string                                         |
| Policy name / reference               | Extension: `policy_name`                                         | Preserved as string                                         |
| Audit entry with hash chain           | Extension: `previous_hash`, `entry_hash`                         | Opaque; PEAC does not verify chain integrity                |
| Trust score / delta                   | Extension: `trust_score`, `trust_delta`                          | Opaque observational values; PEAC does not compute trust    |
| Compliance framework assessment       | Extension: `framework`, `compliance_score`                       | Observational; PEAC does not make compliance determinations |
| Agent lifecycle transition            | Extension: `lifecycle_event_type`, `previous_state`, `new_state` | State change recorded                                       |

See [RUNTIME-GOVERNANCE-PROFILE.md](../specs/RUNTIME-GOVERNANCE-PROFILE.md)
for the full specification, preserved upstream artifact block, and
anti-pattern rules.

## Validation rules

1. All records MUST use `kind: "evidence"` (Wire 0.2 protocol value)
2. Type URIs MUST use `org.peacprotocol/runtime-governance-` prefix
3. Provider field MUST be caller-supplied and present; never hardcoded
4. Adapter MUST NOT import any vendor runtime SDK as a dependency
5. Trust scores are carried as observational values; PEAC MUST NOT derive, recompute, rank, or authoritatively assess trust
6. Compliance observations are recorded; PEAC MUST NOT make compliance determinations
7. Upstream integrity artifacts (Merkle hashes, chain references) are preserved as opaque strings
8. Input validation fails closed on malformed values (non-finite numbers, out-of-range scores, oversized arrays)

## Conformance vectors

Planned for v0.12.10 adapter PR. Fixtures will be located at
`specs/conformance/fixtures/runtime-governance/` with provenance documentation
linking each fixture to verified AGT v3.1.0 pre-release documentation.

Conformance section: Section 25 (RTGOV-001 through RTGOV-007).

## Quick demo

The adapter package is planned for v0.12.10. A runnable demo will land with
the adapter PR at `examples/runtime-governance-records/`.

## Example

Proposed API (not yet runnable):

```typescript
// Planned API -- lands with @peac/adapter-runtime-governance package
const event = mapAgtEvent({
  family: 'policy_decision',
  event: 'policy.evaluated',
  data: {
    action: 'allow',
    matched_rule: 'default-allow',
    policy_name: 'agent-web-access',
    evaluation_ms: 2.3,
  },
});

const result = await issueRuntimeGovernanceRecord(event, {
  privateKey: kp.privateKey,
  kid: 'gov-key-1',
  issuer: 'https://governance.example.com',
  sessionId: 'sess-001',
  agentId: 'agent-001',
  provider: 'example-runtime',
});
```
