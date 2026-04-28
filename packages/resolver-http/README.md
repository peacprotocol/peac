# @peac/resolver-http (workspace-private)

> Internal-only package. Workspace-private per Revision 4 section 19.
> Never published. Never referenced by any published package.

## Status

Skeleton-only at v0.13.2 PR A Commit 1. Resolver logic is added in
subsequent commits of v0.13.2 PR A as a private shadow of
`packages/protocol/src/{discovery, jwks-resolver, ssrf-safe-fetch,
pointer-fetch}.ts` for parity testing.

## Why this exists

v0.13.2 reboot extracts network-bearing resolution into a private
shadow package so the main core path can be exercised in shadow mode by
PR B without changing public protocol behavior or dependency direction.

## Boundary (P0, LOCKED 2026-04-27)

`@peac/protocol` must NOT import, depend on, re-export from, or emit a
reference to `@peac/resolver-http`. Verified by:

- `tests/tooling/protocol-private-imports.test.ts`
- `tests/tooling/private-package-deps.test.ts`
- `tests/tooling/protocol-public-surface-stable.test.ts`
- `tests/tooling/internal-package-invisibility.test.ts`
- `tests/tooling/kernel-public-surface-stable.test.ts`
- `scripts/verify-dist-private-leaks.mjs`
- `scripts/release/pack-install-smoke.mjs`

## Reference

- Revision 4 reboot plan section 7 (canonical specification).
- Revision 4 reboot plan section 7.1P (architecture lock).
- Revision 4 reboot plan section 7.2 (PR table; corrected wording).
- Revision 4 reboot plan section 7.2A (PR A acceptance checklist).
- `~/.claude/plans/tranquil-mirroring-fermat.md` (per-PR execution
  plan, local-only).
