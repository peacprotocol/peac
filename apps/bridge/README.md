# PEAC Bridge - Local Development Sidecar

Zero-friction local enforcement and verification via a loopback HTTP sidecar.

## Overview

The PEAC Bridge is a local development server that provides HTTP endpoints for PEAC protocol operations. It runs exclusively on `127.0.0.1:31415` (main API) and `127.0.0.1:31416` (metrics), providing a secure, loopback-only interface for local development workflows.

## Installation

```bash
# From monorepo root
pnpm install
pnpm build

# Or install globally (when published)
pnpm add -g @peac/cli
```

## Usage

### Starting the Bridge

```bash
# Start in foreground (see logs directly)
peac bridge start --foreground

# Start in background (default)
peac bridge start

# Start with custom port
peac bridge start --port 8080

# Start in development mode
peac bridge start --mode dev
```

### Managing the Bridge

```bash
# Check status
peac bridge status

# Stop the bridge
peac bridge stop
```

## API Endpoints

### Health Check

```bash
# GET /health
curl -i http://127.0.0.1:31415/health

HTTP/1.1 200 OK
peac-version: 0.9.13
Content-Type: application/peac+json
X-Request-ID: 123e4567-e89b-12d3-a456-426614174000

{"ok": true, "version": "0.9.13.2", "wire_version": "0.9.13"}

# HEAD /health (for monitors)
curl -I http://127.0.0.1:31415/health

HTTP/1.1 200 OK
peac-version: 0.9.13
Content-Type: application/peac+json
```

### Readiness Check

```bash
curl -i http://127.0.0.1:31415/ready

HTTP/1.1 200 OK
peac-version: 0.9.13
Content-Type: application/peac+json

{
  "ok": true,
  "checks": {
    "core_loaded": true,
    "signer_cache": true,
    "api_verifier_loaded": true,
    "memory_available": true,
    "uptime_sufficient": true
  }
}
```

### Enforce Endpoint

```bash
curl -i http://127.0.0.1:31415/enforce \
  -H "Content-Type: application/json" \
  -d '{"resource": "https://example.com/data", "purpose": "read"}'

# Success Response (200 OK)
HTTP/1.1 200 OK
peac-version: 0.9.13
Content-Type: application/peac+json
PEAC-Receipt: eyJhbGciOiJFZERTQSIsImtpZCI6IjIwMjUtMDktMTcvMDEiLCJ0eXAiOiJhcHBsaWNhdGlvbi9wZWFjLXJlY2VpcHQrand3cyJ9..signature
Cache-Control: no-store, no-cache, must-revalidate, private
X-Request-ID: 123e4567-e89b-12d3-a456-426614174000

{"allowed": true, "receipt": "eyJ..."}

# Payment Required Response (402)
HTTP/1.1 402 Payment Required
peac-version: 0.9.13
Content-Type: application/problem+json
Retry-After: 60
X-Request-ID: 123e4567-e89b-12d3-a456-426614174000

{
  "type": "https://peacprotocol.org/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "Payment required to access this resource",
  "instance": "/enforce",
  "payment_url": "https://pay.example.com/invoice/123"
}
```

### Verify Endpoint

```bash
curl -i http://127.0.0.1:31415/verify \
  -H "Content-Type: application/json" \
  -d '{
    "receipt": "eyJhbGciOiJFZERTQSI...",
    "resource": "https://example.com/data"
  }'

# Success Response (200 OK)
HTTP/1.1 200 OK
peac-version: 0.9.13
Content-Type: application/peac+json
Cache-Control: no-store, no-cache, must-revalidate, private

{
  "valid": true,
  "claims": {
    "iss": "peac:bridge:local",
    "sub": "https://example.com/data",
    "iat": 1695820800,
    "exp": 1695821100,
    "rid": "0191f4e8-8b9a-7123-b456-000000000000"
  }
}

# Invalid Receipt Response (400)
HTTP/1.1 400 Bad Request
peac-version: 0.9.13
Content-Type: application/problem+json

{
  "type": "https://peacprotocol.org/problems/invalid-receipt",
  "title": "Invalid Receipt",
  "status": 400,
  "detail": "Receipt signature verification failed"
}
```

