# PEAC Protocol v0.12.11

**Date:** pending tag and publish

## Highlights

- Mapper-boundary `assertExplicitFinality` guard in `@peac/adapter-core` with strict / interop / legacy modes.
- ACP delegated-payment observation mapper with `artifact_kind` discriminator.
- MPP / paymentauth payment-attempt and settlement mappers with `artifact_kind` discriminator.
- x402 settlement proof extractor with dual-header precedence and observation mapper.
- Go middleware: panic recovery, bounded token-bucket rate limiter, `Logger` / `Metrics` interfaces, opt-in proxy-trust, request-body cap, per-request timeout.
- IDE plugin packs under `surfaces/plugin-pack/{cursor, codex, claude-code, vscode}/` with pinned `@peac/mcp-server@0.12.11` configs and offline smoke harnesses.
- Canonical Smithery pin at `packages/mcp-server/smithery.yaml` and a GitHub Copilot enterprise registry compatibility checker.
- `peac doctor` offline-default installability diagnostics.
- Single-file offline verify dashboard at `tools/verify-dashboard/index.html`.
- Conformance Section 26 commerce fixtures.
- New reference docs: `docs/compatibility/commerce-protocol-coverage.md`, `docs/compatibility/core-use-case-coverage.md`, `docs/compatibility/go-middleware.md`, `docs/profiles/acp-delegated-payment.md`, `docs/profiles/mpp-payment-evidence.md`, `docs/guides/marketplace-publishing.md`.

## Upgrade notes

No wire, schema, kernel, or error-registry migration required.

Commerce mapping entry points gain an opt-in `options` parameter with `mode` and `warn`. Default `interop` preserves existing behavior; `strict` rejects silent fallbacks (`currency: 'UNKNOWN'`, defaulted `env`) and cross-kind artifact misuse.

Go middleware `DefaultConfig()` now sets `RecoverPanics: true` and `MaxBodyBytes: 1 MiB`. Callers that rely on panics propagating into test harnesses can set `PanicRethrowInTest: true`. `TrustProxyHeaders` defaults to `false`.

## Validation

See `CHANGELOG.md` for the full v0.12.11 entry and `scripts/verify-release.mjs` output on the release tag.
