# Fastly Compute Deployment Guide

Production deployment guide for PEAC Protocol TAP verification on Fastly Compute.

## Protocol Standards

This guide implements:

- **RFC 9421** - HTTP Message Signatures (authentication headers)
- **RFC 9457** - Problem Details for HTTP APIs (error responses)
- **RFC 8615** - Well-Known URIs (JWKS discovery)
- **Visa TAP** - Built on RFC 9421 for cryptographic agent authentication

## Prerequisites

- Fastly account with Compute enabled
- Node.js 18+ and pnpm 8+
- Fastly CLI installed: `npm install -g @fastly/cli`
- PEAC issuer JWKS configured

## Quick Start

### 1. Install Dependencies

```bash
cd surfaces/workers/fastly
pnpm install
```

### 2. Configure Service

Create `fastly.toml`:

```toml
manifest_version = 3
name = "peac-tap-verifier"
description = "PEAC TAP verification on Fastly Compute"
authors = ["your-team@example.com"]
language = "javascript"

[local_server]
[local_server.backends]
[local_server.backends.issuer]
url = "https://issuer.example.com"

[setup]
[setup.backends]
[setup.backends.issuer]
address = "issuer.example.com"
port = 443

[local_server.config_stores]
[local_server.config_stores.peac_config]

[setup.config_stores]
[setup.config_stores.peac_config]
```

### 3. Configure Environment

Create Config Store for runtime configuration:

```bash
# Create config store
fastly config-store create --name=peac_config

# Set configuration
fastly config-store-entry create \
  --store-id=your-store-id \
  --key=ISSUER_ALLOWLIST \
  --value="https://issuer1.example.com,https://issuer2.example.com"

fastly config-store-entry create \
  --store-id=your-store-id \
  --key=MODE \
  --value="tap_only"

fastly config-store-entry create \
  --store-id=your-store-id \
  --key=JWKS_CACHE_TTL_SECONDS \
  --value="3600"
```

### 4. Create KV Store (For Replay Protection)

```bash
# Create KV store
fastly kv-store create --name=peac_replay

# Link to service
fastly kv-store-link \
  --store-id=your-store-id \
  --service-id=your-service-id \
  --name=REPLAY_KV
```

### 5. Deploy

```bash
# Build
pnpm build

# Deploy to production
fastly compute deploy

# Or publish without deploying
fastly compute publish
```

## Architecture

```
┌─────────────────────────────────────┐
│  Fastly Compute Runtime             │
│                                     │
│  ┌───────────────────────────────┐ │
│  │   @peac/worker-core           │ │
│  │   (Runtime-neutral handler)    │ │
│  └───────────────┬───────────────┘ │
│                  │                  │
│  ┌───────────────▼───────────────┐ │
│  │   Fastly Adapter              │ │
│  │   - KV replay store           │ │
│  │   - Config Store (env vars)   │ │
│  │   - Backend fetch (JWKS)      │ │
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

```bash
fastly config-store-entry create \
  --store-id=your-store-id \
  --key=ISSUER_ALLOWLIST \
  --value="https://issuer1.example.com,https://issuer2.example.com"
```

**CRITICAL:** Empty allowlist returns HTTP 500 (fail-closed security).

### Replay Protection

**Fastly Compute:** Uses KV Store for replay protection (best-effort, not atomic).

```bash
# Create KV store
fastly kv-store create --name=peac_replay

# Link to service
fastly resource-link create \
  --version=latest \
  --autoclone \
  --resource-id=your-kv-store-id
```

**Note:** Fastly KV is eventually consistent. Race conditions possible for replay attacks at high scale.

### JWKS Caching

```bash
fastly config-store-entry create \
  --store-id=your-store-id \
  --key=JWKS_CACHE_TTL_SECONDS \
  --value="3600"
```

JWKS responses cached in-memory per Compute instance. TTL controls cache duration.

## Error Responses

All error responses follow RFC 9110 + PEAC extensions:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: PEAC realm="peac", error="signature_invalid"
Content-Type: application/problem+json

{
  "type": "https://www.peacprotocol.org/errors#E_TAP_SIGNATURE_INVALID",
  "title": "TAP Signature Invalid",
  "status": 401,
  "detail": "Signature verification failed",
  "instance": "/api/resource",
  "trace_id": "01JGABC123XYZ"
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

```bash
fastly config-store-entry create \
  --store-id=your-store-id \
  --key=MODE \
  --value="unsafe_no_tap"

fastly config-store-entry create \
  --store-id=your-store-id \
  --key=UNSAFE_DEV_MODE \
  --value="true"
```

Enables:

- Bypass TAP validation
- Skip issuer allowlist
- Detailed error messages (includes sensitive data)

## Performance

### Performance Targets

**NOTE:** These are design targets, not verified benchmarks.

- P95 verification latency: **< 5ms** (target)
- Cold start: **< 50ms** (target)
- WASM bundle size: **< 100KB** (target)

### Optimization Tips

1. **Use Fastly KV for replay** - Fastest available option on Fastly
2. **Enable JWKS caching** - Reduces JWKS fetches by 95%+
3. **Use `tap_only` mode** - Skips receipt verification overhead
4. **Configure backends** - Pre-configure JWKS issuer backends in `fastly.toml`

## Monitoring

### Real-Time Stats

Fastly provides real-time metrics:

- Request count
- Error rate (by status code)
- P50/P95/P99 latency
- Cache hit ratio
- Origin fetch count

Access via Fastly dashboard or Real-Time Stats API.

### Custom Logging

```javascript
import { handleTAP } from '@peac/worker-core';

