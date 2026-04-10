# Managed Runtime Events Integration Guide

`@peac/adapter-managed-agents` is a vendor-neutral adapter for issuing signed PEAC Interaction Records from managed agent runtime events.

## Overview

Managed agent runtimes (such as Anthropic, OpenAI, Google, or self-hosted systems) emit lifecycle events during agent sessions: session start/stop, task submission, tool invocation, MCP calls, permission decisions, and outcome evaluations.

This adapter maps those events to signed Interaction Records using 6 canonical event families.

## Event Families

| Family     | Type URI                                    | Description                                             |
| ---------- | ------------------------------------------- | ------------------------------------------------------- |
| Session    | `org.peacprotocol/managed-agent-session`    | Session lifecycle (created, paused, resumed, completed) |
| Task       | `org.peacprotocol/managed-agent-task`       | Task submission (submitted, accepted, rejected)         |
| Tool Use   | `org.peacprotocol/managed-agent-tool-use`   | Tool invocation                                         |
| MCP Call   | `org.peacprotocol/managed-agent-mcp-call`   | MCP server tool calls                                   |
| Permission | `org.peacprotocol/managed-agent-permission` | Permission decisions (confirmed, denied)                |
| Outcome    | `org.peacprotocol/managed-agent-outcome`    | Outcome evaluation                                      |

## Installation

```bash
pnpm add @peac/adapter-managed-agents @peac/protocol
```

## Usage

### Issue an event

```typescript
import { issueSessionEvent } from '@peac/adapter-managed-agents';

const result = await issueSessionEvent({
  privateKey,
  kid: 'key-1',
  issuer: 'https://your-issuer.example.com',
  sessionId: 'sess_001',
  agentId: 'agent-001',
  provider: 'your-runtime',
  event: 'session.created',
});
```

### Build session summary

```typescript
import { buildSessionSummary } from '@peac/adapter-managed-agents';

const summary = buildSessionSummary(receipts);
// { sessionId, receipts: 6, families: [...], issuer }
```

`buildSessionSummary()` decodes JWS payloads to extract metadata but does **not** verify signatures. Callers must verify receipts first (e.g., via `verifyLocal()`). Throws on malformed JWS input.

## Provider Neutrality

The `provider` field is always caller-supplied. No vendor SDK dependencies exist. The package produces identical Interaction Record shapes regardless of which provider string is passed.

## Extension Namespace

All events use the `org.peacprotocol/managed-agent` extension namespace with fields:

- `session_id`: session identifier
- `event`: specific event name (e.g., `session.created`)
- `agent_id`: agent identifier
- `provider`: caller-supplied provider name

Additional event-specific fields are passed via the `details` parameter.

## Provider-Specific Guides

- [Anthropic Managed Agents](./anthropic-managed-agents.md)
