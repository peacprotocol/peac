# Sandbox Issuer

Test receipt issuer for local development and integration testing.

Issues PEAC receipts (`peac-receipt/0.1`) signed with Ed25519 stable keys.
Not for production use.

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
| POST   | `/api/v1/issue`                 | Issue a receipt      |

## Issue a receipt

```bash
curl -X POST http://127.0.0.1:3100/api/v1/issue \
  -H "Content-Type: application/json" \
  -d '{"aud": "https://example.com"}'
```

Request body (strict whitelist -- no arbitrary claims):

| Field        | Type         | Required | Description                                    |
| ------------ | ------------ | -------- | ---------------------------------------------- |
| `aud`        | string (URL) | yes      | Audience -- who will verify                    |
| `sub`        | string       | no       | Subject identifier                             |
| `purpose`    | string       | no       | Declared purpose                               |
| `expires_in` | number       | no       | Seconds until expiry (default 3600, max 86400) |

The server sets `iss`, `iat`, `exp`, and `rid` automatically.

## Key stability

Keys are resolved in order:

1. **Environment variable** `PEAC_SANDBOX_PRIVATE_JWK` (JSON string)
2. **Local file** `.local/keys.json` (auto-generated, gitignored)
3. **Ephemeral** (generated fresh, clearly labeled)

For stable keys across restarts, the issuer auto-persists generated keys
to `.local/keys.json`.

## Rate limiting

1000 requests per hour per IP. Resets on process restart.

## License

Apache-2.0
