# Changelog

All notable changes to PEAC Protocol will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.6] - 2024-12-18

### Added
- Deterministic ETags with conditional requests (304 support)
- RFC 7807 Problem Details for all error responses
- RFC 9331 RateLimit headers with delta seconds
- Atomic JWKS persistence with fsync and 0600 permissions
- Idempotency middleware with scoped keys and LRU eviction
- W3C trace context propagation (traceparent + tracestate)
- Capabilities memoization for performance
- Comprehensive test coverage (72 tests)
- SBOM generation for supply chain transparency

### Changed
- CSP default-src now 'none' for API-first security
- Permissions-Policy uses explicit deny list
- X-XSS-Protection disabled (deprecated header)
- frame-src replaces deprecated child-src in CSP
- Problem type URIs now use absolute URLs (https://peacprotocol.org/problems/)
- RateLimit-Reset uses delta seconds instead of epoch timestamp

### Security
- Production safety rail preventing rate limit bypass
- Sensitive header redaction in logs (idempotency keys)
- Trust proxy configuration for accurate IP detection
- Atomic file writes with proper permissions
- Bounded memory for idempotency cache

## [0.9.5] - 2024-12-01

### Added
- Initial PEAC Protocol implementation
- Basic capabilities endpoint
- Payment scaffolding
- DPoP authentication framework