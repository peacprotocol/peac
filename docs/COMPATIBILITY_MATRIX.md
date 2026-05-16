# Compatibility Matrix

Current as of the repository state after the v0.14.3 profile additions.

## Wire Format Support

| Surface                    | Wire 0.2 (`interaction-record+jwt`)                                 | Wire 0.1 (`peac-receipt/0.1`)                                        | Status                                                         |
| -------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `@peac/protocol` (TS/Node) | Full: `issue()` + `verifyLocal()`                                   | Legacy verify only (`verifyLocalWire01()`, not exported from barrel) | **default**                                                    |
| `@peac/crypto` (TS/Node)   | Full: dual-stack sign/verify/decode                                 | Decode and verify only                                               | **default**                                                    |
| `@peac/schema` (TS/Node)   | Full: `Wire02ClaimsSchema`, extension groups, type enforcement      | Legacy `ReceiptClaimsSchema`                                         | **default**                                                    |
| `@peac/cli`                | Full                                                                | -                                                                    | **default**                                                    |
| `@peac/mcp-server`         | Full (5 tools)                                                      | -                                                                    | **default**                                                    |
| `@peac/middleware-express` | Full                                                                | -                                                                    | **default**                                                    |
| Go SDK (`sdks/go/`)        | Full: `Issue()` + `VerifyLocal()` + JCS (22 cross-language vectors) | Legacy verify only                                                   | **supported** (core issue/verify); middleware **experimental** |
| Python                     | API-first via reference verifier (httpx examples, `>=3.12`)         | -                                                                    | **examples only**                                              |
| `@peac/core`               | -                                                                   | Full (Wire 0.9 locked)                                               | **archived** (at v0.13.0)                                      |
| `@peac/sdk`                | -                                                                   | Full (Wire 0.1)                                                      | **archived** (use `@peac/protocol`)                            |

## Runtime Environments

| Environment                  | Status            | Notes                                                                  |
| ---------------------------- | ----------------- | ---------------------------------------------------------------------- |
| Node.js 24 (Active LTS)      | **Required**      | Canonical development and CI lane                                      |
| Node.js 22 (Maintenance LTS) | **Compatibility** | `engines.node >= 22.0.0` floor                                         |
| Node.js 25+                  | **Advisory**      | Forward-compat CI lane                                                 |
| Go 1.26+                     | **Default**       | Interaction Record format (core issue/verify); middleware experimental |
| Browser / Edge runtime       | **Partial**       | `@peac/schema` (no-network), verifier UI, worker surfaces              |

## Hosted Services

| Service                                           | Status                     | Endpoint                                                                                                                                                   |
| ------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference Verifier (`POST /v1/verify`)            | **Operational** (v0.12.11) | `POST /v1/verify` (RFC 9457, OpenAPI 3.1, content negotiation: `application/json`, `application/peac-report+json`, `text/plain`; `PEAC-Report-Id` header). |
| Reference Issuer Health (`GET /v1/issuer-health`) | **Operational** (v0.12.11) | `GET /v1/issuer-health?issuer=<url>` (SSRF-safe, independent rate limit, cached).                                                                          |
| Hosted Issue (`POST /v1/issue`)                   | **Alpha** (v0.12.8)        | Disabled by default; BYO-key, provisional.                                                                                                                 |

## Adapters, Mappings, Rails, and Transports

This table covers the Layer 4 surfaces most commonly referenced from the reference verifier flows and the adapter test vectors. The full Layer 4 surface set is machine-readable in [`REPO_SURFACE_STATUS.json`](../REPO_SURFACE_STATUS.json) and rendered at [`docs/SURFACE_STATUS.md`](SURFACE_STATUS.md). Every Layer 4 surface supports Wire 0.2 exclusively.

The **Adapter Readiness** column classifies each surface using the rubric below. Classifications default to the weaker, more conservative claim under ambiguity. Each row carries an evidence tag (`[e1]`..`[e5]`) whose target is documented in the Evidence section.

