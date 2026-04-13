# @peac/adapter-runtime-governance

Runtime governance adapter for PEAC interaction records. Records governance decisions, audit entries, authority scope changes, lifecycle transitions, trust signals, and compliance assessments as signed, portable Interaction Records.

## Installation

```bash
pnpm add @peac/adapter-runtime-governance
```

## What It Does

`@peac/adapter-runtime-governance` is a Layer 4 adapter that records runtime governance artifacts as signed, portable Interaction Records. It provides a generic runtime-governance surface with source-specific mappers. Microsoft AGT is the first mapper; the architecture supports additional mappers for other runtimes.

PEAC validates the structure and signature of the PEAC record, not the truth of the upstream governance decision or the operating effectiveness of the upstream control plane. PEAC does not verify upstream Merkle chain integrity or ML-DSA-65 signatures.

## How Do I Use It?

### Map and issue a governance record

```typescript
import { generateKeypair, verifyLocal } from '@peac/protocol';
import { issueRuntimeGovernanceRecord, mapAgtEvent } from '@peac/adapter-runtime-governance';

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
  provider: 'example-runtime', // caller-supplied, never hardcoded
});

const verification = await verifyLocal(result.jws, kp.publicKey);
```

### Build a session summary

```typescript
import { buildSessionSummary } from '@peac/adapter-runtime-governance';

const summary = buildSessionSummary([result.jws]);
// { sessionId, receipts: 1, families: ['policy_decision'], unknownTypeCount: 0, issuer }
```

`buildSessionSummary()` decodes JWS payloads to extract metadata but does **not** verify signatures. Callers must verify receipts first. Returns deterministic family ordering (sorted alphabetically) and counts unknown type URIs separately.

## Record Families

| Family                 | Type URI                                                     | Kind       |
| ---------------------- | ------------------------------------------------------------ | ---------- |
| Policy Decision        | `org.peacprotocol/runtime-governance-policy-decision`        | `evidence` |
| Audit Entry            | `org.peacprotocol/runtime-governance-audit-entry`            | `evidence` |
| Authority Scope        | `org.peacprotocol/runtime-governance-authority-scope`        | `evidence` |
| Lifecycle Event        | `org.peacprotocol/runtime-governance-lifecycle-event`        | `evidence` |
| Trust Observation      | `org.peacprotocol/runtime-governance-trust-observation`      | `evidence` |
| Compliance Observation | `org.peacprotocol/runtime-governance-compliance-observation` | `evidence` |

## Integrates With

- `@peac/protocol` (Layer 3): Receipt issuance and local verification
- `@peac/crypto` (Layer 2): JWS decode for session summary extraction
- `@peac/adapter-managed-agents`: Managed agent event records (complementary adapter)

## Design

- **Generic surface:** Package named by concept, not vendor. AGT is the first mapper; future mappers can be added without changing the public API.
- **Vendor-neutral:** Zero vendor SDK runtime dependencies. The `provider` field is always caller-supplied.
- **Layer 4:** Depends on `@peac/protocol` and `@peac/crypto` only.
- **Evidence kind:** All record families produce `evidence` kind Interaction Records.
- **Observational only:** PEAC records what the upstream runtime reported; PEAC does not enforce, compute, or determine.
- **Fail-closed validation:** Rejects malformed input with descriptive errors. Validates RFC 3339 timestamps, digest patterns, URI shapes, and numeric bounds.
- **Extension namespace:** `org.peacprotocol/runtime-governance` with `session_id`, `event`, `agent_id`, `provider` fields plus family-specific payload.

## For Agent Developers

If you are building an AI agent or MCP server that needs evidence receipts:

- Start with [`@peac/mcp-server`](https://www.npmjs.com/package/@peac/mcp-server) for a ready-to-use MCP tool server
- Use `@peac/protocol` for programmatic receipt issuance and verification
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
