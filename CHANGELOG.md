# Changelog

All notable changes to PEAC Protocol will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.17] - Unreleased

### Added

- **x402 v2 Adapter**: Full x402 v2 compatibility with v1 fallback (`X402Dialect = 'v1' | 'v2' | 'auto'`)
- **RSL 1.0 Alignment**: Extended `ControlPurpose` with RSL tokens (`ai_input`, `ai_search`, `search`), new `@peac/mappings-rsl` package
- **Subject Binding**: Optional `subject_snapshot` on `AuthContext` (envelope-level) for identity context at issuance
- **issueJws()**: Convenience wrapper returning just the JWS string for header-centric flows
- **Policy Kit v0.1**: New `@peac/policy-kit` package for deterministic CAL policy evaluation (YAML/JSON policy files, first-match-wins rules, subject/purpose/licensing matching)
- **CLI Policy Commands**: `peac policy validate`, `peac policy explain`, `peac policy example` for policy file operations

### Changed

- **BREAKING**: `issue()` now returns `IssueResult { jws, subject_snapshot? }` instead of `string`
- `verify()` accepts `string | VerifyOptions` for backwards compatibility
- PROTOCOL-BEHAVIOR extended with Section 2.4-2.5 (RSL mapping) and Section 8.5 (Subject Binding)

### Migration

To migrate from v0.9.16:

```typescript
// Before (v0.9.16)
const jws = await issue(opts);
response.setHeader('PEAC-Receipt', jws);

// After (v0.9.17) - Option 1: Use issueJws() for simple flows
const jws = await issueJws(opts);
response.setHeader('PEAC-Receipt', jws);

// After (v0.9.17) - Option 2: Use issue() for access to validated snapshot
const result = await issue(opts);
response.setHeader('PEAC-Receipt', result.jws);
// result.subject_snapshot available if provided in opts
```

## [0.9.16] - 2025-12-07

### Added

- **Control Abstraction Layer (CAL) semantics**: `ControlPurpose` (`crawl`, `index`, `train`, `inference`), `ControlLicensingMode` (`subscription`, `pay_per_crawl`, `pay_per_inference`), and `any_can_veto` decision combinator with chain validation
- **PaymentEvidence extensions**: `aggregator` field for marketplace or platform identifiers, `splits[]` array for multi-party allocation with invariants (party required, amount or share required)
- **Subject Profile Catalogue**: `SubjectProfile` and `SubjectProfileSnapshot` types and validators for `human`, `org`, and `agent` subjects
- **Subject profile privacy guidance**: PROTOCOL-BEHAVIOR Section 8.4 specifying SubjectProfile as OPTIONAL, with opaque identifiers, data minimization, and retention documentation requirements

### Changed

- `@peac/schema` now exports CAL, PaymentEvidence, and SubjectProfile validators
- PROTOCOL-BEHAVIOR version set to 0.9.16 and extended with Section 8.4 privacy guidance

## [0.9.15] - 2025-11-26

### Changed

- **Kernel-first architecture**: Published packages now import from granular kernel packages instead of monolithic `@peac/core`
- **Package structure**: `@peac/protocol`, `@peac/crypto`, `@peac/cli`, `@peac/server`, `@peac/mappings-acp` now import from `@peac/kernel` and `@peac/schema`
- **TypeScript config split**: Separate `tsconfig.core.json` (published packages, blocking) and `tsconfig.legacy.json` (all code, advisory)
- **CI improvements**: Split typecheck jobs, `pnpm/action-setup@v4`, advisory performance checks

### Added

- `docs/ARCHITECTURE.md`: Kernel-first dependency DAG documentation
- `docs/CI_BEHAVIOR.md`: CI workflow and advisory vs blocking semantics
- `docs/CANONICAL_DOCS_INDEX.md`: Central index for all normative documentation
- `.github/ISSUE_TEMPLATE/`: Bug report and feature request templates
- `.github/pull_request_template.md`: PR checklist template

### Deprecated

- `@peac/core`: Deprecated in favor of granular packages (`@peac/kernel`, `@peac/schema`, `@peac/crypto`, `@peac/protocol`)
- Import from specific packages:
  - `@peac/kernel` - Receipt types, builder, nonce cache
  - `@peac/schema` - Zod schemas, validation
  - `@peac/crypto` - Signing, verification, key management
  - `@peac/protocol` - High-level enforce/verify APIs

### Migration

To migrate from `@peac/core`:

```typescript
// Before (deprecated)
import { enforce, verify, Receipt } from '@peac/core';

// After (v0.9.15+)
import { enforce, verify } from '@peac/protocol';
import type { Receipt } from '@peac/kernel';
```

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
