# Marketplace Publishing

Single-source submission guidance for PEAC Protocol plugin packs on
third-party marketplaces. Kept as one tracked doc so it does not
proliferate across plugin READMEs, manifests, or quickstarts.

## Publisher / artifact split

| Field                       | Value                                                                             |
| --------------------------- | --------------------------------------------------------------------------------- |
| Listing / product title     | PEAC Protocol                                                                     |
| Listing short description   | Portable signed records for agent, API, MCP, and cross-runtime interactions.      |
| Artifact identity (in-repo) | PEAC Protocol (`@peac/mcp-server` and plugin packs under `surfaces/plugin-pack/`) |
| Source repository           | `peacprotocol/peac`                                                               |
| License                     | Apache-2.0                                                                        |
| Publisher / vendor account  | Stewarding organization (see README footer)                                       |
| Support / contact           | Per marketplace; points to the stewarding organization                            |

PEAC Protocol is an open source project. Some marketplace distributions
may be published by a stewarding organization to give the listing a
consistent publisher identity on marketplaces that require one. The
artifact identity in this repository stays PEAC-first in every tracked
surface (paths, configs, samples, guides, skills, rules, READMEs).

## Submission checklist (maintainer-facing)

Use the items below when preparing a new marketplace submission. Record
the submission outcome in `reference/PROOF_OF_ACTION_LOCAL.md`
(local-only) with date, marketplace, publisher account, listing URL.

- [ ] Listing title exactly matches the canonical string above.
- [ ] Short description exactly matches the canonical string above.
- [ ] Source URL points to `github.com/peacprotocol/peac`.
- [ ] License is declared as Apache-2.0.
- [ ] Publisher / vendor account follows the stewarding-organization
      split documented above.
- [ ] Plugin artifact path references an exact pinned
      `@peac/mcp-server@<semver>` version; `@latest` is forbidden.
- [ ] Self-controlled smoke harness (e.g. `scripts/smoke-cursor.mjs`,
      `scripts/smoke-codex.mjs`, `scripts/smoke-claude-code.mjs`,
      `scripts/smoke-vscode.mjs`, `scripts/smoke-smithery.mjs`) exits 0
      against the submitted artifact.
- [ ] Trust boundary class declared in the submission notes
      (Official-reviewed / Team / Community-unreviewed / Self-hosted).
- [ ] No Originary product names in the submitted artifact itself;
      publisher identity appears only in the marketplace account field
      and, if the marketplace requires it, the support URL.

## Trust boundary classes

- **Official-reviewed**: marketplace gates editorial review before a
  listing is visible (e.g. Cursor marketplace curation).
- **Team**: marketplace reviews listings at the team-scope level
  (e.g. GitHub Copilot enterprise custom registry).
- **Community-unreviewed**: open submission; directory review is
  operator-owned (e.g. Smithery public directory).
- **Self-hosted**: no marketplace involved; the user deploys the
  pack from the source repository directly.

## See also

- `surfaces/plugin-pack/` — canonical tracked plugin surfaces.
- `packages/mcp-server/smithery.yaml` — canonical Smithery configuration.
- `docs/compatibility/core-use-case-coverage.md` — anti-narrowing
  reference for listing description consistency.
