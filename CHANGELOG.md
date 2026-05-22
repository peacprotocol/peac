# Changelog

All notable changes to PEAC Protocol will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.14.5] - 2026-05-21

Public Verification Readiness.

Aligns PEAC's public verification, security, stability, compatibility,
and machine-readable documentation with the v0.14.4 release state.
Removes stale forward-looking language, clarifies supported versions,
records measured local SLO baselines, updates deprecated and archived
package status, and tightens wording around PEAC's protocol boundary.

Public API: unchanged.
Wire format: unchanged.
Public schema: unchanged.
Registered extension groups: unchanged (19).
Registered receipt types: unchanged (61).
Conformance sections: unchanged (32).
Conformance requirement IDs: unchanged (290).
Published package names: unchanged; package count remains 36.
No new CLI surface. No new package-publication surface. No new
signing envelope. No wire/signing change. No runtime behavior change.

### Changed

- **`docs/SLO.md`** records measured local baselines for `issue()` and
  `verifyLocal()` against the v0.14.4 machine profile; reference
  verifier and MCP round-trip rows are marked explicitly as not
  measured in this cycle. Refreshes the `@peac/protocol` version header
  to v0.14.4 and corrects the capture command.
- **`SECURITY.md`** adds an Active `v0.14.x` row, a Maintenance
  `v0.13.x` row, demotes `v0.12.x` to maintenance with a concrete
  support window, and lists concrete end-of-support windows for
  `v0.11.x`. Replaces the carrier-controls forward-looking section
  with a shipped-carrier security-posture section pointing at the
  shipped profile specs. Replaces the soft external-review wording
  with an explicit current-coverage statement.
- **`docs/STABILITY-CONTRACT.md`** classifies `@peac/disc` and
  `@peac/pref` as `archived` consistent with the workspace state
  (source under `archive/`, absent from publish manifest), adds an
  `archived` row to the classification table, splits the `@peac/pref`
  row out from the supporting-packages group, removes stale
  forward-looking framing, and uses release-decision wording for
  stability-boundary changes.
- **`docs/COMPATIBILITY_MATRIX.md`** adds Deprecation Schedule rows
  for `@peac/disc` and `@peac/pref` that match the archive
  classification and name the canonical replacement packages.
- **`docs/TRUST-ARTIFACTS.md`** replaces stale forward-looking carrier
  language with pointers to the shipped CLI, lifecycle, and provisioning
  profile specs, and lists `archived` alongside the other stability
  classifications.
- **`llms.txt`** refreshes the install command to
  `npx -y @peac/mcp-server`, leads with interaction-record wording,
  switches generic receipt verbs to record verbs in quick-start
  bullets, and drops named MCP-client examples for vendor-neutral
  phrasing.
- **`docs/specs/RESOURCE-LIMITS.md`** uses "Record-content invariants"
  in the kernel-invariant heading and verifier-scoped wording for the
  256 KiB body limit.
- **`docs/specs/DISPUTE.md`** uses verifier-scoped wording for the
  UPPERCASE canonical form.
- **`docs/compatibility/commerce-protocol-coverage.md`** uses
  mapper-boundary-scoped wording for the explicit-finality rule.
- **`docs/SOLUTIONS/runtime-evidence-export.md`** removes vendor
  enumeration from the audience block and points related-surface
  references at shipped CLI and lifecycle records.

### Fixed

- Removes the false claim in `docs/TRUST-ARTIFACTS.md` that CLI
  execution carriers and lifecycle observation records were still
  forthcoming; those carriers have shipped and are classified `stable`.
- Corrects the stale `v0.12.x` security-fix window that pointed at
  "Through the v0.13.x line" after the v0.13.x line had already
  shipped.
- Corrects the documented SLO capture command
  (`pnpm exec vitest run tests/perf/wire02-slo.test.ts`) to match
  the test's actual repo-root location.

### Archived

- `@peac/disc` and `@peac/pref` are now formally documented as
  `archived` in both `docs/STABILITY-CONTRACT.md` and
  `docs/COMPATIBILITY_MATRIX.md`. Replacements: `@peac/policy-kit` for
  `peac.txt` policy-document loading; `@peac/mappings-content-signals`
  for AIPREF / robots.txt / tdmrep parsing.

## [0.14.4]

Composition Surfaces.

Documents how the PEAC records layer composes with adjacent runtimes,
verifiers, execution surfaces, evaluation platforms, deterministic
harnesses, agent-to-agent gateways, and the Model Context Protocol
without introducing new protocol semantics.

Public API: unchanged.
Wire format: unchanged.
Public schema: unchanged.
Registered extension groups: unchanged (19).
Registered receipt types: unchanged (61).
Conformance sections: unchanged (32).
Conformance requirement IDs: unchanged (290).
Published package names: unchanged; package count remains 36.
No new CLI surface. No new package-publication surface. No new
signing envelope. No wire/signing change.

### Added

- **Runtime governance composition guide** (`docs/SOLUTIONS/agt-peac-composition.md`)
  describing how a runtime governance toolkit and the PEAC records
  layer compose. The runtime decides; PEAC records what the runtime
  reported.
- **Edge verification recipe** (`docs/SOLUTIONS/verify-at-the-edge.md`)
  showing how to verify PEAC records inside a Fetch-compatible edge
  runtime with bounded body, key, timeout, and cache behavior.
- **Evaluation-platform records recipe**
  (`docs/SOLUTIONS/eval-platform-records.md`) using the existing
  `peac emit lifecycle` CLI and `org.peacprotocol/lifecycle-observation`
  extension namespace.
- **Harness execution records recipe**
  (`docs/SOLUTIONS/harness-records-quickstart.md`) using the existing
  `peac record command` CLI and `org.peacprotocol/cli-execution`
  extension namespace, with optional pairing to
  `org.peacprotocol/agent-action`.
- **MCP composition guide** (`docs/SOLUTIONS/mcp-composition.md`)
  documenting how PEAC records compose beneath MCP interactions,
  citing four merged MCP SEPs by exact number (2468, 2484, 2577,
  2106).
- **Runtime-composition example package**
  (`examples/runtime-composition-records/`) — vendor-neutral runnable
  demo using a generic event-normalization flow.
- **.NET committed-fixture quickstart verifier**
  (`examples/dotnet-quickstart/`) targeting the current supported .NET
  LTS runtime, verifying six committed PEAC interaction records
  offline. Not a PEAC .NET SDK; no NuGet package; no `sdks/dotnet/`.
- **Go middleware chi adapter parity** (`sdks/go/middleware/chi/`):
  per-adapter README and four localized invariants matching the file
  shape of the existing echo, gin, and nethttp adapters.
- **Doc-truth coverage** for every new recipe and example under
  `tests/tooling/`.
- **Compatibility matrix and example-catalog discoverability rows**
  for the .NET quickstart and the MCP composition guide.

### Changed

- `.prettierignore` extended with `**/bin/**` and `**/obj/**` to cover
  .NET build output so contributors building the .NET example locally
  do not trip formatting checks on generated JSON.
- `docs/SOLUTIONS/mcp-tool-call-receipts.md` gains one cross-link to
  the new MCP composition guide.

## [0.14.3]

Agent Action, Commerce Mandate, and Gateway Export Records.

Three new signed-record surfaces for reported agent-action events,
commerce-lifecycle events scoped to a mandate, and payment-gateway
settlement/recovery observations. Caller systems (agents, harnesses,
runtimes, payment gateways, facilitators) report what they observed;
PEAC records that report through a portable, signed interaction
record any party can verify offline.

Public API: extended (additive only).
Wire format: unchanged.
Package surface: unchanged published-package count (36).
Extension keys: 16 → 19 extension groups; 40 → 61 receipt types
(additive). 30 new conformance requirement IDs across three new
conformance sections.
Default observable behavior: unchanged for existing surfaces.

### Added

- **Agent action extension namespace.** New
  `org.peacprotocol/agent-action` extension namespace with 6
  `*-observed` receipt-type URIs (invoked / delegated / approved /
  denied / cancelled / timed-out). Schema validator with stable error
  codes under the `agent.action.*` namespace. New normative spec
  `docs/specs/AGENT-ACTION-RECORDS.md`. Conformance Section 32
  `AGENT-ACT-001..010`.
- **Commerce mandate extension namespace.** New
  `org.peacprotocol/commerce-mandate` extension namespace with 7
  `*-observed` receipt-type URIs (mandate / authorization / capture /
  void / refund / settlement / budget). Schema validator with 16
  stable error codes under the `commerce.mandate.*` namespace.
  Profile-local non-negative-amount-minor refine wrapper.
  Finality-synthesis boundary blocks `settlement_state` on every
  non-settlement event kind. New normative spec
  `docs/specs/COMMERCE-MANDATE-RECORDS.md`. Conformance Section 33
  `COMM-MAN-001..010`.
- **Gateway export extension namespace.** New
  `org.peacprotocol/gateway-export` extension namespace with 8
  `*-observed` receipt-type URIs covering a 7-state
  settlement/recovery model plus 1 facilitator-timeout trigger
  observation. Schema validator with 23 stable error codes under the
  `gateway.export.*` namespace, 19 forbidden top-level payment-data
  keys, real UTF-8 byte limits via `TextEncoder`, optional EIP-3009
  four-tuple references, and a `valid_before_unix_seconds`
  safe-integer-bounded field. New normative spec
  `docs/specs/GATEWAY-EXPORT-RECORDS.md`. Conformance Section 34
  `GATE-EXP-001..010`.
- **Three runnable example packages and operator recipes.** New
  `examples/agent-action-records/`, `examples/commerce-mandate-records/`,
  and `examples/gateway-export-records/` packages with deterministic
  synthetic fixtures and end-to-end `pnpm issue` + `pnpm verify`
  round-trips. New operator recipes under `docs/SOLUTIONS/` for each
  profile.
- **`@peac/schema` barrel re-exports.** 21 new top-level exports
  (15 types + 6 value exports) for the three new profile constants
  and validators.

### Changed

- **ACP mapper boundary fix.** `packages/mappings-acp`
  `fromACPCheckoutSuccess` now requires `amount_minor: string`
  (replacing the prior `total_amount: number` field) and an explicit
  `env` field. New local `ACPMapperBoundaryError` class with 11
  stable codes. BigInt safe-integer guards on every amount
  conversion. Shared private `isValidHttpsResourceUri` helper across
  all five ACP mapper paths.
- **Repository hygiene.** Test-only clock pin on the
  `apps/api/tests/report-format.test.ts` byte-stability test (no
  production behavior change). `api-contract.test.ts`
  extension-key constants count bumped 24 → 27. Pack-install smoke
  extended to verify v0.14.3 profile exports through packed
  `@peac/schema`.
- **Dependency overrides.** `protobufjs` override pinned to exact
  `8.0.2` (closes 7 protobufjs Dependabot advisories across the
  `8.0.0..8.0.1` range). New defensive `@protobufjs/utf8: 1.1.1`
  override. Reachability is private-example-only via
  `@peac/example-telemetry-otel@0.0.0`; no published runtime package
  depends on protobufjs.

## [0.14.2]

Provisioning Lifecycle Records.

A signed-record format for reported provisioning lifecycle events from
external systems. Caller systems (agents, agent-driven workflows,
control planes, CLIs, or providers themselves) report what happened
when services, accounts, resources, credentials, payment authorizations,
budgets, subscriptions, domains, or deployments are provisioned through
external providers; PEAC records that report through a portable, signed
interaction record.

Public API: extended (additive only).
Wire format: unchanged.
Package surface: unchanged published-package count (36).
Extension keys: 15 → 16 extension groups; 30 → 40 receipt types
(additive). 21 new stable error codes under the `provisioning.*`
namespace.
Default observable behavior: unchanged for existing surfaces.

### Added

- **Provisioning lifecycle extension namespace.** New
  `org.peacprotocol/provisioning-lifecycle` extension namespace with
  10 `*-observed` receipt-type URIs covering catalog, provider-link,
  account, resource, credential, payment-authorization, budget,
  subscription, domain, and deployment events. Schema validator with
  recursive credential-material walker (depth-aware,
  structure-bounded, vendor-neutral pattern panel). 21 stable error
  codes (20 validator-emitted plus 1 fixture-loader-only). New
  normative spec `docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md`.
  Conformance Section 31 `PROV-LIFE-001..010`.
- **Provisioning lifecycle examples.** New generic example
  `examples/provisioning-lifecycle/` (10 fixtures, one per
  `*-observed` event family) with `pnpm issue` and `pnpm verify`
  scripts. New concrete sanitized demo
  `examples/agent-provisioning-demo/` using the canonical extension
  namespace; replaces the prior vendor-named example directory.
- **Operator recipe.**
  `docs/SOLUTIONS/verify-agent-provisioning.md` walks an auditor or
  reviewer through verifying reported provisioning lifecycle records
  offline.
- **Cross-language parity corpus.** New
  `specs/conformance/parity-corpus/provisioning-lifecycle/` (29
  vectors: 10 positive plus 19 negative) self-describes each
  expected stable error code in `expected.errors[]`. Enrolled in the
  Go SDK parity loader.
- **Repository hygiene.** New `scripts/verify-example-source-gate.mjs`
  (wired into `scripts/gate.sh` fast and full modes) checks committed
  examples for live-shaped secrets and retired vocabulary. New
  `tests/tooling/workspace-package-privacy.test.ts` enforces that
  every `@peac/*` workspace package with `private!==true` is listed
  in `scripts/publish-manifest.json packages[]`, and that private
  packages do not carry `publishConfig`.
- **Stricter parity-corpus contract.** The v0.14.x sibling-family
  convention now carries an extension-level expected-error column for
  schema-validator profiles; the wire-envelope canonical-truth test
  filters family-scoped extension prefixes so corpora can
  self-describe without breaking envelope-layer parity.

### Changed

- `@peac/cli`: hardened command handlers eliminate file-system-race
  patterns in command-output write paths.
- `packages/mappings/ucp`: prototype-pollution regression test added
  to lock the inline-blocklist barrier shape.
- `integrator-kits/stripe-projects/README.md`: modernized to the
  canonical extension namespace and 10 type URIs.
- 14 `@peac/*` workspace packages flipped from `private:false` to
  `private:true` to align metadata with `scripts/publish-manifest.json`
  (the public package surface stays at 36).

### Security

- Bumped `hono`, `fast-uri`, and `ip-address` to patched versions.

## [0.14.1]

Execution Surfaces + Observational Lifecycle Records.

PEAC gives APIs, agents, MCP tools, A2A handoffs, and CLI workflows a
portable signed record that can be verified outside the system that
produced it. This release adds three new record surfaces (A2A handoff
observation records, CLI command execution records, and observational
lifecycle records) plus a small set of cleanup and consistency
improvements.

Public API: extended (additive only).
Wire format: unchanged.
Package surface: unchanged published-package count (36).
Extension keys: 12 → 15 extension groups; 10 → 30 receipt types
(additive). New stable error codes for the new namespaces.
Default observable behavior: unchanged for existing surfaces.

### Added

- **A2A handoff observation records.** New `org.peacprotocol/a2a-handoff`
  extension namespace with 10 receipt-type URIs covering A2A v1.0 task,
  message, and artifact handoffs. New normative spec
  `docs/specs/A2A-HANDOFF-RECORDS.md`. Conformance Section 28
  `A2A-HOBS-001..010`. The signature-observation field shape is
  caller-reported; the helper does not import signature-verification
  APIs.
- **CLI command execution records.** New `peac observe command`
  (unsigned JSON observation) and `peac record command` (compact JWS,
  signed) verb-group surfaces in `@peac/cli`. New
  `org.peacprotocol/cli-execution` extension namespace +
  `org.peacprotocol/cli-command-execution` receipt-type URI. New
  normative spec `docs/specs/CLI-CARRIER-PROFILE.md`. Conformance
  Section 29 `CLI-EXEC-001..006`. Hard security defaults: double
  opt-in for raw capture and raw env modes; secret-scan on by
  default; shell-binary detected without `--shell-mode` is a hard
  fail.
- **Observational lifecycle records.** New `peac emit lifecycle` CLI
  surface for signed lifecycle observation records. New
  `org.peacprotocol/lifecycle-observation` extension namespace with
  9 receipt-type URIs covering approval, evaluation, experiment,
  workflow-transition, and mode-observed events. Grammar-based
  no-inline-value invariant (20 forbidden top-level keys;
  opaque-reference grammar covering `ref:`, `urn:`, `did:`,
  `sha256:`, `peac:`, `https:` prefixes). New normative spec
  `docs/specs/LIFECYCLE-OBSERVATION-PROFILE.md`. Conformance
  Section 30 `LIFE-OBS-001..010`. OBSERVER scope; vendor-neutral
  orchestrator boundary; OTel composition split into normative and
  informative subsections.
- **Architecture and interoperability guidance.** New
  `docs/architecture/` documents the generic-core, profile,
  adapter, and example boundary doctrine for OSS-neutral protocol
  abstraction.

### Changed

- **Sandbox issuer issues current Wire records.** The sandbox issuer
  now emits records via the validated `@peac/protocol.issue()` path.
  Request body uses `sub` (subject URL); legacy `aud` and
  `expires_in` are rejected with stable detail messages. Discovery
  advertises the current Wire only.
- **Public examples migrated to current Wire.** Seven canonical
  examples (`mcp-tool-call`, `pay-per-crawl`, `pay-per-inference`,
  `stripe-x402-crypto`, `telemetry-otel`, `workflow-correlation`,
  `x402-node-server`) now demonstrate current Wire issuance and
  verification. Two examples (`rsl-collective`, `erc8004-feedback`)
  remain Wire 0.1 with explicit legacy markers preserving their
  conformance binding intent.
- **Public docs and adapter wording cleanup.** Aligned the Go floor
  to `Go 1.26+` across all public docs. Aligned the active
  paymentauth draft revision (`draft-ryan-httpauth-payment-01`) in
  the integrator-kit README. Refined adapter and mapping wording
  away from PEAC-control-plane verbs toward records-layer and
  adapter-scoped wording.
- **`@deprecated` JSDoc on `issueWire01()`** for new code paths.
  Wire 0.1 envelope, schemas, and internal `verifyLocalWire01()`
  remain available for backward compatibility; new issuance is
  discouraged.

### Notes

- npm `next` only. No `latest` promotion in this release.
- Compatibility: existing Wire 0.2 verification, issuance, and
  carrier flows unchanged.
- See `docs/release-notes/v0.14.1.md` for the per-surface
  walkthrough.

## [0.14.0]

Bounded Validation Gate.

Wire 0.2 issuance and local verification now route through the
bounded validation gate. The previous direct-canonical admission
path remains available as an internal rollback path.

Public API: unchanged.
Wire format: unchanged.
Package surface: unchanged.
Extension keys: unchanged.
Default observable behavior: unchanged.

This release makes the internal rollback path meaningful while
preserving byte-equivalent behavior across the covered runtime matrix.

### Changed

