# PEAC SDKs

Language-specific client libraries for PEAC protocol integration.

## Structure

- **[go/](go/)** - Go SDK (v0.9.25+) - Wire 0.1 issuance, verification, policy evaluation, JWKS caching
- **typescript/** - TypeScript SDK (via `@peac/protocol` package)
- **python/** - Python SDK (planned)
- **rust/** - Rust SDK (planned)

## Status

- **Go SDK (v0.9.25+):** Wire 0.1 issuance, verification, and policy evaluation with Ed25519 + JWKS support
- **TypeScript:** Use `@peac/protocol` and `@peac/schema` packages (current stable format)

## Architecture

SDKs provide client interfaces for receipt operations:

- Go SDK: issue, verify, and evaluate policy with `peac.Issue()`, `peac.Verify()`, `policy.Evaluate()` (Wire 0.1)
- TypeScript: use `@peac/protocol` for issuance and verification (current stable format)
- Discovery manifest parsing
- JWKS caching and rotation
- Error handling with retry logic

See [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for full architecture.
