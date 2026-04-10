# @peac/adapter-managed-agents

Vendor-neutral adapter for managed agent runtime event evidence. Maps 6 event families to signed PEAC Interaction Records.

## Event Families

| Family                  | Type URI                                    | Kind     |
| ----------------------- | ------------------------------------------- | -------- |
| Session lifecycle       | `org.peacprotocol/managed-agent-session`    | evidence |
| Task submission         | `org.peacprotocol/managed-agent-task`       | evidence |
| Tool use                | `org.peacprotocol/managed-agent-tool-use`   | evidence |
| MCP invocation          | `org.peacprotocol/managed-agent-mcp-call`   | evidence |
| Permission confirmation | `org.peacprotocol/managed-agent-permission` | evidence |
| Outcome evaluation      | `org.peacprotocol/managed-agent-outcome`    | evidence |

## Usage

```typescript
import { issueSessionEvent, buildSessionSummary } from '@peac/adapter-managed-agents';

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

## Session Summary

```typescript
const summary = buildSessionSummary([result1.jws, result2.jws, result3.jws]);
// { sessionId, receipts: 3, families: ['session', 'task', ...], issuer }
```

## Design

- **Vendor-neutral:** No vendor SDK dependencies. The `provider` field is always caller-supplied.
- **Layer 4:** Depends on `@peac/protocol` and `@peac/crypto` only.
- **Evidence kind:** All event families produce `evidence` kind Interaction Records.
- **Extension namespace:** `org.peacprotocol/managed-agent` with `session_id`, `event`, `agent_id`, `provider` fields.

## License

Apache-2.0
