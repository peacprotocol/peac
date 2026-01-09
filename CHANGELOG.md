# Changelog

All notable changes to PEAC Protocol will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.28] - 2026-01-09

### Added

- **Contracts Package** (`@peac/contracts`, Layer 1)
  - Canonical error codes with E_* prefix format
  - Contract definitions for protocol invariants
  - Shared error taxonomy across TypeScript and Go implementations
- **Worker Core Package** (`@peac/worker-core`, Layer 4)
  - Runtime-neutral TAP verification handler
  - MODE_BEHAVIOR table-driven verification (tap_only, receipt_or_tap, unsafe_no_tap)
  - RFC 9421 HTTP Message Signatures support
  - Replay protection with D1/KV/EdgeKV backends
  - Error normalization with RFC 9457 Problem Details
  - 34 comprehensive tests

### Documentation

- **Edge Deployment Guides** (3 guides)
  - `docs/guides/edge/cloudflare-workers.md`: Cloudflare Workers deployment
  - `docs/guides/edge/fastly-compute.md`: Fastly Compute deployment
  - `docs/guides/edge/akamai-edgeworkers.md`: Akamai EdgeWorkers deployment
  - All guides use RFC 9421 HTTP Message Signatures (Signature-Input, Signature)
  - Protocol Standards sections (RFC 9421, RFC 9457, RFC 8615, Visa TAP)
  - Security and Operations sections (threat model, fail modes, replay semantics)
  - Performance targets clearly labeled as design goals
- **NPM Publishing Policy** (`docs/maintainers/NPM_PUBLISH_POLICY.md`)
  - Latest-only publishing policy
  - First npm publish deferred to v0.9.31
  - Comprehensive quality gates and verification procedures
  - pnpm publish enforcement (NOT npm publish)
- **HOT-PATH-RESILIENCE.md** (`docs/specs/HOT-PATH-RESILIENCE.md`)
  - Reclassified from Normative to Informational
  - Design targets for O(1) parsing, fail mode guidance
  - Explicit disclaimer about enforcement status

### CI/Quality

- **Documentation Quality Workflow** (`.github/workflows/docs-quality.yml`)
  - Forbidden header checks (no Payment-*, enforce RFC 9421)
  - RFC 9421 usage verification in edge guides
  - Performance claim qualification checks
  - Placeholder text detection
  - Error code format consistency
  - Normative spec status validation

### Deferred

The following items were originally planned for v0.9.28 but deferred to future releases:

- **Full Go SDK (Issue + Policy)** → Moved to v0.9.29
  - Only verify.go exists; issue.go and policy.go not implemented
  - 4-6 day implementation timeline required
- **npm publish** → Moved to v0.9.31
  - Latest-only publishing policy
  - Quality gates need validation with real deployments
- **Faremeter Adapter** → Moved to v0.9.30
- **Python SDK** → Moved to post-v0.10.0
- **@peac/nextjs v0.1** → Moved to v0.9.30

### Notes

- No breaking changes (additive only)
- All packages bumped to 0.9.28
- Cross-referenced with quality audit: `reference/V0928_QUALITY_AUDIT.md`

## [0.9.27] - 2026-01-07

### Added

- **Dispute Attestation Schema** (`@peac/schema`)
  - `DisputeAttestation`: Formal mechanism for contesting PEAC claims
  - `DisputeEvidence`: dispute_type, target_ref, grounds, state, resolution
  - `DisputeType`: 8 types (unauthorized_access, attribution_missing, receipt_invalid, etc.)
  - `DisputeTargetType`: receipt, attribution, identity, policy
  - `DisputeGroundsCode`: 14 codes (missing_receipt, source_misidentified, agent_impersonation, etc.)
  - `DisputeState`: 8 lifecycle states with transition rules
  - `DisputeResolution`: outcome, rationale, remediation for terminal states
  - State machine helpers: `canTransitionTo()`, `isTerminalState()`, `getValidTransitions()`
  - Factory helpers: `createDisputeAttestation()`, `transitionDisputeState()`
  - Time validation: `isDisputeExpired()`, `isDisputeNotYetValid()`
  - ULID format enforcement for dispute IDs (uppercase canonical form)
