# Changelog

All notable changes to PEAC Protocol will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.10.10] - 2026-02-11

### Dev Toolchain Modernization

v0.10.10 upgrades the entire dev toolchain to current majors and bumps the
Node.js baseline to 22 LTS. No runtime, API, or wire format changes.

### Changed

- **Turbo v1 -> v2** (`turbo ^2.8.0`)
  - `pipeline` renamed to `tasks` in turbo.json
  - Strict env mode is now the default
- **Vitest v1 -> v4** (`vitest ^4.0.0`)
  - Unified all 38 workspace packages from mixed v1/v2/v3 to ^4.0.0
  - Vite bumped to ^6.0.0 in app-verifier (required by vitest v4)
- **ESLint v8 -> v10** with flat config (`eslint ^10.0.0`)
  - Migrated from `.eslintrc.json` to `eslint.config.mjs` (flat config)
  - Replaced `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser`
    with unified `typescript-eslint` (^8.55.0)
  - Added `@eslint/js` (^10.0.0) and `globals` (^17.0.0)
  - Removed vestigial ESLint devDeps from 4 package-level package.json files
  - Removed `lint:ts` script (TS parser now configured in flat config)
  - Fixed 6 `preserve-caught-error` violations (new v10 recommended rule)
- **dependency-cruiser v16 -> v17** (`dependency-cruiser ^17.3.0`)
  - v17 config format is backward-compatible; no `.dependency-cruiser.json` changes
- **Node.js baseline: 20 -> 22 LTS**
  - `engines.node` bumped to `>=22.0.0` across all packages
  - CI now runs on Node 22 (was 20.19)
  - Node 20 reaches EOL on 2026-04-30

### Added

