// resolver-http (workspace-private)
//
// Internal-only barrel. This package is workspace-private per Revision 4
// section 19; never published; never referenced by any published
// package. Composition layer over published primitives (@peac/net-node,
// @peac/jwks-cache, @peac/kernel, @peac/crypto, @peac/schema) for parity
// testing against the protocol package's existing self-contained
// resolver path on shared local fixtures.
//
// P0 invariants (LOCKED): the protocol package must NOT import, depend
// on, re-export from, or emit a reference to this package; this
// package's runtime source must NOT import the protocol package
// (parity test files MAY import the protocol package for behavior
// comparison). @peac/jwks-cache and @peac/net-node are reused as
// published primitives; they are not modified, merged, or renamed in
// v0.13.2. Verified by tests/tooling/protocol-private-imports.test.ts
// and adjacent gates.

export { fetchJsonSafe, fetchJwksSafe, fetchRawSafe } from './fetch-safe.js';
export type {
  FetchSafeFailure,
  FetchSafeOptions,
  FetchSafeResult,
  FetchSafeSuccess,
  ResolverHttpErrorCode,
} from './types.js';