| Surface                            | Coverage                                                                         | Since    | Status      | Adapter Readiness               |
| ---------------------------------- | -------------------------------------------------------------------------------- | -------- | ----------- | ------------------------------- |
| `@peac/adapter-core`               | Mapper-boundary finality guard (`assertExplicitFinality`, `MapperBoundaryError`) | v0.12.11 | **Shipped** | `conformance-fixture-only` [e1] |
| `@peac/adapter-runtime-governance` | 6 observation-specific type URIs, AGT first mapper, session summary              | v0.12.10 | **Shipped** | `conformance-fixture-only` [e2] |
| `@peac/adapter-managed-agents`     | 6 event families, session summary                                                | v0.12.9  | **Shipped** | `conformance-fixture-only` [e3] |
| `@peac/adapter-x402`               | 4-layer verification, dual-header, V2 support, settlement extractor              | v0.12.1  | **Shipped** | `conformance-fixture-only` [e4] |
| `@peac/adapter-x402-daydreams`     | Daydreams bridge for x402                                                        | v0.12.1  | **Shipped** | `types-only` [e5]               |
| `@peac/adapter-x402-fluora`        | Fluora bridge for x402                                                           | v0.12.1  | **Shipped** | `types-only` [e5]               |
| `@peac/adapter-x402-pinata`        | Pinata bridge for x402                                                           | v0.12.1  | **Shipped** | `types-only` [e5]               |
| `@peac/adapter-eat`                | COSE_Sign1, Ed25519, privacy-first mapping                                       | v0.12.0  | **Shipped** | `conformance-fixture-only` [e1] |
| `@peac/adapter-did`                | did:key, did:web, DID Document resolver                                          | v0.12.6  | **Shipped** | `conformance-fixture-only` [e1] |
| `@peac/adapter-openai-compatible`  | OpenAI-compatible API surface observation                                        | v0.12.6  | **Shipped** | `types-only` [e5]               |
| `@peac/adapter-openclaw`           | OpenClaw bridge                                                                  | v0.12.6  | **Shipped** | `types-only` [e5]               |
| `@peac/mappings-mcp`               | MCP tool-call receipt attachment                                                 | v0.11.x  | **Shipped** | `conformance-fixture-only` [e1] |
| `@peac/mappings-a2a`               | A2A v1.0 normalizer                                                              | v0.12.3  | **Shipped** | `conformance-fixture-only` [e1] |
| `@peac/mappings-acp`               | ACP delegated-payment observation mapper                                         | v0.12.11 | **Shipped** | `conformance-fixture-only` [e4] |
| `@peac/mappings-paymentauth`       | paymentauth / MPP payment-attempt and settlement mappers                         | v0.12.11 | **Shipped** | `conformance-fixture-only` [e4] |
| `@peac/mappings-ucp`               | UCP / AP2 envelope mapping                                                       | v0.12.4  | **Shipped** | `conformance-fixture-only` [e1] |
| `@peac/mappings-content-signals`   | Content signals observation mapping                                              | v0.11.2  | **Shipped** | `conformance-fixture-only` [e1] |
| `@peac/mappings-aipref`            | AI preferences mapping                                                           | v0.12.4  | **Shipped** | `types-only` [e5]               |
| `@peac/mappings-rsl`               | Really Simple Licensing mapping                                                  | v0.12.0  | **Shipped** | `types-only` [e5]               |
| `@peac/mappings-tap`               | Transaction Authorization Protocol mapping                                       | v0.12.0  | **Shipped** | `types-only` [e5]               |
| `@peac/mappings-intoto`            | in-toto attestation bridge                                                       | v0.12.6  | **Shipped** | `conformance-fixture-only` [e1] |
| `@peac/mappings-slsa`              | SLSA provenance bridge                                                           | v0.12.6  | **Shipped** | `conformance-fixture-only` [e1] |
| `@peac/rails-x402`                 | x402 rail                                                                        | v0.12.1  | **Shipped** | `conformance-fixture-only` [e4] |
| `@peac/rails-stripe`               | Stripe rail (SPT observation)                                                    | v0.12.4  | **Shipped** | `conformance-fixture-only` [e4] |
| `@peac/rails-card`                 | Card-network rail                                                                | v0.12.4  | **Shipped** | `types-only` [e5]               |
| `@peac/rails-razorpay`             | Razorpay rail                                                                    | v0.12.4  | **Shipped** | `types-only` [e5]               |
| `@peac/transport-grpc`             | gRPC carrier transport                                                           | v0.12.6  | **Shipped** | `types-only` [e5]               |

