# Apps -- Environment Variables

Environment variable reference for PEAC infrastructure apps.

## Sandbox Issuer (`apps/sandbox-issuer`)

| Variable                   | Default                | Description                                    |
| -------------------------- | ---------------------- | ---------------------------------------------- |
| `PORT`                     | `3100`                 | HTTP listen port                               |
| `PEAC_ISSUER_URL`          | (derived from request) | Override the `iss` claim in issued receipts    |
| `PEAC_SANDBOX_PRIVATE_JWK` | (none)                 | Ed25519 private key as JWK JSON string         |
| `PEAC_TRUST_PROXY`         | (unset)                | Set to `1` to trust `X-Forwarded-Proto`/`Host` |

## Verify API (`apps/api`)

| Variable                    | Default      | Description                                       |
| --------------------------- | ------------ | ------------------------------------------------- |
| `PORT`                      | `3000`       | HTTP listen port                                  |
| `PEAC_TRUSTED_ISSUERS_JSON` | sandbox only | JSON array of trusted issuers for JWKS resolution |

### Trusted issuers format

```json
[
  {
    "issuer": "https://sandbox.peacprotocol.org",
    "jwks_uri": "https://sandbox.peacprotocol.org/.well-known/jwks.json"
  }
]
```

When `PEAC_TRUSTED_ISSUERS_JSON` is not set, only the sandbox issuer
(`https://sandbox.peacprotocol.org`) is trusted by default.

### Rate limits

| Client type                  | Limit         | Window   |
| ---------------------------- | ------------- | -------- |
| Anonymous (by IP)            | 100 requests  | 1 minute |
| API key (`X-API-Key` header) | 1000 requests | 1 minute |

Rate limit state is in-memory and resets on process restart.

## Browser Verifier (`apps/verifier`)

The verifier is a pure static site with no server-side configuration.
All verification runs client-side via `verifyLocal()`.

The "Load Sandbox JWKS" button fetches keys from
`https://sandbox.peacprotocol.org/.well-known/jwks.json`.
The "Load Local Issuer" button fetches from `http://127.0.0.1:3100`
(requires sandbox issuer running locally).

### Subpath import

Browser code imports `@peac/protocol/verify-local` to avoid pulling in
Node.js-only dependencies from the protocol barrel export.
