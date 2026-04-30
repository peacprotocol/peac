# v0.13.2 release exercise notes

This document records the release validation scope for v0.13.2. It does not claim a third-party external interoperability exercise. It does not claim a live pointer-fetch route shadow exercise. It records what v0.13.2's pre-release validation actually covered.

## Hosted Verify pointer-fetch posture

Hosted Verify (`apps/api`) currently accepts inline compact JWS receipts. The `/v1/verify` route schema requires a `receipt` field carrying the JWS string directly; it does not accept a pointer URL or an expected digest. Pointer dereferencing is caller-side: callers fetch the pointer URL on their own and pass the resulting JWS to Hosted Verify.

Live pointer-fetch route shadowing was therefore not exercised in v0.13.2. The shadow-mode diagnostic foundation runs against in-process fixtures only; no production verify request crossed the foundation in this release.

## What v0.13.2 validated

The release covers four areas of internal-only diagnostic and contract work. None of them changes a public protocol surface or a published wire identifier.

### Workspace-private resolver composition layer

A workspace-private resolver composition layer was extracted under `packages/resolver-http`. It composes existing published primitives (`@peac/net-node`, `@peac/jwks-cache`, `@peac/kernel`, `@peac/crypto`) behind a verifier-oriented interface. The package is workspace-private, absent from the publish manifest, and not exposed on any public surface.

Validation:

- Package-level test suites pass.
- `pnpm publish --dry-run --recursive` does not resolve the workspace-private resolver.
- Internal-package invisibility test asserts the package name is absent from `docs/**`, `examples/**`, `integrator-kits/**`, `surfaces/**`, `README.md`, `llms.txt`, and `CHANGELOG.md`.

### Shadow-mode pointer-fetch foundation

`apps/api` carries a workspace-private shadow-mode pointer-fetch foundation. The foundation provides a lazy-import boundary, normalization shapes, a redaction-safe in-memory mismatch sink, a pure-function parity verdict computer, and a public-root no-network parity smoke. It is gated by an internal-only flag (`PEAC_INTERNAL_SHADOW_RESOLVER`) and is OFF by default.

The foundation does not wire live route shadowing for the reasons stated above. Live route shadowing requires either (a) a Hosted Verify pointer-input request shape, or (b) a `@peac/protocol` diagnostic capture hook. Neither exists in v0.13.2.

Validation:

- Foundation tests cover the lazy-import boundary, the normalized class taxonomy, parity-verdict edge cases, the bounded ring-buffer sink (including its progressive-degradation cap), and the public-root no-network parity smoke against the protocol pointer-fetch path and the workspace-private resolver pointer-fetch path.
- Threat-model entries (`T-SHDW-01..06`) link to the test files that exercise each mitigation.
- Stability-contract rows declare both internal-only flags as unstable and not part of the public surface.
- Shadow-foundation diagnostics live at `docs/diagnostics/SHADOW-MISMATCHES.md`.

### Hosted Verify body-size boundary

The 256 KiB raw body-size invariant on `/v1/verify` and `/v1/issue` is now exercised by exact-byte boundary tests. The tests use `TextEncoder().encode().byteLength` to construct request bodies of precisely `MAX_BODY_SIZE` and `MAX_BODY_SIZE + 1` bytes and assert that the at-limit case does not return `E_PAYLOAD_TOO_LARGE` while the over-limit case does.

The other receipt-content invariants in `docs/specs/RESOURCE-LIMITS.md` (nesting depth, array length, object keys, string length, total nodes) are already covered by `packages/protocol/__tests__/_internal/resource-limits.test.ts` and `packages/schema/__tests__/constraints.test.ts`. v0.13.2 does not duplicate that coverage.

### Workspace-private compat helpers

A workspace-private package contract for the migration-class taxonomy and the archival-export reader / writer / validator was finalized in v0.13.2. Reader / writer / validator helpers exposed by that package contract:

- `serializeArchivalBundle(bundle)` produces deterministic JSON output with stable key order; no wall-clock or random fields.
- `parseArchivalBundle(input)` parses and validates with throwing semantics.
- `validateArchivalBundle(input)` returns a discriminated-union result.
- The validator rejects cyclic payloads and sparse arrays as `archival_invalid_payload`.
- The validator's version-mismatch message states the constraint without echoing caller-provided values.

Validation:

- Forty-two package-level tests cover deterministic serialization, key-order independence, alphabetical key order in output, no-wall-clock-or-random invariant, validate-before-serialize discipline, JSON parse errors, twelve discrete failure codes, all four valid migration classes, payload preservation, cyclic-payload rejection, sparse-array rejection, dense-array acceptance, and non-reflective version-error messages.
- Package contract docs are in `packages/compat/spec/ARCHIVAL-EXPORT.md` and `packages/compat/spec/MIGRATION-CLASSES.md`.

## What v0.13.2 explicitly did not validate

- A third-party external party did not exercise the new internal core path in this release window.
- Live Hosted Verify route shadowing was not exercised.
- No new public protocol surface was added; no public spec under `docs/specs/` was created for the workspace-private packages.
- No publish manifest change; the active publish set remains 36 packages.
- No wire-format change; the legacy `peac-receipt/0.1` and current `interaction-record+jwt` shapes are unchanged.

## Aggregate gates run pre-release

- Full repository test suite (`pnpm test`) green across all packages.
- Tooling tests (`pnpm exec vitest run tests/tooling`) green, including the internal-package invisibility test.
- Build (`pnpm build`) green across the workspace.
- Lint (`pnpm lint`) green.
- `verify-local-doc-truth`, `verify-final-hygiene`, `forbid-strings`, `verify-dist-private-leaks` all clean.
- `pnpm publish --dry-run --recursive --no-git-checks`: workspace-private packages absent.
- Pre-push gate ran the strict CI-parity profile and the full release-class profile on every push.

## Posture going forward

The diagnostic foundation work shipped in v0.13.2 is the substrate for future releases that may add a Hosted Verify pointer-input feature or a `@peac/protocol` diagnostic capture hook. Once either exists, the foundation can be wired through real verify traffic without the no-double-fetch invariant being violated. Until then, v0.13.2 ships the foundation and its no-network parity smoke only.
