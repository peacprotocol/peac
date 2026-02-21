# Zod 4 Migration Plan

**Target release:** v0.11.0
**Prepared:** 2026-02-21 (v0.10.14)
**Audit tool:** `node scripts/audit-zod-usage.mjs`

---

## Summary

Zod 4 introduces breaking changes that affect PEAC schemas. This document
provides a per-package audit, migration order, rollback plan, and MCP SDK
compatibility notes so that the v0.11.0 Zod 4 migration is mechanical execution
rather than exploratory work.

**Total API surface scanned:** 213 occurrences across 9 pattern categories.

| Risk   | Count | Patterns                                            |
| ------ | ----- | --------------------------------------------------- |
| HIGH   | 5     | `.superRefine()` (deprecated)                       |
| MEDIUM | 38    | `.describe()` (23), `ZodError` (14), `.uuid()` (1)  |
| LOW    | 62    | `.strict()` (still available)                       |
| NONE   | 108   | `z.infer<>`, `.refine()`, `.transform()`, `.pipe()` |

---

## Breaking Changes Relevant to PEAC

### 1. `.superRefine()`: DEPRECATED (HIGH)

**Zod 4 replacement:** `.check()`: same semantics, new name. The callback
signature and `ctx.addIssue()` API are unchanged. Note: the deprecation status
has shifted across Zod 4 pre-releases. Only rename `.superRefine()` to
`.check()` if the pinned Zod 4 baseline actually emits deprecation warnings;
do not create churn for no reason.

**Occurrences (5):**

| File                                 | Line | Schema                         |
| ------------------------------------ | ---- | ------------------------------ |
| `packages/schema/src/obligations.ts` | 86   | `CreditObligationSchema`       |
| `packages/schema/src/obligations.ts` | 139  | `ContributionObligationSchema` |
| `packages/schema/src/dispute.ts`     | 439  | `DisputeContactSchema`         |
| `packages/schema/src/dispute.ts`     | 550  | `DisputeEvidenceSchema`        |
| `packages/schema/src/interaction.ts` | 376  | `InteractionEvidenceV01Schema` |

**Migration:** If the pinned Zod 4 version emits deprecation warnings for
`.superRefine()`, find-and-replace `.superRefine(` with `.check(` in these
5 locations and verify each callback still type-checks. If no warnings are
emitted, defer the rename.

### 2. `.strict()`: STILL AVAILABLE (LOW)

`.strict()` remains in Zod 4 for backward compatibility. Optionally migrate to
`z.strictObject()` for cleanliness, but not required.

**Occurrences (62):**

