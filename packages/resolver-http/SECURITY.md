# Security posture

`@peac/resolver-http` is a workspace-private internal package. It is
never published and is never referenced by any published package.
Reporting and disclosure follow the repository SECURITY.md at the
repository root.

The composition layer delegates network and JWKS policy to existing
published primitives (`@peac/net-node`, `@peac/jwks-cache`) and pulls
verifier-tuned defaults from `@peac/kernel.VERIFIER_LIMITS`. Every
existing security invariant therefore continues to apply, sourced from
the underlying primitives.

## Network safety

- All network I/O is mediated by `fetchJsonSafe`, `fetchJwksSafe`, or
  `fetchRawSafe`. No call site uses `fetch()`, `globalThis.fetch`, or
  `fetchWithTimeout` directly.
- HTTPS-only enforcement at every call site.
- Verifier limits override broader net-node defaults; redirect chain
  cap, timeout ceiling, response byte cap, and JWKS byte cap are all
  read from `@peac/kernel.VERIFIER_LIMITS`.
- SSRF prevention (private, loopback, and reserved-range block;
  metadata IP block), DNS pinning, dangerous-port block, and redirect
  policy are inherited from `@peac/net-node`.

## JWKS safety

- `@peac/jwks-cache.resolveKey()` and `createResolver()` are not
  called; both use a global fetch path that bypasses verifier limits.
- JWKS network fetches go through `fetchJwksSafe`.
- The cache key includes the issuer origin, the normalized `jwks_uri`
  digest, and the JWK `kid`; cache state is never shared across
  issuers.
- The matched Ed25519 JWK is validated via
  `@peac/jwks-cache.importJwkAsEd25519` before being cached.

## Pointer-fetch safety

- String-mode digest: raw bytes, then UTF-8 decode via
  `TextDecoder('utf-8', { fatal: false })`, then
  `sha256Hex(receiptString)`. Raw-bytes-only digest is forbidden.
- Invalid expected-digest format and malformed compact JWS (non
  three-segment) produce distinct error classes.
- Content-type warnings on success are bounded and redaction-safe.

## Redaction

- No raw URL path or query.
- No headers.
- No body bytes or excerpts.
- No bearer tokens, cookies, private key material, or other
  secret-looking values.
- Diagnostic output is limited to bounded numeric counters and enum
  classes.

## Package boundary

- No runtime `@peac/protocol` dependency.
- No `@peac/schema` dependency.
- No `zod` dependency.
- No private package subpaths.
