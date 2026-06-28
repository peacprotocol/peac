# API Reference (Informative)

Common HTTP headers and endpoints used alongside PEAC.

## HTTP Headers

PEAC uses a canonical HTTP header for receipts, plus optional pointer headers when the record is carried by reference (see `specs/kernel/constants.json`):

- `PEAC-Receipt`: JWS-encoded receipt envelope
- `PEAC-Receipt-Pointer`: RFC 9651 structured-field pointer to a receipt carried out of band
- `PEAC-Receipt-URL`: URL reference to a retrievable receipt

HTTP header names are case-insensitive per [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) (HTTP Semantics). Implementations MUST accept `PEAC-Receipt` and SHOULD tolerate lowercase variants (e.g., `peac-receipt`) as seen in HTTP/2 or gRPC metadata.

**Note:** All legacy `X-`-prefixed PEAC headers were removed in v0.9.15. Do not use or implement them.

## Error Responses

Error responses use [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem Details (`application/problem+json`). See [Error Response Registry](errors.md) for the full problem type registry.

## Endpoints

- Issuer configuration: `/.well-known/peac-issuer.json` (see [PEAC-ISSUER spec](specs/PEAC-ISSUER.md))
- Policy discovery: `/.well-known/peac.txt` (see [PEAC-TXT spec](specs/PEAC-TXT.md))
- JWKS: referenced via `jwks_uri` in `peac-issuer.json` (typically `/.well-known/jwks.json`)
- Verification: implementation-defined. The reference verifier exposes `POST /v1/verify` (see [`packages/schema/openapi/verify.yaml`](../packages/schema/openapi/verify.yaml)).

### Verifier Resolution Flow

1. Extract `iss` claim from receipt
2. Fetch `<iss>/.well-known/peac-issuer.json` for issuer configuration
3. Fetch `jwks_uri` from issuer config to obtain public keys
4. Verify receipt signature against JWKS

## Optional Online Replay Guard

For online consumers that have already verified a record, `@peac/protocol` exports an optional `createReplayGuard` helper for bounded replay detection over the existing `(iss, jti)` pair within an `iat` window. It is composable and is not part of stateless verification. See the [Bounded Replay Guard Profile](specs/REPLAY-GUARD-PROFILE.md).

## MCP Server Registry

The `@peac/mcp-server` package registers with the MCP Registry using the namespace `io.github.peacprotocol/peac`. This namespace uses the reverse-DNS convention based on the GitHub organization. See `packages/mcp-server/server.json` for the full registry manifest.
