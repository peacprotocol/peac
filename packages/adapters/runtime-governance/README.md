# @peac/adapter-runtime-governance

Runtime governance adapter for PEAC interaction records. Records governance
decisions, audit entries, authority scope changes, lifecycle transitions,
trust signals, and compliance assessments as signed, portable Interaction
Records.

PEAC validates the structure and signature of the PEAC record, not the truth
of the upstream governance decision or the operating effectiveness of the
upstream control plane. PEAC does not verify upstream Merkle chain integrity
or ML-DSA-65 signatures.

## Architecture

Generic runtime-governance surface with source-specific mappers.
Microsoft AGT is the first mapper; the architecture supports additional
mappers for other runtimes.

## Record families

| Family                 | Type URI                                                     |
| ---------------------- | ------------------------------------------------------------ |
| Policy Decision        | `org.peacprotocol/runtime-governance-policy-decision`        |
| Audit Entry            | `org.peacprotocol/runtime-governance-audit-entry`            |
| Authority Scope        | `org.peacprotocol/runtime-governance-authority-scope`        |
| Lifecycle Event        | `org.peacprotocol/runtime-governance-lifecycle-event`        |
| Trust Observation      | `org.peacprotocol/runtime-governance-trust-observation`      |
| Compliance Observation | `org.peacprotocol/runtime-governance-compliance-observation` |

## Usage

```typescript
import { generateKeypair, verifyLocal } from '@peac/protocol';
import {
  issueRuntimeGovernanceRecord,
  mapAgtEvent,
  buildSessionSummary,
} from '@peac/adapter-runtime-governance';

const kp = await generateKeypair();

const event = mapAgtEvent({
  family: 'policy_decision',
  event: 'policy.evaluated',
  data: { action: 'allow', matched_rule: 'default-allow' },
  source: { system: 'microsoft-agt' },
});

const result = await issueRuntimeGovernanceRecord(event, {
  privateKey: kp.privateKey,
  kid: 'gov-key-1',
  issuer: 'https://governance.example.com',
  sessionId: 'sess-001',
  agentId: 'agent-001',
  provider: 'example-runtime',
});

const verification = await verifyLocal(result.jws, kp.publicKey);
const summary = buildSessionSummary([result.jws]);
```

## Design constraints

- Layer 4 only; no kernel/schema/crypto/protocol changes
- Zero vendor SDK runtime dependencies
- Provider field is always caller-supplied
- All records use Wire 0.2 `evidence` kind
- Observational only; never enforces, computes, or determines
- Fail-closed validation on malformed input