- The bounded validation path is now the primary internal runtime
  path for `@peac/protocol` `issue()` and `verifyLocal()`. The
  previous direct-canonical admission path remains available as the
  internal rollback path.
- The internal rollback flag is now meaningful: both flag values
  exercise different internal admission paths and produce
  byte-equivalent public outputs across the covered runtime matrix.
  See [`docs/STABILITY-CONTRACT.md`](docs/STABILITY-CONTRACT.md) and
  [`docs/diagnostics/ROLLBACK-v0.14.0.md`](docs/diagnostics/ROLLBACK-v0.14.0.md)
  for the operator runbook.

### Added

- `packages/protocol/src/_internal/record-core/validation-gate.ts`:
  production wrapper for the bounded validation path. Entrypoint-aware
  (`surface: 'issueWire02' | 'verifyLocal'`) with a per-surface
  production projection allowlist.
- `docs/diagnostics/ROLLBACK-v0.14.0.md`: version-specific operator
  runbook for the active internal rollback path.

### Notes

- No public API change, wire-format change, package-surface change,
  extension-key change, or default-path behavior change.
- npm `next` only. No `latest` promotion in this release.

## [0.13.4]

Validation Readiness and Runtime Invariants. This release is
behavior-preserving. It strengthens runtime-invariant verification
coverage, internal validation parity coverage, and release-gate
checks.

There is no public API change, wire-format change, package-surface
change, extension-key change, or default-path behavior change.

### Added

- `scripts/verify-trust-artifacts.mjs`: fourth check that walks every
  invariant table under `docs/specs/RESOURCE-LIMITS.md` and asserts
  every Constant + Test column markdown link resolves to a tracked
  file. Recognizes the existing `same` and bare-identifier
  inheritance idioms used by the doc.
- `tests/tooling/resource-limits-trust-artifact.test.ts`: live-tree
  happy path plus contrived broken-link smoke for the new check.
- `docs/STABILITY-CONTRACT.md`: row in the internal-only flags table
  for the internal rollback flag. Operator runbook continues at
  `docs/diagnostics/ROLLBACK-PATH.md`.
- `tests/tooling/stability-contract-coverage.test.ts`: enumerates
  runtime-read internal flag literals in
  `packages/protocol/src/_internal/` and asserts each has a row in
  the contract.
- `.github/workflows/ci.yml`: rollback-path matrix promoted to a
  release-class gate. Blocking matrix covers Node 22 and Node 24 LTS
  across both rollback-path modes (4 cells). Advisory Current-Node
  lane runs with `continue-on-error: true`.
- `.github/workflows/publish.yml`: `release_gate_rollback_matrix`
  preflight that re-runs the matrix at the tagged SHA;
  `publish_dry_run` and `publish_prod` declare it as a `needs:`
  dependency, hard-blocking publish on any failure.
- `docs/CI_BEHAVIOR.md`: Rollback-path matrix subsection.
- Seven canonical-composed validators under
  `packages/protocol/src/_internal/record-core/validators/`
  (schema-parse, jose-typ-strictness, iat-not-yet-valid,
  policy-binding, unknown-extension-grammar,
  type-extension-enforcement, signature). Each layer either delegates
  to a canonical helper from `@peac/schema` / `@peac/crypto` /
  `@peac/protocol` or mirrors a canonical inline check verbatim.
- `runBoundedValidatorShadow` wired with the six sync layers as
  optional-input layers that skip when their inputs are absent. The
  async signature wrapper is exported standalone, not composed into
  the bounded validator.
- `packages/protocol/src/_internal/test-helpers/candidate-runner.ts`:
  projects bounded-validator output into the canonical-runner's
  `ParityVerdict` shape.
- `packages/protocol/__tests__/_internal/parity-canonical-vs-candidate.test.ts`:
  230 fixtures from the existing manifest assert canonical-vs-candidate
  verdict byte-equality.
- `packages/protocol/__tests__/_internal/bounded-validator-expanded-layers.test.ts`:
  per-layer activation + skip proof for the six new sync layers.
- `packages/protocol/__tests__/_internal/canonical-composed-validators.test.ts`:
  per-validator unit tests including the standalone signature wrapper.
- `packages/protocol/__tests__/_internal/shadow-byte-equivalence.test.ts`:
  with `Date.now` locked, `issue()` produces byte-identical compact
  JWS output across both internal shadow flag values; `verifyLocal()`
  returns byte-equal result shape on a fixed JWS across both values.

### Changed

- `docs/specs/RESOURCE-LIMITS.md`: stale MCP mapping test path
  corrected from `packages/mappings/mcp/__tests__/` to
  `packages/mappings/mcp/tests/budget.test.ts`.
- `scripts/verify-no-semantic-widening.mjs`: header refreshed to
  release-neutral wording. Baselines (36 packages, 12 extension
  groups, 186 errors, 0 emitted-on-primary-path) unchanged.

### Compatibility

- `@peac/protocol.{issue, verifyLocal, verify}`: public TypeScript
  signatures unchanged. Wire-format behavior and default-path
  behavior unchanged.
- Wire format (`peac-receipt/0.1` envelope, `interaction-record+jwt`
  JWS `typ`): unchanged.
- Active publish-manifest count: 36 (unchanged).
- Extension group count: 12 (unchanged).
- Error code count: 186 (unchanged); no new emitted-on-primary-path
  codes.
- OpenAPI verify contract: unchanged. OpenAPI 3.1.x unchanged.
- npm dist-tag: `next` only.

## [0.13.3]

Documentation and internal test-infrastructure release. No public API change. No wire-format change. No new public package. No publish-manifest change. Published to npm `next` only.

### Added

- Operator runbook at `docs/diagnostics/ROLLBACK-PATH.md`.
- `docs/specs/RESOURCE-LIMITS.md`: Layered network limits subsection, Timeout classes subsection, and a Header-carrier surfaces clarification.

### Changed

- `docs/specs/RESOURCE-LIMITS.md`: resource-limit table citations updated to canonical kernel constants; stale citations to a retired package replaced with current source paths.

### Compatibility

- Public API signatures unchanged.
- Wire format unchanged.
- OpenAPI verify contract unchanged.
- Active publish-manifest count: 36 (unchanged from v0.13.2).
- npm dist-tag: `next` only.

## [0.13.2]

Internal foundations release. No public API change. No wire format change. No new public package. No publish-manifest change. Published to npm `next` only.

### Added

- `apps/api/src/lib/shadow-resolver.ts`, `shadow-types.ts`, `shadow-classify.ts`, `shadow-mismatch-sink.ts`, `shadow-execute.ts`: workspace-private shadow-mode pointer-fetch foundation. Lazy-import boundary gated by `PEAC_INTERNAL_SHADOW_RESOLVER=1` (default OFF); bounded normalization shapes; redaction-safe in-memory ring-buffer mismatch sink with progressive-degradation cap; pure-function parity verdict computer; factory-injected execution wrapper. Internal-only; no live route shadowing in this release.
- `apps/api/tests/{shadow-resolver.boundary, shadow-classify, shadow-mismatch-sink, shadow-execute, parity-public-root-smoke, body-limit.boundary}.test.ts`: shadow-mode foundation coverage plus exact-byte-length boundary tests for the 256 KiB raw body-size invariant on `/v1/verify` and `/v1/issue`.
- `docs/diagnostics/SHADOW-MISMATCHES.md`: foundation diagnostic notes describing mismatch taxonomy, bounded entry shape, ring-buffer behaviour, and explicit non-goals.
- `docs/diagnostics/RELEASE-EXERCISE-v0.13.2.md`: release validation record. No third-party external claim and no live Hosted Verify pointer-fetch route shadow claim; Hosted Verify accepts inline compact JWS receipts today.
- `docs/STABILITY-CONTRACT.md`: two new internal-only flag rows for `PEAC_INTERNAL_SHADOW_RESOLVER` and `PEAC_INTERNAL_SHADOW_BUFFER_SIZE`.
- `docs/THREAT_MODEL.md`: new "Shadow-mode telemetry (internal-only)" subsection with six T-SHDW-\* entries linked to test files.
- `packages/compat/src/archival-export.ts` reader / writer / validator: `serializeArchivalBundle` (deterministic stable-key JSON output), `parseArchivalBundle`, `validateArchivalBundle` (discriminated-union return), plus the `ArchivalValidationFailure` / `ArchivalValidationResult` types. Cyclic payloads and sparse arrays are rejected as `archival_invalid_payload`. Version-mismatch error messages do not echo caller-provided values. `ARCHIVAL_BUNDLE_VERSION` constant exported. Workspace-private; not published.
- `packages/resolver-http/`: workspace-private resolver composition layer over published primitives (`@peac/net-node`, `@peac/jwks-cache`, `@peac/kernel`, `@peac/crypto`). Workspace-private; absent from publish manifest. No `@peac/protocol` runtime dependency.

### Changed

- `apps/api/package.json`: workspace dep added on the workspace-private resolver composition layer (workspace-private; not published).
- `surfaces/nextjs/middleware/package.json`: `next` range bumped from `^15.5.12` to `^15.5.15`.
- `apps/api/package.json`, `packages/pay402/package.json`, `packages/receipts/package.json`: `ts-jest` range bumped from `^29.0.0` to `^29.4.9` so the workspace lockfile resolves the transitive `handlebars` dependency to a patched version.
- `apps/api/package.json`, `apps/sandbox-issuer/package.json`, `packages/server/package.json`: `hono` range bumped from `^4.12.12` to `^4.12.15`.
- Root `package.json` `pnpm.overrides`: added range-scoped overrides for `defu` (>= 6.1.5), `esbuild` (< 0.25.0 to >= 0.25.0), `undici` (< 6.24.0 to >= 6.24.0), `postcss` (< 8.5.10 to >= 8.5.10), and `vite` (< 6.4.2 to >= 6.4.2). Each override carries a corresponding `overridesComments` entry naming the GHSA, dependency path, and rationale. All overrides target dev-scope dependencies; no published package ships any of them.
- `packages/compat/spec/ARCHIVAL-EXPORT.md`, `packages/compat/spec/MIGRATION-CLASSES.md`, `packages/compat/README.md`, `packages/compat/SECURITY.md`: rewritten as workspace-private package contract; "internal scaffold" / "future release" / "normative document under docs/specs/" framing removed.

### Compatibility

- `@peac/protocol.{issue, verifyLocal}` signatures and serialized output: byte-identical to v0.13.1.
- Wire format (`peac-receipt/0.1` envelope, `interaction-record+jwt` JWS `typ`): unchanged.
- `@peac/kernel` public TypeScript surface: byte-stable from v0.13.1.
- OpenAPI verify contract: unchanged.
- Error code count: 186 (unchanged); no new emitted-on-primary-path codes.
- Extension group count: 12 (unchanged).
- Active publish-manifest count: 36 (unchanged from v0.13.1).
- Workspace-private packages remain workspace-private; absent from `pnpm publish --dry-run --recursive`.

### Security

- All 16 open Dependabot alerts present at the start of the v0.13.2 window were closed. Closures: `handlebars` (1 critical, 3 high, 2 medium, 1 low — all dev-only via `ts-jest` upgrade); `hono` (1 medium runtime; reachability audit confirmed `hono/jsx` is not imported, upgraded for hygiene); 8 dev-only alerts via range-scoped `pnpm.overrides` (`defu`, `vite` ×2, `esbuild`, `next`, `postcss`, `undici` ×2). 0 open Dependabot alerts on the release commit.

## [0.13.1]

Internal foundations release. No public API change. No wire format change. No new public package. Published to npm `next` only.

### Added

- Mutation, resource-limit, and property-based fuzz test suites for `@peac/protocol`.
- `docs/STABILITY-CONTRACT.md`: Internal-only flags section and shadow-mode timeout guarantee class.
- `docs/release-notes/v0.13.1.md`.

### Changed

- Pre-push and release verification gates broadened to mirror CI (`pnpm verify:release` now runs publish-manifest topological order check).
- Repository language statistics exclude `archive/` (vendored).

### Compatibility

- `@peac/protocol.{issue, verifyLocal}` signatures and serialized output: byte-identical to v0.13.0.
- Wire format (`peac-receipt/0.1` envelope, `interaction-record+jwt` JWS `typ`): unchanged.
- OpenAPI verify contract, error code count (186), extension group count (12), and active publish-manifest count (36): unchanged.

## [0.13.0]

Doctrine cleanup, scheduled deprecation removals, and v0.13.0 baseline artifacts. Records-first wording across active surfaces; legacy `peac.receipt/0.9` quarantined to historical-marker contexts; `ProofMethodSchema` and A2A v0.3.0 compatibility removed; `@peac/core` and `@peac/pref` archived; legacy `POST /verify` removed from the active OpenAPI contract while the runtime alias continues to serve `/v1/verify`-shape responses with `Deprecation`, `Sunset`, and `Link` headers through the advertised Sunset; published normative resource-limits spec, standards ledger, v0.13.0 baseline snapshot, error-emission audit, and mutation-testing posture. No wire format change. No new signing envelope. No new public package.

### Added

- `docs/baselines/BASELINE-v0.13.0.md`: descriptive snapshot of the v0.13.0 tagged tree (released-package surface, wire-format invariants, resource-limit invariants, error-taxonomy inventory, public TypeScript / CLI / verifier surface).
- `docs/specs/RESOURCE-LIMITS.md`: normative invariant table for size, time, cache, SSRF, redirect, and timeout ceilings; each row cites the constant in source and a test.
- `docs/STANDARDS_LEDGER.md`: catalogue of every external standard PEAC cites or implements, organized by category and labeled by status (Standards Track / Informational / IRTF Informational / BCP / FIPS / W3C Recommendation / International Standard / Regulatory / Draft / Watchlist).
- `docs/baselines/ERROR-EMISSION-AUDIT-v0.13.0.{md,json}`: per-code classification of `specs/kernel/errors.json` (186 codes) by production-emission status. Informational; no code is renumbered or removed.
- `docs/baselines/MUTATION-BASELINE-v0.13.0.md` + `stryker.conf.json` + `pnpm mutation:baseline` script: mutation-testing posture across `@peac/kernel`, `@peac/schema`, `@peac/crypto`, `@peac/protocol`, `@peac/policy-kit`. Advisory only; not CI-wired; no score recorded in this release.
- `docs/PACKAGE_STATUS_V0.13.0_PARITY.md`: per-export parity audit for `@peac/disc`, `@peac/core`, and `@peac/pref` against canonical replacements.
- `apps/api/src/index.ts` exports `LEGACY_VERIFY_DEPRECATION_HEADERS` and `createLegacyVerifyAliasHandler` so production routing and tests share the same alias wiring.
- `apps/api/tests/legacy-verify-alias-headers.test.ts` and `apps/api/tests/legacy-verify-alias-pre-sunset.test.ts`: regression coverage for the deprecated `/verify` and `/api/v1/verify` aliases.
- `tests/tooling/package-surface-audit.test.ts`: enforces publish-closure (every `@peac/*` workspace dependency declared by a published package resolves to another package in `packages[]`) and `packages.length <= 37`.
- `tests/tooling/internal-package-invisibility.test.ts`: enforces that workspace-private package names do not appear on tracked public surfaces.
- `tests/tooling/records-first-doctrine.test.ts`: enforces records-first framing in the top 80 lines of active front-door docs.
- `scripts/audit-error-emissions.mjs` + `pnpm audit:errors` / `pnpm audit:errors:write`: token-aware error-code emission audit.
- `scripts/release/npm-deprecate-v0.13.0.sh`: deprecate commands for historical npm versions of `@peac/pref`, `@peac/sdk`, `@peac/disc`, and `@peac/core`. Executed manually after the package release is complete.

### Changed

- Records-first wording across active front-door docs (README, `docs/START_HERE.md`, every `packages/*/README.md` first 80 lines). "Receipt" preserved as the per-artifact noun and as the `PEAC-Receipt` HTTP header.
- `@peac/schema`: `ProofMethodSchema` and the `PROOF_METHODS` constant removed; the four transport-binding values (`http-message-signature`, `dpop`, `mtls`, `jwk-thumbprint`) inlined on `AgentProofSchema.method`. Runtime validation surface for `AgentProof` is unchanged. `ProofTypeSchema` is unchanged.
- `@peac/mappings-a2a`: A2A v0.3.0 compatibility surface removed. v1.0.0 `supportedInterfaces[]` is required; cards with only a top-level `url`, kebab-case `TaskState` values, and the `/.well-known/agent.json` legacy discovery path are no longer accepted. `@peac/mappings-a2a` is now tracked under `bash scripts/release/api-surface-lock.sh`.
- `@peac/disc`: published as a deprecated compatibility alias. The barrel emits a one-shot `PEAC_DISC_DEPRECATED` structured `DeprecationWarning` on import. Existing `parse` / `emit` / `validate` / `discover` / `WELL_KNOWN_PATH` / `MAX_BYTES` / `DEFAULT_TIMEOUT_MS` exports preserved. Canonical replacement: `@peac/policy-kit`.
- `apps/api`: legacy `POST /verify` and `POST /api/v1/verify` routes delegate in-process to `POST /v1/verify` and stamp `Deprecation: true` (RFC 9745), `Sunset: Sat, 01 Nov 2026 00:00:00 GMT` (RFC 8594), and `Link: <https://www.peacprotocol.org/docs/migration>; rel="deprecation"` (RFC 8288) on every response. The active public OpenAPI contract (`packages/schema/openapi/verify.yaml`, `apps/api/openapi.yaml`) documents `POST /v1/verify` as the canonical operation; the alias is not part of the machine-readable contract.
- `docs/STABILITY-CONTRACT.md`, `docs/MIGRATION_CURRENT.md`, `docs/PACKAGE_STATUS.md`, `docs/COMPATIBILITY_MATRIX.md`, `docs/DEPRECATION_POLICY.md`, `docs/HOSTED_VERIFY_CONTRACT.md`, `SECURITY.md`: present-state classifications updated to reflect archived `@peac/core`, archived `@peac/pref`, deprecated `@peac/disc`, and the `/verify` alias contract.
- `.github/workflows/nightly.yml`: nightly crypto smoke migrated from `@peac/core` to `@peac/crypto` (`generateKeypair` / `sign` / `verify` round-trip).
- OpenAPI `verify.yaml` and `apps/api/openapi.yaml` refreshed to `info.version: 0.13.0`.

### Deprecated

- `@peac/disc`: published as a one-release compatibility alias; `npm deprecate` notice attached on release.

### Removed

- `@peac/schema`: `ProofMethodSchema` schema export, `ProofMethod` type, and `PROOF_METHODS` constant.
- `@peac/mappings-a2a`: `TASK_STATE_V03_TO_V1` map, `normalizeTaskState` function, `_resetDeprecationWarning` test hook, and `NormalizedAgentCard.version` discriminant.
- `apps/api`: `apps/api/src/verifier.ts`, `apps/api/src/routes.ts`, `apps/api/src/peac-core.d.ts`, and the `@peac/core` runtime dependency from `apps/api/package.json`.
- Legacy `POST /verify` from the active public OpenAPI contract. The runtime alias is preserved through the advertised Sunset.
- `packages/sdk-js/` workspace stub.
- `packages/core/` (moved to `archive/0.9.0-0.9.14/packages-core/`); `packages/aipref/` (moved to `archive/pref/`); five empty Layer-6 pillar stubs (`packages/{access,compliance,consent,intelligence,provenance}/`) moved under `archive/pillars/`.

