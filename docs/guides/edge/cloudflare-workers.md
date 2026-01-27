# Cloudflare Workers Deployment Guide

Production deployment guide for PEAC Protocol TAP verification on Cloudflare Workers.

## Protocol Standards

This guide implements:

- **RFC 9421** - HTTP Message Signatures (authentication headers)
- **RFC 9457** - Problem Details for HTTP APIs (error responses)
- **RFC 8615** - Well-Known URIs (JWKS discovery)
- **Visa TAP** - Built on RFC 9421 for cryptographic agent authentication

## Prerequisites

- Cloudflare account with Workers enabled
- Node.js 18+ and pnpm 8+
- Wrangler CLI installed: `npm install -g wrangler`
- PEAC issuer JWKS configured

## Quick Start

### 1. Install Dependencies

```bash
cd surfaces/workers/cloudflare
pnpm install
```

### 2. Configure Environment

Create `wrangler.toml`:

```toml
name = "peac-tap-verifier"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
ISSUER_ALLOWLIST = "https://issuer1.example.com,https://issuer2.example.com"
MODE = "tap_only"  # or "receipt_or_tap", "unsafe_no_tap"
JWKS_CACHE_TTL_SECONDS = "3600"

# Optional: Replay protection (requires D1 or KV)
# REPLAY_STORE_TYPE = "d1"  # or "kv"

[[d1_databases]]
binding = "DB"
database_name = "peac_replay"
database_id = "your-database-id"

# Alternative: KV for best-effort replay (not atomic)
# [[kv_namespaces]]
# binding = "REPLAY_KV"
# id = "your-kv-id"
```

### 3. Create D1 Database (For Replay Protection)

```bash
# Create database
wrangler d1 create peac_replay

# Apply schema
wrangler d1 execute peac_replay --file=./schema.sql
```

`schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS replays (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_expires ON replays(expires_at);
```

### 4. Deploy

```bash
# Deploy to production
wrangler deploy

# Or deploy to staging
wrangler deploy --env staging
```

## Architecture

```
┌─────────────────────────────────────┐
│  Cloudflare Workers Runtime         │
│                                     │
│  ┌───────────────────────────────┐ │
│  │   @peac/worker-core           │ │
│  │   (Runtime-neutral handler)    │ │
│  └───────────────┬───────────────┘ │
│                  │                  │
│  ┌───────────────▼───────────────┐ │
│  │   Cloudflare Adapter          │ │
│  │   - D1 replay store           │ │
│  │   - KV JWKS cache             │ │
│  │   - Request/Response bridge   │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

## Configuration Options

### MODE (Required)

| Mode             | Behavior                   | Use Case          |
| ---------------- | -------------------------- | ----------------- |
| `tap_only`       | TAP required (default)     | Production APIs   |
| `receipt_or_tap` | TAP or receipt accepted    | Migration period  |
| `unsafe_no_tap`  | No TAP required (DEV ONLY) | Local development |

### ISSUER_ALLOWLIST (Required)

Comma-separated list of trusted issuer URLs:

```toml
ISSUER_ALLOWLIST = "https://issuer1.example.com,https://issuer2.example.com"
```

**CRITICAL:** Empty allowlist returns HTTP 500 (fail-closed security).

### Replay Protection

**Recommended:** Use D1 for strong replay protection (atomic operations).

```toml
REPLAY_STORE_TYPE = "d1"

[[d1_databases]]
binding = "DB"
database_name = "peac_replay"
database_id = "your-database-id"
```

**Alternative:** Use KV for best-effort replay (NOT atomic, race conditions possible).

```toml
REPLAY_STORE_TYPE = "kv"

[[kv_namespaces]]
binding = "REPLAY_KV"
id = "your-kv-id"
```

### JWKS Caching

```toml
JWKS_CACHE_TTL_SECONDS = "3600"  # 1 hour (default)
```

**Implementation-Specific:** JWKS caching behavior depends on your worker implementation. Cloudflare Workers do not automatically cache `fetch()` responses. For persistent caching across requests, implement explicit caching using the Cache API or KV storage. The TTL value controls cache duration when caching is implemented.

## Error Responses

All error responses follow **RFC 9457** (Problem Details for HTTP APIs):

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: PEAC realm="peac", error="E_TAP_SIGNATURE_INVALID"
Content-Type: application/problem+json
PEAC-Error: E_TAP_SIGNATURE_INVALID

{
  "type": "https://www.peacprotocol.org/problems/E_TAP_SIGNATURE_INVALID",
  "title": "TAP Signature Invalid",
  "status": 401,
  "detail": "Signature verification failed",
  "instance": "/api/resource"
}
```

### Error Codes

