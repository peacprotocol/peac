# @peac/resolver-http (workspace-private)

> Internal-only package. Workspace-private per Revision 4 section 19.
> Never published. Never referenced by any published package.

## Status

Skeleton-only at v0.13.2 PR A Commit 1. Resolver logic is added in
subsequent commits of v0.13.2 PR A as a private composition layer over
published primitives (`@peac/net-node`, `@peac/jwks-cache`,
`@peac/kernel`, `@peac/crypto`, `@peac/schema`) for parity testing
against `@peac/protocol`'s existing self-contained resolver path on
shared local fixtures.

## Why this exists

v0.13.2 reboot adds a private composition layer over the existing
published network and JWKS primitives so the main core path can be
exercised in shadow mode by PR B without changing public protocol
behavior or dependency direction. This avoids creating a fourth
SSRF / JWKS code path: protocol stays self-contained and byte-stable;
resolver-http composes the two published primitives behind a
verifier-oriented interface; parity tests compare both paths on shared
local fixtures.

## Boundary (P0 invariants, LOCKED 2026-04-28)

- `@peac/protocol` must NOT import, depend on, re-export from, or emit
  a reference to `@peac/resolver-http`.
- `@peac/resolver-http` runtime source must NOT import `@peac/protocol`.
  Parity test files MAY import `@peac/protocol` for behavior comparison.
- `@peac/jwks-cache` is reused as a published primitive; not modified,
  not merged, not renamed in v0.13.2.
- `@peac/net-node` is reused as the canonical network-safety primitive;
  not modified in PR A.

Verified by:

- `tests/tooling/protocol-private-imports.test.ts`
- `tests/tooling/private-package-deps.test.ts`
- `tests/tooling/protocol-public-surface-stable.test.ts`
- `tests/tooling/internal-package-invisibility.test.ts`
- `tests/tooling/kernel-public-surface-stable.test.ts`
- `scripts/verify-dist-private-leaks.mjs`
- `scripts/release/pack-install-smoke.mjs`
- runtime-source isolation gate (added in Commit 2):
  `git grep -nE '@peac/protocol' packages/resolver-http/src packages/resolver-http/__tests__/_helpers`
  must be empty.

## Reference

- Revision 4 reboot plan section 7 (canonical specification).
- Revision 4 reboot plan section 7.1P (architecture lock).
- Revision 4 reboot plan section 7.2 (PR table; corrected wording).
- Revision 4 reboot plan section 7.2A (PR A acceptance checklist).
- `~/.claude/plans/tranquil-mirroring-fermat.md` (per-PR execution
  plan, local-only).
