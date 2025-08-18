# PEAC v0.9.6 PR-1 Surgical Improvements

This document describes the "80/20 + gold-lite" surgical improvements implemented for PEAC v0.9.6 PR-1 to make the core primitives bulletproof.

## Overview

The surgical improvements focus on production-readiness, security, observability, and reliability. All improvements follow environment-configurable patterns with sensible defaults.

## Security Headers (`security-headers.ts`)

### Content Security Policy (CSP)

- **Default**: Strict CSP with `default-src 'self'`
- **Configuration**:
  - `PEAC_CSP_ENABLED=true|false` (default: true)
  - `PEAC_CSP_REPORT_ONLY=true|false` (default: false)
  - `PEAC_CSP_REPORT_URI` for violation reporting
- **Behavior**: Configurable CSP directives with report-only mode for testing

### Security Headers Applied

- `X-Content-Type-Options: nosniff` (always)
- `Referrer-Policy: no-referrer` (configurable via `PEAC_REFERRER_POLICY`)
- `X-Frame-Options: DENY` (configurable via `PEAC_FRAME_OPTIONS`)
- `X-XSS-Protection: 1; mode=block` (legacy browser support)
- `Strict-Transport-Security` (only over HTTPS, configurable)

### TLS Detection

Automatically detects HTTPS via multiple indicators:

- `req.secure`
- `X-Forwarded-Proto: https`
- `CloudFront-Forwarded-Proto: https`

## Request Tracing (`request-tracing.ts`)

### X-Request-Id

- **Always emitted**: UUID v4 format
- **Header**: `X-Request-Id`
- **Added to**: `req.requestId` for logging correlation

### W3C Trace Context Support

- **Traceparent parsing**: Full W3C Trace Context format validation
- **Echoing**: If valid `traceparent` received, echo it in response
- **Span generation**: Optional child span creation (`PEAC_GENERATE_SPAN_ID=true`)
- **Logging**: All trace context logged with structured fields

### Configuration

- `PEAC_REQUEST_TRACING_ENABLED=true|false` (default: true)
- `PEAC_GENERATE_SPAN_ID=true|false` (default: false)

## Enhanced Rate Limiting (RFC 9331)

### Headers Added

All responses include RFC 9331 compliant rate limit headers:

- `RateLimit-Limit`: Maximum requests allowed
- `RateLimit-Remaining`: Tokens remaining in bucket
- `RateLimit-Reset`: Unix timestamp when bucket resets
- `RateLimit-Policy`: Policy description (e.g., "60;w=60")

### Rate Limit Exceeded

When rate limited (429), additional header:

- `Retry-After`: Seconds to wait before retry

### Token Bucket Algorithm

- **Algorithm**: Token bucket with configurable refill rate
- **Memory cleanup**: Automatic cleanup of expired buckets
- **Test cleanup**: `destroy()` method for Jest teardown

## JWKS Management (`jwks.handler.ts`)

### Key Persistence

- **Production**: Persistent keys via `PEAC_JWKS_PATH`
- **Development**: Ephemeral keys with warning logs
- **Format**: ES256 (P-256 curve) keys in JWK format

### Key Rotation

- **Primary/Secondary**: Supports two keys for rotation
- **Collision handling**: UUID collision detection and retry
- **Persistence**: Automatic saving to configured path

### HTTP Caching

- **ETag**: Based on primary and secondary key IDs
- **Last-Modified**: Timestamp of last key modification
- **Cache-Control**: `public, max-age=300, stale-while-revalidate=60`
- **Conditional requests**: 304 responses for unchanged keys

## Payment Guards (`guards.ts`)

### Mode Validation

- **Modes**: `test`, `staging`, `live`
- **Live requirements**: All configured secrets must be present
- **Fail-fast**: Fatal error if live mode missing secrets
- **Test/staging**: Graceful degradation with warnings

### Provider Status

Dynamic status reporting based on mode:

- **Credits**: Always "live" (testnet)
- **X402**: "live" in live mode, "simulation" otherwise
- **Stripe**: "live" in live mode, "simulation" otherwise

### Audit Trail

All payment attempts logged with:

- Provider, amount, mode, health status
- Throttled warning logs (1 minute intervals)
- Metrics for monitoring

## Capabilities Caching (`capabilities.handler.ts`)

### HTTP Caching

