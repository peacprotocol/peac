# Managed Agents Evidence Export: Event Family Taxonomy

Mapping specification for managed agent runtime events to PEAC Interaction Record types.

## Event Families

| #   | Event Family            | Interaction Record `type`                   | `kind`   | Description                                       |
| --- | ----------------------- | ------------------------------------------- | -------- | ------------------------------------------------- |
| 1   | Session lifecycle       | `org.peacprotocol/managed-agent-session`    | evidence | Agent session created, paused, resumed, completed |
| 2   | Task submission         | `org.peacprotocol/managed-agent-task`       | evidence | Task submitted to agent, accepted, rejected       |
| 3   | Tool use                | `org.peacprotocol/managed-agent-tool-use`   | evidence | Agent invoked a tool or function                  |
| 4   | MCP invocation          | `org.peacprotocol/managed-agent-mcp-call`   | evidence | Agent called an MCP server tool                   |
| 5   | Permission confirmation | `org.peacprotocol/managed-agent-permission` | evidence | User confirmed or denied a permission request     |
| 6   | Outcome evaluation      | `org.peacprotocol/managed-agent-outcome`    | evidence | Session or task outcome evaluated                 |

## Extension Groups

All event families use the `ext` field with namespace keys:

```json
{
  "ext": {
    "org.peacprotocol/managed-agent": {
      "session_id": "sess_abc123",
      "event": "session.created",
      "agent_id": "agent-001",
      "provider": "anthropic"
    }
  }
}
```

## Design Principles

- Layer 4 only: no changes to core packages (L0-L3)
- No runtime-specific logic in published packages
- Evidence is observational: records what happened, does not enforce behavior
- Provider-neutral type names: `managed-agent-*`, not vendor-specific
