# Stability contract

This document classifies every public surface PEAC publishes. The
classification is binding for the declared release line. Each row names the
exact surface path, package, header, API, or artifact so consumers can pin
expectations to concrete, reviewable entries.

## Classifications

| Classification  | Commitment                                                                                                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stable`        | Public commitment. Breaking changes at a declared major-version boundary. Wire constants in this class are frozen until v1.0.                                                                                                |
| `experimental`  | Public but explicitly subject to change. Breaking changes may land in any release with a CHANGELOG note. Flagged in source.                                                                                                  |
| `deprecated`    | Public and supported within its declared window; scheduled for removal at a named release.                                                                                                                                   |
| `archived`      | Historical surface removed from the active workspace. Source was removed from HEAD and is recoverable from git history and tags; historical npm versions may remain installable, but new integrations MUST NOT depend on it. |
| `internal-only` | Not part of the public surface. Not documented on README, `docs/START_HERE.md`, examples, listings, or marketing prose.                                                                                                      |

These classifications describe behavioral stability, not package-level
maintenance (security and correctness fixes apply to every active line per
[Security operations](SECURITY-OPERATIONS.md)).

## Wire formats

| Surface                    | Concrete identifier                                       | Classification | Notes                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current interaction record | `typ: interaction-record+jwt` (JWS JOSE header; Wire 0.2) | `stable`       | Frozen wire identifiers until v1.0                                                                                                                                |
| Legacy receipt format      | `peac-receipt/0.1` (Wire 0.1)                             | `stable`       | Verify-only path frozen; no new-feature extensions                                                                                                                |
| Archival receipt format    | `peac.receipt/0.9`                                        | `archived`     | Historical verify-only path. Source removed from HEAD (recoverable from git history and `v0.9.x` tags); historical npm `@peac/core@<=0.9.14` remains installable. |
| Cryptographic envelope     | JWS Compact Serialization (RFC 7515), Ed25519 (RFC 8032)  | `stable`       | Algorithm negotiation is not supported                                                                                                                            |
| Canonical JSON             | JCS (RFC 8785)                                            | `stable`       | Cross-language parity fixtures in `specs/conformance/`                                                                                                            |
| Verifier response bodies   | `application/json` (RFC 8259)                             | `stable`       | Error bodies: `application/problem+json` (RFC 9457)                                                                                                               |

**Wire 0.1 compatibility.** `issueWire01()` and `IssueWire01Options` in `@peac/protocol`, plus `Wire01JWSHeader` / `Wire01JWSHeaderSchema` in `@peac/crypto` and `@peac/schema`, remain stable for backward compatibility with existing downstream issuers. Wire 0.1 issuance is deprecated and discouraged for new integrations; new applications should use `issue()`. The public default verifier `verifyLocal()` is current-Wire only and returns `E_UNSUPPORTED_WIRE_VERSION` for Wire 0.1 input. The reference implementation retains `verifyLocalWire01()` as an internal legacy verification path for archival and replay use cases. No new protocol features are added to Wire 0.1.

## Public TypeScript APIs

| Surface (package)                                                                           | Classification  | Notes                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@peac/protocol`](../packages/protocol) `issue()`                                          | `stable`        | Wire 0.2 issuance entry point                                                                                                                                                                                                                |
| [`@peac/protocol`](../packages/protocol) `verifyLocal()`                                    | `stable`        | Offline verification                                                                                                                                                                                                                         |
| [`@peac/protocol`](../packages/protocol) `verify()`                                         | `stable`        | Verification with optional hosted report assembly                                                                                                                                                                                            |
| `@peac/protocol` discovery / JWKS resolver helpers                                          | `internal-only` | Use only through documented verification flows; do not import resolver helpers directly. See [protocol-behavior](specs/PROTOCOL-BEHAVIOR.md).                                                                                                |
| [`@peac/crypto`](../packages/crypto) Ed25519 sign / verify                                  | `stable`        | RFC 8032 primitives                                                                                                                                                                                                                          |
| [`@peac/crypto`](../packages/crypto) JCS                                                    | `stable`        | RFC 8785 serialization                                                                                                                                                                                                                       |
| [`@peac/schema`](../packages/schema) record + extension-group exports                       | `stable`        | Zod v4 schemas                                                                                                                                                                                                                               |
| [`@peac/kernel`](../packages/kernel) type URIs and constants                                | `stable`        | Some constants relocate in a later release with a compat barrel; announced via [deprecation policy](DEPRECATION_POLICY.md)                                                                                                                   |
| `@peac/control` high-level APIs                                                             | `stable`        | Compose `@peac/protocol` with higher-level flows                                                                                                                                                                                             |
| `@peac/middleware-core`, `@peac/middleware-express`                                         | `stable`        | HTTP middleware                                                                                                                                                                                                                              |
| `@peac/disc`                                                                                | `archived`      | Archived at v0.13.0; source removed from HEAD (recoverable from git history and tags); historical npm remains installable. Use `@peac/policy-kit` for peac.txt policy-document loading.                                                      |
| `@peac/jwks-cache`                                                                          | `stable`        | Bounded LRU JWKS cache with kid-reuse detection                                                                                                                                                                                              |
| `@peac/audit` bundle exports                                                                | `stable`        | Offline dispute-bundle composition                                                                                                                                                                                                           |
| [`@peac/adapter-core`](../packages/adapters/core) `assertExplicitFinality`                  | `stable`        | Commerce mapper-boundary guard                                                                                                                                                                                                               |
| `@peac/mappings-{mcp,a2a,acp,paymentauth,ucp,content-signals,intoto,slsa}`                  | `stable`        | Observation mappers                                                                                                                                                                                                                          |
| `@peac/adapter-{x402,openclaw,eat,did,managed-agents,runtime-governance,openai-compatible}` | `stable`        | Layer 4 adapters                                                                                                                                                                                                                             |
| `@peac/rails-x402`, `@peac/rails-card`, `@peac/rails-razorpay`, `@peac/rails-stripe`        | `stable`        | Commerce rails                                                                                                                                                                                                                               |
| `@peac/http-signatures`                                                                     | `stable`        | RFC 9421 helpers                                                                                                                                                                                                                             |
| `@peac/net-node` SSRF-safe fetch                                                            | `stable`        | Used by resolver paths; see [security considerations](specs/SECURITY-CONSIDERATIONS.md)                                                                                                                                                      |
| `@peac/transport-grpc`                                                                      | `stable`        | A2A gRPC carrier                                                                                                                                                                                                                             |
| `@peac/policy-kit`                                                                          | `stable`        | Policy authoring helpers (non-enforcement)                                                                                                                                                                                                   |
| `@peac/capture-core`, `@peac/capture-node`                                                  | `stable`        | Local capture utilities                                                                                                                                                                                                                      |
| `@peac/telemetry`, `@peac/telemetry-otel`                                                   | `stable`        | OpenTelemetry signals (opt-in)                                                                                                                                                                                                               |
| `@peac/contracts`                                                                           | `stable`        | Machine-readable contract exports                                                                                                                                                                                                            |
| `@peac/pay402`, `@peac/attribution`, `@peac/receipts`                                       | `stable`        | Supporting packages on Layer 4                                                                                                                                                                                                               |
| `@peac/pref`                                                                                | `archived`      | Archived at v0.13.0 (deprecated facade since v0.12.14); source removed from HEAD (recoverable from git history and tags); historical npm remains installable. Use `@peac/mappings-content-signals` for AIPREF / robots.txt / tdmrep parsing. |
| `@peac/worker-core`                                                                         | `stable`        | Worker-oriented helpers                                                                                                                                                                                                                      |
| `@peac/core`                                                                                | `archived`      | Archived at v0.13.0; source removed from HEAD (recoverable from git history and `v0.9.x` tags); historical npm `<=0.9.14` remains installable                                                                                                |
| `@peac/sdk`                                                                                 | `archived`      | Archived; historical npm `<=0.10.2` remains installable                                                                                                                                                                                      |