- **Dispute Error Codes** (`specs/kernel/errors.json`): 14 new dispute\_\* codes
  - `E_DISPUTE_INVALID_FORMAT`, `E_DISPUTE_INVALID_ID`, `E_DISPUTE_INVALID_TYPE`
  - `E_DISPUTE_INVALID_TARGET_TYPE`, `E_DISPUTE_INVALID_GROUNDS`, `E_DISPUTE_INVALID_STATE`
  - `E_DISPUTE_INVALID_TRANSITION`, `E_DISPUTE_MISSING_RESOLUTION`
  - `E_DISPUTE_RESOLUTION_NOT_ALLOWED`, `E_DISPUTE_NOT_YET_VALID`, `E_DISPUTE_EXPIRED`
  - `E_DISPUTE_OTHER_REQUIRES_DESCRIPTION`, `E_DISPUTE_DUPLICATE`, `E_DISPUTE_TARGET_NOT_FOUND`
- **Audit Types** (`@peac/audit`)
  - `AuditEntry`: JSONL normative format with trace context, actor, resource, outcome
  - `AuditEventType`: 15 event types including dispute lifecycle events
  - `CaseBundle`: Aggregate audit entries for dispute resolution
  - `CaseBundleSummary`: Statistics for case bundles
  - `TraceContext`: W3C Trace Context for distributed tracing
- **Dispute Conformance Suite** (`specs/conformance/fixtures/dispute/`)
  - `valid.json`: 12 valid dispute attestation vectors
  - `invalid.json`: 25 invalid attestation vectors with expected errors
  - `edge-cases.json`: 18 edge case vectors (state transitions, ULID boundaries, time validation)
- **docs/specs/DISPUTE.md**: Normative dispute specification (450+ lines)
  - Dispute types and grounds codes
  - Lifecycle state machine with transition table
  - Resolution and remediation semantics
  - Error taxonomy with HTTP status mappings
  - ULID format requirements
  - Audit integration patterns
- **docs/compliance/gdpr.md**: GDPR compliance template
- **docs/compliance/soc2.md**: SOC 2 compliance template

### Changed

- **Error Category Parity**: TypeScript `ErrorCategory` type now syncs with `specs/kernel/errors.json`
  - Added `dispute` category to canonical categories
  - CI test ensures categories stay in sync
- **README Streamlined**: Root README reduced from ~690 lines to ~186 lines
  - Canonical expansion: "Portable Evidence for Agent Coordination"
  - Machine-to-machine framing (crawling as one use case)
  - Long content moved to `docs/README_LONG.md`
- **docs/specs/ERRORS.md**: Added 401 convention documentation
  - WWW-Authenticate header with PEAC-Attestation scheme
  - 401 vs 403 HTTP status semantics
  - Attestation temporal validity rules
- **ROADMAP.md**: Updated to show v0.9.26 as current release

## [0.9.26] - 2026-01-04

### Added

- **Attribution Package** (`@peac/attribution`): Full implementation for provenance tracking
  - `computeContentHash()`: SHA-256 content hashing with base64url encoding
  - `verifyContentHash()`: Verify content matches expected hash (accepts padded/unpadded)
  - `normalizeBase64url()`: Canonical unpadded base64url normalization
  - `buildAttributionChain()`: Construct attribution chains from source receipts
  - `verifyAttributionChain()`: Verify chain integrity and signatures
  - 4 test files with comprehensive coverage (chain, errors, hash, verify)
- **Attribution Schema** (`@peac/schema`)
  - `AttributionAttestation`: Core attestation type for content provenance
  - `AttributionEvidence`: source_receipt_ref, content_hash, usage_type, excerpts
  - `AttributionSource`: Represents a source in the attribution chain
  - `UsageType`: `training_input`, `rag_context`, `direct_reference`, `synthesis_source`, `embedding_source`
  - `ContentHash`: SHA-256 hash with base64url encoding
  - `ExcerptReference`: Character ranges with optional hash
