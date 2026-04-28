# Security posture

`@peac/resolver-http` is a workspace-private internal package. It is
never published and is never referenced by any published package.
Reporting and disclosure follow the repository SECURITY.md at the
repository root.

The shadow resolver implementation added in subsequent commits of
v0.13.2 PR A preserves every existing security invariant from
`packages/protocol/src/{discovery, jwks-resolver, ssrf-safe-fetch,
pointer-fetch}.ts`:

- SSRF prevention (private / loopback / reserved-range block; metadata
  IP block; HTTPS enforcement).
- Redirect policy (chain cap; cross-origin rule).
- Timeout ceiling.
- Response byte cap.
- Cache isolation (tenant-keyed; never cross-issuer).
- No raw secret / URL / header / body bytes in any internal mismatch
  report.
