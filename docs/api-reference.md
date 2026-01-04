# API Reference (Informative)

Common HTTP headers and endpoints used alongside PEAC.

## HTTP Headers

PEAC uses a single canonical HTTP header for receipts:

- `PEAC-Receipt`: JWS-encoded receipt envelope (see `specs/kernel/constants.json`)

HTTP header names are case-insensitive per RFC 7230. Implementations MUST accept `PEAC-Receipt` and SHOULD tolerate lowercase variants (e.g., `peac-receipt`) as seen in HTTP/2 or gRPC metadata.

**Note:** All legacy `X-`-prefixed PEAC headers were removed in v0.9.15. Do not use or implement them.

## Endpoints

- Discovery: `/.well-known/peac.json` (see `docs/specs/` for format)
- Verification: Defined by the `verify` URL in discovery response