- **Obligations Extension** (`@peac/schema`)
  - `ObligationsExtension`: CC Signals-aligned credit and contribution requirements
  - `CreditRequirement`: `required`, `recommended`, `optional` with citation_url
  - `ContributionRequirement`: `direct`, `ecosystem`, `open` contribution types
  - Validators: `validateObligationsExtension()`, `isValidObligationsExtension()`
  - 655 lines of obligation tests
- **Attribution Error Codes** (`specs/kernel/errors.json`): 16 new attribution\_\* codes
  - `E_ATTR_INVALID_CHAIN`, `E_ATTR_CIRCULAR_REF`, `E_ATTR_DEPTH_EXCEEDED`
  - `E_ATTR_RECEIPT_INVALID`, `E_ATTR_HASH_MISMATCH`, `E_ATTR_MISSING_SOURCE`
  - `E_ATTR_USAGE_INVALID`, `E_ATTR_EXCERPT_INVALID`, `E_ATTR_OBLIGATIONS_INVALID`
- **HTTP Helpers** (`@peac/kernel`)
  - `applyPurposeVary()`: Add PEAC-Purpose to Vary header
  - `getPeacVaryHeaders()`: Get comma-separated PEAC headers for Vary
  - `needsPurposeVary()`: Check if purpose-based caching is needed
  - Works with Web API Headers, Node.js response objects, and Map-like headers
- **Attribution Conformance Suite** (`specs/conformance/fixtures/attribution/`)
  - `valid.json`: 15 valid attribution attestation vectors
  - `invalid.json`: 20 invalid attestation vectors with expected errors
  - `edge-cases.json`: 12 edge case vectors for boundary conditions
- **docs/specs/ATTRIBUTION.md**: Normative attribution specification (685 lines)
- **docs/compliance/eu-ai-act.md**: EU AI Act compliance guide with PEAC mappings
- **docs/guides/go-middleware.md**: Go middleware integration guide

### Changed

- RFC 6648 compliance: All HTTP headers now use `PEAC-*` prefix (removed `X-PEAC-*`)
  - `PEAC-Verified`, `PEAC-Engine`, `PEAC-TAP-Tag`, `PEAC-Warning`, `PEAC-Decision`
  - Updated: Cloudflare, Fastly, Akamai workers and Next.js middleware
- Guard script enhanced with attribution package exclusions for `issued_at` field
- Publish list updated: 31 public packages (added `@peac/attribution`)

## [0.9.25] - 2026-01-04

### Added

- **Agent Identity Attestation**: Cryptographic proof-of-control binding for agents
  - `AgentIdentityAttestation` type extending generic Attestation framework
  - `ControlType`: `operator` (verified bots) vs `user-delegated` (user agents)
  - `AgentProof` with multiple proof methods: `http-message-signature`, `dpop`, `mtls`, `jwk-thumbprint`
  - `AgentIdentityEvidence` with agent_id, capabilities, delegation_chain, operator
  - Validation helpers: `validateAgentIdentityAttestation()`, `isAgentIdentityAttestation()`, `createAgentIdentityAttestation()`
- **Identity Binding** (`@peac/schema`)
  - `IdentityBinding` type for cryptographic request-receipt binding
  - `constructBindingMessage()` for canonical binding message construction
  - `verifyIdentityBinding()` for publisher-side verification algorithm
  - Key rotation semantics: PENDING, ACTIVE, DEPRECATED, REVOKED
- **Identity Error Codes**: 13 new identity\_\* error codes (`specs/kernel/errors.json`)
  - `E_IDENTITY_MISSING`, `E_IDENTITY_INVALID_FORMAT`, `E_IDENTITY_EXPIRED`
  - `E_IDENTITY_NOT_YET_VALID`, `E_IDENTITY_SIG_INVALID`, `E_IDENTITY_KEY_UNKNOWN`
  - `E_IDENTITY_KEY_EXPIRED`, `E_IDENTITY_KEY_REVOKED`, `E_IDENTITY_BINDING_MISMATCH`
  - `E_IDENTITY_BINDING_STALE`, `E_IDENTITY_BINDING_FUTURE`, `E_IDENTITY_PROOF_UNSUPPORTED`
  - `E_IDENTITY_DIRECTORY_UNAVAILABLE`
