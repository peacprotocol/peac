# Error-path hygiene baseline (v0.13.1)

This baseline records the state of the error-path hygiene gate at the
v0.13.1 release. It is informative; the authoritative gate lives in
`scripts/verify-error-path-hygiene.mjs` and the allowlist at
`scripts/verify-error-path-hygiene.allowlist.json`.

## What is blocked

The gate inspects production source under `packages/**/src/**`,
`apps/**/src/**`, `surfaces/**/src/**`, and `sdks/**/src/**` for
unambiguous AST patterns. Sensitive paths add path-scoped rules:

| Rule                           | Scope                           |
| ------------------------------ | ------------------------------- |
| `emptyCatch`                   | sensitive production paths only |
| `replacementErrorWithoutCause` | sensitive production paths only |
| `logAndContinue`               | sensitive production paths only |

Sensitive production paths are:

- `packages/protocol/`
- `packages/crypto/`
- `packages/schema/`
- `packages/net/`
- `packages/mappings/paymentauth/`
- `packages/mappings/x402/`
- `packages/adapters/x402/`
- `packages/pay402/`
- `packages/mcp-server/`
- `apps/api/`

## What is report-only

Findings are surfaced for visibility but never fail the gate:

- `silentDefault` — return-on-catch pattern is widespread and
  legitimate for predicate functions, try-parsers, capability
  detection, and structured-fallback handlers
- `emptyCatch` and `replacementErrorWithoutCause` outside sensitive
  paths
- ambiguous classifications produced by the AST classifier
- (future) barrel density, directory fanout, duplicate test mock
  setup, legitimate compatibility pass-through wrappers

## What is allowed with rationale

The allowlist at `scripts/verify-error-path-hygiene.allowlist.json`
records 16 entries at v0.13.1: cleanup-only catches around temp-dir
cleanup, lockfile release, and atomic write fallback; telemetry-only
catches that document `MUST NOT throw` invariants in audit / telemetry
hooks; DNS family-fallback catches in `@peac/net-node`; per-rail
graceful degradation in `@peac/pay402`. Each entry carries a `rule`,
`path`, `lineHint` or `symbolHint`, `reason`, `category`, and
`reviewAfter` (for debt categories).

## Reproduction

From the repository root:

```bash
pnpm verify:error-path-hygiene
pnpm test:error-path-hygiene
```

## What is intentionally not enforced

- pass-through wrapper density and barrel density
- function-count or KLOC-based scores
- examples and tests beyond catch-block AST findings (examples teach
  patterns; tests have their own conventions)

## Boundaries

This release prep ships:

- a repo-native verifier under `scripts/`
- a small allowlist file with schema-enforced rationale
- a baseline doc and self-test fixture corpus
- 8 surgical fixes that preserve `cause` on replacement Errors

It does not change:

- the public API of `@peac/protocol`, `@peac/crypto`, `@peac/schema`,
  `@peac/kernel`, or `@peac/mcp-server` (the `McpServerError`
  constructor takes one new optional `ErrorOptions` parameter; existing
  callers are byte-stable)
- the `peac-receipt/0.1` envelope or `interaction-record+jwt` JWS `typ`
- the signing envelope or any error code
- the active publish manifest (still 36 packages)
- the npm `latest` channel (no version bump in this PR)
