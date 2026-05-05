# A2A Integrator Kit Fixtures

Reference JSON examples for the v0.14.1 A2A handoff observation profile (`docs/specs/A2A-HANDOFF-RECORDS.md`). All fixtures are static, hand-curated, and structurally validate against `A2AHandoffSchema` from `@peac/schema`.

| File                                  | Purpose                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `agent-card.example.json`             | A2A v1.0 Agent Card with the canonical PEAC traceability extension declared.                        |
| `agent-card-observation.example.json` | PEAC handoff observation of the Agent Card discovery. Caller-reported `verified`.                   |
| `task-submitted.example.json`         | PEAC handoff observation of `task.submitted`. `from_agent` only.                                    |
| `task-completed.example.json`         | PEAC handoff observation of `task.completed`. `from_agent` and `to_agent`; upstream digest carried. |
| `human-approved.example.json`         | PEAC handoff observation of `human.approved`. PEAC records what an external approver indicated.     |

All `card_ref` values are strict `sha256:<64 lowercase hex>` digests (per the v0.14.1 spec; Agent Cards are stable artifacts and digest references are portable across vendors). All other `*_ref` values use the multi-prefix opaque-reference grammar (`ref:` / `urn:` / `did:` / `sha256:` / `peac:` / `https://`). Digests in these examples are placeholder hex (`abcdef...` / `0000...0001`); replace with computed digests in production.

## Verification

Run from the repo root after `pnpm build`:

```sh
node integrator-kits/a2a/fixtures/verify-fixtures.mjs
```

The script validates each observation fixture directly against
`validateA2AHandoff` (no comment-stripping logic; fixtures are schema-valid as-is)
and validates the Agent Card example via `normalizeAgentCard` from
`@peac/mappings-a2a`. Exit code 0 on success, 1 on any failure.

## Schema invariants exercised

- `card_ref` (Agent Card observation, `from_agent.card_ref`, `to_agent.card_ref`) is `sha256:<64 lowercase hex>`.
- `task_id`, `parent_task_id`, `upstream_event_ref`, `method_ref`, `observed_by_ref` use the opaque-reference grammar.
- `signature_observation.caller_reported_verification` is one of `verified`, `unverified`, `not_checked` (NOT the legacy boolean shape).
- `event` and `type` agree (e.g., `event: task.completed` only with `type: org.peacprotocol/a2a-task-completed`).
- `discovered_at` and `observed_at` are RFC 3339 with UTC offset.
- No `decision` / `verdict` / `score` / `result` / etc. keys at the extension top level.