Consumers: import only from the package's documented public entry points.
Subpath imports into internal modules are not a stable surface even when
`package.json` `exports` permits them; such imports may break without a
breaking-version bump on the package.

## Machine-readable contracts

| Surface                       | Path                                                                                                                  | Classification           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `@peac/crypto` API contract   | [`contracts/api/crypto.json`](../contracts/api/crypto.json)                                                           | `stable`                 |
| `@peac/kernel` API contract   | [`contracts/api/kernel.json`](../contracts/api/kernel.json)                                                           | `stable`                 |
| `@peac/protocol` API contract | [`contracts/api/protocol.json`](../contracts/api/protocol.json)                                                       | `stable`                 |
| `@peac/schema` API contract   | [`contracts/api/schema.json`](../contracts/api/schema.json)                                                           | `stable`                 |
| Reference verifier OpenAPI    | [`packages/schema/openapi/verify.yaml`](../packages/schema/openapi/verify.yaml)                                       | `stable` (OpenAPI 3.1.1) |
| Conformance fixtures          | [`specs/conformance/`](../specs/conformance/)                                                                         | `stable`                 |
| Registries spec               | [`docs/specs/REGISTRIES.md`](specs/REGISTRIES.md) + [`specs/kernel/registries.json`](../specs/kernel/registries.json) | `stable`                 |
| Error taxonomy                | [`docs/specs/ERRORS.md`](specs/ERRORS.md) + [`specs/kernel/errors.json`](../specs/kernel/errors.json)                 | `stable`                 |

