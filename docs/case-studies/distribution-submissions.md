# Distribution submission tracking

Status tracking for every external listing or marketplace submission PEAC maintains. Each row carries a reproducible artifact reference and a per-row state so release reviewers can audit the distribution lane without guessing.

## State semantics

- **prepared** - artifact (manifest, listing copy, submission draft) is ready locally. No submission has been filed.
- **submitted** - submission filed with the external party. A public PR, ticket, or submission URL is captured.
- **discoverable** - the external party has accepted the submission and the entry is live / indexed / listed. Verified by an evaluator URL.

`prepared` or `submitted` with a reproducible artifact reference is the tag-blocking requirement for v0.12.13. `discoverable` is a post-release window KPI tracked on a 30 / 60 / 90-day cadence; it does not block the tag.

## MCP and IDE marketplaces

| Listing               | State    | Artifact reference                                                      | Captured on | Next action                                           | Owner |
| --------------------- | -------- | ----------------------------------------------------------------------- | ----------- | ----------------------------------------------------- | ----- |
| mcpservers.org        | prepared | `surfaces/plugin-pack/smithery.yaml`; submission draft TBD              | 2026-04-20  | Open submission PR on mcpservers.org catalog          | TBD   |
| mcp.so                | prepared | `packages/mcp-server/smithery.yaml`; submission draft TBD               | 2026-04-20  | Open submission on mcp.so after mcpservers.org        | TBD   |
| awesome-mcp-servers   | prepared | draft entry referencing `@peac/mcp-server` on npm; submission draft TBD | 2026-04-20  | Open PR against sindresorhus/awesome-mcp-servers fork | TBD   |
| Smithery remote       | prepared | canonical `smithery.yaml` under `packages/mcp-server/`; submission TBD  | 2026-04-20  | Open Smithery remote onboarding form                  | TBD   |
| Cursor marketplace    | prepared | `surfaces/plugin-pack/cursor/`; marketplace entry TBD                   | 2026-04-20  | Open Cursor marketplace submission                    | TBD   |
| Codex plugin registry | prepared | `surfaces/plugin-pack/codex/`; plugin entry TBD                         | 2026-04-20  | Open Codex plugin registry submission                 | TBD   |
| Claude Code plugin    | prepared | `surfaces/plugin-pack/claude-code/`; plugin entry TBD                   | 2026-04-20  | Open Claude Code plugin listing                       | TBD   |
| VS Code extension     | prepared | `surfaces/plugin-pack/vscode/`; marketplace entry TBD                   | 2026-04-20  | Open VS Code marketplace submission                   | TBD   |

## Tag-time discipline

At v0.12.13 tag time, every row above requires:

- `prepared` at minimum, with a committed artifact under `surfaces/plugin-pack/`, `packages/mcp-server/smithery.yaml`, or equivalent local source.
- Or `submitted`, with a submission URL, PR number, or review thread captured in the `Artifact reference` cell.
- `discoverable` is tracked here but is not tag-blocking.

## Post-release window KPIs

30 / 60 / 90 days after v0.12.13 tag:

- Review each row; advance state where the external party has acted.
- If a row remains `prepared` at 90 days with no external-side motion, reassign the owner or retire the row and move the entry into the release notes historical section.

## Related documents

- [Case studies README](README.md) (admissibility rules).
- [Trust artifacts](../TRUST-ARTIFACTS.md)
- [Release notes](../release-notes/) (per-release distribution-state summary).
