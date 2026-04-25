# v0.13.0 baseline

> **Status:** Invariant snapshot. Captures the public surface, behavior,
> and limits that v0.13.0 ships, and pins them as the comparison point
> for follow-on releases. This document is descriptive, not aspirational:
> every row names a file path, exported identifier, or constant in the
> tagged tree.

## What v0.13.0 is

v0.13.0 finishes the public package-surface cleanup announced over the
v0.12.x line and lands the doctrine groundwork that the next releases
build on. It is not a wire format change, not a new public package
introduction, not a re-categorization, and not a market repositioning.

What v0.13.0 holds invariant:

- The wire format. `typ: interaction-record+jwt` (Wire 0.2) is the taught
  default and the only format actively documented in the public OpenAPI
  contract. `peac-receipt/0.1` (Wire 0.1) remains a frozen verify-only
  path with no new-feature extensions. `peac.receipt/0.9` is archived
  under [`archive/0.9.0-0.9.14/packages-core/`](../../archive/0.9.0-0.9.14/packages-core/);
  `@peac/core` is not published at v0.13.0 or later.
- The signing envelope. JWS Compact Serialization (RFC 7515) with
  Ed25519 (RFC 8032) is the only accepted shape. There is no algorithm
  negotiation surface and no COSE/CBOR pivot.
- The canonical JSON form. RFC 8785 JCS, validated against the
  cross-language parity corpus under
  [`specs/conformance/`](../../specs/conformance/).
- Public TypeScript APIs. `@peac/protocol.{issue, verifyLocal, verify}`
  are the stable issuance and verification entry points; their
  signatures and semantics are unchanged from v0.12.14. See
  [`docs/STABILITY-CONTRACT.md`](../STABILITY-CONTRACT.md) for the full
  classification table.
- The reference verifier contract. `POST /v1/verify` is the canonical
  operation. The legacy `POST /verify` and `POST /api/v1/verify` paths
  remain runtime-reachable as deprecated compatibility aliases through
  the advertised `Sunset: Sat, 01 Nov 2026 00:00:00 GMT`; the alias
  delegates in-process to `/v1/verify` and stamps RFC 9745
  `Deprecation`, RFC 8594 `Sunset`, and RFC 8288 `Link` headers on
  every response. The alias is not part of the active public OpenAPI
  contract.
- No new public package is introduced. The active publish manifest
  remains capped at 37 packages. Archived and retired surfaces are
  not added back to `packages[]`; historical npm versions remain
  installable and are handled through deprecation notices rather than
  unpublishing.

## Released-package surface

| Layer    | Package                                                                                              | Status at v0.13.0                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 0        | `@peac/kernel`                                                                                       | stable                                                                                            |
| 1        | `@peac/schema`                                                                                       | stable                                                                                            |
| 2        | `@peac/crypto`                                                                                       | stable                                                                                            |
| 2.5      | `@peac/telemetry`, `@peac/telemetry-otel`                                                            | stable                                                                                            |
| 2.5      | `@peac/capture-core`, `@peac/capture-node`                                                           | stable                                                                                            |
| 3        | `@peac/protocol`, `@peac/control`                                                                    | stable                                                                                            |
| 3        | `@peac/audit`                                                                                        | stable                                                                                            |
| 3        | `@peac/policy-kit`                                                                                   | stable                                                                                            |
| 3.5      | `@peac/middleware-core`                                                                              | stable                                                                                            |
| 3.5      | `@peac/middleware-express`                                                                           | stable                                                                                            |
| 4        | `@peac/contracts`                                                                                    | stable                                                                                            |
| 4        | `@peac/http-signatures`                                                                              | stable                                                                                            |
| 4        | `@peac/jwks-cache`                                                                                   | stable                                                                                            |
| 4        | `@peac/adapter-core`                                                                                 | stable                                                                                            |
| 4        | `@peac/adapter-x402` (+ daydreams / fluora / pinata)                                                 | stable                                                                                            |
| 4        | `@peac/adapter-did`                                                                                  | stable                                                                                            |
| 4        | `@peac/adapter-eat`                                                                                  | stable                                                                                            |
| 4        | `@peac/adapter-managed-agents`                                                                       | stable                                                                                            |
| 4        | `@peac/adapter-runtime-governance`                                                                   | stable                                                                                            |
| 4        | `@peac/adapter-openai-compatible`                                                                    | stable                                                                                            |
| 4        | `@peac/adapter-openclaw`                                                                             | stable                                                                                            |
| 4        | `@peac/mappings-mcp`, `-a2a`, `-acp`, `-ucp`, `-paymentauth`, `-content-signals`, `-intoto`, `-slsa` | stable                                                                                            |
| 4        | `@peac/rails-x402`                                                                                   | stable                                                                                            |
| 4        | `@peac/transport-grpc`                                                                               | stable                                                                                            |
| 4        | `@peac/net-node`                                                                                     | stable                                                                                            |
| 5        | `@peac/mcp-server`, `@peac/cli`                                                                      | stable                                                                                            |
| compat   | `@peac/disc`                                                                                         | deprecated; published as a one-release compatibility alias                                        |
| archived | `@peac/core`, `@peac/pref`, `@peac/sdk`                                                              | not published at v0.13.0 or later; historical npm versions remain installable for verify-only use |

