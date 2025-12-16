# @peac/worker-cloudflare

PEAC receipt verification worker for Cloudflare Workers.

## Features

- **TAP Verification**: Verify Visa Trusted Agent Protocol signatures at the edge
- **PEAC Receipt Verification**: Validate PEAC receipts (JWS)
- **Replay Protection**: Pluggable nonce deduplication (DO/D1/KV)
- **RFC 9457 Errors**: Structured problem+json error responses
- **Issuer Allowlist**: Restrict which issuers are accepted
- **Path Bypass**: Skip verification for specific paths

## Quick Start

1. **Clone and install:**

   ```bash
   cd surfaces/workers/cloudflare
   pnpm install
   ```

2. **Configure wrangler.toml:**

   ```toml
   name = "peac-verifier"
   main = "src/index.ts"
   compatibility_date = "2024-12-01"
   compatibility_flags = ["nodejs_compat"]
   ```

3. **Set environment variables:**

   ```bash
   wrangler secret put ISSUER_ALLOWLIST
   # Enter: https://issuer1.example.com,https://issuer2.example.com
   ```

4. **Deploy:**

   ```bash
   wrangler deploy
   ```

## Configuration

### Environment Variables

| Variable             | Description                                        | Default       |
| -------------------- | -------------------------------------------------- | ------------- |
| `ISSUER_ALLOWLIST`   | Comma-separated list of allowed issuer origins     | (open access) |
| `BYPASS_PATHS`       | Comma-separated path patterns to skip verification | (none)        |
| `ALLOW_UNKNOWN_TAGS` | Allow unknown TAP tags (fail-open)                 | `false`       |

### Replay Protection

Choose the right backend for your security requirements:

| Backend             | Consistency | Recommendation                       |
| ------------------- | ----------- | ------------------------------------ |
| **Durable Objects** | Strong      | Enterprise (true atomicity)          |
| **D1**              | Strong      | Acceptable (slightly higher latency) |
| **KV**              | Eventual    | Best-effort only (NOT atomic)        |

**WARNING:** Cloudflare KV is eventually consistent. Do NOT rely on it for strong replay protection. For enterprise-grade security, use Durable Objects or D1.

#### Setting Up Durable Objects

1. Add to `wrangler.toml`:

   ```toml
   [[durable_objects.bindings]]
   name = "REPLAY_DO"
   class_name = "ReplayDurableObject"

   [[migrations]]
   tag = "v1"
   new_classes = ["ReplayDurableObject"]
   ```

2. Export the DO class in your worker.

#### Setting Up D1

1. Create database:

   ```bash
   wrangler d1 create peac-replay
   ```

2. Create schema:

   ```sql
   CREATE TABLE IF NOT EXISTS nonces (
     nonce TEXT PRIMARY KEY,
     seen_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_nonces_expires ON nonces(expires_at);
   ```

3. Add to `wrangler.toml`:

   ```toml
   [[d1_databases]]
   binding = "REPLAY_D1"
   database_name = "peac-replay"
   database_id = "<your-d1-database-id>"
   ```

#### Setting Up KV (Best-Effort)

1. Create namespace:

   ```bash
   wrangler kv:namespace create REPLAY_KV
   ```

2. Add to `wrangler.toml`:

   ```toml
   [[kv_namespaces]]
   binding = "REPLAY_KV"
   id = "<your-kv-namespace-id>"
   ```

## Error Responses

All errors are returned as RFC 9457 Problem Details:

```json
{
  "type": "https://peacprotocol.org/problems/tap_signature_invalid",
  "title": "Invalid Signature",
  "status": 401,
  "detail": "Signature verification failed",
  "instance": "https://api.example.com/resource"
}
```

### Error Codes

| Code                    | Status | Description                         |
| ----------------------- | ------ | ----------------------------------- |
| `receipt_missing`       | 402    | No PEAC receipt provided            |
| `tap_signature_missing` | 401    | No TAP signature headers            |
| `tap_signature_invalid` | 401    | Signature verification failed       |
| `tap_time_invalid`      | 401    | Signature outside valid time window |
| `tap_window_too_large`  | 400    | Signature window exceeds 8 minutes  |
| `tap_tag_unknown`       | 400    | Unknown TAP tag (fail-closed)       |
| `tap_nonce_replay`      | 401    | Nonce replay detected               |
| `issuer_not_allowed`    | 403    | Issuer not in allowlist             |

## Response Headers

Successful verification adds these headers:

| Header            | Description                          |
| ----------------- | ------------------------------------ |
| `X-PEAC-Verified` | `true` if verification succeeded     |
| `X-PEAC-Engine`   | `tap` for TAP verification           |
| `X-PEAC-TAP-Tag`  | TAP tag (e.g., `agent-browser-auth`) |

## SSRF Protection Limitations

The JWKS fetching in this worker implements realistic edge-safe hardening:

**What IS protected:**

- HTTPS required (no HTTP except localhost in dev)
- Literal IP addresses blocked
- Localhost variants blocked
- Metadata IPs blocked (169.254.169.254)
- No redirect following

**What is NOT protected:**

- DNS rebinding attacks (no pre-connect DNS API in Workers)
- Private IP resolution via DNS (cannot inspect resolved IP)

For high-security deployments, use an explicit issuer allowlist.

## Development

```bash
# Run locally
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## License

Apache-2.0