### Archived

- `@peac/core` is not in the v0.13.0 active publish manifest. Historical npm versions `<=0.9.14` remain installable for verify-only use of historical `peac.receipt/0.9` records.
- `@peac/pref` is not in the v0.13.0 active publish manifest. Historical npm versions `<=0.12.14` remain installable. Migration target: `@peac/mappings-content-signals`.

## [0.12.14]

Policy binding and privacy-aware verification. Typed document binding for terms and policy, publisher-supplied canonical digest support, privacy-aware deployment guidance, and verifier privacy defaults including JWKS cache retention caps and a no-raw-personal-data minimization mode. Documentation, tests, and tooling only. No wire, schema, kernel, crypto, or protocol public-API change.

### Added

- `packages/protocol/src/document-binding.ts`: typed document-binding helpers with three scheme-specific functions (`computeJsonDocumentDigestJcs`, `computeTextDocumentDigestUtf8`, `computeDocumentDigest`) and a three-state check (`checkDocumentBinding`). JCS name reserved for JSON-only; text helper names its normalization scheme. Normative spec: `docs/specs/DOCUMENT-BINDING.md`.
- `packages/protocol/src/verifier-types.ts` gains `DocumentBindingResult`, `VerifierBindings`, and `DocumentRepresentation` types. The verifier report gains an optional top-level `bindings` object carrying `policy`, `terms`, and `documents` under the same three-state semantics. Legacy `policy_binding` top-level field is preserved as a byte-stable mirror for v0.12.x consumers.
- `docs/specs/DOCUMENT-BINDING.md`: normative spec defining the canonical hash format, three-state semantics, helper-naming contract, minimal text canonicalization rule (`\n` + NFC, no trailing-whitespace stripping), per-representation binding identity, and publisher-supplied `canonical_digest` rule (verifiers may compare when present; must never synthesize from non-JSON; absence is `unavailable`, not `failed`).
- `packages/adapters/x402/src/terms.ts`: `computeX402TermsDigest` convenience helper over the dispatcher for the four x402 PR-1986 `terms` representations (`uri`, `markdown`, `plaintext`, `json`).
- JWKS cache retention caps via `PEAC_JWKS_CACHE_TTL_MS` (default 300 000 ms / 5 min) and `PEAC_JWKS_CACHE_MAX_ENTRIES` (default 1 000) environment variables. Decimal-only parsing; malformed values fall back to built-in defaults without uncaching.
- `PEAC_NO_RAW_PERSONAL_DATA` (set to `true` or `1`) enables the `no_raw_personal_data` minimization mode on the verifier report. The redactor pseudonymises `claims.sub` and `claims.actor.{id,email,name,display_name,handle,sub}` to `sha256:<32 hex>`, walks `claims.extensions` recursively, and elides string leaves that are not short structured identifiers. Protocol metadata fields are unchanged. When the variable is unset the report body is byte-identical to v0.12.13.
- Five boundary-first privacy guidance documents under `docs/privacy/`: `DATA-CLASSIFICATION.md`, `RETENTION-AND-DELETION.md`, `DEPLOYMENT-ROLES.md`, `DATA-SUBJECT-RIGHTS.md`, and `DPIA-STARTER.md`. Each opens with explicit "What PEAC does / What PEAC does not do / What deployers still own" framing.
- `docs/specs/PRIVACY-PROFILE.md`: extended with boundary-first block and cross-references to the new deployment-guidance documents.
- `docs/specs/DOCUMENT-BINDING.md`, `docs/specs/VERIFICATION-REPORT-FORMAT.md` updated to document `bindings` shape and publisher-supplied `canonical_digest` rule.
- `scripts/verify-no-semantic-widening.mjs`: release gate verifying wire format unchanged, published package count unchanged at 37, extension group count unchanged at 12, OpenAPI includes required fields and the permitted additive `bindings` field, no new primary-path error codes, total error count unchanged at 186.

### Changed

- `packages/protocol/src/policy-binding.ts`: `computePolicyDigestJcs` delegates to `computeJsonDocumentDigestJcs` internally; public API and byte output unchanged.
- `packages/discovery/src/`: narrowed to policy-document parsing; legacy `verify` / `public_keys` / `jwks` fields in `peac.txt` emit a structured `PEAC_LEGACY_PEAC_TXT_KEY_FIELD` deprecation warning.
- `packages/aipref/`: deprecated facade over `@peac/mappings-content-signals`; network I/O removed; digests widened to full SHA-256 (`sha256:<64 hex>`); a one-shot `PEAC_DEPRECATED_PREF` structured deprecation warning is emitted.
- OpenAPI `verify.yaml` and `apps/api/openapi.yaml` refreshed to `info.version: 0.12.14` with the additive `bindings` field on both `VerifySuccessResponse` and `ExtendedVerifyReport` schemas.

### Deprecated

- `@peac/disc` (legacy key-discovery fields): deprecated and narrowed. Full removal owned by the next cleanup release.
- `@peac/pref`: deprecated facade over `@peac/mappings-content-signals`. Full removal owned by the next cleanup release.

### Deferred

The following items are deferred to v0.13.0:

- Naming and terminology cleanup; legacy quarantine of `peac.receipt/0.9` off active surfaces.
- Scheduled removals: `ProofMethodSchema`, A2A v0.3.0 compatibility, legacy `/verify` teaching/OpenAPI surface (runtime alias preserved through Sunset), `sdk-js` workspace stub.
- Full removal of `@peac/disc` and `@peac/pref` deprecated facades.
- v0.13.0 baseline snapshot, resource-limit spec, and `docs/STANDARDS_LEDGER.md`.
- Package-surface reduction program with measurable gate.
- Hosted Issue GA decision.

## [0.12.13]

Compliance mappings, verifier contract alignment, portable proof workflows, and Go adapter follow-through. Documentation, tests, workflows, and SDK support tooling only. No wire, schema, kernel, crypto, or protocol public-API change.

### Added

- `docs/compliance/ISO-42001-MAPPING.md` mapping ISO/IEC 42001:2023 Clause 8 to PEAC primitives, with cross-references to Clauses 6.1, 7.5, 9, 10, and Annex A. Every row cites a concrete PEAC artifact, a verification hint, an allowed coverage qualifier, and an explicit non-claim.
- `docs/compliance/EU-AI-ACT-ANNEX-IV-MAPPING.md` mapping Regulation (EU) 2024/1689 Annex IV points 1(a) through 5, with applicability context (entered into force 1 August 2024; applies from 2 August 2026, with exceptions under Article 113). Companion `docs/compliance/eu-ai-act.md` (articles view) carries a banner directing readers to the Annex IV mapping first.
- `scripts/verify-compliance-mappings.mjs`, wired into the docs-metadata CI lane and available as `pnpm verify:compliance-mappings`. Fails-closed on missing artifact-surface links, qualifiers outside the allowlist, non-claim openers outside the allowlist, supportive-qualifier rows missing operator-owned action language, rows missing a verification hint, rows missing a stable outward-facing artifact surface, broken cross-reference links, and claim-language matches in body text.
- `docs/TRUST-ARTIFACTS.md` gains a Compliance mappings section; `docs/SLO.md`, `docs/STABILITY-CONTRACT.md`, and `docs/THREAT_MODEL.md` cross-link the compliance index.
- `docs/HOSTED_VERIFY_CONTRACT.md` explicit authority statement: `packages/schema/openapi/verify.yaml` is the normative machine-readable contract (OpenAPI 3.1.1); `apps/api/openapi.yaml` is the app-level aligned spec; the Markdown is the prose restatement; `surfaces/reference-verifier/README.md` and `integrator-kits/` restate elements for integrators and are cross-checked by CI.
- `scripts/verify-openapi-drift.mjs` extended over five downstream surfaces (`docs/HOSTED_VERIFY_CONTRACT.md`, `surfaces/reference-verifier/README.md`, `integrator-kits/mcp/README.md`, `docs/MIGRATION_CURRENT.md`, `docs/diagrams/peac-proof-flow.mmd`). Historical wire identifiers may appear only with a nearby legitimizing marker. HTTP status codes in downstream tables must be declared by the OpenAPI `/v1/verify` or `/verify` response sets. Fenced code blocks are stripped before scanning. Companion `scripts/verify-openapi-drift.test.mjs` five-case test harness, available as `pnpm verify:openapi:drift:test`.
- `sdks/go/middleware/echo/`: thin Echo-compatible adapter over the core middleware. `type Config = middleware.Config`, `DefaultConfig()`, `Verifier()`, `RequireReceipt`, `OptionalReceipt`, `GetClaims`, `GetResult`, and `ClaimsContextKey` / `ResultContextKey`. Exposes the stdlib-compatible `func(http.Handler) http.Handler` that `echo.WrapMiddleware` accepts; carries no Echo dependency.
- `sdks/go/middleware/nethttp/`: net/http adapter with the same surface as the echo adapter.
- `sdks/go/middleware/paritytest/`: shared parity harness that imports chi, echo, and nethttp via `replace` directives and runs a shared request corpus against all three. Asserts identical status, selected response headers, and body bytes against the chi reference across `TestConfigAliasParity`, `TestDefaultConfigParity`, and `TestAdapterParity` (no-receipt required 401, no-receipt optional pass-through, malformed receipt 400 `E_INVALID_FORMAT`, case-insensitive `peac-receipt` header). Gin is covered by a scenario-equivalent suite in `sdks/go/middleware/gin/gin_test.go`.
- `packages/audit/src/commerce-bundle.ts`: observational `groupByLifecycle(records: LifecycleInputRecord[]): LifecycleBundle[]` export. Bucket keys are the exact `commerce_event` values each upstream attested; no lifecycle semantics are inferred. Records with absent, null, empty, or non-string events are routed to `UNCLASSIFIED_LIFECYCLE_BUCKET`. Deterministic ordering: within each bucket, `iat` ascending with `receipt_ref` lex tie-break; across the array, `session_ref` lex ascending. The `peac.commerce-bundle/0.1-experimental` version constant is carried on every bundle; public JSDoc marks the function `@experimental`.
- `sdks/go/bench/`: new Go module carrying the stable benchmark subset (`BenchmarkVerify_Stable_*` prefix). Three benchmarks cover JCS canonicalization of a flat claims object, JCS canonicalization of a nested object, and the combined JCS + SHA-256 hash path. `sdks/go/bench/baseline.json` ships with `baseline_pending: true`, routing the gate into measurement-only mode until the bench-gate workflow captures numbers on the target CI machine profile.
- `scripts/go-bench-gate.mjs`: runs the stable subset under `-count=10 -benchtime=200ms` and compares median ns/op to the committed baseline. Threshold bands: ratio at most 1.10x green; 1.10x to 1.25x warn (annotate, do not fail); above 1.25x and absolute breach above 50us fail. A fail blocks only when it reproduces in 2-of-3 consecutive runs; `--strict` forces a single-run fail to block. `--json` emits structured output including `median_ns_per_op`, `median_bytes_per_op`, and `median_allocs_per_op`. `--save-run` writes records to `sdks/go/bench/runs/`.
- `scripts/update-bench-baseline.mjs`: the only supported path to edit `baseline.json`; writes real medians for `ns_per_op`, `bytes_per_op`, and `allocs_per_op` from the gate's captured output.
- `.github/workflows/bench-gate.yml`: wires the gate for pull requests touching `sdks/go/**`, `scripts/go-bench-gate.mjs`, or the workflow itself, with a `workflow_dispatch` entrypoint (`mode=measure` or `mode=update-baseline`).
- `specs/conformance/parity-corpus/jcs-extended/`: six new RFC 8785 parity vectors (Unicode NFC / NFD boundary, nested depth-5 objects, zero vs negative zero, integer vs float with same value, control-character and quote / backslash escapes, UTF-16 surrogate pairs for non-BMP characters). Exercised by `packages/crypto/tests/jcs.parity-extended.test.ts` (TypeScript) and `sdks/go/jcs_parity_extended_test.go` (Go), asserting byte-identical output across both canonicalizers.
- `scripts/go-bench-gate.test.mjs` and `scripts/update-bench-baseline.test.mjs`: hermetic test harnesses driving the scripts against temp fixtures with `--fixture-output` / `--baseline` path overrides (no Go toolchain or live baseline required). Wired as `pnpm verify:go-bench-gate:test` and `pnpm verify:bench-baseline:test`.
- `.github/workflows/publish.yml`: `dist_tag` (auto / next / latest), `skip_release`, and `release_stage_1_mode` (draft / prerelease) exposed as `workflow_dispatch` inputs. A new `resolve_tag` preflight resolves the npm dist-tag in order: explicit input; tag prefix (v0.x to next; v1+ to latest); fallback next. Release candidate tags (`v0.x.y-rc.*`) always force next.
- `github_release_stage1` job: after `publish_prod` completes, creates or refreshes a GitHub Release at the tag. When `npm_tag == latest` (Mode 1), the release is finalized immediately. When `npm_tag == next` (Mode 2), it is staged as draft or prerelease per `release_stage_1_mode`; stage 2 finalization runs in `promote-latest.yml` after the `npm-production` environment approval. Release notes and titles are derived from `CHANGELOG.md` via `scripts/extract-changelog-entry.mjs`; title format is `vX.Y.Z - <theme>` or `vX.Y.Z` when the entry carries no prose summary.
- Stamp-only PR CI profile: `.github/workflows/ci.yml` `detect-changes` adds `stamp_any` and `non_stamp` outputs. A new `stamp-only-guard` job runs when `stamp_any == true && non_stamp == false` and calls `scripts/ci/check-stamp-only-pr.sh` to confirm every changed path is in the allowlist (`docs/releases/facts.json`, `docs/releases/current.json`, `REPO_SURFACE_STATUS.json`, `docs/SURFACE_STATUS.md`, `docs/PACKAGE_STATUS.md`).
- `scripts/verify-release-closeout.mjs`: post-release truth reconciler. Audits, for a given version and stage, npm `latest` dist-tag across every package in `scripts/publish-manifest.json`, npm `next` dist-tag (Mode 2 stages only), git tag existence and origin/main reachability, GitHub Release existence with the expected draft / prerelease state, `docs/releases/facts.json` release_date and dist_tag coherence, `docs/releases/current.json` version alignment, and `REPO_SURFACE_STATUS.json` updated-date freshness. Rows emit RED / YELLOW / GREEN with exit 0 when all GREEN; `--strict` fails on YELLOW; `--skip-remote` supports local validation; `--json` emits structured output. Wired into `.github/workflows/promote-latest.yml` as a post-promote step; available locally as `pnpm verify:release-closeout`.
- `docs/case-studies/`: artifact-centric external-proof case-study lane with admissibility rules (non-Originary external actor, reproducible public artifact, public verifiable link or signed record, named integration surface). `docs/case-studies/README.md`, `docs/case-studies/TEMPLATE.md`, and `docs/case-studies/distribution-submissions.md` track per-row submission state (`prepared` / `submitted` / `discoverable`) with reproducible artifact references.
- `docs/release-notes/v0.12.13.md`: per-release note complementing `CHANGELOG.md`; records the two-step `next` to `latest` release mode, post-release truth reconciler wiring, and a pointer to distribution-submissions.
- `docs/compatibility/go-middleware.md`: echo and nethttp rows added to the stability-classes table; new "Adapter parity contract" section naming the stdlib-shaped parity harness and the gin scenario-equivalent test suite; runnable integration snippets for both frameworks.

### Changed

- `docs/diagrams/peac-proof-flow.mmd`: the proof-flow diagram reflects `typ: interaction-record+jwt` on the primary verification path.
- `docs/MIGRATION_CURRENT.md`: canonical target is `/v1/verify`; `/api/v1/verify` is retained only as a deprecated alias.
- Refined wording across a small set of public docs for clarity and consistency; existing links and technical meaning preserved.

### Deferred

The following items are deferred to v0.13.0:

- Naming and terminology cleanup; legacy quarantine of `peac.receipt/0.9` off active surfaces.
- Scheduled removals: `ProofMethodSchema`, A2A v0.3.0 compatibility, legacy `/verify` teaching/OpenAPI surface (runtime alias preserved through Sunset), `sdk-js` workspace stub.
- v0.13.0 baseline snapshot (`docs/baselines/BASELINE-v0.13.0.md`), resource-limit spec (`docs/specs/RESOURCE-LIMITS.md`), and `docs/STANDARDS_LEDGER.md`.
- Package-surface reduction program with measurable gate.
- Hosted Issue GA decision.

## [0.12.12]

Docs, compatibility, and trust artifacts release. No wire format, schema, kernel, crypto, protocol public API, or normative behavior changes. Layer 4 + tooling + docs only.

### Added

- `REPO_SURFACE_STATUS.json` regenerated for v0.12.12; `docs/SURFACE_STATUS.md` and `docs/PACKAGE_STATUS.md` re-derived. `docs/COMPATIBILITY_MATRIX.md` refreshed with an adapter-readiness column and evidence tags per row.
- Machine-readable public-API contracts re-extracted under `contracts/api/` for `@peac/crypto`, `@peac/kernel`, `@peac/protocol`, and `@peac/schema`.
- Reference-verifier OpenAPI regenerated to OpenAPI 3.1.1 at `info.version: 0.12.12`: `application/interaction-record+jwt` example payloads, RFC 9457 Problem Details for error responses, documented receipt and extension size caps, RFC 9745 `Deprecation` and RFC 8594 `Sunset` headers on the legacy `/verify` route.
- CI drift gates wired in `.github/workflows/ci.yml`: `verify:contracts:drift`, `verify:surface-status`, `verify:openapi:drift`, `verify:trust-artifacts`, `verify:public-surface-names`.
- Role-based entry at `docs/START_HERE.md` promoted to the single front-door job selector; `docs/README_LONG.md` demoted with a banner to the deep guide.
- New operator mental-model docs: `docs/HOW-IT-WORKS.md`, `docs/ARTIFACTS.md`, `docs/WHERE-IT-FITS.md`, and `docs/WHAT-PEAC-STANDARDIZES.md`.
- Five outcome-led recipes under `docs/SOLUTIONS/`: `runtime-evidence-export.md`, `api-receipt-issuance.md`, `mcp-tool-call-receipts.md`, `commerce-evidence-bundle.md`, `regulatory-audit-trail.md`. Each recipe carries a Validated-with block pointing at concrete test and fixture paths.
- Reference-verifier deployment recipes under `surfaces/reference-verifier/`: `README.md`, `Dockerfile`, `docker-compose.yml`, Cloudflare Worker variant, and a `smoke.sh` CI harness.
- Four trust artifacts published: `docs/SLO.md` (with release-prep baseline stamps for `issue()`, `verifyLocal()`, reference-verifier `/v1/verify` with and without JWKS resolution, and MCP tool-call round-trip), `docs/BENCHMARK-METHODOLOGY.md`, `docs/STABILITY-CONTRACT.md` (every public surface classified), `docs/THREAT_MODEL.md` (every threat ID linked to a real test file and enforced by `scripts/verify-trust-artifacts.mjs`).
- Trust index at `docs/TRUST-ARTIFACTS.md`.
- Two tracked verifier scripts: `scripts/verify-trust-artifacts.mjs` (threat-model link integrity, stability-contract surface identifiers, no public links to gitignored paths) and `scripts/verify-public-surface-names.mjs` (retired filenames, paths, and label identifiers).
- Expanded root `SECURITY.md` as the canonical human-facing security policy (disclosure timeline, supported versions, supply-chain attestations, dependency-audit policy, external review cadence). `.github/SECURITY.md` aligned as a concise GitHub-facing mirror.