- **docs/specs/AGENT-IDENTITY.md**: Normative agent identity specification
  - Binding message construction algorithm
  - Verification algorithm (VERIFY_IDENTITY pseudocode)
  - Key rotation semantics (lifecycle states)
  - Error taxonomy with HTTP status mappings
  - Security considerations (replay resistance, time bounds)
  - AAIF/MCP/A2A interop patterns (informative)
- **Go Verifier SDK** (`sdks/go/`)
  - `Verify()` function for Ed25519 receipt verification
  - `PEACReceiptClaims` with all claim fields including purpose and identity
  - JWS parsing and header validation (`jws/`)
  - JWKS fetching with timeout and size limits (`jwks/`)
  - Thread-safe cache with TTL and stale-while-revalidate
  - 21 error codes with HTTP status mapping and retriability
  - Conformance tests for golden vector validation
- **Go net/http Middleware** (`sdks/go/middleware/`)
  - `Middleware()` for configurable receipt verification
  - `RequireReceipt()` and `OptionalReceipt()` helper constructors
  - `GetClaims()` and `GetResult()` for context-based claim access
  - RFC 9457 Problem Details error responses
  - Framework integration examples (gorilla/mux, chi, gin)
- **Agent Identity Example** (`examples/agent-identity/`)
  - TypeScript: publisher issuing receipts, agent with identity attestation
  - Go: verifier example using Go SDK
  - End-to-end flow demonstration

### Changed

- `@peac/schema` exports agent identity types from main entry point
- `sdks/README.md` updated to reflect Go SDK availability (v0.9.25+)

## [0.9.24] - 2026-01-03

### Added

- **Purpose on Wire**: First-class purpose tracking in receipts and HTTP headers
  - `PEAC-Purpose` request header for declaring agent intent
  - `PEAC-Purpose-Applied` and `PEAC-Purpose-Reason` response headers
  - Receipt claims: `purpose_declared`, `purpose_enforced`, `purpose_reason`
  - Canonical purposes: `train`, `search`, `user_action`, `inference`, `index`
- **Purpose Type Hierarchy** (`@peac/schema`)
  - `PurposeToken` (string): Wire format preserving unknown tokens for forward-compat
  - `CanonicalPurpose` (enum): PEAC normative vocabulary
  - `PurposeReason` (enum): `allowed`, `constrained`, `denied`, `downgraded`, `undeclared_default`, `unknown_preserved`
  - `parsePurposeHeader()` for header normalization (lowercase, trim, dedupe, preserve order)
  - `isValidPurposeToken()` with grammar validation
- **Enforcement Profiles** (`@peac/policy-kit`)
  - 3 profiles: `strict`, `balanced`, `open` for undeclared purpose handling
  - `strict`: deny undeclared (regulated data, private APIs)
  - `balanced`: review + constraints (general web, gradual compliance) - DEFAULT
  - `open`: allow recorded (public content, research)
  - `createEnforcementProfile()` and `getEnforcementProfile()` helpers
- **@peac/mappings-aipref**: NEW PACKAGE - IETF AIPREF vocabulary alignment
  - Maps IETF AIPREF keys (`train-ai`, `search`) to PEAC `CanonicalPurpose`
  - `aiprefKeyToPurpose()` and `purposeToAiprefKey()` bidirectional mapping
  - Handles extension keys (`train-genai`, `ai`) with audit notes
  - Preserves unknown keys for forward-compatibility
- **Robots.txt Migration Helper** (`@peac/pref`)
  - `robotsToPeacStarter()`: Convert robots.txt to starter PEAC policy document
  - Advisory-only output with clear migration guidance
  - Detects AI crawler user agents (GPTBot, Claude-Web, etc.)
  - Returns `RobotsToPeacResult` with policy, notes, and processed agents
