// @peac/resolver-http (workspace-private)
//
// Internal-only barrel. This package is workspace-private per Revision 4
// section 19; never published; never referenced by any published
// package. Resolver logic is added in subsequent commits of v0.13.2 PR
// A as a private composition layer over published primitives
// (@peac/net-node, @peac/jwks-cache, @peac/kernel, @peac/crypto,
// @peac/schema) for parity testing against @peac/protocol's existing
// self-contained resolver path on shared local fixtures.
//
// P0 invariants (LOCKED): @peac/protocol must NOT import, depend on,
// re-export from, or emit a reference to @peac/resolver-http;
// @peac/resolver-http runtime source must NOT import @peac/protocol
// (parity test files MAY import protocol for behavior comparison).
// @peac/jwks-cache and @peac/net-node are reused as published
// primitives; they are not modified, merged, or renamed in v0.13.2.
// Verified by tests/tooling/protocol-private-imports.test.ts and
// adjacent gates.

export {};