## CLI commands

Package: [`@peac/cli`](../packages/cli).

| Command                               | Classification |
| ------------------------------------- | -------------- |
| `peac verify`                         | `stable`       |
| `peac issue`                          | `stable`       |
| `peac doctor`                         | `stable`       |
| `peac conformance run`                | `stable`       |
| `peac samples list`/`show`/`generate` | `stable`       |
| `peac reconcile`                      | `stable`       |
| `peac policy`                         | `stable`       |
| `peac observe command`                | `stable`       |
| `peac record command`                 | `stable`       |
| `peac emit lifecycle`                 | `stable`       |

`peac observe command` and `peac record command` are POSIX-first
wrappers that emit observational records of a local command execution
(unsigned JSON or Wire 0.2 compact JWS, respectively). Both are
OBSERVERS, not a sandbox, permission system, shell orchestrator, or
process supervisor; they NEVER synthesize shell syntax. The full
contract is specified in
[`docs/specs/CLI-CARRIER-PROFILE.md`](specs/CLI-CARRIER-PROFILE.md).
The `--unsafe-ephemeral-key` flag generates an ephemeral local
signing key whose public key is not published through normal
issuer-key discovery; use only for local development and tests.
Windows behavior is not guaranteed by the current CLI carrier
profile.

`peac emit lifecycle` issues a Wire 0.2 compact JWS lifecycle
observation record using the caller-provided issuer key. The caller
observed the lifecycle event (an external approval, evaluation,
experiment, workflow transition, or mode tag); the CLI is the
issuance path; the caller's issuer is the signer-of-record. PEAC
provides the record format, validation, and signing path. PEAC does
not approve, evaluate, score, transition, orchestrate, schedule, or
vouch for the truth of the event. The full contract is specified in
[`docs/specs/LIFECYCLE-OBSERVATION-PROFILE.md`](specs/LIFECYCLE-OBSERVATION-PROFILE.md).
`--observed-at` is REQUIRED; the wrapper does not silently default
the external event time to wrapper-invocation time.

## Reference verifier (`apps/api`)