- **Dual ESM/CJS output** (from #332, post-v0.10.9)
  - All 20 published packages now ship `.mjs` (ESM) and `.cjs` (CJS) via tsup
  - Schema subpath exports with round-trip tests
  - Pack-smoke and bench scripts
- **DD-49 policy binding precursors** (from #343, post-v0.10.9)
  - `PolicyBindingStatus` type and `policy.binding` check #12
  - `policy_binding` required on `VerificationResult` (always `'unavailable'` in Wire 0.1)
  - Evidence bundle options: `peac_txt`, `peac_txt_hash` manifest field
  - Crypto bridge functions and 9 conformance vectors
- **OpenClaw quickstart example** (from #351, post-v0.10.9)
  - `examples/openclaw-capture/` demonstrating interaction evidence capture

### Fixed

- **Mermaid diagrams** -- fixed GitHub rendering issues (#346, #348, #349)
- **ESLint `preserve-caught-error`** -- 6 re-thrown errors now preserve cause chain
  via `{ cause: err }` (apps/api, apps/bridge, packages/protocol, packages/discovery)

### Notes

- Wire format `peac-receipt/0.1` remains FROZEN
- No runtime dependency changes
- No API surface changes

## [0.10.9] - 2026-02-07

### Foundation Hardening -- Architecture, CI, and Server Reliability

v0.10.9 ships architectural fixes, CI hardening, and server reliability
improvements. Publish manifest expanded from 18 to 20 packages. Four packages
deferred from v0.10.8 (`middleware-core`, `middleware-express`, `adapter-openclaw`,
`cli`) are now bootstrap-ready with all CI guards in place.

### Added

- **Unified receipt parser** (`@peac/schema`)
  - `parseReceiptClaims(input, opts?)` -- single entry point for commerce and
    attestation receipt validation
  - Classification by key presence (`amt`, `cur`, `payment`), not truthiness
  - Returns `{ ok, variant, claims }` or `{ ok: false, error }` result type
  - 3 canonical error codes: `E_PARSE_INVALID_INPUT`, `E_PARSE_COMMERCE_INVALID`,
    `E_PARSE_ATTESTATION_INVALID`
  - 6 conformance vectors with exact error code assertions
  - `isCommerceResult()` / `isAttestationResult()` type guards for downstream narrowing
  - Conformance `parse` category routed through unified parser
  - Fixture ambiguity guard in runner (rejects inputs with both `claims` and
    `payload`)

- **Dependency-cruiser layer enforcement** (14 rules)
  - Pattern-based rules encoding full layer structure (L0 through L6)
  - Layer 3.5 middleware explicitly modeled
  - Narrow test-only exception via `pathNot`
  - Catch-all rule prevents any library package from importing L5 (server/cli)
  - L5 horizontal isolation (server and cli cannot import each other)
  - `pnpm lint:deps` CI gate

- **Publish-manifest closure check** (`scripts/check-publish-closure.ts`)
  - Traverses all manifest packages' runtime dependencies
  - Fails if any `@peac/*` dep is missing from manifest or uses `workspace:*`
  - Manifest expanded: added `@peac/audit` and `@peac/disc` (20 packages total)

- **Manifest-driven pack scripts**
  - `pack-verify.sh` and `pack-install-smoke.sh` now read from
    `publish-manifest.json` -- no more hardcoded package arrays
  - Tarball hygiene checks: no `reference/`, `.local.md`, `.env*` in tarballs

- **Planning leak check** (`scripts/check-planning-leak.sh`)
  - Detects `reference/*_LOCAL.*` path leaks in tracked code
  - Detects strategic content keywords in tracked files
  - Added to CI workflow

- **JWKS stale-if-error** (`@peac/jwks-cache`)
  - Expired cache entries retained for fallback when all discovery paths fail
  - `allowStale` option (library default: `false`, conservative)
  - `maxStaleAgeSeconds` hard cap (default: 48h) prevents accepting ancient keys
  - `ResolvedKey` extended with `stale`, `staleAgeSeconds`, `keyExpiredAt`

- **Bounded rate-limit store** (`@peac/middleware-core`)
  - `RateLimitStore` interface with `increment()` and `reset()`
  - `MemoryRateLimitStore` with LRU eviction (`maxKeys`, default: 10000)
  - Lazy expired window cleanup prevents unbounded Map growth

- **Graceful shutdown** (`apps/sandbox-issuer`, `apps/api`)
  - SIGTERM/SIGINT handlers with 10s forced shutdown timeout

- **`typecheck:apps`** CI step (advisory) for app-level typechecking

- **`.gitattributes`** enforcing LF line endings for text files

### Changed

- **`verifyLocal()` returns discriminated union** (`@peac/protocol`)
  - `VerifyLocalSuccess` now branches on `variant: 'commerce' | 'attestation'`
  - `VerifyLocalFailure` includes `details?: { parse_code?, issues? }` for debugging
  - `details.issues` bounded to 25 entries with stable `{ path, message }` shape
  - Error code contract unchanged: parse failures return `E_INVALID_FORMAT`

- **Telemetry decoupled from protocol** (`@peac/protocol`)
  - Removed `@peac/telemetry` runtime dependency
  - Telemetry accepted via `TelemetryHook` options injection
  - Hooks are fire-and-forget: sync throws and async rejections guarded
  - `TelemetryHook` exported as type-only from protocol (no runtime edge)

- **Rate-limit stores migrated to bounded implementation** (`apps/`)
  - Sandbox-issuer and API app now use `MemoryRateLimitStore` from
    `@peac/middleware-core` (was bare `Map` without memory bounds)

- **`@peac/audit` made publishable** -- removed `private: true`, added
  `publishConfig.access: public`

- **`CoreClaims.payment` now optional** (`@peac/schema`) -- supports attestation
  receipts that have no payment field

- **SHA-pinned GitHub Actions** in CI workflow
  - `actions/checkout@11bd71901...` (v4.2.2)
  - `actions/setup-node@49933ea52...` (v4.4.0)

- **DevDep bumps**: fast-check 4.5.3, prettier 3.8.1, tsx 4.21.0

### Fixed

- **Dependency-cruiser regex bug** -- `middleware` and `telemetry` alternations
  in layer rules did not match hyphenated names (`middleware-core`,
  `middleware-express`, `telemetry-otel`). Changed to `[^/]*` suffix pattern.
  `includeOnly` expanded from `{1,2}` to `{1,4}` for nested adapters.

- **Broken Husky pre-commit hook removed** -- called `lint-staged` which was
  not installed, giving false "local gate passed" signal

- **Build artifacts removed from source** -- deleted `.d.ts` and `.d.ts.map`
  files from `packages/pay402/src/`

- **Orphaned directory removed** -- `packages/nextjs/` (plan doc moved to
  `reference/`)

- **JWKS resolver options** in verify API -- fixed option names to match
  `ResolverOptions` type (`fetchTimeoutMs` -> `timeoutMs`, `cacheTtlSeconds` ->
  `defaultTtlSeconds`)

- **Unicode guard made fail-closed** (`scripts/guard.sh`) -- missing detector
  script now fails the gate instead of silently skipping

### Security

- JWKS stale-if-error defaults to disabled (`allowStale: false`) -- server apps
  must explicitly opt in
- Rate-limit store bounded by `maxKeys` with LRU eviction -- prevents memory
  exhaustion under sustained load
- Publish-manifest closure check prevents broken dependency chains on npm

## [0.10.8] - 2026-02-07

### Adoption Release -- Middleware, Conformance, and Infrastructure

v0.10.8 ships the full adoption stack: middleware for receipt issuance, conformance
testing tools, and infrastructure apps (sandbox issuer, browser verifier, verify API).

### Added

- **@peac/middleware-core** -- Framework-agnostic middleware primitives for PEAC receipt issuance
  - `createReceipt()`, `wrapResponse()`, `selectTransport()`, `validateConfig()`
  - Ed25519 signing, automatic transport selection (header/body/pointer)

- **@peac/middleware-express** -- Express.js middleware for automatic receipt issuance
  - `peacMiddleware()` with skip, audience/subject extractors, error isolation
  - Express 4.x and 5.x compatibility

- **Conformance runner** (`peac conformance run`)
  - Runs conformance tests against @peac/schema validators
  - Output formats: JSON, text, markdown
  - Levels: basic, standard, full with category filtering
  - Report format: `peac-conformance-report/0.1`
  - Deterministic ordering, vectors digest, JCS canonicalization

- **Sample receipts** (`peac samples list`, `peac samples show`, `peac samples generate`)
  - Generate and inspect sample receipts for testing

- **Sandbox issuer** (`apps/sandbox-issuer/`)
  - POST /api/v1/issue with strict whitelist (aud required)
  - Discovery: GET /.well-known/peac-issuer.json + jwks.json
  - Stable key management (env -> .local/keys.json -> ephemeral)
  - In-memory rate limit with RFC 9333 RateLimit headers
  - CORS for cross-origin JWKS/discovery fetch

- **Browser verifier** (`apps/verifier/`)
  - Pure static Vite site, all verification via verifyLocal() in-browser
  - Paste-and-verify, file upload (drag-drop), trust configuration UI
  - Service worker for offline mode, localStorage trust store

- **Verify API** (`apps/api/src/verify-v1.ts`)
  - POST /api/v1/verify with RFC 9457 Problem Details (application/problem+json)
  - Rate limiting: 100/min anonymous, 1000/min with API key
  - RFC 9333 RateLimit-Limit/Remaining/Reset headers
  - Trusted issuer allowlist with boot-time Zod validation
  - Security headers: nosniff, no-store, no-referrer, DENY

- **isProblemError() type guard** -- Centralized duck-typed ProblemError detection
  across tsup bundle boundaries (solves instanceof drift)

- **Unicode sanitizer** (`scripts/sanitize-unicode.mjs`)
  - Uses `git ls-files` as single source of truth (1236 files)
  - Supports --fix mode (NBSP -> space, strip others)

- **CI enhancements** -- test:apps, check:unicode, sandbox health smoke job

- **Root SECURITY.md** pointer to `.github/SECURITY.md`

### Fixed

- RFC 9457 Content-Type enforcement: use `c.body()` not `c.json()` for problem details
  (Hono's c.json() always overrides Content-Type to application/json)
- Security headers now applied on all error paths including early-return 429/413

## [0.10.7] - 2026-02-04

### Interaction Evidence Extension

New extension type for capturing agent execution evidence at `evidence.extensions["org.peacprotocol/interaction@0.1"]`.

### Added

- **InteractionEvidenceV01 schema** (`@peac/schema`)
  - Full type definitions with Zod validation
  - SDK accessors: `getInteraction()`, `setInteraction()`, `hasInteraction()`
  - Projection API: `createReceiptView()` for first-class ergonomics
  - Warning-capable validation: `validateInteractionOrdered()` returns `{ valid, errors[], warnings[] }`
  - Compatibility API: `validateInteraction()` for harness compatibility
  - Strict schema with 6 REJECT invariants enforced in superRefine

- **Canonical digest algorithms**
  - `sha-256` (full SHA-256)
  - `sha-256:trunc-64k` (first 64KB)
  - `sha-256:trunc-1m` (first 1MB)
  - Binary units: k=1024, m=1024\*1024

- **Well-known interaction kinds**
  - `tool.call`, `http.request`, `fs.read`, `fs.write`, `message`
  - Reserved prefixes: `peac.*`, `org.peacprotocol.*` (REJECT if not in registry)

- **Error codes** (14 new codes in `specs/kernel/errors.json`)
  - `E_INTERACTION_*` for validation errors
  - `W_INTERACTION_*` for warnings

- **Conformance fixtures** (`specs/conformance/fixtures/interaction/`)
  - `valid.json` - 16 valid fixtures
  - `invalid.json` - 36 invalid fixtures with expected error codes
  - `edge-cases.json` - 22 fixtures with warnings

- **@peac/capture-core** (NEW package, Layer 2)
  - Runtime-neutral capture pipeline for any agent execution platform
  - `CapturedAction` type for platform-agnostic action representation
  - `SpoolEntry` type for append-only event spool
  - `ActionHasher` with truncate-inline strategy (Option A)
  - `SpoolWriter`/`SpoolReader` with crash-safety guarantees:
    - O_APPEND semantics for atomic writes
    - fsync before checkpoint advancement
    - Atomic checkpoint (write temp, fsync, rename)
    - File locking for concurrent writers
  - RFC 8785 JCS for deterministic chain serialization
  - Tamper-evident chain with spool-anchor extension support
  - Dedupe index keyed by `interaction_id`
  - `toInteractionEvidence()` mapper

- **@peac/adapter-openclaw** (NEW package, Layer 4)
  - OpenClaw plugin for PEAC interaction evidence capture
  - Plugin manifest with configurable capture modes
  - Two-stage pipeline: sync capture (< 10ms) + async emit with signing
  - OpenClaw event to `CapturedAction` to `InteractionEvidence` mapping
  - Session-history tailer fallback for resilience
  - Signer abstraction (env var, keychain, sidecar, HSM)
  - Key rotation support (ACTIVE/DEPRECATED/RETIRED lifecycle)
  - Plugin tools: `peac_receipts.status`, `peac_receipts.export_bundle`, `peac_receipts.verify`, `peac_receipts.query`
  - Skills: `/peac-export`, `/peac-verify`, `/peac-status`

### Documentation

- **docs/specs/INTERACTION-EVIDENCE.md**: Normative specification for InteractionEvidenceV01
  - Extension placement at `evidence.extensions["org.peacprotocol/interaction@0.1"]`
  - Type contracts with Zod schemas
  - Validation semantics with 6 REJECT invariants
  - Canonical digest algorithms and handling
  - Well-known interaction kinds registry
  - Error code taxonomy (E*INTERACTION*_, W*INTERACTION*_)
  - Security considerations (hash-only defaults, secret detection)

- **docs/integrations/openclaw.md**: OpenClaw integration guide
  - Quick start with configuration examples
  - Two-stage capture architecture explanation
  - Key management levels (1-4)
  - Plugin tools reference
  - Verification workflow

### Changed

- **Wire format documentation**: Updated all references from legacy `peac.receipt/0.9` to canonical `peac-receipt/0.1`
  - `specs/kernel/README.md`
  - `packages/schema/src/index.ts` (comment)
  - `docs/guides/x402-peac.md`
  - `examples/quickstart/README.md`
  - `packages/mappings/mcp/tests/mcp.test.ts` (test fixtures)

### Validation Semantics

See [docs/specs/ERRORS.md](docs/specs/ERRORS.md#interaction-evidence-validation-semantics-v0107) for
normative validation precedence and semantic decisions (array rejection, empty-as-missing, timing error layering).

### Notes

- Wire format `peac-receipt/0.1` remains FROZEN
- Interaction evidence stored in extensions, NOT top-level `evidence.interaction`
- Extension key: `org.peacprotocol/interaction@0.1`

## [0.10.5] - 2026-01-30

### npm Publish Script Hardening

Fixes for reliable incremental OIDC Trusted Publishing rollout.

### Changed

- **Manifest-only publishing**: Publish script now only publishes packages explicitly listed in `scripts/publish-manifest.json` (previously published all public packages with non-manifest at end)
- **Removed `--strict` from workflow**: Allows incremental OIDC rollout (add packages to manifest as you configure them on npm)

### Added

- **Manifest validity guard**: Validates every manifest entry:
  - Exists in workspace
  - Is not private (`private: true`)
  - Fails fast with clear error messages
  - Prevents "nothing happened" confusion from typos or renamed packages

### Fixed

- Publish workflow no longer attempts to publish packages without OIDC Trusted Publishing configured
- Clear separation: manifest = allowlist of packages to publish

### Migration Notes

- During OIDC rollout: Keep `--strict=false`, add packages to manifest as you configure them
- Once all packages configured: Switch to `--strict=true` in workflow

## [0.10.4] - 2026-01-29

### GitHub Actions npm Publish with OIDC Trusted Publishing

Secure, automated npm publishing via GitHub Actions with OIDC Trusted Publishing - no long-lived npm tokens required.

### Added

- **GitHub Actions publish workflow** (`.github/workflows/publish.yml`)
  - OIDC Trusted Publishing with `id-token: write` permission
  - SHA-pinned actions for supply chain security:
    - `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2)
    - `actions/setup-node@39370e3970a6d050c480ffad4ff0ed4d3fdee5af` (v4.4.0)
    - `pnpm/action-setup@a7487c7e89a18df4991f7f222e4898a00d66ddda` (v4.2.0)
  - Empty workflow-level permissions with explicit job-level (`id-token: write`, `contents: read`)
  - Protected environment `npm-production` with required reviewers
  - Version assertions in production job
  - Dry-run validation job before production publish
- **Publish manifest** (`scripts/publish-manifest.json`)
  - Single source of truth for package publish order
  - Topological ordering (36 packages, dependencies first)
  - Layer annotations for audit
- **Publish scripts** (`scripts/publish-public.mjs`)
  - Idempotent publishing with `--skip-existing`
  - `--strict` mode: error if all packages already published
  - `--dry-run` for local testing
  - `execFileSync` instead of `execSync` (shell injection prevention)
  - Enhanced post-publish verification (npm view + provenance check)
- **CI gates for publishing**
  - `scripts/check-manifest-topo.mjs` - Validates topological order with pnpm workspace introspection
  - `scripts/check-version-sync.mjs` - Validates version consistency across manifest and packages
  - Error handling with actionable messages for CI debugging
- **Release documentation** (`docs/release/`)
  - `SETUP-GUIDE.md` - Complete setup guide (npm granular tokens, GitHub environments, branch protection)
  - `WORKFLOW-REFERENCE.md` - Workflow reference
  - `npm-oidc.md` - OIDC Trusted Publishing deep dive

### Changed

- **Publish method**: Migrated from local pnpm publish to GitHub Actions workflow
- **Provenance**: All packages now include npm provenance attestations (SLSA L3)

### Security

- **No long-lived npm tokens**: OIDC tokens are ephemeral and scoped to workflow run
- **Protected environment**: Requires manual approval before production publish
- **SHA-pinned actions**: Prevents supply chain attacks via compromised action tags
- **Job-level permissions**: Minimal permissions at workflow level with explicit job-level grants
- **Strict mode guard**: Prevents silent no-ops in CI (catches "nothing to publish" scenarios)

### Migration Notes

- npm publishing now requires GitHub Actions (not local pnpm)
- First-time setup: Configure npm granular access token, link to GitHub OIDC
- See `docs/release/SETUP-GUIDE.md` for complete setup instructions
- Tag format: `vX.Y.Z` triggers publish workflow

## [0.10.3] - 2026-01-29

### x402 Adapter v0.2 Polish

Production hardening for the x402 offer/receipt adapter with deterministic verification output, allocation-safe DoS guards, and comprehensive conformance vectors.

### Added

- **Profile rename**: `peac-x402-offer-receipt/0.1` (from `peac-x402/0.1`)
- **5 new error codes** (local to `@peac/adapter-x402`, not in central registry):
  - `receipt_version_unsupported` - Receipt has unsupported version
  - `accept_too_many_entries` - DoS protection (>128 entries or >256 KiB)
  - `accept_entry_invalid` - Entry shape invalid (non-string fields, circular refs)
  - `amount_invalid` - Non-integer, negative, or leading zeros
  - `network_invalid` - Not CAIP-2 compliant
- **DoS guards with byte limits** (`@peac/adapter-x402`):
  - `MAX_ACCEPT_ENTRIES = 128` (entry count limit)
  - `MAX_TOTAL_ACCEPTS_BYTES = 262144` (256 KiB total limit)
  - `MAX_FIELD_BYTES = 256` (per-field byte limit, UTF-8 aware)
  - `MAX_ENTRY_BYTES = 2048` (per-entry total size including settlement)
  - `MAX_AMOUNT_LENGTH = 78` (uint256 max digits)
  - **Allocation-safe bounded traversal** - Size checks use stack-based JSON byte counting without allocating full JSON strings
  - **Runtime shape validation** - Validates entry types before byte checks to prevent crashes from malformed JSON
  - Uses `TextEncoder` for edge runtime portability (Cloudflare Workers, Deno, etc.)
- **CAIP-2 split parser** - Reference segment now allows hyphens, underscores, 64 chars (e.g., `cosmos:cosmoshub-4`)
- **termMatching first-class** (`OfferVerification.termMatching`):
  - Always present with `method`, `hintProvided`, `hintMismatchDetected` (no optional booleans)
  - Deterministic output for downstream consumers
- **Safe-by-default mapping** - `toPeacRecord()` now marks `termMatching.matched: false` with `reason: 'not_verified'` when offerVerification is not provided
- **Conformance vectors**: 19 total (3 valid + 13 invalid + 3 edge-cases)
  - New: `dos-too-many-accepts.json` with 129 entries
  - New: `invalid-amount-negative.json`, `invalid-amount-decimal.json`, `invalid-amount-leading-zero.json`
- **Error precedence tests** - verifyReceipt checks: structural -> version -> signature -> amount -> network
- **Multibyte DoS tests** - UTF-8 string handling and settlement size validation tests
- **Orphan fixture detection** - Conformance runner checks for fixture files not listed in manifest

### Changed

- **verifyReceipt error precedence**: Version check now runs before amount/network validation
- **Vendor neutrality**: `payTo` (x402) -> `payee` (neutral) at adapter boundary
- **termMatching derivation**: `mismatchDetected` derived from `termMatching.hintMismatchDetected` in `toPeacRecord()`

### Documentation

- **docs/specs/X402-PROFILE.md** - Updated to v0.2 with DoS limits, CAIP-2 notes, error codes
- **docs/adapters/README.md** - Added neutral field naming rationale (`payee` vs `payTo`)
- **docs/adapters/x402.md** - Profile rename, mapping table updates

### Migration Notes

- `OfferVerification.termMatching` is now always present (was optional)
- `termMatching.hintMismatchDetected` is now always boolean (was optional)
- Per-field byte limits enforce UTF-8 byte length, not character count
- Per-entry size limits bound `settlement` objects (max 2KB per entry)
- CAIP-2 reference segment allows hyphens (was restricted to alphanumeric)
- Uses `TextEncoder` for byte length (no Node.js `Buffer` dependency)

## [0.10.2] - 2026-01-27

### Workflow Correlation

Multi-agent orchestration support. Receipts now carry workflow context for DAG reconstruction across MCP, A2A, CrewAI, LangGraph, AutoGen, and other orchestration frameworks.

### Added

- **Workflow context extension** (`@peac/schema`)
  - `WorkflowContext` type in receipt extensions (`ext['org.peacprotocol/workflow']`)
  - Fields: `workflow_id`, `step_id`, `parent_step_ids`, `framework`, `tool_name`, `orchestrator_id`, `external_ids`
  - DAG verification: cycle detection (DFS with color marking), parent validation, limits enforcement
  - Helper functions: `generateWorkflowId()`, `generateStepId()`, `createOTelExternalId()`, `createTemporalExternalId()`, `createAirflowExternalId()`
  - `ExternalIdEntry` type for bi-directional correlation with OTel, Temporal, Airflow, Prefect, Dagster, Argo
- **Workflow summary attestation** (`@peac/schema`)
  - `WorkflowSummaryAttestation` type (`peac/workflow-summary`)
  - Proof-of-run artifact committing the full receipt set by reference or Merkle root
  - Fields: `workflow_id`, `status`, `receipt_refs`, `agents_involved`, `started_at`, `completed_at`
- **12 workflow error codes** in `specs/kernel/errors.json`
  - Validation: `E_WORKFLOW_CONTEXT_INVALID`, `E_WORKFLOW_ID_INVALID`, `E_WORKFLOW_STEP_ID_INVALID`, `E_WORKFLOW_SUMMARY_INVALID`
  - DAG semantics: `E_WORKFLOW_DAG_INVALID`, `E_WORKFLOW_CYCLE_DETECTED`, `E_WORKFLOW_PARENT_NOT_FOUND`, `E_WORKFLOW_LIMIT_EXCEEDED`
  - Correlation: `E_CORRELATION_SALT_REQUIRED`, `E_CORRELATION_SALT_TOO_SHORT`, `E_CORRELATION_INVALID_ID`, `E_CORRELATION_INVALID_MODE`
- **Error categories codegen** (`scripts/codegen-errors.ts`)
  - Auto-generate `error-categories.generated.ts` from `specs/kernel/errors.json`
  - New `workflow` and `correlation` categories
- **Conformance vectors** (`specs/conformance/fixtures/workflow/`)
  - `valid.json`: Valid WorkflowContext and WorkflowSummaryAttestation vectors
  - `invalid.json`: Schema validation and DAG semantics failure vectors
  - `edge-cases.json`: Boundary conditions (max parents, deep DAGs, hash chaining)
  - `fixtures.schema.json`: JSON Schema for fixture files
- **Conformance test harness** (`tests/conformance/workflow.spec.ts`)
  - Ajv 2020-12 fixture schema validation
  - Automated assertion of error codes for invalid fixtures
- **Workflow correlation spec** (`docs/specs/WORKFLOW-CORRELATION.md`)
  - 676-line normative specification covering types, DAG verification, external ID interop, security
- **Workflow correlation example** (`examples/workflow-correlation/`)
  - Fork-join demo with external ID correlation

### Changed

- **Website URL normalization** - All references updated from `https://peacprotocol.org` to `https://www.peacprotocol.org` (136 files)
- **Guard script** (`scripts/guard.sh`) - HTTPS enforcement covers both `www.` and bare domain forms

### Documentation

- **README.md** - Added workflow context row to core primitives table and brief workflow correlation section
- **docs/README_LONG.md** - Full workflow correlation section with code examples, invariants, and external ID interop
- **docs/SPEC_INDEX.md** - Attestations and Extensions section (Agent Identity, Attribution, Dispute, Workflow Correlation)
- **docs/CANONICAL_DOCS_INDEX.md** - Four normative specification entries added

## [0.10.1] - 2026-01-27

### SSRF-Safe Network Utilities

New package for protocol-grade network operations with SSRF prevention.

### Added

- **@peac/net-node** (Layer 4) - SSRF-safe network utilities
  - `safeFetch()` with DNS resolution pinning and RFC 6890 special-use IP blocking
  - Redirect policy with host-change validation
  - Protocol-grade audit events with request-scoped counters
  - Three-tier evidence redaction (public/tenant/private)
  - RFC 8785 JCS canonicalization for evidence digests
  - Self-contained types (no @peac/schema dependency)
  - 284 tests covering security, audit, and edge cases
  - Group folder pattern: `packages/net/node/` for future transport expansion

## [0.10.0] - 2026-01-14

### Wire Format Normalization

This release normalizes all wire format identifiers to the `peac-<artifact>/<major>.<minor>` pattern. Repo version (0.10.0) is now decoupled from wire format versions (0.1).

**Wire Format Changes:**

| Artifact            | Old Format                     | New Format                     |
| ------------------- | ------------------------------ | ------------------------------ |
| Receipt JWS `typ`   | `peac.receipt/0.9`             | `peac-receipt/0.1`             |
| Policy document     | `version: "0.9"`               | `version: "peac-policy/0.1"`   |
| Dispute bundle      | `peac.dispute-bundle/0.1`      | `peac-bundle/0.1`              |
| Verification report | `peac.verification-report/0.1` | `peac-verification-report/0.1` |
| Hash values         | `<64 hex chars>`               | `sha256:<64 hex chars>`        |
| Schema base URI     | `wire/0.9/`                    | `wire/0.1/`                    |

**Versioning Doctrine:**

- **Repo version** (0.10.0): Governs package releases, tooling, and APIs
- **Wire version** (0.1): Governs interoperability of signed artifacts and schemas
- Wire version only increments when schema or semantics change
- See `docs/specs/VERSIONING.md` for full versioning doctrine

### Added

- **Versioning doctrine** (`docs/specs/VERSIONING.md`)
  - Canonical documentation of wire vs repo versioning
  - Artifact identifier patterns and canonical constants
  - Compatibility guarantees within and across wire versions
- **Hash utilities** (`@peac/kernel`)
  - `parseHash()`: Parse `sha256:<hex>` into structured `{ alg, hex }`
  - `formatHash()`: Format hex string as `sha256:<hex>`
  - `isValidHash()`: Validate `sha256:<64 lowercase hex>` format
  - `HASH.pattern`: Regex for strict hash validation
- **Bundle `kind` and `refs` fields** - Extensible bundle types
  - `kind`: `'dispute' | 'audit' | 'archive'` (required in manifest, default: `'dispute'`)
  - `refs`: Array of `{ type, id }` references linking to external entities
  - Enables future bundle types beyond dispute bundles
- **Self-describing hash format** - All hashes now include algorithm prefix
  - Format: `sha256:<64 lowercase hex characters>`
  - Strict validation: lowercase only, exact length
  - Eliminates ambiguity about hash algorithm
- **Canonical constants** (`@peac/kernel`)
  - `BUNDLE_VERSION`: `'peac-bundle/0.1'`
  - `VERIFICATION_REPORT_VERSION`: `'peac-verification-report/0.1'`
  - All packages should import from kernel, not use string literals
- **Guard patterns** for legacy wire IDs
  - CI will fail if old format IDs appear in code
  - Patterns: `peac.receipt/0.9`, `peac.dispute-bundle`, `wire/0.9/`
- **Conformance vectors** - Updated for new wire format
  - `specs/conformance/fixtures/bundle/determinism.json` - Determinism test specification
  - `specs/conformance/fixtures/bundle/valid.json` - Valid bundle vectors
  - All golden vectors regenerated with new format
- **README records-first positioning**
  - Tagline: "Verifiable interaction records for automated systems"
  - Quick glossary: Record (concept) vs Receipt (serialization)
  - Non-payment-first quickstart example
  - Status labels (Implemented/Specified/Planned) on all mappings

### Changed

- **Wire format identifiers** - Normalized to kebab-case pattern
  - Uses `peac-<artifact>/<major>.<minor>` consistently
  - Major version changes require parser updates (breaking)
  - Minor version changes are backward compatible
- **Hash encoding** - Changed from raw hex to prefixed format
  - `content_hash`: `sha256:<hex>` in bundle manifest
  - `report_hash`: `sha256:<hex>` in verification report
  - `receipt_hash`: `sha256:<hex>` in manifest receipts
- **JWS header `typ`** - Changed from `peac.receipt/0.9` to `peac-receipt/0.1`
- **Bundle version** - Changed from `peac.dispute-bundle/0.1` to `peac-bundle/0.1`
- **Verification report version** - Changed to `peac-verification-report/0.1`
- **Schema base URI** - Changed from `wire/0.9/` to `wire/0.1/`
- **Schema files renamed** - `peac.receipt.0.9.schema.json` to `peac-receipt.0.1.schema.json`
- **Constants** - Updated in `@peac/kernel` and `specs/kernel/constants.json`
  - `WIRE_TYPE`: `'peac-receipt/0.1'`
  - `WIRE_VERSION`: `'0.1'`
  - `POLICY.manifestVersion`: `'peac-policy/0.1'`
  - `BUNDLE_VERSION`: `'peac-bundle/0.1'`
  - `VERIFICATION_REPORT_VERSION`: `'peac-verification-report/0.1'`

### Removed

- Legacy backward compatibility code for old wire format
- `LEGACY_WIRE_TYP` and `hashEquals()` functions
- Old wire schema file (`peac.receipt.0.9.schema.json`)

### Deprecated

- `docs/specs/PEAC-RECEIPT-SCHEMA-v0.9.json` - Now a stub redirect to v0.1 schema

### Documentation

- **VERSIONING.md** - Wire vs repo versioning doctrine
- **SPEC_INDEX.md** - Link to versioning doctrine
- **ARCHITECTURE.md** - Updated wire format table and version references
- **README.md** - Records-first positioning with glossary
- **Conformance fixtures** - Updated with new format specifications

## [0.9.31] - 2026-01-13

### Added

- **UCP Webhook Mapping** (`@peac/mappings-ucp`)
  - Google Universal Commerce Protocol (UCP) webhook signature verification
  - Detached JWS (RFC 7797) with ES256/ES384/ES512 support
  - Raw-first, JCS fallback verification strategy for UCP's ambiguous spec
  - UCP order to PEAC receipt mapping with amounts in minor units
  - Dispute evidence generation for @peac/audit bundles
  - Deterministic YAML evidence schema with hardened format

### Security

- **RFC 7797 b64=false**: Raw bytes passed to jose library (not ASCII-decoded)
- **JOSE crit semantics**: Unknown critical header parameters rejected with clear error
- **Strict header validation**: `crit` must be array of strings (no duplicates), `b64` must be boolean
- **Single profile fetch**: Verifier returns both parsed profile and raw JSON to eliminate race conditions
- **IEEE P1363 ECDSA**: Demo signing uses correct JWS signature format (raw R||S, not DER)

### Changed

- Root `test` script now uses `vitest run` (no watch mode hang in CI)
- Extracted shared crypto utilities to `util.ts` module (decouples verify.ts from evidence.ts)

### Documentation

- Security and Correctness Notes section in @peac/mappings-ucp README
- UCP webhook Express example in `examples/ucp-webhook-express/`

## [0.9.30] - 2026-01-12

### Added

- **Dispute Bundle Format** (`@peac/audit`)
  - ZIP-based archive format for offline verification (`peac.dispute-bundle/0.1`)
  - `createDisputeBundle()`: Create bundles from receipts, keys, and optional policy
  - `readDisputeBundle()`: Parse and validate bundle structure
  - `verifyBundle()`: Offline verification with deterministic reports
  - Content-layer hashing for cross-platform determinism (manifest-based, not ZIP bytes)
  - Support for yazl (write) and yauzl (read) ZIP libraries
- **Verification Reports** (`@peac/audit`)
  - `VerificationReport` type with deterministic JCS canonicalization
  - `formatReportText()`: Human-readable auditor summary
  - `serializeReport()`: JSON serialization with stable ordering
  - `report_hash`: SHA-256 of JCS-canonicalized report for cross-language parity
- **CLI Bundle Commands** (`@peac/cli`)
  - `peac bundle create`: Create dispute bundles from receipts and JWKS
  - `peac bundle verify`: Offline verification with JSON/text output
  - `peac bundle info`: Display bundle manifest information
  - `--json` flag for automation-friendly output
- **Error Codegen** (`scripts/codegen-errors.ts`)
  - Auto-generate `errors.generated.ts` from `specs/kernel/errors.json`
  - Type-safe error code constants with HTTP status mapping
  - CI drift check to ensure codegen stays in sync
- **Bundle Error Codes** (`specs/kernel/errors.json`)
  - `E_BUNDLE_INVALID_FORMAT`: Bundle ZIP structure invalid
  - `E_BUNDLE_MISSING_MANIFEST`: manifest.json not found
  - `E_BUNDLE_INVALID_MANIFEST`: manifest.json schema invalid
  - `E_BUNDLE_MISSING_RECEIPTS`: No receipts in bundle
  - `E_BUNDLE_MISSING_KEYS`: No keys for verification
  - `E_BUNDLE_KEY_NOT_FOUND`: Receipt references unknown key
  - `E_BUNDLE_RECEIPT_INVALID`: Receipt JWS invalid
  - `E_BUNDLE_HASH_MISMATCH`: Bundle integrity check failed
  - `E_BUNDLE_VERSION_UNSUPPORTED`: Bundle version not supported
- **Crypto Testkit** (`@peac/crypto/testkit`)
  - `generateKeypairFromSeed()`: Deterministic keypair generation for tests
  - Separate subpath export to prevent accidental production use
  - Export surface guard test to verify main entry exclusion
- **Conformance Vectors** (`specs/conformance/fixtures/bundle/`)
  - 8 golden vector ZIPs (2 valid, 6 invalid)
  - Expected report hashes for cross-implementation parity
  - Determinism spec with fixed timestamps and seeded keys

### CI/Quality

- **Error Codes Drift Check**: Ensures `errors.generated.ts` matches `errors.json`
- **Bundle Vectors Sanity Check**: Verifies generator runs without errors
- **Guard Script Updates**: Allow `issued_at` in audit package, skip binary files

### PRs

- #262: Kernel error codegen and bundle error codes
- #263: Audit dispute bundle verifier with deterministic conformance vectors
- #264: Crypto testkit subpath export and export-surface guard
- #265: CI bundle vector drift gate

## [0.9.29] - 2026-01-10

### Added

- **Go SDK Issue API** (`sdks/go/`)
  - `Issue()`: Receipt issuance with Ed25519 signing
  - `IssueOptions`: Configurable subject, resource, payment, env, extensions
  - URL validation: Rejects fragments (`#`) and userinfo (`user:pass@`)
  - Evidence placement: `payment.evidence` field (not top-level)
  - `IssueError` type with structured error codes
- **Go SDK Policy Evaluation** (`sdks/go/policy/`)
  - `Evaluate()`: First-match-wins rule evaluation
  - `Validate()`: Policy document validation with enum checks
  - `IsAllowed()`, `IsDenied()`, `RequiresReview()`: Convenience helpers
  - `EvaluateBatch()`: Batch evaluation for multiple contexts
  - Nil policy handling: Returns deny with `ReasonNilPolicy` constant
  - Subject matching: Type, labels, and ID patterns (wildcards supported)
  - Purpose and licensing mode matching with OR semantics
- **Go SDK Evidence Validation** (`sdks/go/evidence/`)
  - JSON-safe evidence validation with DoS protection
  - Configurable limits: maxDepth (32), maxKeys (1000), maxArrayLen (10000)
  - Cycle detection for object graphs
  - Fuzz testing with `FuzzValidate`
- **Go SDK CI Workflow** (`.github/workflows/go-sdk.yml`)
  - Format check with `gofmt`
  - Lint with golangci-lint v1.64
  - Build, test, and race detection
  - Bounded fuzz testing (10s)
  - Coverage artifact upload

### Documentation

- **Go SDK README** (`sdks/go/README.md`)
  - Issue API documentation with options table
  - URL restrictions section (no fragments, no userinfo)
  - Evidence structure documentation
  - Policy evaluation with nil behavior
  - Error codes reference

### Notes

- TypeScript packages bumped to 0.9.29 for repo version alignment (no TS behavioral changes)
- Go SDK packages not published to pkg.go.dev yet (local import only)
- Cross-language conformance with TypeScript SDK maintained

## [0.9.28] - 2026-01-09

### Added

- **Contracts Package** (`@peac/contracts`, Layer 1)
  - Canonical error codes with E\_\* prefix format
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
  - Forbidden header checks (no Payment-\*, enforce RFC 9421)
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
- Media types: success application/peac+json, errors application/problem+json (RFC 7807 with canonical https://www.peacprotocol.org/problems/<slug>)
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
- Problem type URIs now use absolute URLs (https://www.peacprotocol.org/problems/)
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
