# @peacprotocol/server (v0.9.6)

Reference server for the PEAC Protocol with strict versioning.

- Strict protocol versioning: X-PEAC-Protocol: 0.9.6 required on writes
- Negotiations + Payments with idempotency & RFC compliance
- Webhook HMAC verification (exempt from protocol header requirement)
- Prometheus metrics, health checks, resilience patterns
- Privacy/SLO features (disabled by default via env flags)

This server **does not** replace the JavaScript SDK or `peac.txt`. It complements `@peacprotocol/core` when policies require verification, sessions, or payments.

## Quickstart

```bash
npm install
npm run build
npm start
Endpoints

POST /verify - Agent identity verification
POST /pay - Payment processing
GET /.well-known/peac - Server capabilities
GET /gdpr-export - GDPR data export
GET /healthz - Health check
GET /metrics - Prometheus metrics

Environment Variables

PEAC_PORT (default: 3000)
PEAC_REDIS_URL (for rate limiting)
PEAC_LOG_LEVEL (info|debug|warn|error)

License: Apache-2.0
```
