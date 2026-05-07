# Sandbox Issuer

Test record issuer for local development and integration testing.

Issues signed current Wire records (`interaction-record+jwt`) with Ed25519 stable keys via the validated `@peac/protocol.issue()` path. Wire 0.1 protocol compatibility remains available elsewhere in the protocol; the sandbox issuer no longer advertises or emits `peac-receipt/0.1`. Not for production use.

Records use the example custom type URI `org.example/sandbox-test`. Registry-aware verification (e.g., `verifyLocal()` from `@peac/protocol`) will surface a `type_unregistered` warning, which is informational.

## Quick start

```bash
pnpm install
pnpm build
pnpm start
# Listening on http://127.0.0.1:3100
```

## Endpoints

| Method | Path                            | Description          |
| ------ | ------------------------------- | -------------------- |
| GET    | `/health`                       | Health check         |
| GET    | `/.well-known/peac-issuer.json` | Issuer configuration |
| GET    | `/.well-known/jwks.json`        | Public keys (JWKS)   |
| POST   | `/api/v1/issue`                 | Issue a record       |

## Issue a record

```bash
curl -X POST http://127.0.0.1:3100/api/v1/issue \
  -H "Content-Type: application/json" \
  -d '{"sub": "https://example.com"}'
```

Request body (strict whitelist: no arbitrary claims):

| Field     | Type         | Required | Description                       |
| --------- | ------------ | -------- | --------------------------------- |
| `sub`     | string (URL) | yes      | Subject: what the record is about |
| `purpose` | string       | no       | Declared purpose                  |

The server sets `iss`, `iat`, `jti`, `kind`, and `type` automatically. `expires_in` is not supported for current Wire records; sending it returns a 422 with the detail `expires_in is not supported for current Wire records`. The legacy `aud` request field is also rejected by the strict schema.

The response field `receipt_id` carries the Wire 0.2 `jti` of the issued record:

```json
{
  "receipt": "<compact JWS>",
  "receipt_id": "<jti>",
  "issuer": "<iss>",
  "key_id": "<kid>"
}
```

## Key stability

Keys are resolved in order:

1. **Environment variable** `PEAC_SANDBOX_PRIVATE_JWK` (JSON string)
2. **Local file** `.local/keys.json` (auto-generated, gitignored)
3. **Ephemeral** (generated fresh, clearly labeled)

For stable keys across restarts, the issuer auto-persists generated keys
to `.local/keys.json`.

## Environment variables

| Variable                   | Default                | Description                                        |
| -------------------------- | ---------------------- | -------------------------------------------------- |
| `PORT`                     | `3100`                 | HTTP listen port                                   |
| `PEAC_ISSUER_URL`          | (derived from request) | Override the `iss` claim in issued records         |
| `PEAC_SANDBOX_PRIVATE_JWK` | (none)                 | Ed25519 private key as JWK JSON string             |
| `PEAC_TRUST_PROXY`         | (unset)                | Set to `1` to trust X-Forwarded-Proto/Host headers |

When `PEAC_ISSUER_URL` is not set, the issuer URL is derived from the request
URL origin. Forwarded headers are only honored when `PEAC_TRUST_PROXY=1`.

## Rate limiting

1000 requests per hour per IP. Resets on process restart.

## License

Apache-2.0
