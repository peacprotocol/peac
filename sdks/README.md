# PEAC SDKs

Language-specific client libraries for PEAC protocol integration.

## Structure

- **[typescript/](typescript/)** - TypeScript/JavaScript SDK (v0.9.17+)
- **[python/](python/)** - Python SDK (v0.9.18+)
- **[go/](go/)** - Go SDK (v0.9.19+)
- **[rust/](rust/)** - Rust SDK (v0.9.20+)

## Status

All SDKs are placeholders in v0.9.15. Implementation begins in v0.9.17+.

## Architecture

SDKs provide high-level client interfaces built on top of `packages/protocol`:

- Receipt issuance and verification
- Discovery manifest parsing
- JWKS caching and rotation
- Transport bindings (HTTP, gRPC, WebSocket)
- Error handling with retry logic

See [REPOSITORY_ARCHITECTURE.md](../REPOSITORY_ARCHITECTURE.md) for full architecture.