| Surface               | Path                                                                             | Classification                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/verify`     | [`apps/api`](../apps/api)                                                        | `stable`                                                                                                                      |
| `POST /v1/issue`      | `apps/api` (provisional; see [Hosted issue contract](HOSTED_VERIFY_CONTRACT.md)) | `experimental`                                                                                                                |
| Legacy `POST /verify` | `apps/api`                                                                       | `deprecated` (delegates in-process to `/v1/verify`; Deprecation + Sunset headers; runtime removal no earlier than 2026-11-01) |

Response shapes:

| Media type                                    | Classification |
| --------------------------------------------- | -------------- |
| `application/json` (default)                  | `stable`       |
| `application/peac-report+json`                | `stable`       |
| `application/problem+json` (errors; RFC 9457) | `stable`       |
| `text/plain` (human-readable)                 | `stable`       |

## MCP server surfaces

Package: [`@peac/mcp-server`](../packages/mcp-server).

| Surface                                                                                                          | Classification |
| ---------------------------------------------------------------------------------------------------------------- | -------------- |
| MCP tool-call `_meta.org.peacprotocol/receipt_jws` + `receipt_ref`                                               | `stable`       |
| `stdio` transport                                                                                                | `stable`       |
| Streamable HTTP transport (unprotected mode; see [HTTP transport security](security/HTTP-TRANSPORT-SECURITY.md)) | `stable`       |
| Registry manifest ([`packages/mcp-server/server.json`](../packages/mcp-server/server.json))                      | `stable`       |
| Smithery config ([`packages/mcp-server/smithery.yaml`](../packages/mcp-server/smithery.yaml))                    | `stable`       |

## IDE plugin packs

Path: [`surfaces/plugin-pack/`](../surfaces/plugin-pack/).

| Surface                                                                 | Classification |
| ----------------------------------------------------------------------- | -------------- |
| `surfaces/plugin-pack/cursor/`                                          | `stable`       |
| `surfaces/plugin-pack/codex/`                                           | `stable`       |
| `surfaces/plugin-pack/claude-code/`                                     | `stable`       |
| `surfaces/plugin-pack/vscode/`                                          | `stable`       |
| `surfaces/plugin-pack/continue/`, `opencode/`, `smithery/`, `windsurf/` | `experimental` |

## HTTP headers and identifiers

| Identifier                                               | Classification | Notes                                                            |
| -------------------------------------------------------- | -------------- | ---------------------------------------------------------------- |
| `PEAC-Receipt` header                                    | `stable`       | Compact JWS; see [PROTOCOL-BEHAVIOR](specs/PROTOCOL-BEHAVIOR.md) |
| `receipt_ref` (MCP `_meta.org.peacprotocol/receipt_ref`) | `stable`       | `sha256(receipt_jws)`                                            |
| `Deprecation` response header                            | `stable`       | RFC 9745 on deprecated routes                                    |
| `Sunset` response header                                 | `stable`       | RFC 8594 on removed routes                                       |

## Archived surfaces

| Surface                   | Path                                                                                        | Classification  |
| ------------------------- | ------------------------------------------------------------------------------------------- | --------------- |
| Historical bridge app     | [`apps/bridge`](../apps/bridge)                                                             | `internal-only` |
| Sandbox issuer            | [`apps/sandbox-issuer`](../apps/sandbox-issuer)                                             | `internal-only` |
| Experimental EAS adapter  | [`packages/adapters/eas`](../packages/adapters/eas)                                         | `experimental`  |
| Archived transports       | `transport/http`, `transport/ws` (removed from HEAD; recoverable from git history and tags) | `archived`      |
| Nextjs middleware preview | [`surfaces/nextjs/middleware`](../surfaces/nextjs/middleware)                               | `experimental`  |

## Deprecation schedule

| Surface                                                   | Deprecated since | Removal target           | Status                                                                                                                                                                                                                             |
| --------------------------------------------------------- | ---------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProofMethodSchema` (compat alias)                        | v0.12.2          | v0.13.0                  | **Removed in v0.13.0.** Transport-binding values (`http-message-signature`, `dpop`, `mtls`, `jwk-thumbprint`) inlined on `AgentProofSchema.method`.                                                                                |
| A2A v0.3.0 compatibility path                             | v0.12.3          | v0.13.0                  | **Removed in v0.13.0.** Agent Cards carrying only a top-level `url`, kebab-case TaskState strings, and the `/.well-known/agent.json` legacy discovery path are no longer accepted. A2A v1.0.0 `supportedInterfaces[]` is required. |
| Legacy `POST /verify` endpoint (in favor of `/v1/verify`) | v0.12.x          | post-Sunset (2026-11-01) | Removed from active OpenAPI teaching at v0.13.0. Runtime alias preserved, delegating in-process to `/v1/verify`, until the advertised Sunset date.                                                                                 |
| `packages/sdk-js/` workspace stub                         | v0.12.x          | v0.13.0                  | **Removed in v0.13.0.** Historical source recoverable from git history and tags; new integrations use `@peac/protocol` directly.                                                                                                   |
| `peac.receipt/0.9` archival format                        | Legacy frozen    | v0.13.0 (quarantine)     | Quarantined to historical contexts; wire stays frozen                                                                                                                                                                              |
| `@peac/core` archival verify-only path                    | Legacy frozen    | v0.13.0                  | **Archived in v0.13.0** (source removed from HEAD; recoverable from git history and `v0.9.x` tags); historical npm `<=0.9.14` remains installable.                                                                                 |