### Changed

- Two docs renamed for clearer public naming; `docs/ARCHITECTURE.md` security section trimmed to a one-paragraph summary with cross-links to the new trust artifacts.
- Root `package.json.description` aligned to the canonical short description; `llms.txt` review stamp refreshed.
- Broken internal link `specs/registries.json` corrected to `specs/kernel/registries.json` where referenced.
- Two references in `docs/specs/` replaced with public equivalents (threat-model pointer now targets the public consolidated doc; profile-rules pointer now targets the public profiles index and the Wire 0.2 extension spec).

### Deferred

The following items are deferred to v0.12.13:

- ISO 42001 Clause 8 control mapping.
- EU AI Act Annex IV transparency applicability mapping.
- External proof loop honest gate.
- Distribution follow-through: `mcpservers.org`, `mcp.so`, `awesome-mcp-servers`, Smithery remote, IDE marketplace acceptance windows.
- Echo and `net/http` Go middleware submodule adapters.
- Regression-aware Go benchmark gate with committed baseline; extended JCS parity expansion.
- Commerce lifecycle grouping export under `packages/audit/`.
- External audit prep scaffolding; Python SDK decision gate.

## [0.12.11]

### Added

- `@peac/adapter-core`: `assertExplicitFinality`, `MapperBoundaryError`, `isFinalityEvent`, `StrictnessMode`, and the stable mapper-boundary code `commerce.finality_synthesis_blocked`.
- `@peac/mappings-acp`: `fromACPDelegatedPaymentObservation()` with `artifact_kind` discriminator and a closed `observed_payment_state` enum.
- `@peac/mappings-paymentauth`: `fromMPPPaymentAttempt()` and `fromMPPSettlement()` with `artifact_kind` discriminator.
- `@peac/adapter-x402`: `extractSettlementProofFromHeaders()` (dual-header precedence: `PEAC-Receipt` > `PAYMENT-RESPONSE` > `X-PAYMENT-RESPONSE`) and `fromX402SettlementObservation()`.
- Go middleware: `Logger` and `Metrics` interfaces with no-op defaults; panic recovery; bounded token-bucket rate limiter with `MaxEntries` cap and `IdleTTL` eviction (strategies: `global`, `per_ip`, `per_issuer`); `RequestTimeout`; `MaxBodyBytes`; opt-in `TrustProxyHeaders`.
- CLI: `peac doctor` offline-default installability diagnostics with opt-in `--online --issuer <url>` remote checks.
- Offline single-file verify dashboard at `tools/verify-dashboard/index.html`.
- IDE plugin packs under `surfaces/plugin-pack/{cursor,codex,claude-code,vscode}/` with pinned `@peac/mcp-server@0.12.11` configs, offline sample receipts, and per-pack smoke harnesses.
- Smithery canonical config pinned at `packages/mcp-server/smithery.yaml`.
- GitHub Copilot enterprise registry compatibility checker at `scripts/check-copilot-compatibility.mjs`.
- Listing-copy coherence guard at `scripts/check-listing-copy-coherence.mjs`, wired into `scripts/verify-distribution.mjs` as check #16.
- Runnable commerce examples: `examples/x402-upto-evidence/`, `examples/acp-delegated-checkout/`, `examples/mpp-payment-attempt/`.
- Conformance Section 26 commerce fixtures (20 vectors + manifest) across `commerce/`, `commerce/acp-delegated-payment/` (11), `commerce/paymentauth/` (6), and `commerce/x402/` (5).
- Docs: `docs/compatibility/commerce-protocol-coverage.md`, `docs/compatibility/core-use-case-coverage.md`, `docs/compatibility/go-middleware.md`, `docs/profiles/acp-delegated-payment.md`, `docs/profiles/mpp-payment-evidence.md`, `docs/guides/{cursor,codex,claude-code,vscode,smithery-remote-mcp,copilot-enterprise-registry,marketplace-publishing,verify-dashboard}-*.md`, `docs/specs/X402-V2-PROFILE.md` Section 8.

### Changed

- `@peac/adapter-core` package description and README updated to cover commerce mappings in addition to payment rail adapters.
- `docs/specs/COMMERCE-EVIDENCE.md` cross-references the v0.12.11 ACP, MPP / paymentauth, and x402 settlement surfaces.
- `packages/mcp-server/smithery.yaml` pins an exact `@peac/mcp-server` version; `scripts/validate-smithery.mjs` accepts both unpinned and pinned forms.
- Go middleware `DefaultConfig()` sets `RecoverPanics: true`, `MaxBodyBytes: 1 MiB`, `TrustProxyHeaders: false`.
- Build targets: 105 (was 102).

### Deferred

- `event_source` discriminant on `CommerceExtensionSchema`.
- `commerce-session` kernel type URI registration.
- Commerce lifecycle grouping export.
- `mcpservers.org`, `mcp.so`, and `awesome-mcp-servers` listings.
- Python SDK.
- OPA / Rego export bridge.
- Echo and `net/http` Go middleware submodule adapters.
- Regression-aware Go benchmark gate with committed baseline.
- Extended JCS parity test expansion.
- TypeDoc + PageFind searchable API reference build pipeline.

## [0.12.10]

### Added

- **`@peac/adapter-runtime-governance`**: new Layer 4 runtime-governance adapter. Generic surface with AGT as first mapper. 6 observation-specific type URIs under `org.peacprotocol/runtime-governance-*` (`policy-decision`, `audit-entry`, `authority-scope`, `lifecycle-event`, `trust-observation`, `compliance-observation`). Discriminated union payload model with per-family validation, explicit extension builders, preserved upstream artifact block. Zero vendor SDK dependencies. 56 tests
- **Runtime-Governance Profile spec** (`docs/specs/RUNTIME-GOVERNANCE-PROFILE.md`): documentary overlay defining how governance records map to PEAC primitives. 6 record categories, preserved upstream artifact block, anti-pattern rules, CloudEvents compatibility, cryptographic diversity acknowledgment
- **Runtime governance coverage matrix** (`docs/compatibility/runtime-governance-coverage.md`): 3 truth surfaces (upstream AGT architecture, PEAC adapter coverage, verified interoperability) with control-plane vs records-plane framing
- **Hosted verify record profile detection**: registry-driven `detectRecordProfile()` in standalone module. `record_profile` metadata in extended reports for recognized type URI prefixes
- **Conformance Section 27**: 7 runtime-governance requirement IDs for observable emitted-record semantics: RTGOV-001 (evidence kind), RTGOV-002 (type URI prefix), RTGOV-003 (extension namespace), RTGOV-004 (provider presence), RTGOV-005 (upstream opacity), RTGOV-006 (no trust derivation), RTGOV-007 (observational compliance only)
- **Runtime-governance example suite** (`examples/runtime-governance-records/`): runnable demo with pinned AGT-shaped fixtures, real SHA-256 digests, deterministic session summary, gate script
- **Benchmark SLO publication**: machine-readable performance targets with regression-based gate. Measured regression gate for `verifyLocal` (p95 baseline from perf-results.json). `issue()` target documented; measured baseline pending
- **Managed-runtime positioning doctrine** (`docs/architecture/`): anti-absorption checklist, adapter packaging rules, complement-not-compete framing

### Changed

- 37 packages (was 36; +`@peac/adapter-runtime-governance`)
- 224 conformance requirement IDs across 25 sections (was 217 across 24)
- 7392 tests across 296 files (was 7336 across 290)
- Manifest invariant checker updated: `pendingTrustedPublishing` and `deferredTrustedPublishing` entries satisfy the OIDC coverage requirement
- Package path resolver updated for nested adapters directory

### Deferred

- Live AGT v3.1.0 runtime integration test: v0.12.11
- OpenAPI schema update for `record_profile`: v0.12.11
- PEAC PQC (ML-DSA-65) signing: v1.0+
- Claude Managed Agents adapter updates: v0.12.11
- Go middleware hardening: v0.12.11
- ACP/MPP/x402 commerce record bridges: v0.12.11
- EU AI Act Annex IV mapping: v0.12.12
- ISO 42001 Clause 8 mapping: v0.12.12

## [0.12.9]

### Added

- **`@peac/adapter-managed-agents`**: new Layer 4 adapter for managed agent runtime event export. Six event families (session lifecycle, task submission, tool use, MCP invocation, permission confirmation, outcome evaluation), reverse-DNS type URIs under `org.peacprotocol/managed-agent-*`, vendor-neutral (caller-supplied `provider` string), zero runtime vendor SDK dependencies, decode-only `buildSessionSummary()`
- **Reference verifier content negotiation** (`POST /v1/verify`): three response formats via `Accept` header: `application/json` (byte-identical to v0.12.8 default), `application/peac-report+json` (extended report with `report_id`, `verified_at`, `duration_ms`, `key_resolution`, `failure_reasons`), and `text/plain` (human-readable summary). `PEAC-Report-Id` header (UUID v4) on every response. OpenAPI 3.1 spec updated with `ExtendedVerifyReport` and `FailureReason` schemas. Shared `deterministicStringify` extracted from `verify-v1.ts` and `hosted-issue.ts`. Drift test gate prevents spec/code divergence
- **Reference issuer health probe** (`GET /v1/issuer-health`): query-parameter API (`?issuer=<url>`), SSRF-safe via shared `@peac/jwks-cache` `validateUrl()` and `isMetadataIp()`, independent rate limiter (10 req/min per IP, isolated from verify limiter), cache key canonicalization (lowercase scheme/host, trailing-slash normalization, port preservation), 60-second cache TTL, probes `/.well-known/peac-issuer.json` reachability, `jwks_uri` from discovery, and Ed25519 key count; never returns 5xx for reachable probe targets
- **MCP Streamable HTTP quickstart** (`examples/mcp-http-quickstart/`): end-to-end `stdio` and `streamable-http` transport example with merge-blocking gate script (`scripts/verify-mcp-quickstart.sh`) that boots the local workspace `@peac/mcp-server` on HTTP, initializes a JSON-RPC session, propagates `Mcp-Session-Id`, and asserts `peac_verify` over HTTP succeeds. Local fallback is not accepted as proof. `packages/mcp-server/server.json` now declares both `stdio` and `streamable-http` transports with the required `url` field per MCP Registry schema 2025-12-11
- **RFC 9728 Protected Resource Metadata strict compliance tests**: 5 new tests under `packages/mcp-server/tests/http/` verifying `Content-Type: application/json`, exact field-count (only `resource` and `authorization_servers`), multiple authorization server serialization, non-HTTPS non-loopback rejection (404), and HTTP loopback allowance for development ergonomics
- **External pilot kit** (`examples/external-pilot/`, `docs/pilots/PILOT_KIT.md`): self-contained pilot kit for independent external organizations, runtime-generated Ed25519 keypair, signed Interaction Record, local and reference-verifier verification paths via `--verifier-url`, deterministic inspectable JSON artifact, formal JSON Schema (draft-07) validation via ajv + ajv-formats, golden snapshot, and merge-blocking engineering gate (`scripts/verify-pilot-output.sh`) that fails on schema drift or private-key leakage
- **Builder-first conformance registration**: formally register 25 previously pending requirement IDs (6 namespaces: `X402V2-*`, `DID-RES-*`, `GRPC-META-*`, `PKCE-*`, `RURL-*`, `SC-*`). Total requirement IDs: 192 -> **217** across 18 -> **24** sections. New `scripts/conformance/build-extension-registry.mjs` as the formal canonical source of truth for all non-WIRE02 requirements. Main builder composes WIRE02 and extension sources into `requirement-ids.json`. Zero temporary registration exemptions remain. `tests/conformance/registry-composition.spec.ts` enforces composition parity
- **Non-WIRE02 annotation ledger**: `specs/conformance/non-wire02-annotation-ledger.md` tracks each remaining governing-spec annotation on a per-ID basis. Hash integrity is blocking for all 217 IDs; non-WIRE02 spec-presence is advisory and bounded by the ledger
- **x402 scheme coverage clarification**: `Section 3.0 Payment Schemes` added to `docs/specs/X402-PROFILE.md` stating the adapter's scheme-agnostic posture for both `exact` and `upto`. New `docs/compatibility/x402-scheme-coverage.md` compatibility doc keeping three truth surfaces explicitly distinct (upstream x402 protocol, upstream facilitator surfaces, PEAC-tested). Two new conformance fixtures (`upto-valid-evm-eip712.json`, `upto-scheme-mismatch.json`) plus 8 new overclaim-guard tests in `packages/adapters/x402/tests/upto-scope.test.ts` asserting scheme is term-matched as a byte-equal required string and never interpreted for scheme-specific invariants (single-use, time bounds, recipient binding, facilitator binding, max-vs-actual settlement correctness). Guide section renamed from `Supported Networks (CAIP-2)` to `Common CAIP-2 identifiers`; non-canonical `solana:mainnet` / `solana:devnet` labels replaced with canonical CAIP-2 genesis-hash identifiers (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`, `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`); Polygon Mainnet added
- **Public doc wording sweep**: removed stale stubs, marketing phrasing, and forward-looking planning language from public docs. `docs/ROADMAP.md` rewritten to a minimal meta surface. `docs/api/README.md`, `docs/guides/README.md`, `docs/architecture/README.md`, `docs/security/README.md` collapsed to real-content indexes. `docs/HOSTED_VERIFY_CONTRACT.md` status updated from design artifact to stable contract. `docs/VERIFY-RELEASE.md` stale preview references removed
- **Release-state stamping script** (`scripts/stamp-release-state.mjs`): deterministic, idempotent, testable script for stamping mutable release metadata (`release_date`, `updated`, `dist_tag`) post-tag and post-promotion. Supports `--publish`, `--promote`, `--dry-run`, and `--check --mode` modes. Exposed via `pnpm release:stamp:publish`, `pnpm release:stamp:promote`, `pnpm release:stamp:check:publish`, and `pnpm release:stamp:check:promote`. Covered by 13 smoke tests in `tests/scripts/stamp-release-state.test.ts`. `docs/RELEASING.md` release checklist updated with explicit post-tag (step 8) and post-promotion (step 10) stamping commands using the `release-state/vX.Y.Z-publish` and `release-state/vX.Y.Z-promote` micro-PR branch naming convention

### Changed

- `REPO_SURFACE_STATUS.json` version 0.12.8 -> 0.12.9; `published_packages: 35 -> 36` (new `@peac/adapter-managed-agents`)
- Conformance matrix regenerated with 217 requirement IDs across 24 sections
- x402 conformance fixture manifest version 0.12.7 -> 0.12.9
- Security audit allowlist: added `GHSA-q4gf-8mx6-v5v3` (next.js Server Components DoS, dev-only via `surfaces/nextjs`, 90-day expiry)

### Security

- **hono 4.12.12 and @hono/node-server 1.19.13** (from 4.12.7 / 1.19.11): covers 5 moderate hono CVEs plus `GHSA-92pp-h63x-v22m`. `pnpm.overrides` enforces the minimums across transitive paths
- Issuer health probe uses `fetch` with `redirect: 'error'` to prevent SSRF via redirect chains to private IPs or cloud-metadata endpoints

### Deferred

