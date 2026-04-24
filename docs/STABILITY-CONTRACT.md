# Stability contract

This document classifies every public surface PEAC publishes. The
classification is binding for the declared release line. Each row names the
exact surface path, package, header, API, or artifact so consumers can pin
expectations to concrete, reviewable entries.

## Classifications

| Classification  | Commitment                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `stable`        | Public commitment. Breaking changes at a declared major-version boundary. Wire constants in this class are frozen until v1.0. |
| `experimental`  | Public but explicitly subject to change. Breaking changes may land in any release with a CHANGELOG note. Flagged in source.   |
| `deprecated`    | Public and supported within its declared window; scheduled for removal at a named release.                                    |
| `internal-only` | Not part of the public surface. Not documented on README, `docs/START_HERE.md`, examples, listings, or marketing prose.       |

These classifications describe behavioral stability, not package-level
maintenance (security and correctness fixes apply to every active line per
[Security operations](SECURITY-OPERATIONS.md)).

## Wire formats

| Surface                    | Concrete identifier                                       | Classification | Notes                                                          |
| -------------------------- | --------------------------------------------------------- | -------------- | -------------------------------------------------------------- |
| Current interaction record | `typ: interaction-record+jwt` (JWS JOSE header; Wire 0.2) | `stable`       | Frozen wire identifiers until v1.0                             |
| Legacy receipt format      | `peac-receipt/0.1` (Wire 0.1)                             | `stable`       | Verify-only path frozen; no new-feature extensions             |
| Archival receipt format    | `peac.receipt/0.9`                                        | `deprecated`   | Verify-only via `@peac/core` archival path; removal at v0.13.0 |
| Cryptographic envelope     | JWS Compact Serialization (RFC 7515), Ed25519 (RFC 8032)  | `stable`       | Algorithm negotiation is not supported                         |
| Canonical JSON             | JCS (RFC 8785)                                            | `stable`       | Cross-language parity fixtures in `specs/conformance/`         |
| Verifier response bodies   | `application/json` (RFC 8259)                             | `stable`       | Error bodies: `application/problem+json` (RFC 9457)            |

## Public TypeScript APIs

| Surface (package)                                                                           | Classification  | Notes                                                                                                                      |
| ------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`@peac/protocol`](../packages/protocol) `issue()`                                          | `stable`        | Wire 0.2 issuance entry point                                                                                              |
| [`@peac/protocol`](../packages/protocol) `verifyLocal()`                                    | `stable`        | Offline verification                                                                                                       |
| [`@peac/protocol`](../packages/protocol) `verify()`                                         | `stable`        | Verification with optional hosted report assembly                                                                          |
| `@peac/protocol` discovery / JWKS resolver helpers                                          | `internal-only` | Use via `verifyLocal()` / `verify()`; see [protocol-behavior](specs/PROTOCOL-BEHAVIOR.md)                                  |
| [`@peac/crypto`](../packages/crypto) Ed25519 sign / verify                                  | `stable`        | RFC 8032 primitives                                                                                                        |
| [`@peac/crypto`](../packages/crypto) JCS                                                    | `stable`        | RFC 8785 serialization                                                                                                     |
| [`@peac/schema`](../packages/schema) record + extension-group exports                       | `stable`        | Zod v4 schemas                                                                                                             |
| [`@peac/kernel`](../packages/kernel) type URIs and constants                                | `stable`        | Some constants relocate in a later release with a compat barrel; announced via [deprecation policy](DEPRECATION_POLICY.md) |
| `@peac/control` high-level APIs                                                             | `stable`        | Compose `@peac/protocol` with higher-level flows                                                                           |
| `@peac/middleware-core`, `@peac/middleware-express`                                         | `stable`        | HTTP middleware                                                                                                            |
| `@peac/disc` issuer-config resolution                                                       | `stable`        | `/.well-known/peac-issuer.json` → `jwks_uri`                                                                               |
| `@peac/jwks-cache`                                                                          | `stable`        | Bounded LRU JWKS cache with kid-reuse detection                                                                            |
| `@peac/audit` bundle exports                                                                | `stable`        | Offline dispute-bundle composition                                                                                         |
| [`@peac/adapter-core`](../packages/adapters/core) `assertExplicitFinality`                  | `stable`        | Commerce mapper-boundary guard                                                                                             |
| `@peac/mappings-{mcp,a2a,acp,paymentauth,ucp,content-signals,intoto,slsa}`                  | `stable`        | Observation mappers                                                                                                        |
| `@peac/adapter-{x402,openclaw,eat,did,managed-agents,runtime-governance,openai-compatible}` | `stable`        | Layer 4 adapters                                                                                                           |
| `@peac/rails-x402`, `@peac/rails-card`, `@peac/rails-razorpay`, `@peac/rails-stripe`        | `stable`        | Commerce rails                                                                                                             |
| `@peac/http-signatures`                                                                     | `stable`        | RFC 9421 helpers                                                                                                           |
| `@peac/net-node` SSRF-safe fetch                                                            | `stable`        | Used by resolver paths; see [security considerations](specs/SECURITY-CONSIDERATIONS.md)                                    |
| `@peac/transport-grpc`                                                                      | `stable`        | A2A gRPC carrier                                                                                                           |
| `@peac/policy-kit`                                                                          | `stable`        | Policy authoring helpers (non-enforcement)                                                                                 |
| `@peac/capture-core`, `@peac/capture-node`                                                  | `stable`        | Local capture utilities                                                                                                    |
| `@peac/telemetry`, `@peac/telemetry-otel`                                                   | `stable`        | OpenTelemetry signals (opt-in)                                                                                             |
| `@peac/contracts`                                                                           | `stable`        | Machine-readable contract exports                                                                                          |
| `@peac/pay402`, `@peac/pref`, `@peac/attribution`, `@peac/receipts`                         | `stable`        | Supporting packages on Layer 4                                                                                             |
| `@peac/worker-core`                                                                         | `stable`        | Worker-oriented helpers                                                                                                    |
| `@peac/core`                                                                                | `deprecated`    | Archival; Wire 0.9 verify-only path; removal at v0.13.0                                                                    |
| `@peac/sdk`                                                                                 | `deprecated`    | Workspace stub; removal at v0.13.0                                                                                         |

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

