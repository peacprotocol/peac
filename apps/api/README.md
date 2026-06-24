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

### `POST /v1/verify`

Verify a PEAC receipt. This is the canonical verify operation; see `packages/schema/openapi/verify.yaml` and [`docs/HOSTED_VERIFY_CONTRACT.md`](../../docs/HOSTED_VERIFY_CONTRACT.md).

**Request:**

```bash
curl -X POST http://localhost:3000/v1/verify \
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

The response body indicates the verified/failed state. See `packages/schema/openapi/verify.yaml` and [`docs/HOSTED_VERIFY_CONTRACT.md`](../../docs/HOSTED_VERIFY_CONTRACT.md) for the canonical schema.

```json
{
  "verified": true,
  "receipt_ref": "sha256:<hex>",
  "claims": {},
  "warnings": [],
  "policy_binding": "verified",
  "issuer": "https://example.com",
  "kid": "key-1",
  "wire_version": "0.2"
}
```

**Error response (RFC 9457):**

```json
{
  "type": "https://www.peacprotocol.org/problems/invalid-format",
  "title": "Invalid Format",
  "status": 400,
  "detail": "Input is not a valid compact JWS."
}
```

All error responses use `Content-Type: application/problem+json` with kernel-canonical error codes (see [`docs/HOSTED_VERIFY_CONTRACT.md`](../../docs/HOSTED_VERIFY_CONTRACT.md)).

### `GET /health`

Health check endpoint.

```json
{ "ok": true }
```

### Deprecated aliases

`POST /api/v1/verify` and `POST /verify` are deprecated compatibility aliases. They delegate in-process to `POST /v1/verify` and return the same response shape and status codes. New integrations MUST target `POST /v1/verify`. See [`docs/HOSTED_VERIFY_CONTRACT.md`](../../docs/HOSTED_VERIFY_CONTRACT.md) for the alias behavior and Sunset schedule.

## Rate Limits

| Tier      | Limit         | Window   | Header      |
| --------- | ------------- | -------- | ----------- |
| Anonymous | 100 requests  | 1 minute | none        |
| API Key   | 1000 requests | 1 minute | `X-API-Key` |

All responses include RFC 9333 rate limit headers:

- `RateLimit-Limit`: Maximum requests per window
- `RateLimit-Remaining`: Remaining requests in current window
- `RateLimit-Reset`: Seconds until window reset

## HTTP Status Codes

| Status | Meaning                                                                                  |
| ------ | ---------------------------------------------------------------------------------------- |
| 200    | Verification completed; response body indicates the result.                              |
| 400    | Invalid request format.                                                                  |
| 413    | Request body too large (receipt exceeds 256 KiB).                                        |
| 422    | Verification or validation failure (signature invalid, claims invalid, policy mismatch). |
| 429    | Rate limit exceeded.                                                                     |
| 502    | Upstream resolution failure (JWKS fetch, issuer config fetch).                           |

## Security Headers

All responses include:

- `X-Content-Type-Options: nosniff`
- `Cache-Control: no-store`
- `Referrer-Policy: no-referrer`
- `X-Frame-Options: DENY`

## Environment Variables

| Variable           | Default | Description                                                        |
| ------------------ | ------- | ------------------------------------------------------------------ |
| `PORT`             | `3000`  | Server port                                                        |
| `PEAC_TRUST_PROXY` | unset   | Set to `1` to trust `X-Forwarded-*` headers behind a reverse proxy |

## Trusted Issuers

The verify API only fetches JWKS from trusted issuers. The default allowlist includes `https://sandbox.peacprotocol.org`. Configure via the trusted issuers list in `verify-v1.ts`.

## License

Apache-2.0
