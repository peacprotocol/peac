# Managed Agents Session Evidence Summary

Demo: PEAC as a portable evidence layer for managed agent runtimes.

Demo only, not production-hardened. No runtime-specific logic in published packages.

## What This Demonstrates

1. Create a simulated agent session
2. Issue signed interaction records for each event (6 event families)
3. Verify all receipts
4. Print session evidence summary

## Event Families

| Family     | Type                                        | Description             |
| ---------- | ------------------------------------------- | ----------------------- |
| Session    | `org.peacprotocol/managed-agent-session`    | Session lifecycle       |
| Task       | `org.peacprotocol/managed-agent-task`       | Task submission         |
| Tool use   | `org.peacprotocol/managed-agent-tool-use`   | Tool invocation         |
| MCP        | `org.peacprotocol/managed-agent-mcp-call`   | MCP server call         |
| Permission | `org.peacprotocol/managed-agent-permission` | Permission confirmation |
| Outcome    | `org.peacprotocol/managed-agent-outcome`    | Outcome evaluation      |

## Run

```bash
pnpm demo
```

## Design

- Layer 4 only: no core package changes
- Provider-neutral type names
- Evidence is observational
- See `event-families.md` for the full mapping specification
