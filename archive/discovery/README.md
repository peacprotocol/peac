# @peac/disc (ARCHIVED at v0.13.1)

This package is no longer published from the PEAC monorepo.

Historical npm versions (≤ 0.13.0) remain installable from the npm registry but
are deprecated. The deprecation messages were dispatched at the v0.13.0 release.
See `docs/MIGRATION_CURRENT.md` for migration guidance.

## Why archived

`@peac/disc` was a thin loader/validator and remote fetcher for `peac.txt`
policy documents (`peac-policy/0.1`). At v0.12.14 it was deprecated in favor of
`@peac/policy-kit.parsePolicyDocument` (strict parse) and an inline
SSRF-aware HTTP client for the remote-fetch path.

v0.13.1 completes the retirement: the package is removed from
`pnpm-workspace.yaml` (via this directory move out of the `packages/*` glob)
and from `scripts/publish-manifest.json`. The CLI `peac discover <url>`
command continues to work via an internal helper at
`packages/cli/src/lib/policy-document-discovery.ts` that uses public
`@peac/net-node.safeFetchRaw` and `@peac/policy-kit.parsePolicyDocument`,
plus a tolerant two-pass parse step that preserves the legacy-line behavior
this package used to provide.

## How to migrate

For canonical migration guidance, see
[`docs/MIGRATION_CURRENT.md`](../../docs/MIGRATION_CURRENT.md).

The CLI contains an internal compatibility helper that preserves the old
tolerant parsing behavior for the `peac discover` command and conformance
checks. It is an implementation detail, not a public API or supported
import path.

For external code:

- use `parsePolicyDocument` from `@peac/policy-kit` for strict parsing of
  `peac-policy/0.1` documents;
- if tolerant legacy-line handling is required, copy the behavior
  intentionally into your own code rather than importing CLI internals.

Reference of the previous public-API mapping:

- `import { parse } from '@peac/disc'` → `import { parsePolicyDocument } from '@peac/policy-kit'`.
  Note: `parsePolicyDocument` throws `PolicyValidationError` /
  `PolicyLoadError` on failure, where the retired `@peac/disc.parse`
  returned a structured `ParseResult { valid, data?, errors?, warnings? }`
  and was tolerant of legacy key-discovery lines (`verify:`,
  `public_keys:`, `jwks:`) via a two-pass strip-and-retry. If you need the
  tolerant behavior, implement it intentionally in your own code; do not
  import the CLI helper.
- `import { loadPolicyDocument } from '@peac/disc'` →
  `import { loadPolicyDocument } from '@peac/policy-kit'` (already
  supported since v0.12.14).
- `import { discover } from '@peac/disc'` → combine
  `@peac/net-node.safeFetchRaw` (SSRF-safe, byte-capped, timeout-bounded,
  redirect-policy-aware) with the parse step above. Path comes from
  `@peac/kernel.POLICY.manifestPath`; body cap from
  `@peac/kernel.POLICY.maxBytes`. Use `safeFetchRaw`'s `maxResponseBytes`
  and `timeoutMs` options. Always call `await raw.close()` in a `finally`
  block after reading the response body to avoid socket leaks.

## What is preserved here

- `package.json`, `src/`, `tests/`, `tsconfig.json`, `tsup.config.ts`: the
  full v0.13.0 source, kept for archaeology only.
- `dist/`, `node_modules/`: historical build outputs (subject to local
  cleanup; not normative).
