# Security policy: `@peac/compat`

Workspace-private package. Not published to npm. Not a public attack surface.

The canonical security policy for the PEAC Protocol monorepo is the root
[`SECURITY.md`](../../SECURITY.md). Report vulnerabilities through the
process documented there.

This package holds the migration-class taxonomy and the archival-export
reader / writer / validator. It has no runtime cryptographic behavior of
its own. The reader and validator are pure functions: no network I/O,
no filesystem I/O, no logging of raw secrets. Any security-relevant
change must be coordinated with the canonical codec / record-core
implementation under `packages/protocol/src/_internal/record-core/`.