## Reference verifier (`apps/api`)

| Surface               | Path                                                                             | Classification                                                  |
| --------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `POST /v1/verify`     | [`apps/api`](../apps/api)                                                        | `stable`                                                        |
| `POST /v1/issue`      | `apps/api` (provisional; see [Hosted issue contract](HOSTED_VERIFY_CONTRACT.md)) | `experimental`                                                  |
| Legacy `POST /verify` | `apps/api`                                                                       | `deprecated` (Deprecation + Sunset headers; removal at v0.13.0) |

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

| Surface                   | Path                                                                                                         | Classification  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------- |
| Historical bridge app     | [`apps/bridge`](../apps/bridge)                                                                              | `internal-only` |
| Sandbox issuer            | [`apps/sandbox-issuer`](../apps/sandbox-issuer)                                                              | `internal-only` |
| Experimental EAS adapter  | [`packages/adapters/eas`](../packages/adapters/eas)                                                          | `experimental`  |
| Experimental transports   | [`packages/transport/http`](../packages/transport/http), [`packages/transport/ws`](../packages/transport/ws) | `experimental`  |
| Nextjs middleware preview | [`surfaces/nextjs/middleware`](../surfaces/nextjs/middleware)                                                | `experimental`  |

## Deprecation schedule

| Surface                                                   | Deprecated since | Removal target           | Status                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | ---------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProofMethodSchema` (compat alias)                        | v0.12.2          | v0.13.0                  | **Removed in v0.13.0 PR B.** Transport-binding values (`http-message-signature`, `dpop`, `mtls`, `jwk-thumbprint`) inlined on `AgentProofSchema.method`.                                                                                |
| A2A v0.3.0 compatibility path                             | v0.12.3          | v0.13.0 PR B             | **Removed in v0.13.0 PR B.** Agent Cards carrying only a top-level `url`, kebab-case TaskState strings, and the `/.well-known/agent.json` legacy discovery path are no longer accepted. A2A v1.0.0 `supportedInterfaces[]` is required. |
| Legacy `POST /verify` endpoint (in favor of `/v1/verify`) | v0.12.x          | post-Sunset (2026-11-01) | v0.13.0 PR B removes from active OpenAPI teaching; runtime alias preserved until advertised Sunset date                                                                                                                                 |
| `packages/sdk-js/` workspace stub                         | v0.12.x          | v0.13.0 PR B             | Scheduled                                                                                                                                                                                                                               |
| `peac.receipt/0.9` archival format                        | Legacy frozen    | v0.13.0 (quarantine)     | Quarantined to historical contexts; wire stays frozen                                                                                                                                                                                   |
| `@peac/core` archival verify-only path                    | Legacy frozen    | v0.13.0 PR B             | Scheduled (coupled with legacy `/verify` handler rewire)                                                                                                                                                                                |

All status transitions are tracked in
[`REPO_SURFACE_STATUS.json`](../REPO_SURFACE_STATUS.json) and mirrored in
[`docs/SURFACE_STATUS.md`](SURFACE_STATUS.md) and
[`docs/PACKAGE_STATUS.md`](PACKAGE_STATUS.md). Support windows and fix
policy live in [Security operations](SECURITY-OPERATIONS.md) and
[Deprecation policy](DEPRECATION_POLICY.md).

## Forthcoming surfaces (pre-doctrine)

The following surfaces are not yet shipped. They enter the stability
contract only when the corresponding code lands. Classifications here are
forward-looking and binding for the future public code, not for any
current behavior.

| Surface                                               | Status      | Target                                                             |
| ----------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| CLI execution-evidence carrier profile                | Not shipped | v0.14.1                                                            |
| Observational lifecycle-record carrier profile        | Not shipped | v0.14.1                                                            |
| COSE/CBOR codec flag (`PEAC_EXPERIMENTAL_CODEC=cose`) | Not shipped | `experimental` once shipped; gated by an explicit roadmap decision |

Security and semantic constraints pre-declared for these surfaces live in
the [Threat model](THREAT_MODEL.md) forward-looking subsection.

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
