# @peacprotocol/server (v0.9.3)

Optional reference server for the PEAC Protocol.
- Identity verification (JWK/JWKS, DPoP)
- Session mint/verify (JWT)
- Payments via X402 provider (+ Stripe bridge)
- GDPR export, rate limiting, metrics
- Emits X-PEAC-Version: 0.9.3

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
