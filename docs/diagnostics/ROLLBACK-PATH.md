# Internal rollback-path flag

Operator runbook for the `PEAC_INTERNAL_LEGACY_PATH` flag introduced for release validation.

Both flag values currently use the same protocol path. The flag reader is exercised for release validation without changing public behavior.

This document explains what the flag does, how to set it, how to verify both flag values, and how to remove the setting if needed.

## What the flag does today

- Internal-only flag plumbed into `issueWire02()`, `verifyLocal()`, and `verifyReceipt()` in `@peac/protocol`.
- Read at the top of each entry point as a guarded read that intentionally discards the returned boolean.
- Both flag values currently use the same protocol path. The flag reader is exercised for release validation without changing public behavior.
- Internal-only: not declared on any public option type (`IssueOptions`, `VerifyLocalOptions`, `VerifyOptions`); accessible only via internal cast inside `@peac/protocol`. The public TypeScript declaration surface is unchanged.

The implementation lives at [`packages/protocol/src/_internal/legacy-path.ts`](../../packages/protocol/src/_internal/legacy-path.ts) and mirrors the existing internal-flag pattern at [`packages/protocol/src/_internal/shadow.ts`](../../packages/protocol/src/_internal/shadow.ts).

## How to enable or set the flag

### Environment variable

```bash
export PEAC_INTERNAL_LEGACY_PATH=1
```

Strict literal `'1'`. Any other value, including `'0'`, `'true'`, `'yes'`, `''`, leaves the flag inactive. Runtime reads occur on each call into `issue()` / `verifyLocal()` / `verifyReceipt()`; the env var is read per call, not cached at module scope, so tests and operators can toggle it dynamically.

### Programmatic option (internal callers only)

```ts
// internal-only; the field is NOT declared on the public option types
issue(options as { _internal: { legacyPath: boolean } });
```

The programmatic flag is reachable only via internal cast. Public option types do not declare `_internal.legacyPath`, and the symbol does not appear in any emitted `.d.ts` file in the published package.

### Browser and edge-runtime guard

When `process` is undefined (browser, edge, certain serverless runtimes), the flag reader returns `false` without throwing. No additional configuration is required for non-Node runtimes.

## How to verify both flag values

### Targeted CI matrix

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) defines a `protocol-rollback-path-matrix` job gated on `detect-changes.outputs.core == 'true'`. On protocol-touching PRs, the matrix runs the `@peac/protocol` test suite under `PEAC_INTERNAL_LEGACY_PATH=0` and `=1`. Both halves green is the gate.

### Local verification

```bash
pnpm --filter '@peac/protocol...' build

PEAC_INTERNAL_LEGACY_PATH=0 pnpm --filter @peac/protocol test
PEAC_INTERNAL_LEGACY_PATH=1 pnpm --filter @peac/protocol test
```

Identical pass counts under both values demonstrate that the flag has no observable runtime effect on the protocol test suite.

### Self-tests

The flag reader has dedicated unit tests at [`packages/protocol/__tests__/_internal/legacy-path-flag.test.ts`](../../packages/protocol/__tests__/_internal/legacy-path-flag.test.ts) covering: env-variable parsing (strict `'1'` semantics), programmatic-option parsing, browser/edge runtime guard, and `issue()` / `verifyLocal()` byte-equivalence across both flag values using the existing fixed-seed deterministic pattern.

## How to remove the setting

The rollback procedure is intentionally trivial because both flag values use the same path:

1. **Unset the environment variable**:

   ```bash
   unset PEAC_INTERNAL_LEGACY_PATH
   ```

   Or set to any non-`'1'` value: `export PEAC_INTERNAL_LEGACY_PATH=0`.

2. **Drop the programmatic option**: remove any `_internal: { legacyPath: true }` literal from internal callers.

3. **Re-deploy**: no special migration is required. The on-disk JWS records, the wire format, and every public API are byte-stable across both flag values.

## What it does NOT do

- Does NOT change `@peac/protocol.{issue, verifyLocal, verify}` signatures.
- Does NOT change the wire format. The `peac-receipt/0.1` envelope and the `interaction-record+jwt` JWS `typ` are unchanged.
- Does NOT change the OpenAPI verify contract.
- Does NOT change the Hosted Verify response shape.
- Does NOT publish from a workspace-private package. The flag lives entirely inside `@peac/protocol`.
- Does NOT introduce a new public emitted error code, a new public extension key, or a new typ.

## Public-surface protection

Three independent gates ensure the flag does not leak onto the public TypeScript surface:

- [`scripts/verify-dist-private-leaks.mjs`](../../scripts/verify-dist-private-leaks.mjs) (Tier 1): scans every `.d.ts` and `.cjs`/`.mjs` runtime file across the 36 publish-manifest packages for forbidden identifiers (`PEAC_INTERNAL_LEGACY_PATH`, `_internal.legacyPath`, etc.). The identifiers are allowlisted only in `@peac/protocol` runtime files, never in `.d.ts`, never in any other package.
- [`scripts/verify-no-semantic-widening.mjs`](../../scripts/verify-no-semantic-widening.mjs): public-surface grep across configured user-facing entry files and directories such as README, CHANGELOG, examples, integrator-kits, surfaces, and selected docs. Diagnostics runbooks are intentionally outside that scanned set.
- The targeted CI matrix described above asserts the protocol test suite is equivalent under both flag values.

## See also

- [`docs/specs/RESOURCE-LIMITS.md`](../specs/RESOURCE-LIMITS.md): network and resource-limit invariants for verifier-bearing paths.
- [`docs/STABILITY-CONTRACT.md`](../STABILITY-CONTRACT.md): public stability classifications. Internal-only flags are not part of the public stability contract; this runbook is the authoritative reference for the rollback-path flag.