All status transitions are tracked in
[`REPO_SURFACE_STATUS.json`](../REPO_SURFACE_STATUS.json) and mirrored in
[`docs/SURFACE_STATUS.md`](SURFACE_STATUS.md) and
[`docs/PACKAGE_STATUS.md`](PACKAGE_STATUS.md). Support windows and fix
policy live in [Security operations](SECURITY-OPERATIONS.md) and
[Deprecation policy](DEPRECATION_POLICY.md).

## Unshipped experimental surfaces

The following surfaces are not shipped in the current release. They are
listed only to make the stability boundary explicit. They do not describe
current behavior and are not a commitment to ship without a separate
release decision.

| Surface                                               | Status      | Target                                                             |
| ----------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| COSE/CBOR codec flag (`PEAC_EXPERIMENTAL_CODEC=cose`) | Not shipped | `experimental` once shipped; gated by an explicit release decision |

No public COSE/CBOR codec ships in this release. Security and semantic
constraints for additional codec surfaces are documented with any
released public code.

## Internal-only flags

The following flags are **internal-only**: subject to change without
notice; not part of the public surface; not documented on front-door
surfaces; not supported in production deployments. They are documented
here for transparency to maintainers and security researchers, NOT as
a public-API commitment.

| Flag                                                                         | Surface                                       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PEAC_INTERNAL_SHADOW_CORE=1` (env) or `_internal.shadowCore: true` (option) | `@peac/protocol.{issue, verifyLocal}`         | Activates an observational shadow path that runs the bounded internal validator alongside the canonical Zod validator. Mismatches accumulate in a bounded in-memory log. Used for cross-implementation parity observation across the v0.13.x window.                                                                                                                                                                                                                                                                                                                                                                             |
| `PEAC_INTERNAL_SHADOW_RESOLVER=1` (env)                                      | `apps/api` shadow-mode diagnostic foundation  | Activates lazy loading of the workspace-private resolver composition layer used by the shadow-mode pointer-fetch parity foundation. v0.13.2 ships only the foundation (boundary, normalization, sink, executor, no-network smoke); no live route integration, no internal endpoint, no public surface change.                                                                                                                                                                                                                                                                                                                    |
| `PEAC_INTERNAL_SHADOW_BUFFER_SIZE=<n>` (env)                                 | `apps/api` shadow-mismatch-sink ring buffer   | Overrides the default in-memory mismatch sink capacity. Clamped to `[64, 16384]`; default 1024.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `PEAC_INTERNAL_LEGACY_PATH=1` (env) or `_internal.legacyPath: true` (option) | `@peac/protocol.{issue, verifyLocal, verify}` | For `issue()` and `verifyLocal()`: routes the protocol entry points through the previous direct-canonical admission path (rollback) instead of the bounded validation path (default). For `verifyReceipt()` (Wire 0.1 verifier): no behavioral effect; the bounded validation path is keyed on Wire 0.2 claim shapes. Both flag values produce byte-equivalent public outputs across the covered runtime matrix. Version-specific operator runbook in [`docs/diagnostics/ROLLBACK-v0.14.0.md`](diagnostics/ROLLBACK-v0.14.0.md); release-neutral runbook in [`docs/diagnostics/ROLLBACK-PATH.md`](diagnostics/ROLLBACK-PATH.md). |
| `PEAC_EXPERIMENTAL_CODEC=<name>` (env, reserved)                             | `@peac/protocol.{issue, verifyLocal, verify}` | Selects a non-default record codec. v0.13.x ships `jws-jwt` only. Additional codecs, if released, are experimental unless this contract assigns a stronger classification.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Allowed locations for these identifiers in tracked source:

- `docs/STABILITY-CONTRACT.md` (this section).
- `packages/protocol/src/_internal/` (the wiring itself).
- `packages/protocol/__tests__/_internal/` (tests).
- Repository reference files outside the published package surface.

These identifiers MUST NOT appear in:

- the public TypeScript surface (`dist/index.d.ts`,
  `dist/verify-local.d.ts`),
- `README.md`, `docs/START_HERE.md`, `docs/PACKAGE_STATUS.md`,
- `examples/`, `integrator-kits/`, `surfaces/`,
- `llms.txt`, `CHANGELOG.md`,
- any release notes.

## Shadow-mode timeout guarantee class

The 250 ms wall-clock timeout enforced by the shadow-mode scheduler in
`@peac/protocol` is a **reporting** bound, not a hard preemption
guarantee. Specifically:

- Where the shadow function consults the supplied `AbortSignal` (the
  preferred shape for new shadow code; the runner always passes one),
  the timeout aborts the work and bounds CPU and memory.
- Where the shadow function is purely CPU-bound and does not consult
  the signal (the v0.13.1 record-core validators are this shape),
  JavaScript cannot preempt synchronous work. The runner stops
  awaiting and records a `timing-diff` divergence; the shadow
  function may continue to completion off the runner's await chain.
  The runner enforces no resource bound on non-cancellable shadow
  paths beyond the natural completion of the work.

Either way, the public-call boundary returns the real-path value
immediately. Shadow scheduling uses a macrotask boundary
(`setTimeout(..., 0)`) so the shadow function does not run before the
caller's awaited promise continuation. Pure-CPU validators are
themselves bounded by the record-content invariants in
[Resource limits](specs/RESOURCE-LIMITS.md), so the practical
resource bound holds even without runtime cancellation.

Hard cancellation is not part of the current stability commitment. Any
cancellation guarantee for validator entry points requires an explicit
release decision, documented semantics, and tests.

## Related documents

- [SECURITY.md](../SECURITY.md)
- [Security operations](SECURITY-OPERATIONS.md)
- [Deprecation policy](DEPRECATION_POLICY.md)
- [Compatibility matrix](COMPATIBILITY_MATRIX.md)
- [Surface status](SURFACE_STATUS.md)
- [Package status](PACKAGE_STATUS.md)
- [Threat model](THREAT_MODEL.md)
- [SLO](SLO.md)
- [Trust artifacts](TRUST-ARTIFACTS.md)
- [Compliance mappings](compliance/README.md)
- [Resource limits](specs/RESOURCE-LIMITS.md)
