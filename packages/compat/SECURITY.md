# Security policy: `@peac/compat`

Internal workspace package. Not published to npm. Not a public attack surface.

The canonical security policy for the PEAC Protocol monorepo is the root
[`SECURITY.md`](../../SECURITY.md). Report vulnerabilities through the
process documented there.

This package is a type-surface scaffold for future cross-version /
cross-codec record-translation work; it has no runtime cryptographic
behavior of its own. Any security-relevant change must be coordinated
with the canonical codec / record-core implementation under
`packages/protocol/src/_internal/record-core/`.
