# Changelog

All notable changes to PEAC Protocol will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.15] - Unreleased

### Added

**Universal Parser (Phase 2)**

- `@peac/parsers-universal`: Priority-based parser orchestration with deny-safe merging
- P0 format support: agent-permissions (P100), AIPREF (P80), ai.txt (P60), peac.txt (P50), robots.txt (P40), ACP (P10)
- `@peac/safe-fetch`: Centralized SSRF protection with CIDR blocking (IPv4/IPv6)
- `@peac/core`: New `discoverPolicy()` and `discoverAndEnforce()` functions
- Comprehensive test coverage: determinism (100 iterations) and precedence validation
- ADR-0004: Universal parser precedence and deny-safe merge rules
- Bridge readiness: `universal_parser_loaded` check

**Build Guardrails**

- `tools/guards/ensure-pnpm.js`: Hard guard for PNPM-only enforcement
- CI verification: package manager validation and foreign lockfile detection
- `.npmrc`: Strict settings (engine-strict, auto-install-peers, strict-peer-dependencies)
- `.gitignore`: Block Yarn PnP artifacts (.pnp, .pnp.js, .pnp.cjs, .pnp.loader.mjs)
- `pnpm-workspace.yaml`: Nested package patterns for new packages

**Golden Tests and Benchmarks**

- `benchmarks/wasm-vs-ts/`: Performance comparison infrastructure
- `tools/guards/ensure-no-wasm.js`: CI guard to prevent WASM imports in core until v0.9.16+
- `tests/goldens/`: Cross-runtime determinism tests (JCS, URL normalization)
- `archive/wasm-exploration-v0.9.15/`: WASM modules archived for future reference

### Changed

- `package.json`: Added `packageManager: "pnpm@9.10.0"` and engines guard
- `package.json`: Preinstall hook enforces PNPM-only usage
- `package.json`: Added `"type": "module"` to eliminate module warnings
- README: Development section with Corepack setup instructions
- docs/getting-started.md: Replaced npx with pnpm dlx
- CI workflows: PNPM 9.10.0 with verification and foreign lockfile checks

### Performance

- **TypeScript baseline retained**: Benchmarks confirmed TypeScript is faster than initial WASM implementation for micro-operations (0.001-0.002ms range)
- WASM exploration archived for future batch API (v0.9.16+)
- String marshalling overhead (JS↔WASM) exceeds computational gains for sub-millisecond operations
- V8 JIT optimization sufficient for current workload sizes

### Security

- SSRF protection: Blocks file:, data:, ftp:, gopher:, javascript: schemes
- IPv4 CIDR blocking: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 0.0.0.0/8
- IPv6 CIDR blocking: ::1, fc00::/7, fe80::/10
- Deny-safe policy merging ensures no unintended permission escalation

## [0.9.14] - 2025-09-27

### Changed

- **Wire format v0.9.14**: Simplified JWS header with `typ: "peac.receipt/0.9"`
- **Single header**: Only `PEAC-Receipt` header (removed `peac-version` header)
- **Receipt fields**: Use `iat` (Unix seconds) instead of `issued_at`, `payment.scheme` instead of `payment.rail`
- **Core exports**: New `signReceipt()`, `verifyReceipt()` functions with v0.9.14 format
- **Performance**: Sub-1ms p95 verification target with benchmark script

### Added

- `packages/core/src/b64.ts`: Base64url utilities
- `scripts/bench-verify.ts`: Performance benchmark with p95 metrics
- `tests/golden/generate-vectors.ts`: 120+ test vectors generator
- `scripts/assert-core-exports.mjs`: Build output validation
- `scripts/guard.sh`: Safety checks for dist imports and field regressions

### Deprecated

- `verify()`: Use `verifyReceipt()` instead
- `verifyBulk()`: Use `verifyReceipt()` in a loop

## [0.9.13.2] - 2025-09-17

Intent: Zero-friction local enforcement/verification via a loopback sidecar.

### Added

- **apps/bridge/** Hono server on 127.0.0.1:31415 with /enforce, /verify, /health, /ready; /metrics on :31416
- Wire headers: peac-version: 0.9.13 on all endpoints
- Media types: success application/peac+json, errors application/problem+json (RFC 7807 with canonical https://peacprotocol.org/problems/<slug>)
- PEAC-Receipt header on allow; sensitive responses send Cache-Control: no-store, no-cache, must-revalidate, private
- 402 responses mirror payment timing via Retry-After and normalized payment{} extension
- Prometheus metrics with Content-Type: text/plain; version=0.0.4; charset=utf-8, peac-version header, and Cache-Control: no-cache
- Explicit HEAD /health for monitors
- CLI: peac bridge install|start|stop|status with Windows-safe stop, PID tracking, logs, and require.resolve() discovery
- Readiness checks include core_loaded and api_verifier_loaded

### Changed

- Verify returns proper 4xx/5xx with Problem+JSON on errors (no 200-on-error)
- Lock loopback host to 127.0.0.1 (no 0.0.0.0 override)
- Consolidated security headers (nosniff, CORP same-origin) via centralized helper

### Removed

- All legacy X-PEAC-\* headers; emojis/em-dashes in logs; dead discovery code paths

### Security

- Loopback-only binding; SSRF protections preserved; strict cache controls

### Performance

- Local /enforce p95 < 5 ms; CPU idle < 5% @ 100 rps baseline
- Cold start comfortably < 30 ms

### Compatibility

- Wire protocol 0.9.13; additive, non-breaking. Embedded enforcement remains fallback

## [0.9.10-beta] - 2025-01-29

### Added

- **Signed Agent-Directory Caching**: TOFU pinning with key rotation support and comprehensive SSRF protection
- **Receipt Key Rotation**: JWS `kid` header support for seamless key rotation without downtime
- **Batch Verify API**: High-performance batch verification (POST ≤100 items, GET ≤25 items)
- **Hardened Rate Limiting**: Per-tier token bucket rate limiting with RFC 9457 RateLimit headers
- **Structured Telemetry**: Privacy-safe event logging with correlation IDs and PII protection

### Security

- DNS resolution checks to prevent SSRF attacks on private/internal networks
- Ed25519 signature verification for agent directory authentication
- Singleflight pattern to prevent directory fetch stampedes
- Token bucket rate limiting with accurate time-based refill
- Certificate chain validation for directory fetching
- Private IP address blocking (RFC 1918, CGNAT, link-local, loopback)
- Timeout controls and response size limits for all external requests

### Changed

- Protocol version updated to 0.9.10 (X-PEAC-Protocol header)
- Package versions updated to 0.9.10 across all packages
- Web Bot Auth verification now uses cached directory system
- Receipt verification supports multiple keys with `kid` matching
- Rate limiting now properly enforces RFC 9457 compliant headers

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
