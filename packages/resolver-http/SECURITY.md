# Security posture

`@peac/resolver-http` is a workspace-private internal package. It is
never published and is never referenced by any published package.
Reporting and disclosure follow the repository SECURITY.md at the
repository root.

The composition layer added in subsequent commits of v0.13.2 PR A
delegates network and JWKS policy to existing published primitives
(`@peac/net-node`, `@peac/jwks-cache`) and pulls verifier-tuned
defaults from `@peac/kernel.VERIFIER_LIMITS`. Every existing security
invariant therefore continues to apply, sourced from the underlying
primitives:

- SSRF prevention (private / loopback / reserved-range block; metadata
  IP block; HTTPS enforcement) — see `@peac/net-node` and
  `@peac/jwks-cache` security docs.
- Redirect policy (chain cap; cross-origin rule) — verifier limit from
  `@peac/kernel.VERIFIER_LIMITS.maxRedirects`.
- Timeout ceiling — verifier limit from
  `@peac/kernel.VERIFIER_LIMITS.fetchTimeoutMs`.
- Response byte cap — verifier limits from
  `@peac/kernel.VERIFIER_LIMITS.maxResponseBytes` (general) and
  `maxJwksBytes` (JWKS).
- Cache isolation (issuer-keyed; never cross-issuer) — provided by
  `@peac/jwks-cache`.
- Redaction discipline: no raw URL path / query / headers / body
  bytes / bearer tokens / cookies / private keys / JWKS body excerpts
  in any internal mismatch report or error message; bounded numeric
  counters and enum classes only.