The full machine-readable inventory lives in
[`REPO_SURFACE_STATUS.json`](../../REPO_SURFACE_STATUS.json) and is
regenerated by `scripts/generate-surface-status.mjs`. The list above
is a reading aid; the JSON is authoritative.

## Wire-format invariants

| Surface                         | Concrete identifier                                  | Held at v0.13.0         |
| ------------------------------- | ---------------------------------------------------- | ----------------------- |
| Active interaction-record `typ` | `interaction-record+jwt` (JWS JOSE header; Wire 0.2) | unchanged from v0.12.14 |
| Frozen receipt format           | `peac-receipt/0.1` (Wire 0.1)                        | unchanged               |
| Archived receipt format         | `peac.receipt/0.9`                                   | archive only            |
| Cryptographic envelope          | RFC 7515 JWS Compact Serialization, RFC 8032 Ed25519 | unchanged               |
| Canonical JSON                  | RFC 8785 JCS                                         | unchanged               |
| Verifier success Content-Type   | `application/json` (RFC 8259)                        | unchanged               |
| Verifier error Content-Type     | `application/problem+json` (RFC 9457)                | unchanged               |

## Resource-limit invariants

The full table with rationale per row is
[`docs/specs/RESOURCE-LIMITS.md`](../specs/RESOURCE-LIMITS.md). The
short list pinned at v0.13.0:

| Invariant                        | Constant                                                                     | Value     |
| -------------------------------- | ---------------------------------------------------------------------------- | --------- |
| Verifier request body cap        | `MAX_BODY_SIZE` (`apps/api/src/verify-v1.ts`)                                | 256 KiB   |
| Receipt JSON nesting depth       | `KERNEL_CONSTRAINTS.MAX_NESTED_DEPTH` (`packages/schema/src/constraints.ts`) | 32        |
| Receipt JSON array length        | `KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH`                                        | 10,000    |
| Receipt JSON object keys         | `KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS`                                         | 1,000     |
| Receipt JSON string length       | `KERNEL_CONSTRAINTS.MAX_STRING_LENGTH` (code units)                          | 65,536    |
| Receipt JSON total nodes         | `KERNEL_CONSTRAINTS.MAX_TOTAL_NODES`                                         | 100,000   |
| Clock skew                       | `KERNEL_CONSTRAINTS.CLOCK_SKEW_SECONDS`                                      | 60 s      |
| `peac.txt` policy fetch cap      | `MAX_BYTES` (`packages/discovery/src/index.ts`)                              | 256 KiB   |
| A2A carrier embed cap            | `A2A_MAX_CARRIER_SIZE` (`packages/mappings/a2a/src/types.ts`)                | 64 KiB    |
| receipt_url fetch cap            | `DEFAULT_MAX_BYTES` (`packages/net/node/src/receipt-resolver.ts`)            | 64 KiB    |
| net-node fetch timeout (default) | `DEFAULT_TIMEOUT_MS` (`packages/net/node/src/index.ts`)                      | 30,000 ms |
| net-node redirect chain cap      | `DEFAULT_MAX_REDIRECTS` (`packages/net/node/src/index.ts`)                   | 5         |
| `peac.txt` discovery timeout     | `DEFAULT_TIMEOUT_MS` (`packages/discovery/src/index.ts`)                     | 5,000 ms  |
| JWKS fetch timeout               | `DEFAULT_TIMEOUT_MS` (`packages/jwks-cache/src/resolver.ts`)                 | 5,000 ms  |
| JWKS cache TTL (default)         | `DEFAULT_TTL_SECONDS` (`packages/jwks-cache/src/resolver.ts`)                | 3,600 s   |
| JWKS cache TTL (max)             | `MAX_TTL_SECONDS`                                                            | 86,400 s  |
| JWKS keys per fetch (max)        | `DEFAULT_MAX_KEYS`                                                           | 100       |

