# @peac/resolver-http (workspace-private)

> Internal-only package. Workspace-private per Revision 4 section 19.
> Never published. Never referenced by any published package.
> Not a public API. Not part of PEAC's external integration surface.

## Status

`@peac/resolver-http` is a workspace-private composition layer over
existing published primitives. v0.13.2 PR A adds the package and its
runtime modules, no-network public-API smoke coverage, resolver-http
local harness coverage, and SSRF, redirect, timeout, cache-isolation,
and byte-cap test coverage. No `apps/api` or Hosted Verify
production-path switch is included in PR A; that wiring is deferred to
PR B. Full fetched-body cross-implementation pointer parity is
intentionally re-homed to PR B shadow mode (see `## Parity testing`
below).

## Why this exists

v0.13.2 reboot adds a private composition layer over the existing
published network and JWKS primitives so the verifier core path can be
exercised in shadow mode by PR B without changing public protocol
behavior or dependency direction. Protocol stays self-contained and
byte-stable; resolver-http composes the published primitives behind a
verifier-oriented interface; full cross-implementation parity belongs
to PR B shadow mode.

## Composition

Resolver-http composes only published packages:

- `@peac/net-node`: SSRF-safe network fetches, DNS pinning, redirect
  policy, and response byte-limit behavior.
- `@peac/jwks-cache`: package-root URL pre-check, in-memory cache
  primitives, and Ed25519 JWK import validation
  (`importJwkAsEd25519`).
- `@peac/kernel`: `VERIFIER_LIMITS` and `ISSUER_CONFIG` constants.
- `@peac/crypto`: package-root primitives (`sha256Hex`,
  `generateKeypair`, `signWire02`, `verify`, `decode`) for digest
  computation and real-JWS test fixtures.

## Boundary (P0 invariants, LOCKED 2026-04-28)

- `@peac/protocol` must NOT import, depend on, re-export from, or emit
  a reference to `@peac/resolver-http`.
- `@peac/resolver-http` runtime source must NOT import `@peac/protocol`.
  Parity test files MAY import `@peac/protocol` for behavior
  comparison.
- `@peac/jwks-cache` is reused as a published primitive; not modified,
  not merged, not renamed in v0.13.2.
- `@peac/net-node` is reused as the canonical network-safety primitive;
  not modified in PR A.

Hard rules carried forward:

- No runtime `@peac/protocol` dependency.
- No `@peac/schema` dependency (not even type-only imports).
- No `zod` runtime dependency.
- No direct `fetch()`, `globalThis.fetch`, `fetchWithTimeout`,
  `resolveKey()`, or `createResolver()` calls in resolver-http source.
  All network I/O is mediated by `fetchJsonSafe`, `fetchJwksSafe`, or
  `fetchRawSafe`.
- No private package subpaths anywhere under `packages/resolver-http/`.
- No external network in any test.
- Absent from `scripts/publish-manifest.json` and from any public
  documentation, example, integrator kit, or surfaces manifest.

Verified by:

- `tests/tooling/protocol-private-imports.test.ts`
- `tests/tooling/private-package-deps.test.ts`
- `tests/tooling/protocol-public-surface-stable.test.ts`
- `tests/tooling/internal-package-invisibility.test.ts`
- `tests/tooling/kernel-public-surface-stable.test.ts`
- `scripts/verify-dist-private-leaks.mjs`
- `scripts/release/pack-install-smoke.mjs`
- runtime-source isolation gate covering resolver-http source and the
  `_helpers/` test directory.

## Parity testing

PR A includes no-network public-API smoke coverage (`parity.*.test.ts`)
plus a resolver-http local harness exercising the composed discovery,
JWKS, and pointer-fetch paths against shared local fixtures. This does
not claim full fetched-body cross-implementation byte-equal parity
against protocol's self-contained resolver. Full cross-implementation
pointer parity is intentionally re-homed to PR B shadow mode, where
`apps/api` drives both paths through real shadow responses without
protocol-internal mocking.

## Reference

- Revision 4 reboot plan section 7 (canonical specification).
- Revision 4 reboot plan section 7.1P (architecture lock).
- Revision 4 reboot plan section 7.2 (PR table).
- Revision 4 reboot plan section 7.2A (PR A acceptance checklist).
