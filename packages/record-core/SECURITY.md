# Security policy: `@peac/record-core`

Internal workspace package. Not published to npm. Not a public attack surface.

The canonical security policy for the PEAC Protocol monorepo is the root
[`SECURITY.md`](../../SECURITY.md). Report vulnerabilities through the
process documented there.

This package is a metadata placeholder; it has no runtime exports and no
runtime behavior. Any security-relevant change for the codec / record-core
implementation must be made in `packages/protocol/src/_internal/record-core/`
(the canonical location inside `@peac/protocol`'s own source tree), not here.