### Adapter Readiness rubric

One classification per Layer 4 surface. Under ambiguity between two defensible classifications, choose the one making the **weaker claim** about current readiness. Strength ordering from weakest to strongest: `paused` < `experimental` < `types-only` < `conformance-fixture-only` < `live-upstream-tested`.

| Classification             | Binding definition                                                                                                                                                           | Typical evidence                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `live-upstream-tested`     | CI exercises the real upstream (or a faithful, dated fixture replay of a real upstream artifact) within the last release cycle. Upstream format changes surface as CI diffs. | Recorded round-trip against live endpoint; fixture set stamped with upstream release. |
| `conformance-fixture-only` | Pinned conformance fixtures only, no upstream coupling. Mapper behavior is tested; upstream conformance is asserted against frozen fixtures.                                 | `specs/conformance/<mapper>/` vectors plus stable test; no network.                   |
| `types-only`               | TS and/or Go types compile against the upstream shape; no end-to-end runtime flow exercised in CI.                                                                           | Type-definition file committed; no runtime assertions beyond structural checks.       |
| `experimental`             | Public but explicitly subject to change; `@experimental` JSDoc; breaking changes allowed with CHANGELOG note.                                                                | JSDoc tag.                                                                            |
| `paused`                   | Intentionally not maintained in this release cycle; `paused_reason` and `resumption_target` recorded in the row.                                                             | Row-level rationale documented in the matrix.                                         |

No Layer 4 surface in v0.14.1 is `live-upstream-tested`: no CI step exercises a live upstream endpoint today. Promotion from `conformance-fixture-only` to `live-upstream-tested` requires committing a recorded round-trip fixture stamped with the upstream release and wiring it into CI.

### Evidence

Each tag below points at the conformance vectors and test paths that justify the classification in the row above.

- **[e1]** Conformance fixtures under [`specs/conformance/fixtures/`](../specs/conformance/fixtures/) (per-surface subdirectories: `interaction/`, `carrier/`, `carrier-boundary/`, `content-usage/`, `discovery/`, `x402/`, `paymentauth/`, `acp/`, `ucp/`, `stripe/`, `attribution/`, `purpose/`, `obligations/`, `policy/`, `workflow/`) plus each package's `tests/` suite. Exercised under `pnpm test`; no network.
- **[e2]** RTGOV-001..RTGOV-007 requirement IDs declared in [`specs/conformance/requirement-ids.json`](../specs/conformance/requirement-ids.json) (Section 27) plus [`packages/adapters/runtime-governance/tests/`](../packages/adapters/runtime-governance/tests/) (families, fixtures, guards, issue, mappers).
- **[e3]** [`packages/adapters/managed-agents/tests/`](../packages/adapters/managed-agents/tests/) covering event families, issue-event, and session-summary, built on upstream-event fixtures checked into that package's test tree.
- **[e4]** Commerce evidence vectors C-001..C-010 under [`specs/conformance/commerce/`](../specs/conformance/commerce/) plus per-mapper test suites at [`packages/adapters/x402/tests/`](../packages/adapters/x402/tests/), [`packages/mappings/acp/tests/`](../packages/mappings/acp/tests/), and [`packages/mappings/paymentauth/tests/`](../packages/mappings/paymentauth/tests/). The `assertExplicitFinality` boundary is asserted in [`packages/adapters/core/tests/finality.test.ts`](../packages/adapters/core/tests/finality.test.ts) and [`packages/adapters/core/tests/finality-fixtures.test.ts`](../packages/adapters/core/tests/finality-fixtures.test.ts).
- **[e5]** Type-definition coverage only: TypeScript declaration file(s) in the package `src/` compile under the workspace typecheck (`pnpm typecheck:core`). No runtime assertion exists beyond the declaration shape.

## Profile Coverage

Profiles add normative semantic constraints on top of the wire envelope for a registered extension namespace. Each profile registers its extension namespace, type URI set, validator, and conformance section in the registries; this table summarizes profiles whose validator and parity corpus are shipped alongside the extension.