| HTTP | Code                             | Description                       | Retryable |
| ---- | -------------------------------- | --------------------------------- | --------- |
| 400  | E_TAP_MALFORMED                  | Invalid TAP format                | No        |
| 400  | E_TAP_TAG_UNKNOWN                | Unknown TAP tag                   | No        |
| 400  | E_TAP_WINDOW_TOO_LARGE           | Time window > 8 min               | No        |
| 401  | E_TAP_SIGNATURE_INVALID          | Signature verification failed     | No        |
| 401  | E_TAP_TIME_INVALID               | Outside time window               | Yes       |
| 401  | E_TAP_KEY_NOT_FOUND              | Key ID not in JWKS                | Maybe     |
| 401  | E_TAP_REPLAY_PROTECTION_REQUIRED | Nonce present but no replay store | No        |
| 402  | E_TAP_MISSING                    | TAP required but not provided     | Yes       |
| 403  | E_TAP_ISSUER_NOT_ALLOWED         | Issuer not in allowlist           | No        |
| 409  | E_TAP_REPLAY_DETECTED            | Nonce already used                | No        |
| 503  | E_TAP_JWKS_UNAVAILABLE           | Cannot fetch JWKS                 | Yes       |

## Security Hardening

### Fail-Closed Defaults

- Empty `ISSUER_ALLOWLIST` → HTTP 500
- Unknown TAP tags → HTTP 400 (reject)
- Missing replay protection when nonce present → HTTP 401

### Time Validation

- TAP time window: **max 8 minutes** (480 seconds, hard limit)
- Clock skew tolerance: 30 seconds
- Validation: `created <= now <= expires`

### Replay Protection TTL

- Fixed: **480 seconds** (8 minutes, not configurable)
- Matches TAP max time window
- Auto-expires old nonces

### SSRF Protection

JWKS fetching includes SSRF guards:

- Block private IP ranges (10.0.0.0/8, 192.168.0.0/16, 127.0.0.1)
- Block metadata URLs (169.254.169.254)
- Enforce HTTPS (except localhost)
- 5-second timeout

### UNSAFE_DEV_MODE

For development only. **NEVER use in production.**

```toml
[vars.dev]
MODE = "unsafe_no_tap"
UNSAFE_DEV_MODE = "true"
```

Enables:

- Bypass TAP validation
- Skip issuer allowlist
- Detailed error messages (includes sensitive data)

## Security and Operations

### Threat Model

**What This Worker Protects Against:**

- **Signature forgery**: Ed25519 cryptographic verification prevents unauthorized request signing
- **Replay attacks**: With D1 replay store, prevents nonce reuse (atomic check-and-set)
- **Issuer impersonation**: ISSUER_ALLOWLIST enforces trusted issuer policy
- **Time-based attacks**: Enforces 8-minute max window with clock skew tolerance

**What This Worker Does NOT Protect Against:**

- **Eventual consistency replay**: KV-based replay protection is eventually consistent (race conditions possible)
- **DNS hijacking**: JWKS fetching trusts DNS resolution (no DNSSEC validation)
- **Compromised JWKS origin**: If issuer's JWKS endpoint is compromised, attacker can sign valid TAPs
- **DDoS attacks**: Standard Cloudflare DDoS protection applies, but no PEAC-specific rate limiting

### Dependency Trust Boundaries

**Trusted:**