- **Purpose Conformance Suite**: Golden vectors for cross-implementation parity
  - `specs/conformance/fixtures/purpose/normalization.json` - 10 header parsing vectors
  - `specs/conformance/fixtures/purpose/validation.json` - 10 token validation vectors
  - `specs/conformance/fixtures/purpose/reason.json` - 8 reason derivation vectors
- **Purpose Parsing Limits** (`specs/kernel/constants.json`)
  - `max_token_length`: 64 characters
  - `max_tokens_per_request`: 10 tokens
  - Grammar: `/^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)?$/`

### Changed

- `issue()` now accepts `purpose` option (`PurposeToken | PurposeToken[]`)
- Purpose token grammar widened to allow hyphens (e.g., `train-ai`)
- Protocol emits purpose-related headers in HTTP responses

### Security

- `undeclared` is internal-only, never valid on wire (explicit `PEAC-Purpose: undeclared` returns 400)
- Unknown purpose tokens preserved but cannot affect enforcement (forward-compat without bypass risk)

## [0.9.23] - 2025-12-31

### Added

- **Policy Profiles**: Pre-built policy templates for common publisher archetypes
  - 4 profiles: `news-media`, `api-provider`, `open-source`, `saas-docs`
  - YAML source files compiled to TypeScript at build time (no runtime fs/YAML deps)
  - `listProfiles()`, `loadProfile()`, `validateProfileParams()`, `customizeProfile()`
  - `PROFILES` and `PROFILE_IDS` constants for direct access
  - Profile summaries with `getProfileSummary()` for quick metadata
- **Decision Enforcement**: Explicit semantics for `review` decisions
  - `enforceDecision()` with strict `receiptVerified` requirement
  - `enforceForHttp()` for HTTP response details (status, headers)
  - `requiresChallenge()` and `getChallengeHeader()` helpers
  - HTTP 402 with `WWW-Authenticate: PEAC realm="receipt"` challenge
- **CLI Profile Commands**: New policy subcommands
  - `peac policy list-profiles` - List available profiles
  - `peac policy show-profile <id>` - Show profile details
  - `--profile` flag for `peac policy init`
  - Automation flags: `--json`, `--yes`, `--strict`, `--out -`
- **Generator CI Gate**: Build-time profile generation with drift check
  - `pnpm --filter @peac/policy-kit generate:profiles` - Generate TypeScript from YAML
  - `pnpm --filter @peac/policy-kit generate:profiles:check` - Verify no drift
  - Prettier-stable output with deterministic key ordering
- **Tarball Smoke Test**: `pnpm --filter @peac/policy-kit test:smoke`
  - Packs, installs, and verifies published package works correctly
  - Tests profile loading, evaluation, and enforcement

### Changed

- `RateLimitConfig` uses `window_seconds` (IETF-aligned) instead of string format
- `formatRateLimit()` added for round-trip serialization
- `EnforcementContext` simplified to only `receiptVerified` (deferred: humanAttested, customRequirementMet)

## [0.9.22] - 2025-12-31

### Added

- **@peac/telemetry**: Core telemetry interfaces and no-op implementation
  - `TelemetryProvider` interface with `onReceiptIssued`, `onReceiptVerified`, `onAccessDecision` hooks
  - Privacy modes: `strict` (hash all), `balanced` (hash + payment), `custom` (allowlist)
  - `TelemetryConfig` with `serviceName`, `privacyMode`, `allowAttributes`, `hashSalt`, `enableExperimentalGenAI`
  - Runtime-portable: works in Node, edge, WASM (no Node-specific APIs)
  - Zero-overhead no-op provider when telemetry not configured
- **@peac/telemetry-otel**: OpenTelemetry adapter for PEAC telemetry (90 tests)
  - Bridges PEAC events to OTel spans, events, and metrics
  - Privacy-preserving attribute filtering with `createPrivacyFilter()`
  - W3C Trace Context validation (`parseTraceparent`, `parseTracestate`, `validateTraceContext`)
  - Metrics: `peac.receipt.issued`, `peac.receipt.verified`, `peac.access.decision` counters/histograms
  - Never-throw provider pattern with defensive try/catch guards