- Reference verifier exporter scheme-label additions for x402: deferred to a future release to avoid touching PR #628's freshly-merged content-negotiation schema
- SVM `upto` scheme support: upstream RFC [x402-foundation/x402#1642](https://github.com/x402-foundation/x402/issues/1642) unresolved
- Commerce-lifecycle mapping, max-vs-actual delta audit, reserve/lock evidence: tracked for a future release
- Facilitator attestation handling: upstream RFC [#1921](https://github.com/x402-foundation/x402/issues/1921) open
- Payment Identifier extension, gas sponsoring, Bazaar discovery, SIWX: tracked for a future release
- Runnable `x402-upto-evidence` example: deferred to a follow-up PR to avoid pre-release truth-surface drift

## [0.12.8]

### Added

- **Hosted Verify API** (`POST /v1/verify`): deterministic DD-210 verification reports, RFC 9457 problem-detail error reporting, OpenAPI 3.1 spec, threat-to-test traceability matrix, opt-in issuer discovery (DD-211)
- **Hosted Issue alpha** (`POST /v1/issue`): provisional BYO-key endpoint, disabled by default (sensitive-key transit model), canonical pillar validation, byte-level size enforcement (DD-212)
- **Go SDK Interaction Record parity**: `Issue()` and `VerifyLocal()` for current stable format, RFC 8785 JCS with byte-identical cross-language parity (22 golden vectors), JOSE hardening, policy binding, trailing-input rejection (DD-209)
- **Cursor and Codex installability packaging**: `@peac/kernel` tarball hygiene fix, shared install validation script, Codex MCP config
- **Smithery packaging validation**: real YAML parsing, sandboxed commandFunction evaluation, wired into `verify:distribution`
- **Python API-first examples**: httpx-based verification (Python 3.12+), Express middleware quickstart
- **Managed Agents session evidence summary demo**: 6 event families mapped to Interaction Record types

### Changed

- Go SDK rewritten for Interaction Record format (`interaction-record+jwt`); Wire 0.1 types removed
- Go modules upgraded: `go 1.26`, `gin v1.12.0`, `golang.org/x/crypto v0.48.0`, `golangci-lint v2.9.0`
- `typecheck:apps` now fully blocking in CI (ambient `@peac/core` declarations)
- `bump-version.mjs` no longer overwrites conformance fixture version fields
- Contract error codes aligned with kernel-canonical names
- `E_PAYLOAD_TOO_LARGE` added to kernel error taxonomy
- `DefaultReceiptTyp` in Go JWS now points to `interaction-record+jwt`
- Perf SLO threshold relaxed to 15ms p95 for CI stability (10ms production target)

### Breaking (Go SDK)

The Go SDK core types and functions have been rewritten for the Interaction Record format. Wire 0.1 types (`PEACReceiptClaims`, `PaymentEvidence`) and functions (legacy `Issue()`, `Verify()`) have been replaced. The `jwks`, `evidence`, and `jws` packages are preserved. The `policy` package is deprecated.

### Known Limitations

- Conformance coverage gate passes with a temporary pending-registration exemption for 25 historical requirement IDs from v0.12.6/v0.12.7 features (DID resolution, gRPC, PKCE, receipt-url, supply-chain, x402-v2); formal registry registration is deferred to a follow-up cleanup
- Perf CI gate stabilized: verifyLocal warmup increased to 50 iterations and CI p95 threshold relaxed from 10ms to 15ms for CI variance stability; 10ms remains the production profiling target
- Hosted Issue is a sensitive-key transit model; disabled by default; provisional surface

### Deferred

- Full Python SDK: v0.12.9+ decision gate
- Go middleware hardening: v0.12.9
- `@peac/adapter-anthropic-managed-agents`: v0.12.9 (productized from v0.12.8 sidecar demo)
- `@peac/mappings-opa`: v0.12.9
- Hosted Issue GA (non-provisional): v0.13.0
- Formal conformance registry registration for 25 pending IDs: v0.12.9

## [0.12.7]

Coherence, trust, and installability release. No new protocol surface.

### Added

- `pnpm verify:distribution`: distribution surface verification gate with tarball packaging smoke (44 checks)
- `pnpm verify:release`: release facts verification gate (22 checks)
- `pnpm verify:docs-examples`: documentation code block type-checking
- `docs/releases/facts.json`: canonical source of truth for release metrics
- `docs/ENTERPRISE_TRUST_POSTURE.md`: key custody, tenancy, procurement posture
- `docs/SECURITY_POSTURE.md`: support windows, provenance, logging boundaries, tenant isolation
- `docs/REFERENCE_ARCHITECTURES.md`: API gateway, MCP tool-call, and A2A handoff evidence flows
- `docs/WHEN_NOT_TO_USE_PEAC.md`: guidance on when PEAC is the wrong tool
- `docs/COMPATIBILITY_MATRIX.md`: wire format, runtime, and SDK support matrix
- `docs/MIGRATION_CURRENT.md`: Wire 0.1 to 0.2 migration guide
- `docs/DEPRECATION_POLICY.md`: surface lifecycle, support windows, HTTP deprecation headers
- `docs/STANDARDS_COMPLIANCE.md`: 16 standards mapped to PEAC surfaces
- `docs/SUPPORTED_ENVIRONMENTS.md`: Node.js, Go, Python, browser support status
- `docs/HOSTED_VERIFY_CONTRACT.md`: Hosted Verify API design artifact (DD-210)
- `REPO_SURFACE_STATUS.json`: machine-readable surface classification (74 surfaces)
- Coherence gate: 9 blocking checks in `verify:spec-drift`

### Changed

- Legacy Wire 0.1 defaults quarantined across 12 spec and guide files
- `@peac/sdk` (`sdk-js`) and `apps/bridge` archived
- Legacy `/verify` compatibility path: RFC 8594 Sunset and Deprecation headers added
- `examples/wire-02-minimal` renamed to `examples/minimal`
- x402 upstream references migrated to `x402-foundation/x402`
- GitHub Actions: all tracked workflows pinned to immutable commit SHAs
- Security policy: supported versions updated to 0.12.x only

### Status transitions

- `@peac/sdk` (`sdk-js`): supported -> archived
- `apps/bridge`: supported -> archived
- `@peac/core`: supported -> deprecated (removal: v0.13.0)
- `/verify` API endpoint: supported -> deprecated (removal: v0.13.0 or Nov 1 2026)

---

## [0.12.6]

x402 V2 support, DID resolution, A2A OAuth, gRPC transport, receipt URL middleware, and supply-chain provenance mappings.

### Added

- `@peac/adapter-did`: did:key and did:web resolution with caching
- `@peac/transport-grpc`: gRPC carrier adapter (8 KiB metadata default)
- `@peac/mappings-intoto`: in-toto v1.0 provenance mapping
- `@peac/mappings-slsa`: SLSA v1.2 provenance mapping
- A2A v1.0 OAuth surface: PKCE S256, Device Code types, auth evidence mapping
- x402 V2 transport: version detection, normalization, mapping, verification
- Receipt URL resolution middleware in `@peac/net-node`
- `receipt_ref` span attribute in `@peac/telemetry-otel`
- ERC-8128 conformance fixtures (RFC 9421)
- Spec profiles: x402 V2, DID resolution, A2A auth, gRPC transport
- Evidence carrier contract: gRPC transport section
- Registries v0.6.0: error codes, gRPC transport, supply-chain proof types

### Fixed

- gRPC `addReceiptToMetadata()` defaults to Wire 0.2 receipt type
- Registry drift checker supports multi-spec requirement entries

### Changed

- x402 V2 opt-in only (`supportedVersions` defaults to `[1]`)
- gRPC carrier size: 8 KiB default (HTTP/2 header budget)
- CI: 5 parallel lanes, Node 24.14.1, MCP SDK 1.28.0

---

## [0.12.4]

### Theme: Commerce Evidence + Integration Depth

PEAC as the neutral portable evidence layer across paymentauth/MPP, ACP, x402, Stripe SPT, and UCP.

### Added

- `@peac/mappings-paymentauth` (DD-191): new Layer 4 package for HTTP Payment authentication scheme envelope parsing, evidence mapping, and carrier adapter
- `paymentauth` payment rail registration (DD-190): informational registry entry for `draft-ryan-httpauth-payment`
- x402 v2 dual-header read compatibility (DD-193): PEAC-Receipt > PAYMENT-RESPONSE (v2) > X-PAYMENT-RESPONSE (v1)
- ACP session lifecycle evidence (DD-188): session states produce access evidence; commerce evidence only from explicit payment artifacts with `observed_payment_state`
- Stripe SPT delegated payment evidence: delegation-specific vocabulary (`delegated_payment_granted/presented/deactivated`); `fromStripePaymentIntentObservation()` for commerce events
- UCP order-vs-payment semantic separation (DD-187): `UcpPaymentState`, `payment_state_source` marker for derived vs explicit
- Experimental commerce evidence bundle (DD-192) in `@peac/audit`: non-aggregating cross-ecosystem correlation
- Commerce pillar profile (`docs/profiles/commerce.md`)
- Commerce evidence boundary spec (`docs/specs/COMMERCE-EVIDENCE.md`)
- Commerce semantics spec (`docs/specs/COMMERCE-SEMANTICS.md`): canonical vocabulary for observed vs derived payment state, delegation vs finality, carrier vs upstream artifacts
- Integration kits: paymentauth, ACP, x402 (populated from placeholders)
- 6 runnable commerce examples with deterministic output
- `pnpm verify:examples-commerce` smoke target
- 21 cross-package commerce boundary conformance tests
- Shared Stripe metadata sanitization helper (`metadata.ts`)

### Fixed

- flatted prototype pollution (GHSA-rf6f-7fwh-wjgh): pin to 3.4.2
- Dynamic error category derivation from generated file (no more hardcoded list)
- Recursive stable serialization for commerce bundles
- Injectable `created_at` for deterministic bundle output

### Changed

- MCP server version constant updated from 0.11.2 to 0.12.4
- 91 build targets (was 84)
- 6664 tests (was 6443)
- 361 conformance tests (was 340)
- 29 packages in publish manifest (was 28)

### Deferred

- `@peac/adapter-did`: deferred to v0.12.6
- x402 V2 full adapter rewrite: deferred to v0.12.6
- Go/Python SDK: deferred to v0.12.6 (gated on external signal)
- A2A v1.0 OAuth PKCE, A2A v1.0 gRPC binding: deferred to v0.12.6

## [0.12.5]

### Theme: Commerce Hardening + Interop Proofs

Cross-rail conformance parity, settlement semantic equivalence, and naming truth cleanup.

### Added

- Execution-backed commerce rail conformance fixtures: 40 vectors across paymentauth, ACP, Stripe SPT, and UCP (3 valid, 4 invalid, 2 edge, 1 security per rail)
- Registry-derived commerce coverage gate (`check-commerce-coverage.mjs`): enforces minimum vector floor per rail, derived from `registries.json`
- Cross-rail settlement semantic equivalence test: one deterministic payment scenario ($25.00 USD settled) mapped through all 5 commerce rails
- Asymmetric safety invariant: delegation/lifecycle/provisioning functions must not emit settlement-like commerce events
- `isValidAmountMinor()` and `AmountMinorStringSchema` in `@peac/schema`: validate-and-reject utility with shared source of truth
- Commerce integration matrix (`docs/specs/COMMERCE-INTEGRATION-MATRIX.md`) with upstream compatibility table
- Paymentauth carrier roundtrip conformance test (attach, extract, coexistence)
- Stripe out-of-order observation race test (authorization vs settlement ordering)
- `verify:commerce-coverage` script in root package.json
- Commerce coverage check wired into `gate.sh`

### Changed

- README: `paymentauth/MPP` to `paymentauth`; Agentic Commerce Protocol (ACP) expanded on first mention
- Commerce evidence spec: paymentauth naming clarification (code/registry term vs ecosystem prose)
- Commerce semantics spec: added cross-rail invariants section with equivalence and asymmetric safety prose
- Commerce profile: removed internal shorthand from event field description
- 6915 tests (was 6664)
- 92 build targets (was 91)

### Fixed

- Fixture `spec_revision` pinned to `draft-ryan-httpauth-payment-01` (active Internet-Draft)
- `intent_spec_revision` marked provisional (not publicly listed on datatracker.ietf.org)

### Deferred

- `@peac/adapter-did`: deferred to v0.12.6
- x402 V2 full adapter rewrite: deferred to v0.12.6

## [Unreleased]

## [0.12.3]

### Added

- A2A v1 compatibility helpers for agent cards and task states
- AIPREF version constants
- Start Here guide and evaluator quickstarts (API Provider, Agent Operator)
- Common use cases section in README

### Changed

- Expanded A2A and MCP integration guides
- Updated registry-facing metadata and listing copy
- Synced workspace and conformance metadata to 0.12.3
- Expanded bare "ACP" to "Agentic Commerce Protocol (ACP)" across docs and fixtures
- Updated AIPREF draft references from vocab-03 to vocab-05

### Deferred

- UCP order-vs-payment semantic separation: v0.12.4
- ACP checkout-vs-payment split: v0.12.4
- x402 V2 delta audit: v0.12.4
- A2A v0.3.0 type removal: v0.13.0

## [0.12.2]

### Profile-Defined Types and Extension Groups

Completes the 12-group typed extension surface for Wire 0.2 interaction records,
adds type-to-extension enforcement at verification time, ships 9 pillar usage
profiles, and introduces shared protocol-grade validators.

### Added

- **7 new extension groups** (#519, #520, #521): consent, compliance, privacy, safety, provenance, attribution, purpose
- **Shared validator helpers** (#518): SHA-256 digest, HTTPS URI hint (SSRF-hardened), ISO 8601 duration (parser-grade), ISO 8601 date, SPDX 3.0.1 license expression parser
- **Type-to-extension enforcement** (#522): strict mode requires mapped extension group for registered types; interop mode downgrades to warnings
- **Byte-budget controls** (#518): per-group 64 KB, total 256 KB, per-array 32 KB limits with browser-safe UTF-8 measurement
- **9 pillar usage profiles** (#525): access, identity, consent, privacy, safety, compliance, provenance, attribution, purpose
- **Commerce event field** (#526): 6-value closed enum (observational metadata only)
- **ProofMethodSchema deprecation** (#526): transport-binding alias preserved through v0.12.x; remove-not-before v0.13.0
- **AST no-network audit** (#527): static analysis confirming `@peac/schema` has zero I/O call sites
- **API contract extraction** (#527): extracted API surface artifacts at `contracts/api/`
- **Extension regression benchmarks** (#528): strict-mode enforcement benchmarks and byte-budget boundary coverage
- **Registry codegen** (#518): `registries.generated.ts` from `registries.json` with deterministic output
- **Subject record terminology** (#518): `SubjectRecord` canonical; `SubjectProfile` kept as deprecated alias

### Changed

- Extension groups: 12 total (was 5); all 10 receipt types now have non-null `extension_group`
- Warning codes: 6 total (was 4): added `extension_group_missing`, `extension_group_mismatch`
- Error codes: 4 new (`E_EXTENSION_SIZE_EXCEEDED`, `E_EXTENSION_NON_JSON_VALUE`, `E_EXTENSION_GROUP_REQUIRED`, `E_EXTENSION_GROUP_MISMATCH`)
- Node CI matrix: Node 24 (canonical) + Node 22 (compat) + Node 25 (forward-compat)

### Deferred

- `@peac/adapter-did` (DID resolution): v0.12.3
- Wire 0.2 adoption across A2A/ACP (Agentic Commerce Protocol)/UCP mappings: v0.12.3
- Commerce events vocabulary expansion: v0.12.3+
- Profile capability signaling: v0.12.3+

## [0.12.1]

### x402 Upstream Wire Sync

Aligns `@peac/adapter-x402` with the current x402 offer-receipt extension wire shapes (upstream PR #935, commit `f2bbb5c`).

### Added

- **Upstream wire types and extraction** (#511, DD-169, DD-170, DD-171)
  - `raw.ts`: exact upstream wire mirror (Layer A) with discriminated JWS/EIP-712 unions
  - `normalize.ts`: EIP-712 placeholder normalization (Layer B): `validUntil: 0` to undefined, `transaction: ""` to undefined
  - Hardened JWS compact serialization parser: 3-segment check, no padding, size limit (64 KiB), object root only
  - `extractOfferPayload()` / `extractReceiptPayload()` / `extractExtensionInfo()` helpers
- **Verification layering** (#511, DD-172)
  - `verifyReceipt()`: receipt semantic verification (version, payer, issuedAt recency, network)
  - `verifyOfferReceiptConsistency()`: offer-receipt consistency (resourceUrl, network matching)
  - Closed-policy enums: `offerExpiryPolicy`, `signatureVerificationPolicy`, `signerAuthorizationPolicy`
  - `CryptoVerifier` and `SignerAuthorizer` opt-in interfaces
  - Network-aware address comparison via `AddressComparator` (EVM case-insensitive, exact otherwise)
- **Conformance expansion** (#512)
  - 35 conformance vectors (was 19): offer, receipt, consistency, JWS hardening, EIP-712 placeholder
  - Explicit fixture `kind` routing and metadata validation
  - 8 direct mapping and proof-preservation tests
- **Upstream compatibility CI**
  - Vendored type snapshot pinned to upstream commit `f2bbb5c`
  - Lane 1: parity tests in conformance suite (runs on every PR)
  - Lane 2: weekly drift detection workflow against upstream HEAD

### Changed

- **Profile identifier**: `peac-x402-offer-receipt/0.2` (was `0.1`)
- **`OfferPayload.version`**: `number` (was `string`)
- **`OfferPayload.resourceUrl`**: added (required)
- **`OfferPayload.scheme`**: required (was optional)
- **`OfferPayload.settlement`**: removed
- **`ReceiptPayload`**: restructured to `resourceUrl/payer/issuedAt/transaction?` (was `txHash` with optional `asset/amount/payTo`)
- **`SignedOffer`/`SignedReceipt`**: discriminated union by `format` (JWS: no `payload` field; EIP-712: has `payload`)
- **`X402PaymentRequired`**: renamed to `X402OfferReceiptChallenge`, single `offer` became `offers[]`
- **`acceptIndex`**: moved from top-level to per-offer on `SignedOffer`
- **`X402AdapterConfig.supportedVersions`**: `number[]` (was `string[]`)
- **Evidence model**: `txHash` replaced by optional `transaction`; added `resourceUrl`, `payer`, `issuedAt`
- **Verification API**: `verifyOffer` + `verifyReceipt` + `verifyOfferReceiptConsistency` (was `verifyOffer` only)

### Design Decisions

- DD-169: Upstream payment extension wire alignment (exact field names and types at wire layer)
- DD-170: Discriminated signed artifact unions (JWS/EIP-712 format dispatch)
- DD-171: Four-layer adapter architecture (raw wire, encoded payload, semantic, mapped)
- DD-172: Verification layering with opt-in crypto (5-layer API, closed-policy enums)

### Migration

See `docs/guides/x402-migration-0.12.1.md` for field-by-field migration guidance.

## [0.12.0]

### Interaction Record Format 0.2 (Stable)

v0.12.0 promotes Wire 0.2 (`interaction-record+jwt`) from preview to stable on
the `latest` dist-tag. This release contains no new protocol features beyond
preview.2; it adds proof of correctness, security, and performance through
conformance expansion, property-based testing, fuzzing, benchmarks, SSRF
hardening, API surface locking, and adoption evidence.

Wire 0.2 is the next generation of the PEAC receipt format: 2 structural kinds
(`evidence`, `challenge`), open semantic `type` with 10-pillar taxonomy, 5 typed
extension groups, JCS policy binding, JOSE hardening, and dual-stack
strict/interop verification. See preview.1 and preview.2 entries below for the
full Wire 0.2 feature set.

### Added (Stable-Only)

- **Conformance Expansion** (#477, DD-164, DD-167)
  - 146 normative requirement IDs (BCP 14, RFC 8174) across 18 spec sections
  - Machine-readable registry `specs/conformance/requirement-ids.json` with source fragment hashing for drift detection
  - Per-requirement `enforcement_class`: `hard_fail`, `warning_only`, `routing`, `issuance`, `advisory`
  - 618+ conformance fixtures (173 with requirement metadata)
  - Generated `CONFORMANCE-MATRIX.md` from registry, fixtures, and test-mappings
  - Section 19 validation-order tests proving step precedence
  - 7 conformance scripts (core, registry, inventory, matrix, schemas, drift, backfill)
  - Guard script integration (coverage, inventory freshness, registry drift)
- **Property and Fuzz Tests** (#478, DD-158)
  - 12+ property tests across schema, crypto, protocol, policy, strictness (fast-check 4.5.3)
  - Zero-crash guarantee on 1000 iterations per property
  - `verifyLocal()` default-strict proven by property test
  - Deferred conformance fixtures for sections 13-16 (challenge, warnings, dual-stack, strictness)
  - `fuzz-suite` gate wired in `run-gates.sh`
- **Performance Benchmarks** (#480, DD-159)
  - Vitest bench suite for Wire 0.2 issuance, verification, and policy binding
  - Baseline results with Node 24.13.0
  - `perf-benchmarks` gate wired in `run-gates.sh`
- **SSRF and Security Hardening** (#479, DD-160)
  - Expanded SSRF test vectors for `@peac/net-node` `safeFetch()`
  - Security posture documentation
  - `ssrf-suite` gate wired in `run-gates.sh`
- **Package Surface Audit** (#482, DD-162, DD-163)
  - API surface lock for 9 critical packages (snapshot-based contract tests)
  - Pack-install smoke tests for 6 packages (ESM + CJS + types resolution)
  - `api-surface-lock` and `pack-install-smoke` gates wired
- **Doc-Example Execution Gate** (#481, DD-163)
  - Automated validation of code examples in 5 spec documents (25 blocks, 19 validated)
  - 10 unit tests for doc-example validator
- **DD-90 Stable Gates and Adoption Evidence** (#489)
  - All 6 DD-90 gates wired (zero stubs): `perf-benchmarks`, `ssrf-suite`, `fuzz-suite`, `adoption-evidence`, `pack-install-smoke`, `api-surface-lock`
  - Adoption evidence catalog: `docs/adoption/integration-evidence.json` with JSON Schema validation
  - Integration evidence validator (`scripts/release/validate-adoption-evidence.mjs`)
  - Markdown parity check for `integration-evidence.md`
  - 3 integrations cataloged: MCP (DD-90), A2A (DD-90), EAT (non-DD-90, DD-154)
- **OIDC Trusted Publishing** (#490)
  - 45 packages configured for OIDC trusted publishing via `npm trust`
  - `publish-manifest.json` restructured: `oidcConfigured` (45), `deferredTrustedPublishing` (2: net-node, adapter-eat)
  - Invariant checker CI gate for OIDC configuration

### Changed

- **dist-tag:** promotes v0.12.0 to `latest` (from v0.11.3)
- **API:** `issue()` restored as canonical issuance entry point (thin alias over `issueWire02()`); the preview.2 deprecation is reversed
- **Node.js baseline:** Node 24 Active LTS canonical for benchmarks and CI (DD-161); Node 22 Maintenance LTS compat lane; `engines.node` remains `>=22.0.0`

### Infrastructure

- **Release Gate Runner** (`scripts/release/run-gates.sh`): `--target stable` runs all 6 DD-90 gates plus standard gates; `--write-release-artifacts` produces versioned gate report
- **Conformance Tooling:** 7 Node scripts for registry management, inventory generation, matrix generation, schema validation, drift detection
- **Guard Script:** Extended with conformance coverage, inventory freshness, registry drift checks

### Design Decisions

- DD-157: Release integrity gate (committed manifest, coherence checks)
- DD-158: Property/fuzz testing gate (fast-check, zero-crash invariant)
- DD-159: Performance benchmark gate (Vitest bench, baseline tracking)
- DD-160: SSRF/security hardening gate (expanded vectors, posture doc)
- DD-161: Node 24 canonical baseline (Active LTS primary, Node 22 compat)
- DD-162: Publisher trust and OIDC migration (45 packages, invariant checker)
- DD-163: Package surface audit (API lock, pack-install, doc-example gate)
- DD-164: Full BCP 14 requirement coverage (146 IDs, drift detection)
- DD-167: Conformance fixture inventory system (machine-readable tracking)
- DD-168: Stable promotion (version bump, dist-tag flip, 28 packages)

### Deferred

- AST-based no-network audit for DD-55 enforcement: deferred to v0.12.1 (#484)
- SSRF-specific error preservation in safeFetch: deferred to v0.12.1 (#483)
- Repeated-run and Linux benchmark artifacts: deferred to v0.12.1 (#485)
- Stronger API contract extraction for critical packages: deferred to v0.12.1 (#486)
- Full install-surface proof for workspace-dep packages: deferred to v0.12.1 (#487)
- Conformance fixtures for sections 2-4 (media type, envelope, compatibility): deferred to v0.12.1
- ProofTypeSchema and ProofMethodSchema unification: deferred to v0.12.1
- Remaining 5 pillar extension groups (consent, compliance, privacy, safety, provenance): deferred to v0.12.1+
- Go SDK: deferred to v0.13.0+

## [0.12.0-preview.2]

### Interaction Record Format 0.2 Preview (Hardening)

v0.12.0-preview.2 hardens the Wire 0.2 preview with release integrity gates,
Wire 0.1 isolation, spec completeness (sections 18-20), ecosystem integration
(MCP and A2A), and the EAT passport adapter (DD-154).

This is the second preview release on the `next` dist-tag. Wire 0.2
(`interaction-record+jwt`) is feature-complete; this release focuses on
correctness, integration proof, and quality gate infrastructure ahead of
stable promotion.

### Added

- **Release State Coherence Gate** (#467)
  - Committed `docs/releases/current.json` manifest (CI-enforceable source of truth)
  - `scripts/check-release-state-coherence.sh` validates manifest against committed artifacts
  - Extended `scripts/guard.sh` with release-state-coherence section
- **Spec Sections 18-20** (#470, DD-156)
  - Section 18: Identifier Stack (4-layer dispatch model, token confusion prevention per RFC 8725)
  - Section 19: Validation Algorithm (12-step RFC 9068-style verification procedure)
  - Section 20: Replay Prevention (issuer-MUST jti uniqueness, verifier-SHOULD cache)
  - Updated terminology and editorial review across all 20 sections
- **MCP Server Wire 0.2 Issuance** (#472)
  - `peac_issue` tool accepts Wire 0.2 fields: `kind`, `type`, `pillars`, `extensions`, `policy`
  - Wire 0.2 only (no `wire_version` discriminator); unlocks DD-90 gate 1
- **A2A Wire 0.2 Integration Tests** (#473)
  - Wire 0.2 round-trip through A2A metadata carrier
  - Validates embed, extract, verify cycle; unlocks DD-90 gate 2
- **EAT Passport Adapter** (#474, DD-154)
  - `@peac/adapter-eat`: COSE_Sign1 (RFC 9052/9053) + Ed25519 via `@peac/crypto`
  - Privacy-first claim mapping (EAT/RFC 9711)
  - 5 error codes: `E_EAT_SIZE_EXCEEDED`, `E_EAT_INVALID_CBOR`, `E_EAT_INVALID_COSE`,
    `E_EAT_SIGNATURE_FAILED`, `E_EAT_UNSUPPORTED_ALG`
  - Detached COSE payload rejection, 32-byte Ed25519 key validation, 64 KB size limit
- **Consolidated Release Gate Runner** (#471)
  - `scripts/release/run-gates.sh`: unified gate runner with `--target preview|stable`
  - JSON gate report output, DD-90 stable gate stubs
- **Quality Gates Hardening** (#475)
  - `check-publish-list.sh` reads from `publish-manifest.json` (single source of truth)
  - Pre-commit auto-syncs `errors.generated.ts`
  - `pnpm fixtures:new` scaffold helper
  - `guard.sh` MCP distribution gates

### Changed

- **Wire 0.1 Isolation** (#468)
  - `verifyLocal()` returns `E_UNSUPPORTED_WIRE_VERSION` for Wire 0.1 receipts
  - `verifyLocalWire01()` internal-only (NOT barrel-exported from `@peac/protocol`)
  - MCP server: Wire 0.2 only (no Wire 0.1 issuance or verification)
  - `issue()` deprecated in favor of `issueWire02()` (reversed in v0.12.0 stable)
- **Hono Audit Fix** (#469)
  - Bumped `hono` and `@hono/node-server` for CVE remediation

### Fixed (pre-existing, included in release prep)

- **MCP Server Test Alignment** (post-#472 repair)
  - `schemas.test.ts`: fixed unsorted pillars array in optional fields test
    (`['commerce', 'access']` corrected to `['access', 'commerce']`)
  - `privileged-e2e.test.ts`: updated Wire 0.1 rejection test to expect Wire 0.2
    success (MCP now issues Wire 0.2 per #472; test predated that change)
  - Both failures were pre-existing on main, not introduced by release prep

### Infrastructure

- **Release Gate Runner Rewrite** (`scripts/release/run-gates.sh`)
  - Portable `now_ms()` via Node (fixes macOS `date +%3N` arithmetic errors)
  - `--write-release-artifacts` is now the authoritative gate path; dry-run mode
    never claims "ready to tag"
  - Versioned gate report: `docs/releases/<version>-gate-report.json`
  - Stable gate stubs now include `api-surface-lock` and `pack-install-smoke`
- **Atomic Version Bump** (`scripts/bump-version.mjs`)
  - Version bump now atomically bumps spec JSON files, regenerates codegen,
    and formats all bumped files in a single script invocation
- **Machine-Derived Release Facts** (`docs/releases/current.json`)
  - Removed `_informational` block (approximate test counts, DD counts)
  - Manifest contains only CI-enforceable fields; informational data derived
    at check time by scripts
- **Deterministic Doc-Sync** (`scripts/sync-release-state.mjs`)
  - Reads `current.json` + machine-derived facts, rewrites `<!-- release-state -->`
    blocks in all 7 reference docs deterministically
  - `--check` mode for CI verification of doc drift
- **CHANGELOG Coverage Gate**
  - `run-gates.sh` now verifies CHANGELOG has entry for current version
- **Conformance Fixture Correction**
  - Wire 0.2 fixtures: `wire_format` corrected from `peac-receipt/0.2` to
    `interaction-record+jwt` (2 files, 8 occurrences)
- **Source-of-Truth Purge**
  - `@peac/compat-wire01`: annotated as resolved (internal `verifyLocalWire01()`)
  - `peac-receipt/0.2`: corrected to `interaction-record+jwt` across reference docs

### Deferred

- Property/fuzz tests: deferred to v0.12.0 stable
- Performance benchmarks: deferred to v0.12.0 stable
- SSRF test expansion: deferred to v0.12.0 stable
- Public API surface lock: deferred to v0.12.0 stable
- Migration guide: deferred to v0.12.0 stable

## [0.12.0-preview.1]

### Interaction Record Format 0.2 Preview

v0.12.0-preview.1 introduces Wire 0.2 (`interaction-record+jwt`), the next
generation of the PEAC receipt format. This is a preview release on the `next`
dist-tag for early adoption testing.

### Added

- **Wire 0.2 Format** (DD-150 through DD-156)
  - 2 structural kinds (`evidence`, `challenge`), forever fixed
  - Open semantic `type` (reverse-DNS or URI) + multi-valued `pillars` (10-pillar closed taxonomy)
  - `typ: interaction-record+jwt` (MUST; `application/interaction-record+jwt` accepted per RFC 7515)
  - `iss` canonical: `https://` (ASCII origin, RFC 3986) and `did:` (DID Core) only
  - 5 typed extension groups: Commerce, Access, Challenge, Identity, Correlation
  - Policy binding: JCS (RFC 8785) + SHA-256, 3-state result (`verified`/`failed`/`unavailable`)
  - JOSE hardening: reject embedded keys (`jwk`, `x5c`), `crit`, `b64: false`, `zip`
  - Strictness profiles: `strict` (default) and `interop` (explicit opt-in only)
  - 16 error codes, 4 warning codes (append-only), RFC 6901 pointers
  - 59+ conformance fixtures
- **Wire 0.2 Issuance and Verification**
  - `issueWire02()` in `@peac/protocol`
  - `verifyLocal()` dual-stack with strict/interop profiles
  - `signWire02()` and `validateWire02Header()` in `@peac/crypto`
  - `Wire02ClaimsSchema` in `@peac/schema`
- **Policy Binding**
  - `verifyPolicyBinding()` in `@peac/schema` (L1 pure string comparison, DD-141)
  - `computePolicyDigestJcs()` in `@peac/protocol` (JCS RFC 8785 + SHA-256)
  - `checkPolicyBinding()` 3-state logic
  - 33 policy binding tests with golden JCS vectors
- **Wire 0.2 Conformance Suite**
  - 59+ conformance fixtures across kinds, types, pillars, extensions, JOSE
  - Normative spec: `docs/specs/WIRE-0.2.md` (17 sections at preview.1, 20 at preview.2)
- **Typed Extension Accessors**
  - 5 accessor helpers: `getCommerceExtension()`, `getAccessExtension()`,
    `getChallengeExtension()`, `getIdentityExtension()`, `getCorrelationExtension()`
  - Return `undefined` if absent; throw `SchemaError` with RFC 6901 pointer if invalid-present
- **JWS Header Discrimination**
  - 3-variant discriminated union: `Wire01JWSHeader | Wire02JWSHeader | UnTypedJWSHeader`
  - Callers narrow by `header.typ`

### Changed

- **Wire 0.1 is FROZEN:** `peac-receipt/0.1` receives no further changes
- **Deprecated:** `WIRE_TYPE` and `WIRE_VERSION` constants in `@peac/kernel`
- **Deprecated:** `JWSHeader` Zod schema alias (use `Wire01JWSHeaderSchema`)

## [0.11.3]

### Identity, Zero Trust, and Enterprise Readiness

v0.11.3 adds Zero Trust profile documentation overlays, expanded agent identity with 8 proof
types, normative key rotation lifecycle management, a reconciliation CLI for evidence bundle
merge, and governance framework alignment mappings.

### Added

- **Zero Trust Profile Pack** (DD-145)
  - 7 sub-profiles as documentation overlays: Access, Toolcall, Decision, Risk Signal, Sync,
    Tracing, ZT Extensions
  - Each specifies REQUIRED/RECOMMENDED/PROHIBITED receipt fields per PROFILE_RULES.md
  - No new wire fields; all ZT data flows through `ext[]` with reverse-DNS keys
- **Agent Identity Profile** (DD-142, DD-143, DD-144)
  - `ActorBindingSchema` with 8 proof types: `ed25519-cert-chain`, `eat-passport`,
    `eat-background-check`, `sigstore-oidc`, `did`, `spiffe`, `x509-pki`, `custom`
  - `MVISFieldsSchema` with 5 required identity fields (issuer, subject, key_binding,
    time_bounds, replay_protection)
  - `isOriginOnly()` validator enforcing origin-only URLs (no path/query/fragment)
  - 8 valid fixtures (one per proof type) + 2 negative fixtures
  - Standards alignment: RFC 8032, RFC 9711 (EAT), RFC 5280, W3C DID 1.1, CNCF SPIFFE,
    NIST SP 800-63, Sigstore
- **ZT Extension Schemas** (DD-145, DD-146)
  - `credential-event`, `tool-registry`, `control-action` schemas in `@peac/schema`
  - `FingerprintRef` conversion utilities (opaque reference format, Layer 1 string manipulation)
  - URL scheme allowlist on `tool_registry.registry_uri` (HTTPS + URN only, SSRF prevention)
  - 10 conformance fixtures
- **Treaty Extension** (DD-147)
  - 4-level `commitment_class` vocabulary: `informational`, `operational`, `financial`, `legal`
  - Extension key: `org.peacprotocol/treaty`
  - 3 conformance fixtures
- **Key Rotation Lifecycle** (DD-148)
  - Normative spec: lifecycle FSM (PENDING, ACTIVE, DEPRECATED, RETIRED, REVOKED)
  - 30-day overlap normative (upgraded from 7-day RECOMMENDED)
  - Cache-Control coordination: JWKS `max-age` MUST be <= overlap period
  - Emergency revocation via `revoked_keys[]` in `peac-issuer.json` (RFC 5280 CRLReason subset)
  - Kid reuse detection in JWKS resolver (tiered: stateful MUST reject, stateless SHOULD warn)
  - NIST SP 800-57 key management lifecycle alignment
  - 6 conformance fixtures including cache-based kid reuse detection
- **Reconciliation CLI**
  - `peac reconcile <bundle1> <bundle2>` for evidence bundle merge and conflict detection
  - Conflict key: composite `(iss, jti)` with 3-step fallback
  - `--format json|text` with deterministic ordering (CI-friendly, diffable)
  - `--fail-on-conflict` exit code 1 for CI gate usage
  - 16 MB bundle size limit, path traversal prevention
- **Content Signals Example**
  - `examples/content-signals/` demonstrating DD-136/DD-137 observation model
  - Parses robots.txt and tdmrep.json, maps to `CanonicalPurpose`, issues receipt
- **A2A Gateway Pattern Example**
  - `examples/a2a-gateway-pattern/` demonstrating receipt per state transition
  - Agent Card declaration, task submission, working/completion state receipts
- **Governance Framework Mappings** (8 documents in `docs/governance/`)
  - NIST AI RMF, EU AI Act, OWASP ASI, ISO 42001, IEEE 7001, OECD AI Principles,
    Singapore MGFAA, AWS RAI compliance
- **Multi-Tenant Guide** (DD-149)
  - 3-tier isolation guidance: Shared, Scoped (kid prefix), Isolated (per-tenant JWKS)
  - Migration path between tiers, security tradeoffs per tier
- **Plugin Pack Enhancements**
  - `verify-receipt.md` and `explain-receipt.md` skills for Claude Code
  - OpenCode configuration template and agent template
- **CI Improvements**
  - PR scope guard with label-driven path allowlist (`scripts/ci/scope-guard.sh`)
  - Unified gate script (`scripts/gate.sh`) called by both CI and hooks
  - Repo-managed hooks (`.githooks/`) auto-installed via `pnpm prepare`
  - lint-staged auto-format at commit time
  - No-network guard (`scripts/check-no-network.mjs`) for DD-55 enforcement
  - Release gate (`scripts/release-gate-0.11.3.sh`) with 10 checks
- **Registry Additions**
  - `proof_types` section: 8 entries for multi-root identity verification
  - `extension_keys` section: ZT and treaty extension keys
  - `pillar_values` section: 10-value closed vocabulary
- **Error Codes**
  - `E_KID_REUSE_DETECTED`: same kid with different key material within retention window
  - `E_MVIS_INCOMPLETE`: identity receipt missing MVIS required fields
  - `E_REVOKED_KEY_USED`: receipt signed with a revoked key

### Changed

- **`JWKS.overlapDays`** constant updated from 7 to 30 (normative upgrade)
- **Publish manifest**: 28 packages (unchanged count, version bumped)

### Notes

- Wire format `peac-receipt/0.1` remains FROZEN
- Design decisions: DD-142 (ActorBinding), DD-143 (multi-root proof types),
  DD-144 (MVIS), DD-145 (ZT Pack composition), DD-146 (FingerprintRef),
  DD-147 (Treaty extension), DD-148 (Key Rotation lifecycle), DD-149 (Multi-Tenant)
- All ZT data flows through `ext[]` with reverse-DNS keys per PROFILE_RULES.md
- `ProofTypeSchema` (8 types for ActorBinding) is separate from existing
  `ProofMethodSchema` (4 methods for AgentProof); unification deferred to v0.12.0

### Deferred

- EAT adapter (passport + background-check): deferred to v0.12.0-preview.1 (CBOR dependency)
- Wire 0.2 kernel envelope: deferred to v0.12.0-preview.1
- Content signals streaming: deferred to v0.12.1
- OpenAI adapter streaming: deferred to v0.12.1
- ActorBinding/ProofMethod schema unification: deferred to v0.12.0

## [0.11.2]

### Content Signals + Evidence Locators

v0.11.2 adds agent-actionable error recovery hints, an optional receipt locator on
evidence carriers, a new content signals observation package, an OpenAI-compatible
inference adapter, and MCP Registry distribution surfaces.

### Added

- **Error recovery `next_action` hints** (DD-132, DD-133)
  - Closed vocabulary of 7 agent-actionable recovery hints on every `ErrorDefinition`:
    `retry_after_delay`, `retry_with_different_key`, `retry_with_different_input`,
    `refresh_attestation`, `contact_issuer`, `abort`, `none`
  - Hints are best-effort guidance, not protocol promises; servers may change
    mappings between minor versions
  - Conformance fixture: `specs/conformance/fixtures/errors/next-action-hints.json`
  - MCP server error responses now include `retryable` and `next_action` fields
- **`receipt_url` locator hint** (DD-135, DD-141)
  - Optional HTTPS-only field on `PeacEvidenceCarrier` (max 2048 chars, no credentials)
  - Schema validation in `@peac/schema` (Layer 1, validation-only per DD-141)
  - SSRF-hardened resolver in `@peac/net-node` (Layer 4): private IP rejection,
    timeout, redirect rejection, max response size
  - Round-trip tests for all 5 carrier adapters (MCP, A2A, ACP, UCP, x402)
  - Conformance fixtures: valid and invalid `receipt_url` vectors
- **`@peac/mappings-content-signals`** (DD-136, DD-137, NEW package)
  - Content use policy signal parsing: robots.txt (RFC 9309), Content-Usage
    (AIPREF draft, RFC 9651 Structured Fields), tdmrep.json (EU Directive
    2019/790 Art. 4)
  - Observation-only model: signals record what was observed, never enforce
    (DD-136, DD-95 rail neutrality)
  - Source precedence: tdmrep.json > Content-Signal > Content-Usage > robots.txt
    (DD-137)
  - Three-state resolution: `allow`, `deny`, `unspecified` per purpose
  - 16 conformance fixtures (8 valid + 8 edge-case Content-Usage, 4 carrier)
- **`@peac/adapter-openai-compatible`** (DD-138, NEW package)
  - Hash-first model: SHA-256 digests of messages and output; no raw prompt or
    completion text in receipts
  - Deterministic key-sorted JSON canonicalization (not RFC 8785 JCS) with
    type-safe input constraints
  - Self-contained types: works with any OpenAI-compatible provider without
    importing vendor SDKs
  - Streaming support explicitly deferred to v0.11.3
- **Distribution surfaces** (DD-139, DD-140)
  - MCP Registry manifest (`packages/mcp-server/server.json`) validated against
    vendored schema in CI
  - Smithery config (`packages/mcp-server/smithery.yaml`)
  - `llms.txt` at repository root
  - Plugin pack: Claude Code skill (`surfaces/plugin-pack/claude-code/peac/SKILL.md`)
    and Cursor rules (`surfaces/plugin-pack/cursor/peac.mdc`)
  - CI distribution gate (`scripts/check-distribution.sh`)
  - MCP Registry publisher workflow (`.github/workflows/publish-mcp-registry.yml`)

### Changed

- **`retriable` renamed to `retryable`** (DD-134): clean rename across all error
  definitions, types, codegen, and consuming code; zero live consumers
- **Error codegen** (`scripts/codegen-errors.ts`): validates `next_action` from
  closed vocabulary; emits both `retryable` and `next_action`
- **Publish manifest**: 25 -> 27 packages (added `@peac/mappings-content-signals`,
  `@peac/adapter-openai-compatible`)

### Deferred

- Content signals streaming/chunked parsing: deferred to v0.11.3
- OpenAI adapter streaming (`fromChatCompletionStream`): deferred to v0.11.3
- Reconciliation CLI: deferred to v0.11.3
- Key rotation spec: deferred to v0.11.3
- `receipt_url` auto-resolution in middleware: deferred to v0.12.0
- Content signals enforcement mode: deferred to v0.12.0

### Notes

- Wire format `peac-receipt/0.1` remains FROZEN
- Design decisions: DD-132 (error recovery next_action), DD-133 (next_action vocabulary),
  DD-134 (retriable -> retryable rename), DD-135 (receipt_url locator hint),
  DD-136 (content signals observation model), DD-137 (content signals source precedence),
  DD-138 (inference receipt hash-first model), DD-139 (plugin pack distribution contract),
  DD-140 (distribution surface validation), DD-141 (schema layer is validation-only)
- `next_action` and `retryable` are error metadata fields, not wire format fields
- `receipt_url` is a carrier metadata field, not a wire format field

## [0.11.1]

### Evidence Carrier Contract + A2A Mapping

v0.11.1 formalizes the Evidence Carrier Contract: the universal interface that
lets any protocol (MCP, A2A, ACP (Agentic Commerce Protocol), UCP, x402, HTTP) carry PEAC receipts without
kernel changes. This is the first release with A2A (Agent-to-Agent Protocol)
support and content-addressed receipt references.

### Added

- **Evidence Carrier Contract** (DD-124)
  - `PeacEvidenceCarrier` type in `@peac/kernel` (Layer 0, zero runtime)
  - `CarrierAdapter<TInput, TOutput>` generic interface for protocol adapters
  - `CarrierMeta` type with transport, format, and size limit metadata
  - `computeReceiptRef()` in `@peac/schema`: canonical SHA-256 receipt reference
    computation (WebCrypto, portable across Node >= 20, Deno, Bun, Workers)
  - `validateCarrierConstraints()`: transport-aware carrier validation
  - Zod schemas: `ReceiptRefSchema`, `CompactJwsSchema`, `PeacEvidenceCarrierSchema`
  - Conformance fixtures: 7 carrier fixtures (valid + invalid vectors)
- **`@peac/mappings-a2a`** (NEW package, DD-126, DD-128)
  - A2A evidence carrier mapping for Agent-to-Agent Protocol v0.3.0
  - Extension URI: `https://www.peacprotocol.org/ext/traceability/v1`
  - Metadata layout: `metadata[extensionURI] = { carriers: [...] }` per A2A convention
  - Attach/extract for TaskStatus, Message, and Artifact metadata
  - Agent Card extension type for `capabilities.extensions[]`
  - `A2A-Extensions` header parser (DD-86: no X-headers)
  - Agent Card discovery with SSRF protection (DNS rebinding defense,
    `redirect: "error"`, 256 KB response cap, Content-Type check)
  - No runtime dependency on `@a2a-js/sdk` (minimal types from spec)
- **MCP `_meta` carrier format** (DD-125, DD-129)
  - `attachReceiptToMeta()` / `extractReceiptFromMeta()` in `@peac/mappings-mcp`
  - Keys: `org.peacprotocol/receipt_ref`, `org.peacprotocol/receipt_jws`
  - `McpCarrierAdapter` implementing `CarrierAdapter`
  - `extractReceiptFromMetaAsync()`: async extraction with receipt_ref consistency
    check (DD-129: `sha256(receipt_jws) MUST equal receipt_ref`)
  - `assertNotMcpReservedKey()`: MCP \_meta reserved key guard per spec 2025-11-25
    (checks second label in dot-separated prefix)
  - Backward compat: reads legacy `org.peacprotocol/receipt` key (v0.10.13),
    auto-computes `receipt_ref` from JWS
- **Agentic Commerce Protocol (ACP) carrier adoption** in `@peac/mappings-acp`
  - `attachCarrierToACPHeaders()` / `extractCarrierFromACPHeaders()`
  - Header-only transport: `PEAC-Receipt` = compact JWS (8 KB limit)
  - ACP state transition helpers (create/update/complete/cancel)
  - Webhook HMAC binding via `request_nonce`
- **UCP carrier adoption** in `@peac/mappings-ucp`
  - `normalizeToCarrier()` from webhook evidence
  - `attachCarrierToWebhookPayload()` for outbound webhooks
  - Backward compat with `extensions["org.peacprotocol/interaction@0.1"]`
- **x402 carrier adapter** in `@peac/adapter-x402`
  - `fromOfferResponse()` / `fromSettlementResponse()` for HTTP 402/200 flows
  - `X402CarrierAdapter` implementing `CarrierAdapter`
  - `ChallengeType` taxonomy: `payment`, `auth`, `consent`, `rate_limit`,
    `purpose_denied`, `other`
  - Header-only transport: `PEAC-Receipt` = compact JWS (8 KB limit)
- **JWKS resolver** in `@peac/protocol`
  - Shared JWKS key fetching and caching for offline verification
  - SSRF-hardened: private IP blocking, response size cap, timeout
- **Discovery Profile** spec and 3-step algorithm (DD-110)
  - Agent Card -> `/.well-known/peac.json` -> `PEAC-Receipt` header probe
  - `discoverPeacCapabilities()` in `@peac/mappings-a2a`
- **Normative specs**
  - `docs/specs/EVIDENCE-CARRIER-CONTRACT.md`
  - `docs/specs/A2A-RECEIPT-PROFILE.md`
  - `docs/specs/MCP-EVIDENCE-PROFILE.md`
  - `docs/specs/DISCOVERY-PROFILE.md`
- **MCP carrier e2e smoke test** (release gate)
  - Full round-trip: issue -> computeReceiptRef -> attachReceiptToMeta ->
    extractReceiptFromMetaAsync -> verifyLocal
  - Tampered receipt_ref detection (DD-129)
  - Legacy `org.peacprotocol/receipt` backward compat verification

### Changed

- **AGENTS.md**: updated MCP section to v0.11.1 carrier format, added A2A
  metadata carrier example, updated discovery table with spec links
- **Registry** (`specs/kernel/registries.json`): added `a2a`, `ucp`, `stripe`
  entries; bumped version to 0.10.0

### Deferred

- NIST CAISI RFI submission: deferred to separate submission (March 9 deadline)
- Full OAuth 2.1 MCP server: deferred to v0.11.x+
- A2A body-embed carrier format: deferred to future version (metadata-only in v0.11.1)
- ACP/x402 body-embed carrier format: deferred to future version (header-only in v0.11.1)

### Notes

- Wire format `peac-receipt/0.1` remains FROZEN
- Design decisions: DD-124 (carrier types), DD-125 (MCP legacy deprecation),
  DD-126 (no external SDK deps), DD-127 (carrier size limits), DD-128 (A2A
  version pinning), DD-129 (carrier field immutability), DD-130 (AGENTS.md
  alignment), DD-131 (carrier validation as ASI-04 defense)
- `@modelcontextprotocol/sdk` stays at ~1.26.0 (npm latest; v1.27.0 is GitHub
  tag only, not published to npm)
- PRs: #414 (types+schemas), #415 (spec+docs), #416 (A2A mapping), #417 (MCP
  carrier), #418 (ACP+UCP), #419 (x402), #420 (profile specs), #421 (discovery)

### Standards References

- **A2A Protocol v0.3.0** (Linux Foundation): Extension metadata layout
- **MCP Specification 2025-11-25**: `_meta` reverse-DNS key conventions
- **RFC 9711** (EAT, Oct 28, 2025): Entity Attestation Token reference model
- **OWASP ASI-04** (Supply Chain): Carrier validation as defense
- **CVE-2026-25536**: MCP SDK floor remains >= 1.26.0

## [0.11.0]

### Infrastructure Modernization + Enterprise Readiness

v0.11.0 is an infrastructure modernization release: Zod 4 migration for 7-14x
parsing performance, MCP Streamable HTTP transport for remote agent connectivity,
kernel constraint enforcement in issuance and verification pipelines, integrator
kit scaffolding for ecosystem partners, and OWASP Top 10 for Agentic Applications
security alignment.

**Breaking change:** `@peac/schema` exports Zod 4 types. If you compile against
exported schemas, align your Zod major to v4. Zod 3 and Zod 4 types are not
assignment-compatible. Consumers pinned to `^0.10.x` will stay on v0.10.14 (safe);
`^0.11.x` opts in explicitly.

### Added

- **MCP Streamable HTTP transport** (DD-119, DD-123)
  - `--transport http` flag enables HTTP transport alongside existing stdio
  - Session-isolated `McpServer` + `StreamableHTTPServerTransport` per HTTP
    session (CVE-2026-25536 defense: no cross-client data leak)
  - `Mcp-Session-Id` lifecycle: server-generated on init, required on subsequent
    requests, `DELETE /mcp` for session termination
  - Session eviction: configurable TTL (default 30 min) + max sessions (default 100)
  - `POST /mcp`: JSON-RPC request/response; `GET /mcp`: 405 Method Not Allowed
  - `GET /health`: health check (no auth, returns version + protocol version)
  - RFC 9728 PRM discovery endpoint at `GET /.well-known/oauth-protected-resource[/<path>]`:
    implemented but disabled by default; enabled when both `--authorization-servers`
    and `--public-url` are configured; returns 404 otherwise
  - Security: CORS deny-all default, localhost-only bind, 1MB request body limit,
    per-session + per-IP rate limiting (100 req/min default), Origin/Host validation,
    Node.js server timeouts (slowloris defense)
  - CLI flags: `--transport`, `--port`, `--host`, `--cors-origins`,
    `--authorization-servers`, `--public-url`, `--trust-proxy`
- **Kernel constraint enforcement in pipelines** (DD-121)
  - `validateKernelConstraints()` called in `issue()` before signing (rejects
    oversized claims pre-sign)
  - `validateKernelConstraints()` called in `verifyReceipt()` and `verifyLocal()`
    after decode/signature, before schema parse (rejects malformed payloads early)
  - New `constraint_violation` reason in `VerifyFailure` taxonomy
  - New `E_CONSTRAINT_VIOLATION` error code in `@peac/schema` error taxonomy
  - Fail-closed: all violations produce typed errors (no silent failures)
  - Normative specification: `docs/specs/KERNEL-CONSTRAINTS.md`
- **Integrator Kit** (DD-108, DD-122)
  - Template kit at `integrator-kits/template/` with README, integration guide,
    and security FAQ
  - Ecosystem scaffolds: MCP, A2A, ACP, x402, Content Signals
  - Conformance harness: `scripts/conformance-harness.ts` CLI runner with
    `--adapter`, `--fixtures`, `--format json|pretty` flags
  - Deterministic JSON report output for CI consumption
- **OWASP Top 10 for Agentic Applications alignment**
  - `docs/security/OWASP-ASI-MAPPING.md` maps all 10 risks (ASI-01 through
    ASI-10) to specific PEAC mitigations with test file citations
- **Performance baselines** updated with Zod 4 benchmarks
  - `parseReceiptClaims` commerce: ~388K ops/sec; attestation: ~792K ops/sec
  - `toCoreClaims` commerce: ~11.8M ops/sec; attestation: ~27.3M ops/sec

### Changed

- **Zod 4 migration** (DD-120): all workspace packages migrated from Zod 3.25.x
  to Zod 4.x (`^4.3.6`). Key migration patterns:
  - `z.record(ValueSchema)` to `z.record(z.string(), ValueSchema)` (2-arg form)
  - `.default({})` to `.prefault({})` for mutable defaults
  - `ZodError.errors` to `ZodError.issues`; `issue.path` is `PropertyKey[]`
  - `pnpm.overrides` enforces single Zod major across workspace
  - MCP SDK peer dependency accepts `^3.25 || ^4.0` (compatible)
- **MCP SDK** pinned at `~1.27.0` (>= 1.26.0 for CVE-2026-25536 fix)

### Zod 4 Consumer Migration Notes

If you import schemas from `@peac/schema`, align your Zod major to v4:

1. `z.record(ValueSchema)` now requires two arguments: `z.record(z.string(), ValueSchema)`
2. `.default({})` replaced by `.prefault({})` for mutable default values
3. `ZodError.errors` renamed to `ZodError.issues`
4. `z.infer<>` types remain structurally equivalent for all PEAC schemas
5. `pnpm.overrides` or equivalent should enforce a single Zod major in your workspace

### Deferred

- Full OAuth 2.1 MCP server: deferred to v0.11.x+ (HTTP transport needs field validation first)
- MCP protected mode (401 + WWW-Authenticate + token validation): deferred to v0.11.x+
- Evidence Carrier Contract (`PeacEvidenceCarrier`): deferred to v0.11.1
- `@peac/mappings-a2a`: deferred to v0.11.1
- NIST CAISI RFI submission: deferred to v0.11.1

### Notes

- Wire format `peac-receipt/0.1` remains FROZEN
- 22 published packages version-bumped to 0.11.0
- Design decisions: DD-119 (Streamable HTTP), DD-120 (Zod 4), DD-121 (kernel
  constraints pipeline), DD-122 (conformance harness), DD-123 (HTTP security)
- MCP Streamable HTTP runs in unprotected mode only (no token validation);
  "OAuth readiness" hooks provided via optional PRM endpoint
- stdio transport remains the default (backward compatible)
- PR merge order: #407 (Zod 4 schema) -> #408 (Zod 4 remaining) -> #409/#410/#411
  (HTTP transport / kernel constraints / integrator kit, parallel) -> #412 (release)

### Standards References

- **MCP Transport 2025-06-18**: Streamable HTTP implemented (JSON-only mode, SSE deferred)
- **MCP Authorization 2025-11-25**: Discovery only (RFC 9728 PRM); protected mode deferred
- **RFC 9728** (OAuth Protected Resource Metadata): Conditional PRM endpoint (path-aware routing)
- **CVE-2026-25536** (MCP SDK cross-client data leak): Mitigated by per-session transport isolation
- **MCP SDK ~1.27.0** (v1.x stable): v2 pre-alpha, not production
- **Zod ^4.3.6**: Full migration from 3.25.x
- **OWASP ASI-01 through ASI-10**: Alignment mapping in `docs/security/OWASP-ASI-MAPPING.md`

## [0.10.14]

### Quality Hardening and Zod 4 Preparation

v0.10.14 is a hardening release: no new packages, no wire format changes.
It closes three follow-up issues from prior releases, tightens editorial and
integrity standards, promotes the shared worker core to a proper workspace
package, and lays the groundwork for the Zod 4 migration in v0.11.0.

### Added

- **`@peac/worker-shared`** (NEW internal package, private)
  - Promoted from `surfaces/workers/_shared/core/` to a first-class
    workspace package (`packages/worker-shared/`)
  - Eliminates root-level devDep workaround for Vitest strict resolution
  - Source exports (`./src/index.ts`): no build step, edge-runtime safe
  - Used by Cloudflare, Akamai, and Fastly worker surfaces
  - Closes #355
- **Per-fixture conformance versioning** (`specs/conformance/`)
  - `category-tracking.json` data file tracks `schema_version` per fixture
  - `scripts/validate-fixtures.mjs` CI gate enforces versioning
  - Closes #380
- **Kernel constraints** (`@peac/schema`)
  - `KERNEL_CONSTRAINTS` constant: 9 named constraints with name, limit,
    unit, and rationale fields
  - `validateKernelConstraints()` function with structured violation reporting
  - Exported types: `ConstraintViolation`, `ConstraintValidationResult`,
    `KernelConstraintKey`
  - Design decision DD-60
- **Polish Bucket tooling** (DD-118)
  - 18 fast-check property tests across kernel, schema, and crypto
  - Fuzz seed tests for boundary conditions
  - Machine-readable perf baseline (`tests/perf/baseline-results.json`)
- **Zod 4 migration tooling**
  - `scripts/audit-zod-usage.mjs`: inventory all Zod API usage across 42
    packages, generates migration plan with staged ordering and rollback notes
  - `docs/internal/ZOD4-MIGRATION-PLAN.md`: MCP SDK compatibility analysis,
    migration order, breaking API changes, and CI gate strategy
- **Writer-side omission of redundant fields** (`@peac/adapter-openclaw`)
  - Export bundle writer strips top-level `auth` and `evidence` when `_jws`
    is present; JWS payload is canonical, duplicate fields risk divergence
  - Receipts without `_jws` (unsigned) are written unchanged
  - Closes #382

### Changed

- **RFC 9651 replaces RFC 8941** across all source, spec, test, and fixture
  files (RFC 8941 obsoleted by RFC 9651: Structured Field Values for HTTP)
- **Dev dependency freshness**: `@types/node` ^22.x, `turbo`, `prettier`,
  `typescript-eslint`, `wrangler`, `next` bumped to current ranges
- **Audit allowlist quality bar**: structured rationale fields
  (`scope`/`owner`/`added_at`/`dependency_chain`/`verified_by`) enforced
  by `scripts/audit-gate.mjs`; prod ceiling 30 days, strict ISO dates
- **`@peac/worker-shared` tsconfig**: `noEmit: true` declared explicitly
  (was already passed via CLI; now unambiguous for editors and direct `tsc`)

### Fixed

- **`x403` typo gate** added to `guard.sh` and `check-planning-leak.sh`
  to prevent protocol name typos from entering the codebase
- **Unicode scan log**: `guard.sh` now prints "Unicode scan OK" explicitly
  in the Trojan Source section (clarifies GitHub bidi diff banners)
- Legacy TypeScript annotation errors in openclaw, capture-core,
  capture-node, and middleware-core test files (advisory-only but visible
  as CI annotations)
- `apps/api` Hono `c.body()` overload mismatch (TS2769)
- `check-error-codes.sh` missing category entries (workflow, interaction,
  verifier)

### Notes

- Wire format `peac-receipt/0.1` remains FROZEN
- No new published packages (all 22 packages version-bumped to 0.10.14)
- `@peac/worker-shared` is private (not published to npm)
- Design decisions: DD-59 (per-fixture versioning), DD-60 (kernel
  constraints), DD-101 (editorial hygiene), DD-118 (Polish Bucket)

## [0.10.13]

### MCP Server for AI Agents

v0.10.13 ships `@peac/mcp-server`, bringing PEAC receipt operations to any MCP
client (Claude Desktop, Cursor, Windsurf). Verify, inspect, decode, issue, and
bundle receipts locally: no API keys, no network required.

### Added

- **`@peac/mcp-server`** (NEW package, Layer 5)
  - 5 MCP tools: `peac_verify`, `peac_inspect`, `peac_decode` (pure),
    `peac_issue`, `peac_create_bundle` (privileged)
  - Pure tools require no configuration: safe for any environment
  - Privileged tools require explicit operator opt-in via `--issuer-key`,
    `--issuer-id`, and `--bundle-dir` CLI flags
  - `peac-mcp-server` CLI binary with stdio transport
  - Structured outputs (`structuredContent` + `text`) on every response
  - `_meta` audit block on all responses (serverVersion, policyHash,
    protocolVersion, registeredTools)
  - `outputSchema` published on all tools for client schema discovery
  - JSON policy file for tool enablement, size limits, redaction controls,
    and concurrency bounds
  - Canonical policy hash (SHA-256, deep-sorted keys) in every response
  - Cancellation support via MCP SDK AbortSignal (`E_MCP_CANCELLED`)
  - Line-buffered stdout fence (DD-58) for JSON-RPC framing integrity
  - Evidence bundles: deterministic `bundle_id` (content-addressable),
    canonical manifest (sorted keys, SHA-256 receipt hashes), signed
    provenance (`manifest.jws`)
  - Path traversal prevention for bundle output directories
  - Input guards: size limits, depth limits, concurrency limits, timeouts
  - Output size cap on full JSON-RPC envelope
  - `inspect_full_claims` policy gate (default: false) for claim visibility
  - JWKS file support for verifier key resolution
  - Issuer key loading from `env:VAR` or `file:/path` references
  - No ambient key discovery (DD-52): keys never searched from filesystem
    or environment
  - MCP SDK `@modelcontextprotocol/sdk@~1.27.0` (tilde pin, patch-only)
  - MCP protocol version `2025-11-25`
  - 226 tests across 18 test files
  - Design decisions DD-51 through DD-58

### Notes

- Wire format `peac-receipt/0.1` remains FROZEN
- `--jwks-url` deferred to v0.11.x (SSRF hardening pending)
- Capability tokens deferred to v0.11.x (HTTP transport)
- All audit HIGH vulnerabilities are dev-only (eslint/wrangler chains)

## [0.10.12]

### OpenClaw Activation, Durable Capture, and RFC 9421 Proof Profile

v0.10.12 ships the production-ready OpenClaw adapter with one-call activation,
Ed25519 key generation, filesystem-backed durable stores, and structured
verification counters. It also introduces the RFC 9421 proof capture profile
specification with conformance vectors and an extension schema.

### Added

- **`@peac/capture-node`** (NEW package, Layer 2)
  - Filesystem-backed durable capture stores for Node.js environments
  - `FileSpoolStore`: append-only spool with atomic writes, fsync, and
    crash-recovery via checkpoint files
  - `FileDedupeIndex`: persistent deduplication index backed by newline-delimited
    JSON with periodic compaction
  - Both stores implement the `SpoolStore`/`DedupeIndex` interfaces from
    `@peac/capture-core`
- **OpenClaw `activate()` one-call setup** (`@peac/adapter-openclaw`)
  - Single function to initialize capture session, background service, hook
    handler, plugin tools, and signer from a config object
  - Returns `{ instance, hookHandler, tools, shutdown }` for clean lifecycle
    management
  - `generateSigningKey()` CLI and programmatic Ed25519 key generation with
    file permission enforcement (0o600)
  - `peac-keygen` CLI command for key generation
- **Structured verification counters** (`@peac/adapter-openclaw`)
  - Export bundle: `scanned_count`, `exported_count`, `skipped_count`,
    `skipped_reasons` (stat_error, invalid_json, malformed_jws, filtered),
    `skipped_files` (bounded to 100)
  - Query: `scanned_count`, `matched_count`, `malformed_jws`, `filtered`
    in skip breakdown
- **Dual-representation mismatch check** (`@peac/adapter-openclaw`)
  - Verifier detects when top-level `auth`/`evidence` fields differ from
    `_jws` payload and reports as error
- **RFC 9421 proof capture profile** (`docs/specs/PEAC-PROOF-RFC9421.md`)
  - Normative profile spec for HTTP Message Signature verification evidence
  - Extension key: `org.peacprotocol/rfc9421-proof@0.1`
  - Three-state verification: `verified` / `failed` / `unavailable`
  - Six reason codes: `sig_valid`, `sig_expired`, `sig_future`,
    `sig_key_not_found`, `sig_alg_unsupported`, `sig_base_mismatch`
  - Privacy by construction: covered component names only, no raw header values
- **RFC 9421 extension schema** (`specs/extensions/rfc9421-proof/0.1/schema.json`)
  - Non-wire JSON Schema for extension payload validation
  - Conformance vectors validate against both InteractionEvidenceV01Schema and
    extension schema
- **RFC 9421 conformance vectors** (`specs/conformance/fixtures/interaction/rfc9421-proof.json`)
  - 5 vectors covering verified, expired, key-not-found, base-mismatch,
    and full-metadata scenarios
- **Profiles taxonomy** (`docs/specs/PROFILES.md`)
  - Overview of Transport, Proof Capture, and Wire Format profile categories
  - Design principles: independence, verification equivalence, extension-based,
    three-state results
- **Anti-rot demo contract test** (`packages/adapters/openclaw/tests/demo-contract.test.ts`)
  - Mirrors full activate/capture/drain/export/verify flow in a test
  - Validates stable fields (counts, verification success) to prevent drift
- **CI: promote-latest workflow** for npm dist-tag management (#374)
- **CI: publish preflight main fetch** fix (#373)

### Changed

- **OpenClaw example rewritten** (`examples/openclaw-capture/`)
  - Uses `activate()` + `generateSigningKey()` instead of inline stores
    and fake signer
  - Demonstrates full flow: keygen, activate, capture, drain, export, verify
- **OpenClaw adapter README rewritten** (`packages/adapters/openclaw/README.md`)
  - Developer-first language ("activity records", "evidence export")
  - Quick start, configuration, compatibility, security sections
- **Node.js baseline references updated** to >= 22 across all docs
  - `README.md`, `docs/README_LONG.md`, `packages/net/node/README.md`
  - `renovate.json`: `">=22.0.0"` constraint
- **OpenClaw example tool names** aligned with real OpenClaw surface
  - `file_read` -> `read`, `code_execute` -> `exec`

### Notes

- Wire format `peac-receipt/0.1` remains FROZEN
- RFC 9421 proof capture is a profile (doc + vectors), not a runtime dependency
- No new registry entries required (uses existing `http.request` op type)

## [0.10.11]

### Runtime Dependencies and x402 Payment Rail

v0.10.11 upgrades two runtime dependencies (@noble/ed25519 v3, OpenTelemetry SDK
v2), expands the registry spec, and adds the Stripe x402 payment rail adapter.

### Changed

- **@noble/ed25519 v2 -> v3** (`@noble/ed25519 ^3.0.0`)
  - New `packages/crypto/src/ed25519.ts` wrapper exposing async-only surface
    (`signAsync`, `verifyAsync`, `getPublicKeyAsync`, `randomSecretKey`)
  - Prevents accidental sync usage (sync methods in v3 require explicit hash
    configuration)
  - New `derivePublicKey()` and `validateKeypair()` functions in `@peac/crypto`
  - Golden vector conformance tests in `specs/conformance/fixtures/crypto/`
- **OpenTelemetry SDK v1 -> v2** (`@opentelemetry/sdk-metrics ^2.0.0`,
  `@opentelemetry/sdk-trace-base ^2.0.0`)
  - SDK packages remain devDependencies only; `@peac/telemetry-otel` runs with
    only `@opentelemetry/api ^1.9.0` as peer dependency
  - New pack-and-import smoke test (`scripts/otel-smoke.sh`) verifies tarball
    installability in an isolated npm project
  - New import smoke test validates all public exports resolve at runtime

### Added

- **`@peac/rails-stripe`**: Stripe payment rail adapter (`packages/rails/stripe/`)
  - `fromCheckoutSession()`, `fromPaymentIntent()`, `fromWebhookEvent()` for
    fiat Stripe flows
  - `fromCryptoPaymentIntent()` for x402 crypto payment flows with CAIP-2
    network identifiers
  - Privacy-by-default: customer ID and metadata excluded unless opted in
  - Metadata policy: `'omit'` (default), `'passthrough'`, `'allowlist'`
  - Metadata bounds enforcement (max 20 entries, key/value length limits,
    invisible Unicode stripped)
  - Profile documentation: `docs/profiles/stripe-x402-machine-payments.md`
  - Conformance vectors in `specs/conformance/fixtures/stripe-crypto/`
  - Example: `examples/stripe-x402-crypto/`
- **Registry spec v0.3.0** (`docs/specs/registries.json`)
  - `org.peacprotocol/interaction` extension key (interaction evidence)
  - `toolcall_op_types` advisory registry (`memory.write`, `memory.read`,
    `db.query`, `db.mutate`, `file.write`, `file.read`, `http.request`, etc.)
  - `toolcall_resource_types` advisory registry (`memory-store`, `database`,
    `file-store`, `api-endpoint`)
  - JSON Schema for registry validation (`docs/specs/registries.schema.json`)
  - Governance metadata: stability levels, deprecation lifecycle, change policy
- **Dependency audit gate** (`scripts/audit-gate.mjs`)
  - Deterministic vulnerability checker integrated into `guard.sh`
  - Two-tier policy: critical blocks, high warns (strict mode via `AUDIT_STRICT=1`)
  - Time-bounded allowlist at `security/audit-allowlist.json` (90-day max expiry)
- **`SECURITY.md`**: security policy, vulnerability reporting, contributor
  checklist
- **CI hardening**
  - `corepack prepare` with `--activate` in all workflow jobs
  - OTel pack-and-import smoke test in CI pipeline
  - Category tracking data file (`specs/conformance/category-tracking.json`)

### Notes

- Wire format `peac-receipt/0.1` remains FROZEN
- No API surface changes to existing packages

## [0.10.10]

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
  - `.node-version` file added (22.22.0) as single source of truth
  - All CI workflows now use `node-version-file` instead of hardcoded versions
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

- **Mermaid diagrams**: fixed GitHub rendering issues (#346, #348, #349)
- **ESLint `preserve-caught-error`**: 6 re-thrown errors now preserve cause chain
  via `{ cause: err }` (apps/api, apps/bridge, packages/protocol, packages/discovery)

### Notes

- Wire format `peac-receipt/0.1` remains FROZEN
- No runtime dependency changes
- No API surface changes

## [0.10.9]

### Foundation Hardening: Architecture, CI, and Server Reliability

v0.10.9 ships architectural fixes, CI hardening, and server reliability
improvements. Publish manifest expanded from 18 to 20 packages. Four packages
deferred from v0.10.8 (`middleware-core`, `middleware-express`, `adapter-openclaw`,
`cli`) are now bootstrap-ready with all CI guards in place.

### Added

- **Unified receipt parser** (`@peac/schema`)
  - `parseReceiptClaims(input, opts?)`: single entry point for commerce and
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
    `publish-manifest.json`: no more hardcoded package arrays
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

- **`@peac/audit` made publishable**: removed `private: true`, added
  `publishConfig.access: public`

- **`CoreClaims.payment` now optional** (`@peac/schema`): supports attestation
  receipts that have no payment field

- **SHA-pinned GitHub Actions** in CI workflow
  - `actions/checkout@11bd71901...` (v4.2.2)
  - `actions/setup-node@49933ea52...` (v4.4.0)

- **DevDep bumps**: fast-check 4.5.3, prettier 3.8.1, tsx 4.21.0

### Fixed

- **Dependency-cruiser regex bug**: `middleware` and `telemetry` alternations
  in layer rules did not match hyphenated names (`middleware-core`,
  `middleware-express`, `telemetry-otel`). Changed to `[^/]*` suffix pattern.
  `includeOnly` expanded from `{1,2}` to `{1,4}` for nested adapters.

- **Broken Husky pre-commit hook removed**: called `lint-staged` which was
  not installed, giving false "local gate passed" signal

- **Build artifacts removed from source**: deleted `.d.ts` and `.d.ts.map`
  files from `packages/pay402/src/`

- **Orphaned directory removed**: `packages/nextjs/` (plan doc moved to
  `reference/`)

- **JWKS resolver options** in verify API: fixed option names to match
  `ResolverOptions` type (`fetchTimeoutMs` -> `timeoutMs`, `cacheTtlSeconds` ->
  `defaultTtlSeconds`)

- **Unicode guard made fail-closed** (`scripts/guard.sh`): missing detector
  script now fails the gate instead of silently skipping

### Security

- JWKS stale-if-error defaults to disabled (`allowStale: false`): server apps
  must explicitly opt in
- Rate-limit store bounded by `maxKeys` with LRU eviction: prevents memory
  exhaustion under sustained load
- Publish-manifest closure check prevents broken dependency chains on npm

## [0.10.8]

### Adoption Release: Middleware, Conformance, and Infrastructure

v0.10.8 ships the full adoption stack: middleware for receipt issuance, conformance
testing tools, and infrastructure apps (sandbox issuer, browser verifier, verify API).

### Added

- **@peac/middleware-core**: Framework-agnostic middleware primitives for PEAC receipt issuance
  - `createReceipt()`, `wrapResponse()`, `selectTransport()`, `validateConfig()`
  - Ed25519 signing, automatic transport selection (header/body/pointer)

- **@peac/middleware-express**: Express.js middleware for automatic receipt issuance
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

- **isProblemError() type guard**: Centralized duck-typed ProblemError detection
  across tsup bundle boundaries (solves instanceof drift)

- **Unicode sanitizer** (`scripts/sanitize-unicode.mjs`)
  - Uses `git ls-files` as single source of truth (1236 files)
  - Supports --fix mode (NBSP -> space, strip others)

- **CI enhancements**: test:apps, check:unicode, sandbox health smoke job

- **Root SECURITY.md** pointer to `.github/SECURITY.md`

### Fixed

- RFC 9457 Content-Type enforcement: use `c.body()` not `c.json()` for problem details
  (Hono's c.json() always overrides Content-Type to application/json)
- Security headers now applied on all error paths including early-return 429/413

## [0.10.7]

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

## [0.10.5]

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

## [0.10.4]

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

## [0.10.3]

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

## [0.10.2]

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

## [0.10.1]

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

## [0.10.0]

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

## [0.9.31]

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

## [0.9.30]

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

## [0.9.29]

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

## [0.9.28]

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

- **Full Go SDK (Issue + Policy)** -> Moved to v0.9.29
  - Only verify.go exists; issue.go and policy.go not implemented
  - 4-6 day implementation timeline required
- **npm publish** -> Moved to v0.9.31
  - Latest-only publishing policy
  - Quality gates need validation with real deployments
- **Faremeter Adapter** -> Moved to v0.9.30
- **Python SDK** -> Moved to post-v0.10.0
- **@peac/nextjs v0.1** -> Moved to v0.9.30

### Notes

- No breaking changes (additive only)
- All packages bumped to 0.9.28
- Cross-referenced with quality audit: `reference/V0928_QUALITY_AUDIT.md`

## [0.9.27]

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

## [0.9.26]

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

## [0.9.25]

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

## [0.9.24]

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

## [0.9.23]

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

## [0.9.22]

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

## [0.9.21]

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

## [0.9.20]

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

## [0.9.19]

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

## [0.9.18]

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

## [0.9.17]

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

## [0.9.16]

### Added

- **Control Abstraction Layer (CAL) semantics**: `ControlPurpose` (`crawl`, `index`, `train`, `inference`), `ControlLicensingMode` (`subscription`, `pay_per_crawl`, `pay_per_inference`), and `any_can_veto` decision combinator with chain validation
- **PaymentEvidence extensions**: `aggregator` field for marketplace or platform identifiers, `splits[]` array for multi-party allocation with invariants (party required, amount or share required)
- **Subject Profile Catalogue**: `SubjectProfile` and `SubjectProfileSnapshot` types and validators for `human`, `org`, and `agent` subjects
- **Subject profile privacy guidance**: PROTOCOL-BEHAVIOR Section 8.4 specifying SubjectProfile as OPTIONAL, with opaque identifiers, data minimization, and retention documentation requirements

### Changed

- `@peac/schema` now exports CAL, PaymentEvidence, and SubjectProfile validators
- PROTOCOL-BEHAVIOR version set to 0.9.16 and extended with Section 8.4 privacy guidance

## [0.9.15]

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

## [0.9.14]

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

## [0.9.13.2]

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

## [0.9.10-beta]

### Added

- **Signed Agent-Directory Caching**: TOFU pinning with key rotation support and comprehensive SSRF protection
- **Receipt Key Rotation**: JWS `kid` header support for seamless key rotation without downtime
- **Batch Verify API**: High-performance batch verification (POST <=100 items, GET <=25 items)
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

## [0.9.6]

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