- JWKS origin (issuer's `.well-known/jwks.json` endpoint) - must be HTTPS
- Cloudflare Workers runtime (code execution, crypto primitives)
- D1/KV storage integrity (for replay protection)

**Not Trusted:**

- Request headers (validated and sanitized)
- Request body (not used in TAP verification)
- Client-provided timestamps (validated against server clock)

### Fail Modes

**Fail-Closed (Default):**

- Empty `ISSUER_ALLOWLIST` → 500 (server error)
- Unknown TAP tags → 400 (reject unless `UNSAFE_ALLOW_UNKNOWN_TAGS=true`)
- Nonce present but no replay store → 401 (reject unless `UNSAFE_ALLOW_NO_REPLAY=true`)
- JWKS fetch failure → 503 (reject)

**Fail-Open (Explicit Opt-In):**

- `UNSAFE_DEV_MODE=true` → bypass all validation (development only)
- `UNSAFE_ALLOW_UNKNOWN_TAGS=true` → accept unknown TAP tags
- `UNSAFE_ALLOW_NO_REPLAY=true` → accept nonces without replay protection

### Replay Protection Semantics

**With D1 (Recommended for High-Value APIs):**

- Atomic check-and-set prevents race conditions
- Suitable for financial transactions, sensitive operations
- Latency: ~5-10ms per request

**With KV (Best-Effort):**

- Eventually consistent (global replication ~10 seconds)
- Race condition window exists (same nonce could be accepted on multiple edge nodes)
- Suitable for non-critical operations, acceptable risk tolerance
- Latency: ~1-2ms per request

**Without Replay Protection:**

- Nonces are ignored (replay attacks possible)
- Only suitable for public APIs with no sensitive operations
- NOT recommended for production

### Key Management

**JWKS Rotation:**

- Workers fetch JWKS on-demand per request (unless Cache API is implemented)
- Issuer can rotate keys by updating JWKS endpoint
- No worker restart required
- Consider implementing Cache API with short TTL (5-10 minutes) for production

**Key Pinning:**

- Not currently supported
- All keys in issuer's JWKS are trusted if issuer is in allowlist
- For enhanced security, implement key ID allowlist in worker code

**Secrets:**

- Never log JWKS responses (contains public keys but reveals key IDs)
- Never log signature values (reveals cryptographic material)
- Log only: issuer origin, key ID (hashed), error codes

## Performance

### Performance Targets

**NOTE:** These are design targets, not verified benchmarks.

- P95 verification latency: **< 5ms** (target)
- Cold start: **< 50ms** (target)
- WASM bundle size: **< 100KB** (target)

### Optimization Tips

1. **Use D1 for replay** - Faster than KV for small datasets
2. **Enable JWKS caching** - Reduces JWKS fetches by 95%+
3. **Use `tap_only` mode** - Skips receipt verification overhead

## Monitoring

### Metrics

Cloudflare Workers automatically collect:

- Request count
- Error rate (by status code)
- P50/P95/P99 latency
- Worker CPU time

### Custom Metrics (via Analytics Engine)

```typescript
import { handleTAP } from '@peac/worker-core';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const start = Date.now();
    const response = await handleTAP(request, {
      mode: env.MODE,
      issuerAllowlist: env.ISSUER_ALLOWLIST.split(','),
      replayStore: env.DB ? createD1ReplayStore(env.DB) : undefined,
    });

    // Log metrics
    const duration = Date.now() - start;
    env.ANALYTICS?.writeDataPoint({
      blobs: [env.MODE, response.status.toString()],
      doubles: [duration],
      indexes: [request.url],
    });

    return response;
  },
};
```

### Alerts

Configure alerts in Cloudflare dashboard:

- Error rate > 5%
- P95 latency > 10ms
- JWKS fetch failures

## Troubleshooting

### "HTTP 500: Empty issuer allowlist"

**Cause:** `ISSUER_ALLOWLIST` not configured or empty.

**Fix:** Set `ISSUER_ALLOWLIST` in `wrangler.toml`:

```toml
[vars]
ISSUER_ALLOWLIST = "https://issuer.example.com"
```

### "HTTP 401: Replay protection required"

**Cause:** TAP contains nonce but no replay store configured.

**Fix:** Configure D1 or KV replay store in `wrangler.toml`.

### "HTTP 409: Replay detected"

**Cause:** Nonce already used (possible replay attack).

**Action:** This is expected behavior. Client should NOT retry with same nonce.

### "HTTP 503: JWKS unavailable"

**Cause:** Cannot fetch issuer JWKS (network error, timeout, SSRF block).

**Fix:**

1. Verify issuer URL is reachable
2. Check SSRF guards (not private IP, not metadata URL)
3. Verify HTTPS (required except localhost)

## Production Checklist

- [ ] `MODE` set to `tap_only` (not `unsafe_no_tap`)
- [ ] `ISSUER_ALLOWLIST` contains trusted issuers only
- [ ] D1 replay database created and schema applied
- [ ] `UNSAFE_DEV_MODE` NOT set (or set to `"false"`)
- [ ] Alerts configured (error rate, latency, JWKS failures)
- [ ] Staging deployment tested with production-like traffic
- [ ] Rollback plan documented

## Migration from Receipt-Only

If migrating from receipt-only verification:

1. **Phase 1:** Deploy with `MODE = "receipt_or_tap"` (accepts both)
2. **Phase 2:** Update clients to send TAP headers
3. **Phase 3:** Monitor TAP adoption (log TAP vs receipt usage)
4. **Phase 4:** Switch to `MODE = "tap_only"` when adoption > 95%

## Example Usage

### Basic Deployment

```bash
# Clone repo
git clone https://github.com/peacprotocol/peac.git
cd peac/surfaces/workers/cloudflare

# Install dependencies
pnpm install

# Configure wrangler.toml (see above)
vi wrangler.toml

# Create D1 database
wrangler d1 create peac_replay
wrangler d1 execute peac_replay --file=schema.sql

# Deploy
wrangler deploy
```

### Testing

```bash
# Test with curl (RFC 9421 HTTP Message Signatures)
curl -i https://your-worker.workers.dev/api/resource \
  -H 'Signature-Input: sig1=("@method" "@path" "@authority" "content-type");created=1704067200;keyid="https://issuer.example/.well-known/jwks.json#key-1";alg="ed25519";tag="peac/v0.9"' \
  -H 'Signature: sig1=:BASE64_SIGNATURE_HERE:' \
  -H "Content-Type: application/json"
```

**Header Notes:**

- `Signature-Input`: RFC 9421 signature metadata (covered components, created timestamp, key ID, algorithm, TAP tag)
- `Signature`: RFC 9421 signature value (base64-encoded)
- Headers are case-insensitive per HTTP spec

## Support

- Documentation: <https://www.peacprotocol.org/docs>
- Issues: <https://github.com/peacprotocol/peac/issues>
- Discussions: <https://github.com/peacprotocol/peac/discussions>
