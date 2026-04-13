# Runtime Governance Adapter

> Part of [PEAC Adapters](./README.md) | Since: v0.12.10

Records runtime governance artifacts as signed PEAC Interaction Records.
Generic surface with source-specific mappers. Microsoft AGT is the first
mapper; the architecture supports additional mappers for other runtimes.

**Package:** `@peac/adapter-runtime-governance`
**Layer:** 4 (Adapters)
**Extension Namespace:** `org.peacprotocol/runtime-governance`
**Spec:** [RUNTIME-GOVERNANCE-PROFILE.md](../specs/RUNTIME-GOVERNANCE-PROFILE.md)
**Status:** Planned (v0.12.10)

## Overview

Runtime governance systems enforce policy inside a runtime boundary.
This adapter records what those systems reported as portable, signed
Interaction Records. The boundary is intentional and load-bearing:

| Layer                   | Owner               | Responsibility                                                             |
| ----------------------- | ------------------- | -------------------------------------------------------------------------- |
| Runtime enforcement     | AGT, Claude MA, ACP | Policy evaluation, trust scoring, sandbox management                       |
| Portable signed records | PEAC                | Record decisions, preserve upstream artifacts, enable offline verification |

PEAC validates the structure and signature of the PEAC record, not the truth
of the upstream governance decision or the operating effectiveness of the
upstream control plane. PEAC does not verify AGT's Merkle chain integrity or
ML-DSA-65 signatures in v0.12.10. It records upstream artifacts observationally.

## Architecture

```text
issueRuntimeGovernanceRecord(event, opts)    <-- generic issuance
  ^
  |
mapAgtEvent(agtInput) --> event              <-- AGT mapper
mapManagedAgentEvent(...) --> event           <-- future mapper
```

## Record Categories

| Category               | Type URI                                                     | Description                                                |
| ---------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| Policy Decision        | `org.peacprotocol/runtime-governance-policy-decision`        | Governance decision: action, rule, policy, evaluation time |
| Audit Entry            | `org.peacprotocol/runtime-governance-audit-entry`            | Audit log entry with upstream integrity references         |
| Authority Scope        | `org.peacprotocol/runtime-governance-authority-scope`        | Scope narrowing, privilege tier, matched invariants        |
| Lifecycle Event        | `org.peacprotocol/runtime-governance-lifecycle-event`        | Agent state transitions                                    |
| Trust Observation      | `org.peacprotocol/runtime-governance-trust-observation`      | Trust signals (opaque, never computed by PEAC)             |
| Compliance Observation | `org.peacprotocol/runtime-governance-compliance-observation` | Framework assessments (opaque, never determined by PEAC)   |

## What this adapter does

- Issues signed Interaction Records for 6 governance event categories
- Validates input with discriminated union per-family validators
- Preserves upstream artifacts (Merkle hashes, CloudEvents types) as opaque data
- Provides source-specific mappers (AGT first, others later)
- Caller-supplied `provider` field (never hardcoded)

## What this adapter does NOT do

- Enforce policies or make allow/deny decisions
- Compute, validate, or weight trust scores
- Make compliance determinations or issue certifications
- Verify upstream Merkle chain integrity
- Verify upstream ML-DSA-65 or SPIFFE signatures
- Import any vendor SDK as a runtime dependency

## Quick start

Proposed API (lands with adapter package in v0.12.10):

```typescript
// Planned API -- not yet runnable; package ships with adapter PR
import { generateKeypair, verifyLocal } from '@peac/protocol';
import {
  issueRuntimeGovernanceRecord,
  mapAgtEvent,
  buildSessionSummary,
} from '@peac/adapter-runtime-governance';

// 1. Generate keypair
const kp = await generateKeypair();

// 2. Map an AGT-shaped event to the generic model
const event = mapAgtEvent({
  family: 'policy_decision',
  event: 'policy.evaluated',
  data: {
    action: 'allow',
    matched_rule: 'default-allow',
    policy_name: 'agent-web-access',
    evaluation_ms: 2.3,
  },
  source: {
    system: 'microsoft-agt',
    event_type: 'ai.agentmesh.policy.evaluation',
  },
});

// 3. Issue a signed Interaction Record
const result = await issueRuntimeGovernanceRecord(event, {
  privateKey: kp.privateKey,
  kid: 'gov-key-1',
  issuer: 'https://governance.example.com',
  sessionId: 'sess-001',
  agentId: 'agent-001',
  provider: 'example-runtime',
});

// 4. Verify locally
const verification = await verifyLocal(result.jws, kp.publicKey);

// 5. Build session summary (decode-only, no verification)
const summary = buildSessionSummary([result.jws]);
```