- **Protocol telemetry hooks**: `setTelemetryProvider()` in `@peac/protocol`
  - `issue()` now calls `onReceiptIssued()` with receipt hash, issuer, kid, duration
  - `verify()` now calls `onReceiptVerified()` with receipt hash, valid flag, reason code, duration
- **Telemetry example**: `examples/telemetry-otel/` with console exporter demo
- **Evidence lane rules**: Documented in `specs/wire/README.md`
  - `payment.evidence.*` - Rail-scoped (fraud tools, charge lifecycle)
  - `attestations[]` - Interaction-scoped (content safety, policy decisions)
  - `extensions.*` - Non-normative metadata (trace correlation, vendor extras)
- **Telemetry ADR**: `docs/architecture/ADR-001-telemetry-package-taxonomy.md`

### Changed

- `TelemetryConfig.hashSalt` added for privacy-preserving identifier hashing
- Protocol package now depends on `@peac/telemetry` (workspace dependency)

## [0.9.21] - 2025-12-31

### Added

- **Generic Attestation type**: Extensible attestation container in `@peac/schema`
  - `Attestation<T>` with `type`, `issued_at`, `issuer`, `signature`, and type-safe `claims`
  - `AttestationInput<T>` for attestation creation
  - Pre-defined attestation types: `ContentSafetyAttestation`, `BotClassificationAttestation`, `PolicyDecisionAttestation`
- **Extensions type**: Non-normative metadata container
  - `Extensions` type with vendor-prefixed keys (`x_*`)
  - `ExtensionsInput` for creating extensions
  - Clear separation from normative receipt fields
- **Wire schema specification**: `specs/wire/` with JSON Schema definitions
  - `receipt.schema.json`, `payment-evidence.schema.json`, `attestation.schema.json`
  - Conformance test harness with golden vectors
- **JSON validation with DoS protection**: `@peac/schema` additions
  - `validateJsonValue()` with depth limit (default 32), breadth limit (default 1000), total nodes cap (10000)
  - Cycle detection for object graphs
  - JSON-safe evidence validation (no functions, symbols, undefined)
- **Property-based tests**: fast-check integration for schema validation
  - Arbitrary generators for receipt fields, payment evidence, attestations
  - Roundtrip property tests for JSON serialization

### Security

- **DoS protection**: JSON validator prevents stack overflow via depth limiting
- **Cycle detection**: Prevents infinite loops in nested object validation
- **Node count cap**: Limits total JSON nodes to prevent memory exhaustion

## [0.9.20] - 2025-12-30

### Added

- **Adapter taxonomy**: x402 vendor packages moved from `packages/rails/` to `packages/adapters/x402/`
  - `@peac/adapter-x402-daydreams`: AI inference event normalizer
  - `@peac/adapter-x402-fluora`: MCP marketplace event normalizer
  - `@peac/adapter-x402-pinata`: Private IPFS objects event normalizer
- **PaymentEvidence.facilitator**: New optional field to identify the platform/vendor operating on a payment rail
  - Separates protocol (`rail: "x402"`) from vendor (`facilitator: "daydreams"`)
  - Allows querying by protocol while knowing specific facilitator
- **CI unicode security scan**: Dedicated step for Trojan Source attack prevention (CVE-2021-42574)
- **@peac/rails-card**: Card payment rail foundation (private)
- **@peac/transport-grpc**: gRPC transport bindings (private)
- **@peac/worker-fastly**: Fastly Compute@Edge worker (private)
- **@peac/worker-akamai**: Akamai EdgeWorkers support (private)
- **@peac/privacy**: Privacy primitives for k-anonymity and data minimization (private)

### Changed

- **Breaking**: Adapter package names changed from `@peac/rails-x402-*` to `@peac/adapter-x402-*`
- **Breaking**: Adapter `rail` field now set to `"x402"` (was `"x402.<vendor>"`)
- x402 adapters now set `facilitator` field to vendor name (e.g., `"daydreams"`, `"fluora"`, `"pinata"`)

### Notes

