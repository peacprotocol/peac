# @peac/app-api

PEAC Verify API server with RFC 9457 Problem Details.

## Quick Start

```bash
pnpm install
pnpm build
pnpm start
# Listening on http://localhost:3000
```

## Endpoints

### `POST /api/v1/verify`

Verify a PEAC receipt.

**Request:**

```bash
curl -X POST http://localhost:3000/api/v1/verify \
  -H "Content-Type: application/json" \
  -d '{"receipt": "eyJhbGciOiJFZERTQSIs..."}'
```

**Request body:**

```json
{
  "receipt": "<JWS compact serialization>",
  "public_key": "<optional base64url Ed25519 public key>"
}
```

**Success response (200):**

```json
{
  "valid": true,
  "claims": {
    "iss": "https://sandbox.peacprotocol.org",
    "aud": "https://example.com",
    "iat": 1738756800,
    "exp": 1738760400,
    "rid": "receipt-id"
  }
}
```

**Error response (RFC 9457):**

```json
{
  "type": "https://www.peacprotocol.org/problems/invalid-jws-format",
  "title": "Invalid JWS Format",
  "status": 422,
  "detail": "Receipt is not valid JWS compact serialization"
}
```

All error responses use `Content-Type: application/problem+json`.

### `GET /health`

Health check endpoint.

```json
{"ok": true}
```

### `POST /verify` (deprecated)

Legacy verify endpoint. Use `/api/v1/verify` instead.

## Rate Limits

| Tier | Limit | Window | Header |
|------|-------|--------|--------|
| Anonymous | 100 requests | 1 minute | -- |
| API Key | 1000 requests | 1 minute | `X-API-Key` |

All responses include RFC 9333 rate limit headers:
- `RateLimit-Limit` -- Maximum requests per window
- `RateLimit-Remaining` -- Remaining requests in current window
- `RateLimit-Reset` -- Seconds until window reset

## HTTP Status Codes

| Status | Meaning |
|--------|---------|
| 200 | Verification complete |
| 413 | Receipt too large (> 256 KB) |
| 422 | Invalid receipt, untrusted issuer, or missing claims |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

## Security Headers

All responses include:
- `X-Content-Type-Options: nosniff`
- `Cache-Control: no-store`
- `Referrer-Policy: no-referrer`
- `X-Frame-Options: DENY`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `PEAC_TRUST_PROXY` | unset | Set to `1` to trust `X-Forwarded-*` headers behind a reverse proxy |

## Trusted Issuers

The verify API only fetches JWKS from trusted issuers. The default allowlist includes `https://sandbox.peacprotocol.org`. Configure via the trusted issuers list in `verify-v1.ts`.

## License

Apache-2.0
