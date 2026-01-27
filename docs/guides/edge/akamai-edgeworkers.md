# Akamai EdgeWorkers Deployment Guide

Production deployment guide for PEAC Protocol TAP verification on Akamai EdgeWorkers.

## Protocol Standards

This guide implements:

- **RFC 9421** - HTTP Message Signatures (authentication headers)
- **RFC 9457** - Problem Details for HTTP APIs (error responses)
- **RFC 8615** - Well-Known URIs (JWKS discovery)
- **Visa TAP** - Built on RFC 9421 for cryptographic agent authentication

## Prerequisites

- Akamai account with EdgeWorkers enabled
- Node.js 18+ and pnpm 8+
- Akamai CLI installed with EdgeWorkers package
- PEAC issuer JWKS configured

## Quick Start

### 1. Install Akamai CLI

```bash
# Install Akamai CLI
npm install -g @akamai/cli

# Install EdgeWorkers package
akamai install edgeworkers
```

### 2. Install Dependencies

```bash
cd surfaces/workers/akamai
pnpm install
```

### 3. Configure EdgeWorker

Create `bundle.json`:

```json
{
  "edgeworker-version": "1.0",
  "description": "PEAC TAP verification on Akamai EdgeWorkers",
  "bundle-version": "1.0.0",
  "api-version": "1.0"
}
```

### 4. Configure Environment Variables

Create EdgeKV namespace for configuration:

```bash
# Create EdgeKV namespace
akamai edgekv create namespace peac_config --network production

# Initialize namespace
akamai edgekv init

# Set configuration items
akamai edgekv write \
  peac_config default ISSUER_ALLOWLIST \
  "https://issuer1.example.com,https://issuer2.example.com"

akamai edgekv write \
  peac_config default MODE \
  "tap_only"

akamai edgekv write \
  peac_config default JWKS_CACHE_TTL_SECONDS \
  "3600"
```

### 5. Create EdgeKV for Replay Protection

```bash
# Create replay namespace
akamai edgekv create namespace peac_replay --network production

# Initialize for replay protection
akamai edgekv init --namespace peac_replay
```

### 6. Build and Deploy

```bash
# Build EdgeWorker bundle
pnpm build

# Create tarball
tar -czvf peac-tap-verifier.tgz bundle.json main.js

# Upload to Akamai
akamai edgeworkers upload --bundle peac-tap-verifier.tgz

# Activate on staging
akamai edgeworkers activate <edgeworker-id> --network staging --version <version>

# Activate on production
akamai edgeworkers activate <edgeworker-id> --network production --version <version>
```

## Architecture

```
┌─────────────────────────────────────┐
│  Akamai EdgeWorkers Runtime         │
│                                     │
│  ┌───────────────────────────────┐ │
│  │   @peac/worker-core           │ │
│  │   (Runtime-neutral handler)    │ │
│  └───────────────┬───────────────┘ │
│                  │                  │
│  ┌───────────────▼───────────────┐ │
│  │   Akamai Adapter              │ │
│  │   - EdgeKV replay store       │ │
│  │   - EdgeKV config (env vars)  │ │
│  │   - httpRequest (JWKS fetch)  │ │
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
akamai edgekv write \
  peac_config default ISSUER_ALLOWLIST \
  "https://issuer1.example.com,https://issuer2.example.com"
```

**CRITICAL:** Empty allowlist returns HTTP 500 (fail-closed security).

### Replay Protection

**Akamai EdgeWorkers:** Uses EdgeKV for replay protection (eventually consistent).

```bash
# Create EdgeKV namespace
akamai edgekv create namespace peac_replay --network production

# Initialize
akamai edgekv init --namespace peac_replay
```

**Note:** EdgeKV is eventually consistent (typical latency: < 10 seconds globally). Race conditions possible for replay attacks.

### JWKS Caching

```bash
akamai edgekv write \
  peac_config default JWKS_CACHE_TTL_SECONDS \
  "3600"
```

JWKS responses cached in-memory per EdgeWorker instance. TTL controls cache duration.

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
akamai edgekv write \
  peac_config default MODE \
  "unsafe_no_tap"

akamai edgekv write \
  peac_config default UNSAFE_DEV_MODE \
  "true"
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
- Bundle size: **< 100KB** (target)

### Optimization Tips

1. **Use EdgeKV for replay** - Fastest available option on Akamai
2. **Enable JWKS caching** - Reduces JWKS fetches by 95%+
3. **Use `tap_only` mode** - Skips receipt verification overhead
4. **Deploy close to users** - Akamai's global network minimizes latency

## Monitoring

### EdgeWorkers Logs

Access logs via Akamai Control Center:

- Real-time logs (last 2 minutes)
- Historical logs (last 24 hours)
- Error logs with stack traces

### DataStream Integration

Stream logs to external systems:

```javascript
import { handleTAP } from '@peac/worker-core';

export async function onClientRequest(request) {
  const start = Date.now();
  const response = await handleTAP(request, {
    mode: await getConfig('MODE'),
    issuerAllowlist: (await getConfig('ISSUER_ALLOWLIST')).split(','),
    replayStore: createEdgeKVReplayStore('peac_replay'),
  });

  // Log metrics (sent to DataStream)
  const duration = Date.now() - start;
  logger.log({
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
    status: response.status,
    duration_ms: duration,
    mode: await getConfig('MODE'),
  });

  return response;
}
```