- The 3 adapter packages were never published to npm, so the rename has no migration impact
- Existing code using `rail: "x402.<vendor>"` pattern should migrate to `rail: "x402"` + `facilitator: "<vendor>"`

## [0.9.19] - 2025-12-24

### Added

- **@peac/rails-razorpay** (private, not published to npm): India-focused payment adapter for Razorpay (UPI, cards, netbanking)
  - Webhook signature verification using raw bytes + constant-time compare (`timingSafeEqual`)
  - Payment normalization to PEAC PaymentEvidence with safe integer enforcement
  - VPA privacy: HMAC-SHA256 hashing by default (prevents dictionary attacks)
  - Structured error handling with RFC 9457 problem+json support
- **MCP/ACP Budget Utilities**: Budget enforcement for agent commerce
  - `checkBudget()`: Pure function with bigint minor units for precise currency math
  - Per-call, daily, and monthly budget limits with currency match enforcement
  - Explicit "unbounded" semantics when no limits configured
  - Identical implementation in `@peac/mappings-mcp` and `@peac/mappings-acp`
- **x402 Payment Headers**: Headers-only detection in `@peac/rails-x402`
  - `detectPaymentRequired()`, `extractPaymentReference()`, `extractPaymentResponse()`
  - Case-insensitive header lookup (works with any `HeadersLike` interface)
  - No DOM types leaked into core packages
- **MCP Tool Call Example**: `examples/mcp-tool-call/` demonstrating paid MCP tools with budget enforcement
- **CI Examples Harness**: `pnpm examples:check` for TypeScript validation of all examples
- **Unicode Scanner**: `scripts/find-invisible-unicode.mjs` for Trojan Source attack prevention
  - Detects bidirectional controls, direction marks, zero-width chars, BOM
  - Integrated into `scripts/guard.sh` as CI gate

### Security

- **Razorpay webhook**: Raw bytes verification prevents JSON canonicalization attacks
- **VPA hashing**: HMAC-SHA256 prevents rainbow table attacks on common VPAs
- **Amount validation**: Safe integer enforcement prevents precision loss
- **Trojan Source prevention**: Unicode scanner blocks hidden bidirectional characters

### Notes

- PaymentEvidence.amount remains `number` for v0.9.19 (enforced as integer minor units)
- x402 payment headers are headers-only (no body parsing, no Response dependency)
- VPA hashing uses HMAC-SHA256; changing hash key changes all hashes (audit trail impact)

## [0.9.18] - 2025-12-19

### Added

- **@peac/http-signatures**: RFC 9421 HTTP Message Signatures parsing and verification (22 tests)
  - WebCrypto Ed25519 signature verification
  - Signature-Input and Signature header parsing per RFC 8941
  - Signature base construction per RFC 9421 Section 2.5
- **@peac/jwks-cache**: Edge-safe JWKS fetch with SSRF protection and caching (19 tests)
  - Multi-path resolution: `/.well-known/jwks` -> `/keys?keyID=` -> `/.well-known/jwks.json`
  - SSRF hardening: literal IP blocking, localhost blocking, no redirect following
  - TTL-based caching with ETag support
- **@peac/mappings-tap**: Visa Trusted Agent Protocol (TAP) to control evidence mapping (29 tests)
  - 8-minute (480s) max window enforcement (Visa TAP hard limit)
  - Fail-closed tag handling (unknown tags rejected by default)
  - Time validation: `created <= now <= expires` with clock skew tolerance
- **Cloudflare Worker TAP verifier**: Reference surface at `surfaces/workers/cloudflare/` (34 tests, private)
  - Fail-closed security defaults: issuer allowlist required, replay protection when nonce present
  - Pluggable ReplayStore: DO (strong), D1 (strong), KV (best-effort)
  - RFC 9457 problem+json with stable error codes (E*TAP*_, E*RECEIPT*_, E*CONFIG*\*)
- **Next.js Edge middleware**: Reference surface at `surfaces/nextjs/middleware/` (21 tests, private)
  - Exact parity with Cloudflare Worker: same error codes, status mappings, security defaults
  - Mode config: `receipt_or_tap` (402 challenge) or `tap_only` (401 missing)
  - LRUReplayStore exported utility for best-effort replay protection
