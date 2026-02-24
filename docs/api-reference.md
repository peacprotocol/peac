# API Reference (Informative)

Common HTTP headers and endpoints used alongside PEAC.

## HTTP Headers

PEAC uses a single canonical HTTP header for receipts:

- `PEAC-Receipt`: JWS-encoded receipt envelope (see `specs/kernel/constants.json`)

HTTP header names are case-insensitive per [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) (HTTP Semantics). Implementations MUST accept `PEAC-Receipt` and SHOULD tolerate lowercase variants (e.g., `peac-receipt`) as seen in HTTP/2 or gRPC metadata.

**Note:** All legacy `X-`-prefixed PEAC headers were removed in v0.9.15. Do not use or implement them.

## Error Responses

Error responses use [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem Details (`application/problem+json`). See [Error Response Registry](errors.md) for the full problem type registry.

## Endpoints

- Issuer configuration: `/.well-known/peac-issuer.json` (see [PEAC-ISSUER spec](specs/PEAC-ISSUER.md))
- Policy discovery: `/.well-known/peac.txt` (see [PEAC-TXT spec](specs/PEAC-TXT.md))
- JWKS: referenced via `jwks_uri` in `peac-issuer.json` (typically `/.well-known/jwks.json`)
- Verification: defined by the verifier implementation

### Verifier Resolution Flow

1. Extract `iss` claim from receipt
2. Fetch `<iss>/.well-known/peac-issuer.json` for issuer configuration
3. Fetch `jwks_uri` from issuer config to obtain public keys
4. Verify receipt signature against JWKS

## MCP Server Registry

The `@peac/mcp-server` package registers with the MCP Registry using the namespace `io.github.peacprotocol/peac`. This namespace uses the reverse-DNS convention based on the GitHub organization. See `packages/mcp-server/server.json` for the full registry manifest.
