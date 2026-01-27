# @peac/worker-cloudflare

PEAC receipt verification worker for Cloudflare Workers.

## Features

- **TAP Verification**: Verify Visa Trusted Agent Protocol signatures at the edge
- **PEAC Receipt Verification**: Validate PEAC receipts (JWS)
- **Replay Protection**: Pluggable nonce deduplication (DO/D1/KV)
- **RFC 9457 Errors**: Structured problem+json error responses with stable `code` extension
- **Issuer Allowlist**: Restrict which issuers are accepted
- **Path Bypass**: Skip verification for specific paths
- **Security-First**: Hashed storage keys, sanitized error messages

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
   # REQUIRED for production: Set issuer allowlist
   wrangler secret put ISSUER_ALLOWLIST
   # Enter: https://issuer1.example.com,https://issuer2.example.com
   ```

4. **Deploy:**

   ```bash
   wrangler deploy
   ```

## Configuration

### Environment Variables

**Security-Critical (Required for Production):**

| Variable           | Description                                    | Default | Notes                      |
| ------------------ | ---------------------------------------------- | ------- | -------------------------- |
| `ISSUER_ALLOWLIST` | Comma-separated list of allowed issuer origins | (none)  | **REQUIRED** or 500 error  |
| `REPLAY_DO`        | Durable Object for strong replay protection    | (none)  | Recommended for production |
| `REPLAY_D1`        | D1 database for replay protection              | (none)  | Good alternative to DO     |
| `REPLAY_KV`        | KV namespace for best-effort replay protection | (none)  | NOT recommended (eventual) |

**Path Configuration:**

| Variable       | Description                                        | Default |
| -------------- | -------------------------------------------------- | ------- |
| `BYPASS_PATHS` | Comma-separated path patterns to skip verification | (none)  |

**UNSAFE Escape Hatches (Development Only):**

| Variable                    | Description                                           | Default | Security Note                       |
| --------------------------- | ----------------------------------------------------- | ------- | ----------------------------------- |
| `UNSAFE_ALLOW_ANY_ISSUER`   | Skip ISSUER_ALLOWLIST requirement                     | `false` | **UNSAFE** - allows any issuer      |
| `UNSAFE_ALLOW_UNKNOWN_TAGS` | Accept unknown TAP tags (fail-open)                   | `false` | **UNSAFE** - may accept future tags |
| `UNSAFE_ALLOW_NO_REPLAY`    | Skip replay protection requirement when nonce present | `false` | **UNSAFE** - allows replay attacks  |

### Security Defaults (Fail-Closed)

The worker is secure by default. Without explicit configuration:

1. **ISSUER_ALLOWLIST is REQUIRED** - Returns 500 `E_CONFIG_ISSUER_ALLOWLIST_REQUIRED` if empty
2. **Unknown TAP tags are REJECTED** - Returns 400 `E_TAP_TAG_UNKNOWN`
3. **Replay protection is REQUIRED** - Returns 401 `E_TAP_REPLAY_PROTECTION_REQUIRED` if nonce present but no store

### Development Mode

For local development only, you can bypass security checks:

```bash
# wrangler.toml or wrangler dev --var
UNSAFE_ALLOW_ANY_ISSUER=true
UNSAFE_ALLOW_UNKNOWN_TAGS=true
UNSAFE_ALLOW_NO_REPLAY=true
```

**WARNING:** Never use UNSAFE\_\* variables in production. They bypass critical security controls.

### Security Best Practices

1. **Always set `ISSUER_ALLOWLIST` in production** - List only trusted issuer origins.

2. **Configure replay protection** - Use Durable Objects (recommended) or D1 for strong guarantees. KV is best-effort only.

3. **Use `BYPASS_PATHS` sparingly** - Only bypass verification for truly public endpoints like `/health`, `/.well-known/*`, or public API documentation.

4. **Never use UNSAFE\_\* in production** - These are development escape hatches only.

### Bypass Path Patterns

Path matching is **first-match** on pathname only (query strings excluded):

- Exact: `/health` matches only `/health`
- Wildcard: `/api/public/*` matches `/api/public/foo` but not `/api/public/foo/bar`
- Glob: `*.json` matches `/data.json`

## Replay Protection

Choose the right backend for your security requirements:

| Backend             | Consistency | Atomicity        | Recommendation                       |
| ------------------- | ----------- | ---------------- | ------------------------------------ |
| **Durable Objects** | Strong      | Atomic check-set | Enterprise (true atomicity)          |
| **D1**              | Strong      | Atomic via SQL   | Good (slightly higher latency)       |
| **KV**              | Eventual    | NOT atomic       | Best-effort only (may allow replays) |
| **None**            | N/A         | N/A              | Development only (logs warning)      |

**CRITICAL:** Cloudflare KV is eventually consistent and does NOT provide atomic check-and-set operations. Under concurrent load, the same nonce may be accepted multiple times. For enterprise-grade security, use Durable Objects or D1.

### Storage Key Security

All replay keys are stored as SHA-256 hashes of `issuer|keyid|nonce` to prevent correlation of raw identifiers in storage. Raw nonces are never stored.

### Setting Up Durable Objects (Recommended)

1. Add to `wrangler.toml`:

   ```toml
   [[durable_objects.bindings]]
   name = "REPLAY_DO"
   class_name = "ReplayDurableObject"

   [[migrations]]
   tag = "v1"
   new_classes = ["ReplayDurableObject"]
   ```

2. Export the DO class in your worker entry point.

### Setting Up D1

1. Create database:

   ```bash
   wrangler d1 create peac-replay
   ```

2. Create schema:

   ```sql
   CREATE TABLE IF NOT EXISTS replay_keys (
     key_hash TEXT PRIMARY KEY,
     seen_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_replay_expires ON replay_keys(expires_at);
   ```

3. Add to `wrangler.toml`:

   ```toml
   [[d1_databases]]
   binding = "REPLAY_D1"
   database_name = "peac-replay"
   database_id = "<your-d1-database-id>"
   ```

### Setting Up KV (Best-Effort Only)

**WARNING:** KV is NOT recommended for production replay protection due to eventual consistency.

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

All errors are returned as RFC 9457 Problem Details with a stable `code` extension:

```json
{
  "type": "https://www.peacprotocol.org/problems/tap_signature_invalid",
  "title": "Invalid Signature",
  "status": 401,
  "detail": "Signature verification failed",
  "instance": "https://api.example.com/resource",
  "code": "E_TAP_SIGNATURE_INVALID"
}
```

### Error Codes

| Code                                 | Status | Description                           |
| ------------------------------------ | ------ | ------------------------------------- |
| `E_RECEIPT_MISSING`                  | 402    | No PEAC receipt provided              |
| `E_RECEIPT_INVALID`                  | 402    | Invalid receipt format                |
| `E_RECEIPT_EXPIRED`                  | 402    | Receipt has expired                   |
| `E_TAP_SIGNATURE_MISSING`            | 401    | No TAP signature headers              |
| `E_TAP_SIGNATURE_INVALID`            | 401    | Signature verification failed         |
| `E_TAP_TIME_INVALID`                 | 401    | Signature outside valid time window   |
| `E_TAP_KEY_NOT_FOUND`                | 401    | Public key not found at JWKS endpoint |
| `E_TAP_REPLAY_PROTECTION_REQUIRED`   | 401    | Nonce present but no replay store     |
| `E_TAP_WINDOW_TOO_LARGE`             | 400    | Signature window exceeds 8 minutes    |
| `E_TAP_TAG_UNKNOWN`                  | 400    | Unknown TAP tag (fail-closed)         |
| `E_TAP_ALGORITHM_INVALID`            | 400    | Unsupported signature algorithm       |
| `E_ISSUER_NOT_ALLOWED`               | 403    | Issuer not in allowlist               |
| `E_TAP_NONCE_REPLAY`                 | 409    | Nonce replay detected (conflict)      |
| `E_CONFIG_ISSUER_ALLOWLIST_REQUIRED` | 500    | ISSUER_ALLOWLIST not configured       |
| `E_INTERNAL_ERROR`                   | 500    | Internal server error                 |

### Security: Error Sanitization

Error details are automatically sanitized to prevent leaking sensitive information:

- Signature values are redacted (`sig1:[REDACTED]:`)
- PEM keys are redacted (`[REDACTED KEY]`)
- Internal paths are not exposed

## Response Headers

Successful verification adds these headers:

| Header          | Description                              |
| --------------- | ---------------------------------------- |
| `PEAC-Verified` | `true` if verification succeeded         |
| `PEAC-Engine`   | `tap` for TAP verification               |
| `PEAC-TAP-Tag`  | TAP tag (e.g., `agent-browser-auth`)     |
| `PEAC-Warning`  | `replay-protection-disabled` if no store |

## Example Requests

### Successful TAP Verification

```bash
curl -i https://your-worker.example.com/api/resource \
  -H "Signature-Input: sig1=(\"@method\" \"@path\");created=1702684800;expires=1702685280;keyid=\"https://issuer.example.com/.well-known/jwks.json#key-1\";alg=\"ed25519\";tag=\"agent-browser-auth\";nonce=\"abc123\"" \
  -H "Signature: sig1=:BASE64_SIGNATURE:"
```

Expected response headers on success:

```http
PEAC-Verified: true
PEAC-Engine: tap
PEAC-TAP-Tag: agent-browser-auth
```

### Missing Receipt (402 Challenge)

```bash
curl -i https://your-worker.example.com/api/resource
```

Response:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/problem+json
WWW-Authenticate: PEAC realm="peac-verifier"

{
  "type": "https://www.peacprotocol.org/problems/receipt_missing",
  "title": "Payment Required",
  "status": 402,
  "code": "E_RECEIPT_MISSING",
  "detail": "A valid PEAC receipt is required to access this resource."
}
```

## SSRF Protection Limitations

The JWKS fetching implements realistic edge-safe hardening:

**What IS protected:**

- HTTPS required (no HTTP except localhost in dev)
- Literal IP addresses blocked
- Localhost variants blocked
- Metadata IPs blocked (169.254.169.254)
- No redirect following

**What is NOT protected (edge runtime limitations):**

- DNS rebinding attacks (no pre-connect DNS API in Workers)
- Private IP resolution via DNS (cannot inspect resolved IP)

**Recommendation:** For high-security deployments, always use an explicit issuer allowlist via `ISSUER_ALLOWLIST`.

## Development

```bash
# Run locally
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## Performance

Designed for sub-5ms p95 verification latency on edge runtimes (excludes cold JWKS fetch). Bundle size is optimized for fast cold starts.

- Bundle: ~63 KiB (uncompressed), ~15 KiB (gzipped)
- Config parsing: < 0.01ms
- Path matching: < 0.01ms per path
- Error response creation: < 0.01ms

## License

Apache-2.0