## Error-taxonomy inventory

`specs/kernel/errors.json` defines the canonical error codes. At v0.13.0
this registry holds **186** entries; see
[`docs/baselines/ERROR-EMISSION-AUDIT-v0.13.0.md`](ERROR-EMISSION-AUDIT-v0.13.0.md)
for the per-code emission audit. No public error code is renumbered or
re-categorized in this release.

## Public API and CLI inventory

The exact set of value and type exports tracked under
[`docs/releases/api-surface/`](../releases/api-surface/) at v0.13.0:

- `@peac/kernel` — value and type exports per
  [`docs/releases/api-surface/kernel.txt`](../releases/api-surface/kernel.txt).
- `@peac/schema` — per
  [`docs/releases/api-surface/schema.txt`](../releases/api-surface/schema.txt).
- `@peac/crypto`, `@peac/protocol`, `@peac/control`,
  `@peac/middleware-core`, `@peac/adapter-eat`, `@peac/mcp-server`,
  `@peac/mappings-a2a` — per-file snapshots in the same directory.

The `bash scripts/release/api-surface-lock.sh` gate runs in CI and
fails on any unintentional drift from those snapshots. v0.13.0 tracks
nine packages (eight at v0.12.14 plus `@peac/mappings-a2a`).

## Reference-verifier endpoints

| Path                    | Status           | Notes                                                                                                            |
| ----------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `POST /v1/verify`       | stable           | Canonical verify operation; documented in OpenAPI 3.1.x                                                          |
| `POST /v1/issue`        | experimental     | BYO-key, disable via `PEAC_HOSTED_ISSUE=false`                                                                   |
| `GET /v1/issuer-health` | operational      | SSRF-safe issuer health probe                                                                                    |
| `GET /health`           | operational      | liveness                                                                                                         |
| `POST /verify`          | deprecated alias | Delegates in-process to `/v1/verify`; stamps RFC 9745 / 8594 / 8288 headers; alias removal not before 2026-11-01 |
| `POST /api/v1/verify`   | deprecated alias | Same alias treatment as `POST /verify`                                                                           |

## What changed between v0.12.14 and v0.13.0

- ProofMethodSchema removed from `@peac/schema`. Transport-binding
  values inlined on `AgentProofSchema.method`. ProofTypeSchema is
  unchanged.
- A2A v0.3.0 compatibility removed from `@peac/mappings-a2a`. A2A
  v1.0.0 `supportedInterfaces[]` is required; the legacy
  `/.well-known/agent.json` discovery path is no longer consulted.
- Legacy `POST /verify` removed from the active public OpenAPI
  contract. Runtime alias preserved with deprecation headers through
  the advertised Sunset.
- `@peac/core` archived to `archive/0.9.0-0.9.14/packages-core/`.
  `apps/api` no longer depends on it. Historical npm
  `@peac/core@<=0.9.14` remains installable for verify-only use of
  historical `peac.receipt/0.9` records.
- `@peac/pref` archived to `archive/pref/`. Migration target:
  `@peac/mappings-content-signals`.
- `@peac/disc` retained on npm as a one-release deprecated
  compatibility alias so workspace consumers (`@peac/cli`, `apps/api`)
  keep publish closure.
- Five empty Layer-6 pillar stubs (access, compliance, consent,
  intelligence, provenance) moved to `archive/pillars/`.
- `packages/sdk-js/` workspace stub deleted. Source archived
  previously.

For the per-package migration table see
[`docs/PACKAGE_STATUS_V0.13.0_PARITY.md`](../PACKAGE_STATUS_V0.13.0_PARITY.md);
for per-export migration guidance see
[`docs/MIGRATION_CURRENT.md`](../MIGRATION_CURRENT.md); for the
deprecation classification table see
[`docs/STABILITY-CONTRACT.md`](../STABILITY-CONTRACT.md).

## What this baseline does NOT promise

- This is a snapshot of the v0.13.0 tagged tree. It does not commit
  the release line to specific p50/p95/p99 latencies; those are
  captured separately in [`docs/SLO.md`](../SLO.md) and the
  [benchmark methodology](../BENCHMARK-METHODOLOGY.md).
- The open-source reference verifier carries no contractual SLA.
- Resource limits listed here are the values shipped at v0.13.0;
  follow-on releases may tighten them, but tightening is a roadmap
  decision and is not implied by this document.
- Compatibility with adjacent specifications (RFCs, IETF drafts, W3C
  drafts) is described in the
  [Standards Ledger](../STANDARDS_LEDGER.md). Listing a standard
  there does not imply certification.
