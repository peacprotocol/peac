# Rollback path runbook (v0.14.0)

Operator runbook for the active internal rollback path on Wire 0.2
issuance and local verification.

The bounded validation path is now the primary internal admission path
for `issue()` and `verifyLocal()` in `@peac/protocol`. The previous
direct-canonical admission path remains available via the
`PEAC_INTERNAL_LEGACY_PATH` flag for diagnostic and rollback purposes.
Both flag values produce byte-equivalent public outputs across the
covered runtime matrix.

This runbook is the version-specific operator reference. The
release-neutral runbook for the flag itself lives at
[`docs/diagnostics/ROLLBACK-PATH.md`](ROLLBACK-PATH.md).

## What the rollback flag does

The rollback flag selects which internal admission path runs inside
the affected `@peac/protocol` entry points:

| Flag value | `issue()` admission path                         | `verifyLocal()` admission path                                       |
| ---------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| unset / 0  | Bounded validation gate (default)                | Bounded validation gate (default)                                    |
| `1`        | Inline `Wire02ClaimsSchema.safeParse` (rollback) | Inline `validateKernelConstraints` + `parseReceiptClaims` (rollback) |

The bounded validation gate at
[`packages/protocol/src/_internal/record-core/validation-gate.ts`](../../packages/protocol/src/_internal/record-core/validation-gate.ts)
is the single production wrapper. It is entrypoint-aware
(`surface: 'issueWire02' | 'verifyLocal'`) and applies a per-surface
production projection allowlist. On rejection it surfaces the
canonical error code, message, and details byte-equally with the
inline canonical sequence.

Wire 0.1 verification (`verifyReceipt()` in
[`packages/protocol/src/verify.ts`](../../packages/protocol/src/verify.ts))
is not routed through the bounded validation gate. The flag has no
behavioral effect at that entry point; the bounded validation gate is
keyed on Wire 0.2 claim shapes.

## When to set the flag

Set the rollback flag only as a diagnostic measure or as a controlled
fallback if a specific operational need surfaces. The default path is
the supported runtime for production. Both paths are tested on every
protocol-touching change by the rollback-path CI matrix.

Typical operator scenarios:

- A regression appears in production traffic on the default branch
  and you want to confirm whether the bounded validation gate is
  involved before filing a bug.
- You are running a parity comparison across the two paths offline
  for assurance.
- You are reproducing a customer report under the alternate path to
  isolate a code-path-dependent observation.

There is no scenario where setting the rollback flag is required for
correct operation. Both flag values are correct.

## How to enable the rollback flag

### Environment variable (Node.js, MCP server, CLI, reference verifier)

```bash
export PEAC_INTERNAL_LEGACY_PATH=1
```

Strict literal `'1'`. Any other value, including `'0'`, `'true'`,
`'yes'`, or empty, leaves the flag inactive. The reader runs once per
call into `issue()` / `verifyLocal()` / `verifyReceipt()`; the env
var is read per call, not cached at module scope, so the flag can be
toggled without process restart.

The MCP server, the `@peac/cli` binary, and the reference verifier
(`apps/api`) all respect the env var transparently because they
import `@peac/protocol` and read the flag on each protocol call.

### Programmatic option (internal callers only)

```ts
// internal-only; the field is NOT declared on the public option types
issue(options as { _internal: { legacyPath: boolean } });
verifyLocal(jws, publicKey, opts as { _internal: { legacyPath: boolean } });
```

The programmatic flag is reachable only via internal cast. Public
option types do not declare `_internal.legacyPath`, and the symbol
does not appear in any emitted `.d.ts` file in the published package.

### Browser and edge runtimes

When `process` is undefined (browser, edge, certain serverless
runtimes), the flag reader returns `false` without throwing. No
additional configuration is required for non-Node runtimes.

## What the rollback path preserves

For every input on the covered runtime matrix, both flag values
produce:

- **Byte-identical JWS output** from `issue()` (asserted by T8 in
  [`legacy-path-flag.test.ts`](../../packages/protocol/__tests__/_internal/legacy-path-flag.test.ts)).
- **Byte-equal `VerifyLocalResult` shape** from `verifyLocal()`
  (asserted by T9, including warning order via the canonical
  `sortWarnings` step at the materializer boundary).
- **Identical canonical error code, message, and details** on
  admission rejection (asserted by T12 for `issue()` schema rejection,
  T13 for `verifyLocal()` schema rejection on a validly signed
  payload, and T13b for `verifyLocal()` kernel-constraint rejection).
- **Identical thrown error class** (`IssueError` / typed
  `VerifyLocalFailure`).

The canonical materializer (claim construction, JWS sign / decode via
the codec, caller-option binding, temporal checks, type-extension
enforcement, policy-binding compute, bindings construction,
`sortWarnings`, success-return shape) is shared between branches.
The flag changes only the admission step.

## Observable surfaces that change

None expected for inputs on the covered runtime matrix. If a
discrepancy surfaces, file it as a regression. Both branches are
designed to produce identical public outputs.

The rollback-path CI matrix runs the `@peac/protocol` test suite
under both flag values on every protocol-touching change. Both halves
green is the gate.

## Telemetry and logging

The rollback flag does not emit telemetry by default. The flag's
value is not stamped on any emitted record, header, or response
body, and it is not emitted in any runtime record, header, response
body, or package declaration surface.

Operators investigating a regression may log the flag value through
their own observability layer. The reader function
[`readLegacyPathFlag`](../../packages/protocol/src/_internal/legacy-path.ts)
is internal but stable; reading it from internal tooling is
supported.

## Expected support window

The rollback flag is supported for the current release line. Any
removal or narrowing of the rollback path requires a separate
documented release note.

## How to remove the setting

The rollback procedure is intentionally trivial because both flag
values produce byte-equivalent public outputs:

1. **Unset the environment variable**:

   ```bash
   unset PEAC_INTERNAL_LEGACY_PATH
   ```

   Or set to any non-`'1'` value: `export PEAC_INTERNAL_LEGACY_PATH=0`.

2. **Drop the programmatic option**: remove any
   `_internal: { legacyPath: true }` literal from internal callers.

3. **Re-deploy**: no special migration is required. The on-disk JWS
   records, the wire format, and every public API are byte-stable
   across both flag values.

## What the rollback flag does NOT do

- Does NOT change `@peac/protocol.{issue, verifyLocal, verify}`
  signatures.
- Does NOT change the wire format. The `peac-receipt/0.1` envelope
  and the `interaction-record+jwt` JWS `typ` are unchanged.
- Does NOT change the OpenAPI verify contract.
- Does NOT change the reference verifier `POST /v1/verify` response shape.
- Does NOT publish from a workspace-private package. The flag lives
  entirely inside `@peac/protocol`.
- Does NOT introduce a new public emitted error code, a new public
  extension key, or a new typ.
- Does NOT change the on-disk JWS bytes for any deterministic
  issuance input.

## See also

- [`docs/diagnostics/ROLLBACK-PATH.md`](ROLLBACK-PATH.md): the
  release-neutral runbook for the flag itself (env-var parsing,
  programmatic option, browser-runtime guard, public-surface
  protection).
- [`docs/STABILITY-CONTRACT.md`](../STABILITY-CONTRACT.md): the
  internal-only flags table.
- [`packages/protocol/src/_internal/record-core/validation-gate.ts`](../../packages/protocol/src/_internal/record-core/validation-gate.ts):
  the production wrapper for the bounded validation path.
- [`packages/protocol/src/_internal/legacy-path.ts`](../../packages/protocol/src/_internal/legacy-path.ts):
  the flag reader.