- **Schema normalization**: `toCoreClaims()` projection function for cross-mapping parity
  - Parity tests ensure TAP, RSL, ACP produce byte-identical core claims for equivalent events
- **Canonical flow examples** at `examples/`:
  - `pay-per-inference/`: Agent-side receipt acquisition and retry
  - `pay-per-crawl/`: Policy Kit + receipt flow for AI crawlers
  - `rsl-collective/`: RSL token mapping + collective licensing demonstration

### Fixed

- **TAP terminology**: "Trusted Agent Protocol" (was incorrectly "Token Authentication Protocol")
- **RSL 1.0 Token Vocabulary**: Corrected RSL token mapping to match RSL 1.0 specification
  - RSL uses `ai-index`, not `ai-search` (was a mistaken assumption in v0.9.17)
  - Added `ai_index` ControlPurpose (RSL 1.0 canonical)
  - Added `all` RSL token support (expands to all purposes)
  - **BREAKING**: Removed `ai_search` ControlPurpose (use `ai_index` or `ai_input` instead)
- **Registry sync**: `specs/kernel/registries.json` now includes `tap` and `rsl` control engines

### Documentation

- PROTOCOL-BEHAVIOR Section 7.4: HTTP Message Signatures (RFC 9421) normative verification algorithm
- REGISTRIES.md: Added `tap` and `rsl` control engines
- ARCHITECTURE.md: Updated package inventory with new packages, surfaces, and examples
- SCHEMA-NORMALIZATION.md: Cross-mapping parity rules and `toCoreClaims()` specification

### Security Defaults (v0.9.18 Surfaces)

- **Fail-closed issuer allowlist**: ISSUER_ALLOWLIST required; 500 error if empty
- **Fail-closed unknown tags**: Unknown TAP tags rejected; 400 error
- **Replay protection required**: 401 error if nonce present but no replay store (unless UNSAFE_ALLOW_NO_REPLAY)
- **402 reserved for payment**: Only RECEIPT_MISSING/INVALID/EXPIRED use 402
- **UNSAFE\_\* escape hatches**: Explicit naming for dev-only overrides (never use in production)

### Migration (ai_search removal)

If you used `ai_search`:

- For **AI search summaries / RAG grounding**: use `ai_input` (RSL: `ai-input`)
- For **AI indexing / embedding index creation**: use `ai_index` (RSL: `ai-index`)

## [0.9.17] - 2025-12-14

### Added

- **x402 v2 Adapter**: Full x402 v2 compatibility with v1 fallback (`X402Dialect = 'v1' | 'v2' | 'auto'`)
- **RSL 1.0 Alignment**: Extended `ControlPurpose` with RSL tokens (`ai_input`, `ai_search`, `search`), new `@peac/mappings-rsl` package
- **Subject Binding**: Optional `subject_snapshot` on `AuthContext` (envelope-level) for identity context at issuance
- **issueJws()**: Convenience wrapper returning just the JWS string for header-centric flows
- **Policy Kit v0.1**: New `@peac/policy-kit` package for deterministic CAL policy evaluation
  - YAML/JSON policy format with first-match-wins rule semantics
  - Subject matching by type, labels, and ID patterns
  - Purpose and licensing mode matching
  - Compile to deployment artifacts: `peac.txt`, `robots-ai-snippet.txt`, `aipref-headers.json`, `ai-policy.md`
  - Configurable receipts (`required` | `optional` | `omit`) with sensible defaults
- **CLI Policy Commands**: `peac policy init`, `peac policy validate`, `peac policy explain`, `peac policy generate`
  - `peac policy generate --dry-run` for safe preview without writing files
  - `peac policy generate --well-known` to output peac.txt to `.well-known/` subdirectory

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

- All legacy `X-`-prefixed PEAC headers; emojis/em-dashes in logs; dead discovery code paths

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

- Protocol version updated to 0.9.10 (legacy protocol header, since removed)
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
