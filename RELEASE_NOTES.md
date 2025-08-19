# PEAC Protocol Release Notes

## v0.9.6 - PR-2 Core Implementation (Strict Protocol = Release)

### Major Features
- **Strict Protocol Versioning**: X-PEAC-Protocol: 0.9.6 required on write endpoints
- **Negotiations API**: Full negotiation lifecycle with state management
- **Payments API**: Credit and X402 payment rails with idempotency
- **Webhook System**: HMAC verification with timestamp skew and replay protection
- **Health & Metrics**: Prometheus metrics (gated), liveness/readiness endpoints

### Protocol Compliance
- **RFC 7807**: Problem Details with absolute URIs and extensions
- **RFC 9331**: Rate limiting with delta seconds (not epoch timestamps)  
- **RFC 9110**: Proper caching with ETag/304 handling
- **Webhook Security**: HMAC + timestamp verification, exempt from protocol headers

### SDK Enhancements
- Auto-injection of X-PEAC-Protocol header on write operations
- Enhanced error handling with structured problem details
- Comprehensive pagination support

### Testing & Quality
- Protocol enforcement integration tests
- Webhook security testing with signature verification
- Idempotency replay header validation
- Rate limiting compliance verification

### Dark Features
- Privacy/data protection code (disabled by env flags)
- SLO management system (disabled by env flags)
- Ready for activation in future releases

### Technical Details
- Enhanced idempotency with replay detection and fingerprinting
- Circuit breakers, retry logic, and timeout patterns
- Structured logging with distributed tracing support
- Comprehensive OpenAPI specification with consolidated error examples
- SBOM generation for supply chain security

### Breaking Changes
- Strict protocol versioning - no backward compatibility until ~0.9.12
- Webhook endpoints exempt from protocol enforcement (HMAC-only verification)
- All write operations require X-PEAC-Protocol: 0.9.6 header

### Migration Guide
- Update client integrations to include X-PEAC-Protocol: 0.9.6 on writes
- Webhook implementations continue unchanged (HMAC verification only)
- SDK users get automatic protocol header injection