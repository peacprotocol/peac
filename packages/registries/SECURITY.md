# Security policy: `@peac/registries`

Internal workspace package. Not published to npm. Not a public attack surface.

The canonical security policy for the PEAC Protocol monorepo is the root
[`SECURITY.md`](../../SECURITY.md). Report vulnerabilities through the
process documented there.

This package is a re-export facade over public `@peac/kernel` constants for
internal-consumer ergonomics; it has no runtime behavior of its own. Any
security-relevant change must be made in `@peac/kernel` (the public package
that defines the constants), not here.