Configure DataStream in Akamai Control Center (Splunk, Datadog, S3, etc.).

### Alerts

Configure alerts in Akamai Control Center:

- Error rate > 5%
- P95 latency > 10ms
- JWKS fetch failures
- EdgeKV errors

## Troubleshooting

### "HTTP 500: Empty issuer allowlist"

**Cause:** `ISSUER_ALLOWLIST` not configured in EdgeKV.

**Fix:** Set `ISSUER_ALLOWLIST`:

```bash
akamai edgekv write \
  peac_config default ISSUER_ALLOWLIST \
  "https://issuer.example.com"
```

### "HTTP 401: Replay protection required"

**Cause:** TAP contains nonce but EdgeKV namespace not configured.

**Fix:** Create EdgeKV namespace:

```bash
akamai edgekv create namespace peac_replay --network production
akamai edgekv init --namespace peac_replay
```

### "HTTP 409: Replay detected"

**Cause:** Nonce already used (possible replay attack).

**Action:** This is expected behavior. Client should NOT retry with same nonce.

### "HTTP 503: JWKS unavailable"

**Cause:** Cannot fetch issuer JWKS (network error, timeout, SSRF block).

**Fix:**

1. Verify issuer URL is reachable
2. Check SSRF guards (not private IP, not metadata URL)
3. Verify HTTPS (required except localhost)
4. Check EdgeWorkers network connectivity

### EdgeKV Latency

**Issue:** EdgeKV reads showing high latency.

**Cause:** Global EdgeKV replication (typical: < 10 seconds).

**Mitigation:**

1. Use EdgeKV for infrequently changing data only (config, allowlists)
2. Cache JWKS in-memory (reduces EdgeKV reads)
3. For replay protection, accept eventual consistency trade-off

## Production Checklist

- [ ] `MODE` set to `tap_only` (not `unsafe_no_tap`)
- [ ] `ISSUER_ALLOWLIST` contains trusted issuers only
- [ ] EdgeKV namespaces created (peac_config, peac_replay)
- [ ] `UNSAFE_DEV_MODE` NOT set (or set to `"false"`)
- [ ] DataStream configured for log export
- [ ] Alerts configured (error rate, latency, JWKS failures)
- [ ] Staging deployment tested with production-like traffic
- [ ] Property configuration includes EdgeWorker activation
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
cd peac/surfaces/workers/akamai

# Install dependencies
pnpm install

# Create EdgeKV namespaces
akamai edgekv create namespace peac_config --network production
akamai edgekv create namespace peac_replay --network production

# Set configuration
akamai edgekv write \
  peac_config default ISSUER_ALLOWLIST \
  "https://issuer.example.com"

akamai edgekv write \
  peac_config default MODE \
  "tap_only"

# Build and deploy
pnpm build
tar -czvf peac-tap-verifier.tgz bundle.json main.js
akamai edgeworkers upload --bundle peac-tap-verifier.tgz

# Activate on staging
EDGEWORKER_ID=$(akamai edgeworkers list-ids --json | jq -r '.[0].edgeworkerId')
VERSION=$(akamai edgeworkers list-versions $EDGEWORKER_ID --json | jq -r '.[0].version')
akamai edgeworkers activate $EDGEWORKER_ID --network staging --version $VERSION

# Test staging (RFC 9421 HTTP Message Signatures)
curl -i https://staging.example.com/api/resource \
  -H 'Signature-Input: sig1=("@method" "@path" "@authority");created=1704067200;keyid="https://issuer.example/.well-known/jwks.json#key-1";alg="ed25519";tag="peac/v0.9"' \
  -H 'Signature: sig1=:BASE64_SIGNATURE_HERE:'

# Activate on production (after staging validation)
akamai edgeworkers activate $EDGEWORKER_ID --network production --version $VERSION
```

### Testing

```bash
# Test with curl (RFC 9421 HTTP Message Signatures)
curl -i https://your-property.akamaized.net/api/resource \
  -H 'Signature-Input: sig1=("@method" "@path" "@authority" "content-type");created=1704067200;keyid="https://issuer.example/.well-known/jwks.json#key-1";alg="ed25519";tag="peac/v0.9"' \
  -H 'Signature: sig1=:BASE64_SIGNATURE_HERE:' \
  -H "Content-Type: application/json"
```

**Header Notes:**

- `Signature-Input`: RFC 9421 signature metadata
- `Signature`: RFC 9421 signature value
- Headers are case-insensitive per HTTP spec

## Akamai-Specific Features

### Property Manager Integration

Add EdgeWorker behavior in Property Manager:

```json
{
  "name": "edgeworkersEnabled",
  "options": {
    "enabled": true,
    "edgeworkersId": "your-edgeworker-id"
  }
}
```

### EdgeKV Access Control

Restrict EdgeKV access to specific EdgeWorkers:

```bash
akamai edgekv create acl \
  peac_config \
  --allow-edgeworker your-edgeworker-id
```

### Performance Monitoring

Use Akamai mPulse for real user monitoring (RUM):

- Client-side latency
- Geographic distribution
- Error rates by region

## Support

- Documentation: <https://www.peacprotocol.org/docs>
- Issues: <https://github.com/peacprotocol/peac/issues>
- Discussions: <https://github.com/peacprotocol/peac/discussions>
- Akamai Support: <https://control.akamai.com/support>
