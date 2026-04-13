# @peac/adapter-managed-agents

Vendor-neutral adapter for managed agent runtime event records. Maps 6 event families to signed PEAC Interaction Records.

## Installation

```bash
pnpm add @peac/adapter-managed-agents
```

## What It Does

`@peac/adapter-managed-agents` is a Layer 4 adapter that records managed agent runtime events as signed, portable Interaction Records. It supports 6 event families covering the full agent session lifecycle: session management, task submission, tool use, MCP invocation, permission confirmation, and outcome evaluation.

## How Do I Use It?

### Issue a session lifecycle event

```typescript
import { issueSessionEvent } from '@peac/adapter-managed-agents';

const result = await issueSessionEvent({
  privateKey, // Ed25519 32 bytes
  kid: 'key-1',
  issuer: 'https://your-issuer.example.com',
  sessionId: 'sess_001',
  agentId: 'agent-001',
  provider: 'your-runtime', // caller-supplied, never hardcoded
  event: 'session.created',
});

// result.jws is a signed Interaction Record (compact JWS)
```

### Build a session summary

```typescript
import { buildSessionSummary } from '@peac/adapter-managed-agents';

const summary = buildSessionSummary([result1.jws, result2.jws, result3.jws]);
// { sessionId, receipts: 3, families: ['session', 'task', ...], issuer }
```

`buildSessionSummary()` decodes JWS payloads to extract metadata but does **not** verify signatures. Callers must verify receipts first (e.g., via `verifyLocal()` from `@peac/protocol`). Throws on malformed JWS input.

## Event Families

| Family                  | Type URI                                    | Kind       |
| ----------------------- | ------------------------------------------- | ---------- |
| Session lifecycle       | `org.peacprotocol/managed-agent-session`    | `evidence` |
| Task submission         | `org.peacprotocol/managed-agent-task`       | `evidence` |
| Tool use                | `org.peacprotocol/managed-agent-tool-use`   | `evidence` |
| MCP invocation          | `org.peacprotocol/managed-agent-mcp-call`   | `evidence` |
| Permission confirmation | `org.peacprotocol/managed-agent-permission` | `evidence` |
| Outcome evaluation      | `org.peacprotocol/managed-agent-outcome`    | `evidence` |

## Integrates With

- `@peac/protocol` (Layer 3): Receipt issuance and local verification
- `@peac/crypto` (Layer 2): JWS decode for session summary extraction
- `@peac/adapter-runtime-governance`: Runtime governance records (complementary adapter)

## Design

- **Vendor-neutral:** No vendor SDK dependencies. The `provider` field is always caller-supplied.
- **Layer 4:** Depends on `@peac/protocol` and `@peac/crypto` only.
- **Evidence kind:** All event families produce `evidence` kind Interaction Records.
- **Extension namespace:** `org.peacprotocol/managed-agent` with `session_id`, `event`, `agent_id`, `provider` fields.

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