| Package               | Count | Files                                                                                                                                                               |
| --------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@peac/schema`        | 43    | validators.ts (13), interaction.ts (10), dispute.ts (8), agent-identity.ts (6), attribution.ts (4), obligations.ts (3), attestation-receipt.ts (2), workflow.ts (4) |
| `@peac/policy-kit`    | 14    | types.ts (14)                                                                                                                                                       |
| `apps/sandbox-issuer` | 1     | schemas.ts                                                                                                                                                          |
| `apps/api`            | 2     | verify-v1.ts                                                                                                                                                        |
| `@peac/mcp-server`    | 2     | infra/policy.ts (implicit via policy-kit re-export)                                                                                                                 |

**Migration:** No immediate action required. Consider a follow-up PR to migrate
to `z.strictObject()` for stylistic consistency, but this is P2.

### 3. `.describe()`: VERIFY MCP TOOL DESCRIPTIONS (MEDIUM)

`.describe()` is unchanged in Zod 4 but its behavior with MCP SDK structured
outputs must be verified. The MCP SDK reads `.describe()` metadata from Zod
schemas to generate tool parameter descriptions for LLM clients.

**Occurrences (23):**

| Package            | Count | Files                                                                                                              |
| ------------------ | ----- | ------------------------------------------------------------------------------------------------------------------ |
| `@peac/mcp-server` | 23    | schemas/issue.ts (13), schemas/verify.ts (4), schemas/inspect.ts (2), schemas/decode.ts (1), schemas/bundle.ts (3) |

**Migration:** After Zod 4 bump, run the MCP server and verify each tool's
parameter descriptions are preserved in the `tools/list` response. This is the
**single most important verification step** for the MCP server.

**Verification command:**

```bash
# Start MCP server and list tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  node packages/mcp-server/src/index.ts --key-file /dev/null 2>/dev/null
```

Check that all `inputSchema.properties[*].description` values match the
`.describe()` strings.

### 4. `ZodError` imports: SAFE (MEDIUM)

Zod 4 renames `error.errors` to `error.issues`. PEAC code already uses
`.issues` exclusively: no migration needed.

**Occurrences (14):**

| Package                                 | Import                | Property Used                        | Status |
| --------------------------------------- | --------------------- | ------------------------------------ | ------ |
| `@peac/schema` (receipt-parser.ts)      | `import { ZodError }` | `.issues`                            | SAFE   |
| `@peac/schema` (validators.ts)          | JSDoc only            | N/A                                  | SAFE   |
| `@peac/schema` (interaction.ts)         | JSDoc only            | N/A                                  | SAFE   |
| `@peac/schema` (workflow.ts)            | JSDoc only            | N/A                                  | SAFE   |
| `@peac/schema` (attestation-receipt.ts) | JSDoc only            | N/A                                  | SAFE   |
| `@peac/protocol` (issue.ts)             | `import { ZodError }` | `.issues`                            | SAFE   |
| `@peac/policy-kit` (loader.ts)          | `import { ZodError }` | `.issues`, `ZodError['issues']` type | SAFE   |

**Migration:** No changes needed. All code uses `.issues`.

### 5. `z.string().uuid()`: STRICTER VALIDATION (MEDIUM)

Zod 4 enforces strict RFC 4122 UUID validation. Zod 3 accepted some
non-compliant UUID formats. Zod 4 provides `z.guid()` for v3-compatible
behavior.

**Occurrences (1):**

| File                                 | Line | Field        |
| ------------------------------------ | ---- | ------------ |
| `packages/control/src/validators.ts` | 164  | `receipt_id` |

**Migration:** PEAC generates UUIDs via `crypto.randomUUID()` which produces
RFC 4122 v4 UUIDs. These will pass Zod 4's stricter check. Verify with existing
conformance test fixtures: if any fixture contains a non-RFC 4122 UUID,
update it.

### 6. No-Change APIs

| API            | Count | Notes                                              |
| -------------- | ----- | -------------------------------------------------- |
| `z.infer<>`    | 88    | Unchanged. Verify inferred types match after bump. |
| `.refine()`    | 15    | Unchanged.                                         |
| `.transform()` | 3     | Unchanged.                                         |
| `.pipe()`      | 2     | Unchanged.                                         |

---

## Migration Order

Migration follows package layering (bottom-up). Each step is a separate PR
within v0.11.0.

### Step 1: `@peac/schema` (Layer 1): Foundation

- 76+ schemas, 5 `.superRefine()` (HIGH), 43 `.strict()` (LOW)
- `.superRefine()` -> `.check()` rename (5 locations)
- Run full conformance suite after
- **PR:** v0.11.0-1

### Step 2: `@peac/control` (Layer 3): Validators

- 7 schemas, 1 `z.string().uuid()` (MEDIUM), 0 `.superRefine()`
- Verify `receipt_id` UUID validation still accepts `crypto.randomUUID()` output
- **PR:** v0.11.0-2

### Step 3: `@peac/policy-kit` (Layer 3): Policy Types

- 10+ schemas, 14 `.strict()` (LOW), 2 `ZodError` imports (SAFE)
- No high-risk changes; verify policy loader error handling
- **PR:** v0.11.0-2 (same as control, both L3)

### Step 4: `@peac/protocol` (Layer 3): Issue/Verify

- 1 `ZodError` import only (SAFE, uses `.issues`)
- Verify `issue()` error wrapping still works
- **PR:** v0.11.0-2

### Step 5: `@peac/mcp-server` (Layer 5): MCP Tools

- 11 schemas, 23 `.describe()` (CRITICAL to verify)
- Run MCP `tools/list` and verify all descriptions preserved
- Test structured output roundtrip with Zod 4
- **PR:** v0.11.0-3

### Step 6: Apps (`sandbox-issuer`, `api`): Minimal

- 1 `.strict()` + 1 `.refine()` each
- Straightforward after lower layers are migrated
- **PR:** v0.11.0-3

---

## MCP SDK Compatibility

### Current state

- **SDK:** `@modelcontextprotocol/sdk@~1.27.0` (tilde pin)
- **Protocol:** `2025-11-25` (current stable)
- **Zod peer dep:** SDK v1.x requires Zod 3.25+ (backward compatible with both Zod 3 and Zod 4)

### SDK v1 vs v2

- **Stay on v1.x.** SDK v2 ("main" branch) is pre-alpha and NOT the production
  recommendation. v1.x remains the stable, recommended version.
- v1.x will receive bug fixes and security patches for 6+ months after v2 ships.
- v1.27.0 is the current "latest non-vulnerable" baseline.
- Bump tilde pin only for security patches.

### Zod 4 + MCP SDK interaction points

1. **Tool input schemas:** MCP SDK v1.27.0 uses the `zod-to-json-schema` package
   to convert Zod schemas to JSON Schema for `tools/list`. Zod 4 adds first-party
   JSON Schema conversion via `z.toJSONSchema()`, but the SDK does not use it yet.
   When upgrading Zod, verify the existing `zod-to-json-schema` path still produces
   identical output. The SDK explicitly supports `zod ^3.25 || ^4.0`.

2. **`.describe()` metadata:** SDK reads `ZodType._def.description` to populate
   tool parameter descriptions. Zod 4 may store descriptions differently in the
   internal `_def` structure. MUST be verified post-migration.

3. **Structured outputs:** SDK validates tool results against Zod schemas.
   Zod 4 parse behavior is identical for the schema patterns PEAC uses.

### Verification checklist (MCP + Zod 4)

- [ ] `tools/list` returns correct JSON Schema for all 5 tools
- [ ] All `.describe()` strings appear in `inputSchema.properties[*].description`
- [ ] `verify` tool accepts/rejects same inputs as before
- [ ] `issue` tool produces valid JWS that can be verified
- [ ] `bundle` tool creates valid .peac.tar.gz bundles
- [ ] `inspect` and `decode` tools return correct structured output
- [ ] Error responses include correct Zod validation messages

---

## Rollback Plan

Zod 4 provides a permanent `"zod/v3"` subpath export. If Zod 4 migration
causes unforeseen issues in any package:

```typescript
// Emergency rollback for a specific file
import { z } from 'zod/v3';
```

This is an **escape hatch**, not a long-term strategy. Any package using
`zod/v3` should be migrated to `zod` (v4) within 1 release.

**Full rollback procedure:**

1. Revert the Zod version bump in `package.json`
2. Run `pnpm install` to restore Zod 3
3. All `.check()` -> `.superRefine()` (if already renamed)
4. Run full test suite

---

## `@zod/mini`: Future Optimization

Zod 4 ships `@zod/mini`: a smaller bundle (~57% smaller) for edge runtimes.

**Candidates for `@zod/mini`:**

- `surfaces/workers/cloudflare/`: Cloudflare Workers (bundle size matters)
- `surfaces/workers/fastly/`: Fastly Compute (bundle size matters)
- `surfaces/workers/akamai/`: Akamai EdgeWorkers (bundle size matters)

**NOT candidates:**

- `packages/schema/`: needs full Zod for `.superRefine()`/`.check()`,
  `.transform()`, `.pipe()`
- `packages/mcp-server/`: needs `.describe()` for MCP tool metadata

**Action:** Document for v0.11.1+ exploration. Not in scope for v0.11.0.

---

## Appendix: Full Audit Output

Run `node scripts/audit-zod-usage.mjs` for the latest machine-readable audit.

**Scan paths:**

- `packages/schema/src/`
- `packages/control/src/`
- `packages/protocol/src/`
- `packages/policy-kit/src/`
- `packages/mcp-server/src/`
- `apps/sandbox-issuer/src/`
- `apps/api/src/`

**Last run (2026-02-21):** 213 findings (5 HIGH, 38 MEDIUM, 62 LOW, 108 NONE).
