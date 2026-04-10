# Anthropic Managed Agents Integration

Provider-specific guide for using `@peac/adapter-managed-agents` with Anthropic's managed agent runtime.

## Overview

Anthropic's managed agent runtime emits session lifecycle, task, tool use, MCP invocation, permission, and outcome events. This guide shows how to map those events to signed PEAC Interaction Records.

## Prerequisites

- `@peac/adapter-managed-agents` installed
- Ed25519 signing key (generate with `@peac/protocol`)
- Issuer URL (your domain with JWKS published)

## Example: Full Session

```typescript
import {
  issueSessionEvent,
  issueTaskEvent,
  issueToolUseEvent,
  issueMcpCallEvent,
  issuePermissionEvent,
  issueOutcomeEvent,
  buildSessionSummary,
} from '@peac/adapter-managed-agents';
import { generateKeypair } from '@peac/protocol';

const { privateKey, publicKey } = await generateKeypair();
const kid = 'anthropic-demo-key-1';
const sessionId = `sess_${Date.now()}`;

const opts = {
  privateKey,
  kid,
  issuer: 'https://your-issuer.example.com',
  sessionId,
  agentId: 'claude-agent-001',
  provider: 'anthropic',
};

const receipts = await Promise.all([
  issueSessionEvent({ ...opts, event: 'session.created' }),
  issueTaskEvent({ ...opts, event: 'task.submitted', details: { task: 'Summarize document' } }),
  issueToolUseEvent({
    ...opts,
    event: 'tool.invoked',
    details: { tool: 'web_search', input_hash: 'sha256:abc' },
  }),
  issueMcpCallEvent({
    ...opts,
    event: 'mcp.tool_call',
    details: { server: 'peac', tool: 'peac_verify' },
  }),
  issuePermissionEvent({
    ...opts,
    event: 'permission.confirmed',
    details: { action: 'file_write', user_decision: 'allow' },
  }),
  issueOutcomeEvent({
    ...opts,
    event: 'outcome.evaluated',
    details: { result: 'success', confidence: 0.95 },
  }),
]);

const summary = buildSessionSummary(receipts.map((r) => r.jws));
console.log(summary);
```

## Notes

- The `provider` field is set to `'anthropic'` by the caller; it is never hardcoded in the adapter.
- No Anthropic SDK dependency is required.
- The adapter produces standard PEAC Interaction Records verifiable by any PEAC-compatible verifier.

## See Also

- [Generic managed runtime events guide](./managed-runtime-events.md)
- [@peac/adapter-managed-agents README](../../packages/adapters/managed-agents/README.md)