### Metrics Endpoint

```bash
curl -i http://127.0.0.1:31416/metrics

HTTP/1.1 200 OK
Content-Type: text/plain; version=0.0.4; charset=utf-8
peac-version: 0.9.13
Cache-Control: no-cache

# HELP peac_enforce_requests_total Total number of enforce requests
# TYPE peac_enforce_requests_total counter
peac_enforce_requests_total{status="allowed"} 42
peac_enforce_requests_total{status="denied"} 3
peac_enforce_requests_total{status="payment_required"} 7

# HELP peac_verify_requests_total Total number of verify requests
# TYPE peac_verify_requests_total counter
peac_verify_requests_total{status="valid"} 35
peac_verify_requests_total{status="invalid"} 8

# HELP peac_http_request_duration_seconds HTTP request duration
# TYPE peac_http_request_duration_seconds histogram
peac_http_request_duration_seconds_bucket{le="0.005",path="/enforce"} 40
peac_http_request_duration_seconds_bucket{le="0.01",path="/enforce"} 42
```

## Headers and Cache Control

### Wire Protocol Headers

All responses include the wire protocol version:

```
peac-version: 0.9.13
```

### Cache Control for Sensitive Endpoints

Sensitive endpoints (`/enforce`, `/verify`) include strict cache controls:

```
Cache-Control: no-store, no-cache, must-revalidate, private
```

### Retry-After on 402 Responses

Payment required responses include retry timing:

```
Retry-After: 60
```

This mirrors the actual payment provider's retry timing, allowing clients to implement smart retry logic.

### Security Headers

All responses include enterprise security headers:

```
X-Content-Type-Options: nosniff
Cross-Origin-Resource-Policy: same-origin
```

## Environment Variables

```bash
# Enable metrics endpoint (port 31416)
PEAC_ENABLE_METRICS=true

# Set bridge port (default: 31415)
PEAC_BRIDGE_PORT=8080

# Set mode (dev|test|production)
PEAC_MODE=dev

# Enable debug logging
DEBUG=peac:*
```

## Process Management

The bridge includes cross-platform process management:

- **Unix/Linux/macOS**: Uses standard signals (SIGTERM, SIGKILL)
- **Windows**: Uses `taskkill` for graceful shutdown
- **PID Tracking**: Stores process ID in `~/.peac/bridge.pid`
- **Logs**: Written to `~/.peac/logs/bridge.log` (background mode)

## Performance Characteristics

- **Local /enforce**: p95 < 5ms
- **Local /verify**: p95 < 5ms
- **CPU Usage**: < 5% idle at 100 rps
- **Memory**: < 50MB RSS typical
- **Cold Start**: < 30ms

## Security Considerations

- **Loopback Only**: Bridge binds exclusively to `127.0.0.1`, never `0.0.0.0`
- **No External Access**: Cannot be accessed from network interfaces
- **SSRF Protection**: Maintains core SSRF protections from PEAC protocol
- **Secure Headers**: Implements full security header suite

## Development

```bash
# Build from source
cd apps/bridge
pnpm build

# Run directly
PEAC_ENABLE_METRICS=1 node dist/server.js

# Run tests
pnpm test

# Watch mode
pnpm dev
```

## Troubleshooting

### Bridge won't start

Check if port is already in use:

```bash
lsof -i:31415
```

### Bridge status shows not running but process exists

Clean up stale PID file:

```bash
rm ~/.peac/bridge.pid
peac bridge stop  # Clean up any orphaned processes
peac bridge start
```

### Metrics not appearing

Ensure metrics are enabled:

```bash
PEAC_ENABLE_METRICS=1 peac bridge start
```

Check metrics endpoint:

```bash
curl http://127.0.0.1:31416/metrics
```

## License

Apache-2.0