| Namespace                                 | Profile version | Scope    | Stability | Spec                                                                                 | Conformance fixtures                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | --------------- | -------- | --------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `org.peacprotocol/provisioning-lifecycle` | 0.1             | Observer | Stable    | [`specs/PROVISIONING-LIFECYCLE-PROFILE.md`](specs/PROVISIONING-LIFECYCLE-PROFILE.md) | [`specs/conformance/parity-corpus/provisioning-lifecycle/`](../specs/conformance/parity-corpus/provisioning-lifecycle/) (10 positive + 19 negative vectors; `provisioning.invalid_utf8` and `provisioning.structure_too_deep` covered in schema unit tests) plus Section 31 requirement IDs.         |
| `org.peacprotocol/agent-action`           | 0.1             | Observer | Stable    | [`specs/AGENT-ACTION-RECORDS.md`](specs/AGENT-ACTION-RECORDS.md)                     | [`specs/conformance/parity-corpus/agent-action/`](../specs/conformance/parity-corpus/agent-action/) (6 positive vectors covering all `*-observed` event kinds) plus Section 32 requirement IDs `AGENT-ACT-001..010`.                                                                                 |
| `org.peacprotocol/commerce-mandate`       | 0.1             | Observer | Stable    | [`specs/COMMERCE-MANDATE-RECORDS.md`](specs/COMMERCE-MANDATE-RECORDS.md)             | [`specs/conformance/parity-corpus/commerce-mandate/`](../specs/conformance/parity-corpus/commerce-mandate/) (7 positive vectors covering all `*-observed` event kinds) plus Section 33 requirement IDs `COMM-MAN-001..010`.                                                                          |
| `org.peacprotocol/gateway-export`         | 0.1             | Observer | Stable    | [`specs/GATEWAY-EXPORT-RECORDS.md`](specs/GATEWAY-EXPORT-RECORDS.md)                 | [`specs/conformance/parity-corpus/gateway-export/`](../specs/conformance/parity-corpus/gateway-export/) (8 positive vectors covering all `*-observed` event kinds: 7 settlement/recovery states plus 1 facilitator-timeout trigger observation) plus Section 34 requirement IDs `GATE-EXP-001..010`. |

The Observer scope means PEAC records what an external system reports happened. Type URIs across these profiles all carry the `*-observed` suffix to make the observer scope explicit at the record-type layer. PEAC does not authorize actions, validate credentials, approve or deny decisions, process payments, settle transactions, route payments, contact gateways, verify on-chain state, monitor settlements, enforce recovery policy, or operate the upstream workflow.

## Performance Targets

Informational and regression-oriented. Operator-facing service-level objectives are tracked in [`docs/SLO.md`](SLO.md) when published. Benchmark methodology: [`docs/BENCHMARK-METHODOLOGY.md`](BENCHMARK-METHODOLOGY.md) when published.

| Operation       | p95 Target (CI) | p95 Target (Prod) | Model            |
| --------------- | --------------- | ----------------- | ---------------- |
| `verifyLocal()` | 15 ms           | 10 ms             | Regression-based |
| `issue()`       | 10 ms           | 5 ms              | Regression-based |

## Deprecation Schedule

| Surface                   | Deprecated since | Removal target           | Migration                                                                                        |
| ------------------------- | ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| `@peac/core`              | v0.10.0          | v0.13.0 (archived)       | Use `@peac/kernel` plus `@peac/schema` plus `@peac/crypto` plus `@peac/protocol`.                |
| `@peac/sdk`               | v0.12.7          | v0.13.0 (archived)       | Use `@peac/protocol` directly.                                                                   |
| API `/verify` endpoint    | v0.12.7          | post-Sunset (2026-11-01) | Use `/v1/verify`. Legacy `/verify` delegates in-process; carries RFC 9745 / RFC 8594 / RFC 8288. |
| `apps/bridge`             | v0.12.7          | v0.13.0                  | Use `@peac/protocol` or `/api/v1/verify`.                                                        |
| Wire 0.1 default teaching | v0.12.7          | Immediate                | All defaults now Wire 0.2.                                                                       |
