# PEAC SDKs

Language-specific client libraries for PEAC protocol integration.

## Structure

- **[go/](go/)** - Go SDK (v0.9.25+) - Receipt verification, JWKS caching
- **typescript/** - TypeScript SDK (via `@peac/protocol` package)
- **python/** - Python SDK (planned)
- **rust/** - Rust SDK (planned)

## Status

- **Go SDK (v0.9.25+):** Minimal verifier with Ed25519 + JWKS support
- **TypeScript:** Use `@peac/protocol` and `@peac/schema` packages

## Architecture

SDKs provide high-level client interfaces built on top of `packages/protocol`:

- Receipt issuance and verification
- Discovery manifest parsing
- JWKS caching and rotation
- Transport bindings (HTTP, gRPC, WebSocket)
- Error handling with retry logic

See [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for full architecture.