async function handleRequest(event) {
  const start = Date.now();
  const response = await handleTAP(event.request, {
    mode: env.MODE,
    issuerAllowlist: env.ISSUER_ALLOWLIST.split(','),
    replayStore: createKVReplayStore(env.REPLAY_KV),
  });

  // Log to Fastly logging endpoints
  const duration = Date.now() - start;
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      method: event.request.method,
      url: event.request.url,
      status: response.status,
      duration_ms: duration,
      mode: env.MODE,
    })
  );

  return response;
}
```

Configure log streaming in Fastly dashboard (Datadog, Splunk, S3, etc.).

### Alerts

Configure alerts in Fastly dashboard:

- Error rate > 5%
- P95 latency > 10ms
- JWKS fetch failures
- KV store errors

## Troubleshooting

### "HTTP 500: Empty issuer allowlist"

**Cause:** `ISSUER_ALLOWLIST` not configured or empty in Config Store.

**Fix:** Set `ISSUER_ALLOWLIST`:

```bash
fastly config-store-entry create \
  --store-id=your-store-id \
  --key=ISSUER_ALLOWLIST \
  --value="https://issuer.example.com"
```

### "HTTP 401: Replay protection required"

**Cause:** TAP contains nonce but no KV store linked.

**Fix:** Create and link KV store:

```bash
fastly kv-store create --name=peac_replay
fastly resource-link create --resource-id=your-kv-store-id --version=latest
```

### "HTTP 409: Replay detected"

**Cause:** Nonce already used (possible replay attack).

**Action:** This is expected behavior. Client should NOT retry with same nonce.

### "HTTP 503: JWKS unavailable"

**Cause:** Cannot fetch issuer JWKS (network error, timeout, SSRF block).

**Fix:**

1. Verify issuer URL is reachable
2. Check backend configuration in `fastly.toml`
3. Verify HTTPS (required except localhost)
4. Check SSRF guards (not private IP, not metadata URL)

## Production Checklist

- [ ] `MODE` set to `tap_only` (not `unsafe_no_tap`)
- [ ] `ISSUER_ALLOWLIST` contains trusted issuers only
- [ ] KV store created and linked for replay protection
- [ ] `UNSAFE_DEV_MODE` NOT set (or set to `"false"`)
- [ ] Backends configured in `fastly.toml`
- [ ] Log streaming configured (Datadog, Splunk, etc.)
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
cd peac/surfaces/workers/fastly

# Install dependencies
pnpm install

# Initialize Fastly service
fastly compute init

# Create config store
fastly config-store create --name=peac_config

# Set configuration
fastly config-store-entry create \
  --store-id=your-store-id \
  --key=ISSUER_ALLOWLIST \
  --value="https://issuer.example.com"

fastly config-store-entry create \
  --store-id=your-store-id \
  --key=MODE \
  --value="tap_only"

# Create KV store for replay protection
fastly kv-store create --name=peac_replay
fastly resource-link create --resource-id=your-kv-store-id --version=latest

# Build and deploy
pnpm build
fastly compute deploy
```

### Testing

```bash
# Test locally
fastly compute serve

# Test with curl (RFC 9421 HTTP Message Signatures)
curl -i http://localhost:7676/api/resource \
  -H 'Signature-Input: sig1=("@method" "@path" "@authority" "content-type");created=1704067200;keyid="https://issuer.example/.well-known/jwks.json#key-1";alg="ed25519";tag="peac/v0.9"' \
  -H 'Signature: sig1=:BASE64_SIGNATURE_HERE:' \
  -H "Content-Type: application/json"
```

**Header Notes:**

- `Signature-Input`: RFC 9421 signature metadata
- `Signature`: RFC 9421 signature value
- Headers are case-insensitive per HTTP spec

## Fastly-Specific Features

### Backends

Pre-configure JWKS issuer backends in `fastly.toml` for faster JWKS fetching:

```toml
[setup.backends]
[setup.backends.issuer1]
address = "issuer1.example.com"
port = 443

[setup.backends.issuer2]
address = "issuer2.example.com"
port = 443
```

### Edge Side Includes (ESI)

PEAC TAP verification can be used with Fastly ESI:

```html
<esi:include src="/verified-content" />
```

TAP verification runs before ESI processing.

### VCL Integration

For advanced use cases, integrate with Fastly VCL:

```vcl
sub vcl_recv {
  # Route to Compute for TAP verification (RFC 9421)
  if (req.http.Signature-Input) {
    set req.backend = compute;
  }
}
```

## Support

- Documentation: <https://www.peacprotocol.org/docs>
- Issues: <https://github.com/peacprotocol/peac/issues>
- Discussions: <https://github.com/peacprotocol/peac/discussions>
- Fastly Support: <https://support.fastly.com>
