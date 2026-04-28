// @peac/resolver-http (workspace-private)
//
// Internal-only barrel. This package is workspace-private per Revision 4
// section 19; never published; never referenced by any published
// package. Resolver logic is added in subsequent commits of v0.13.2 PR
// A as a private shadow of packages/protocol/src/{discovery, jwks-
// resolver, ssrf-safe-fetch, pointer-fetch}.ts for parity testing.
//
// P0 invariant (LOCKED): @peac/protocol must NOT import, depend on,
// re-export from, or emit a reference to @peac/resolver-http. Verified
// by tests/tooling/protocol-private-imports.test.ts and adjacent
// gates.

export {};