- **ETag**: Static based on version and conformance level
- **Last-Modified**: Fixed timestamp for stable caching
- **Cache-Control**: `public, max-age=600, stale-while-revalidate=300`
- **Vary**: `Accept` for content negotiation

### Conditional Requests

- **If-None-Match**: ETag-based caching
- **If-Modified-Since**: Timestamp-based caching
- **304 responses**: Proper not-modified handling

### Content Negotiation

- **Vendor media types**: `application/vnd.peac.capabilities+json;version=0.9.6`
- **Fallback**: `application/json` for compatibility
- **406 responses**: Not Acceptable for unsupported types

## Idempotency Middleware (`idempotency.ts`)

### Idempotency Keys

- **Auto-generation**: For payment operations without keys
- **Validation**: Key length limits (255 chars default)
- **TTL**: Configurable cache lifetime (1 hour default)

### Response Caching

- **Success only**: Only 2xx responses cached
- **Headers**: `Idempotency-Key`, `X-Idempotent-Replay`, `Age`
- **Cleanup**: Automatic expired entry removal

### Payment Audit

All payment operations logged with:

- Method, path, idempotency key
- User agent, IP address
- Audit trail for compliance

## Environment Configuration

### Core Settings

```bash
# Security Headers
PEAC_CSP_ENABLED=true
PEAC_CSP_REPORT_ONLY=false
PEAC_CSP_REPORT_URI=https://example.com/csp-report
PEAC_REFERRER_POLICY=no-referrer
PEAC_HSTS_ENABLED=true
PEAC_HSTS_MAX_AGE=31536000

# Request Tracing
PEAC_REQUEST_TRACING_ENABLED=true
PEAC_GENERATE_SPAN_ID=false

# JWKS
PEAC_JWKS_PATH=/app/data/jwks.json

# Payments
PEAC_PAYMENTS_MODE=test|staging|live
PEAC_X402_ENABLED=true
PEAC_STRIPE_ENABLED=true

# Idempotency
PEAC_IDEMPOTENCY_ENABLED=true
PEAC_IDEMPOTENCY_TTL=3600000
```

## Testing

### Conformance Tests

Comprehensive test suite in `tests/integration/conformance.test.ts`:

- **Security Headers**: CSP, nosniff, referrer policy, frame options
- **Request Tracing**: X-Request-Id generation, traceparent echoing
- **Rate Limiting**: RFC 9331 headers, retry-after on limits
- **JWKS**: Key persistence, conditional requests, ephemeral warnings
- **Payment Guards**: Mode validation, health checks, audit trail
- **Capabilities**: Conditional requests, cache headers, content negotiation

### Test Cleanup

All middleware provides `destroy()` methods for Jest teardown:

```javascript
afterAll(() => {
  standardRateLimiter.destroy();
  strictRateLimiter.destroy();
  idempotencyMiddleware.destroy();
});
```

## Production Deployment

### Required Environment Variables

For live payment mode, these secrets are required:

```bash
PEAC_PAYMENTS_MODE=live
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
PEAC_X402_RPC_URL=https://mainnet.ethereum.io
PEAC_X402_PRIVATE_KEY=0x...
```

### Recommended Settings

```bash
# JWKS persistence
PEAC_JWKS_PATH=/app/data/jwks.json

# CSP enforcement (not report-only)
PEAC_CSP_ENABLED=true
PEAC_CSP_REPORT_ONLY=false

# Span generation for tracing
PEAC_GENERATE_SPAN_ID=true

# HSTS for HTTPS
PEAC_HSTS_ENABLED=true
PEAC_HSTS_PRELOAD=true
```

## Security Considerations

1. **Secrets Management**: Never log or expose payment secrets
2. **Key Persistence**: JWKS path should be writable and backed up
3. **CSP Reports**: Configure CSP reporting URI for violation monitoring
4. **Rate Limiting**: Monitor rate limit metrics for abuse detection
5. **Audit Logs**: Payment audit trail should be tamper-evident

## Monitoring & Observability

### Metrics Added

- Rate limit hits/misses by path
- Idempotency cache hits/stores by path
- Payment attempts by provider/outcome
- Security header application counts

### Structured Logging

All middleware emits structured logs with:

- Request IDs for correlation
- Trace context when available
- Security events for monitoring
- Performance timers for latency tracking
