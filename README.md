# PEAC Protocol

**Govern locally. Prove across boundaries.**

When logs are not enough, PEAC gives teams portable signed records that can be verified outside the system that produced them.

Portable signed records for API, MCP, agent, and cross-runtime interactions.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/peacprotocol/peac?color=brightgreen)](https://github.com/peacprotocol/peac/releases)
[![npm downloads](https://img.shields.io/npm/dm/@peac/protocol?style=flat&color=brightgreen)](https://www.npmjs.com/package/@peac/protocol)
[![CI Status](https://img.shields.io/github/actions/workflow/status/peacprotocol/peac/ci.yml?branch=main&label=CI&color=brightgreen)](https://github.com/peacprotocol/peac/actions/workflows/ci.yml)

## What you can do with PEAC

| If you...                                        | PEAC helps you...                                                                                                                                           | Start here                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Run an API or HTTP service                       | issue signed interaction records with responses so clients can verify what happened later                                                                   | [API Provider Quickstart](docs/guides/quickstart-api-provider.md)                 |
| Run metered APIs or agent-consumed services      | issue records for usage, access decisions, responses, and policy-visible outcomes that may need to be verified after the request                            | [API Provider Quickstart](docs/guides/quickstart-api-provider.md)                 |
| Run an MCP server                                | attach signed records to tool calls and expose verification tools for operators                                                                             | [MCP Integration Kit](integrator-kits/mcp/README.md) or `npx -y @peac/mcp-server` |
| Build agentic commerce or payment flows          | record evidence around x402, paymentauth / MPP, ACP, UCP commerce flows, AP2-style payment flows, settlement observations, and disputes                     | [Commerce evidence bundle](docs/SOLUTIONS/commerce-evidence-bundle.md)            |
| Need to verify a record                          | verify a PEAC receipt offline with the issuer's public key                                                                                                  | [Agent Operator Quickstart](docs/guides/quickstart-agent-operator.md)             |
| Operate managed runtimes or agent control planes | record runtime-governance observations without making PEAC the control plane                                                                                | [`@peac/adapter-runtime-governance`](packages/adapters/runtime-governance/)       |
| Need audit evidence beside observability         | produce portable records that can be referenced alongside logs, traces, OpenTelemetry, SIEMs, and audit repositories without replacing them                 | [Where PEAC fits](docs/WHERE-IT-FITS.md)                                          |
| Run agent-to-agent workflows                     | record handoff events across agent-card discovery, task lifecycle, and human-review boundaries                                                              | [A2A Handoff Records](docs/specs/A2A-HANDOFF-RECORDS.md)                          |
| Need command-execution records                   | record unsigned observations with `peac observe command` or signed command-execution records with `peac record command`                                     | [CLI Carrier Profile](docs/specs/CLI-CARRIER-PROFILE.md)                          |
| Need lifecycle records from another system       | issue records for caller-reported evaluation, approval, experiment, and workflow events                                                                     | [Lifecycle Observation Profile](docs/specs/LIFECYCLE-OBSERVATION-PROFILE.md)      |
| Need provisioning lifecycle records              | record reported catalog, provider-link, account, resource, credential, payment-authorization, budget, subscription, domain, and deployment lifecycle events | [Provisioning Lifecycle Records](docs/SOLUTIONS/verify-agent-provisioning.md)     |

Full path-by-role tree: [`docs/START_HERE.md`](docs/START_HERE.md).

## Verify a PEAC receipt in 60 seconds

```bash
pnpm add @peac/protocol @peac/crypto
```

```typescript
import { verifyLocal } from '@peac/protocol';

const receipt = response.headers.get('PEAC-Receipt');
const result = await verifyLocal(receipt, publicKey, {
  issuer: 'https://api.example.com',
});

if (result.valid) {
  console.log(result.claims.iss, result.claims.kind, result.claims.type);
}
```

Node 24 tested, Node 22+ compatible. Go middleware and examples supported (Go 1.26+). Python via API-first examples and OpenAPI-driven flows.

## How it works

```text
1. Publish terms at /.well-known/peac.txt
2. Return PEAC-Receipt with a signed interaction record
3. Verify offline with the issuer's public key
```

Full loop: [`docs/HOW-IT-WORKS.md`](docs/HOW-IT-WORKS.md). Artifact vocabulary (record, receipt, bundle, report): [`docs/ARTIFACTS.md`](docs/ARTIFACTS.md). Where PEAC sits next to other systems: [`docs/WHERE-IT-FITS.md`](docs/WHERE-IT-FITS.md). Protocol scope: [`docs/WHAT-PEAC-STANDARDIZES.md`](docs/WHAT-PEAC-STANDARDIZES.md).

## Where PEAC fits

PEAC is useful when an action crosses a system, organization, protocol, agent, or settlement boundary and the local log is not enough.

| Surface                                 | What PEAC adds                                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Metered APIs and HTTP services          | signed records for requests, responses, usage, and policy-visible outcomes                                                               |
| MCP tools and agent runtimes            | records for tool calls, command execution, handoffs, and runtime observations                                                            |
| Agentic commerce and automated payments | evidence around x402, paymentauth / MPP, ACP, UCP commerce flows, AP2-style payment flows, settlement observations, and disputes         |
| Runtime governance and managed agents   | portable observations from Microsoft Agent Governance Toolkit, Claude Managed Agents, custom harnesses, and other runtime control planes |
| Observability and audit systems         | verifiable records that complement logs, traces, OpenTelemetry, SIEMs, and audit repositories                                            |
| Cross-protocol workflows                | a records layer beside A2A, MCP, x402, paymentauth / MPP, ACP, UCP / AP2, OpenTelemetry, SLSA, in-toto, and DID-based identity systems   |

PEAC does not replace those systems. It gives them a portable records layer: what was reported, by whom, when, under which protocol context, and with which verifiable signature.

## Use cases

Practical recipes under [`docs/SOLUTIONS/`](docs/SOLUTIONS/):

- [API record issuance](docs/SOLUTIONS/api-receipt-issuance.md)
- [MCP tool-call records](docs/SOLUTIONS/mcp-tool-call-receipts.md)
- [Commerce evidence bundle](docs/SOLUTIONS/commerce-evidence-bundle.md)
- [Cloudflare x402 + PEAC](docs/SOLUTIONS/cloudflare-x402-peac.md)
- [Runtime evidence export](docs/SOLUTIONS/runtime-evidence-export.md)
- [Provisioning lifecycle verification](docs/SOLUTIONS/verify-agent-provisioning.md)
- [Regulatory audit trail](docs/SOLUTIONS/regulatory-audit-trail.md)

## Why PEAC

Modern systems often need proof that travels beyond the system that produced the log.

- Logs are local. PEAC records are portable and independently verifiable.
- Traces correlate execution. PEAC records preserve signed claims across organizational boundaries.
- Auth, policy, runtime, and payment systems decide whether actions may happen. PEAC records what another system reported happened.

## Try it in 5 minutes

- Verify a receipt locally with `verifyLocal()` or `pnpm dlx @peac/cli verify`.
- Start the MCP server: `npx -y @peac/mcp-server`.
- Run the minimal example: `pnpm --filter @peac/example-minimal demo`.
- Run the provisioning lifecycle example:
  ```bash
  pnpm --filter @peac/example-provisioning-lifecycle run issue
  pnpm --filter @peac/example-provisioning-lifecycle run verify
  ```
- Self-host the reference verifier: [`surfaces/reference-verifier/`](surfaces/reference-verifier/).

## Implementations and surfaces

- **TypeScript core** — issuance, verification, CLI, middleware (this repo).
- **Go SDK** — [`sdks/go/`](sdks/go/) with production HTTP middleware.
- **MCP tools** — [`packages/mcp-server/`](packages/mcp-server/) evidence tools.
- **Editor and plugin-pack surfaces** — Cursor, Codex, Claude Code, VS Code, Continue, Windsurf, OpenCode under [`surfaces/plugin-pack/`](surfaces/plugin-pack/); canonical [Smithery config](packages/mcp-server/smithery.yaml).
- **Express middleware** — [`packages/middleware-express/`](packages/middleware-express/).
- **Commerce and agentic-payment mappings** — x402 v1/v2, paymentauth / MPP, ACP delegated payment, and UCP commerce envelopes and AP2-style payment-flow records under [`packages/adapters/x402/`](packages/adapters/x402/), [`packages/mappings/paymentauth/`](packages/mappings/paymentauth/), [`packages/mappings/acp/`](packages/mappings/acp/), and [`packages/mappings/ucp/`](packages/mappings/ucp/).
- **Runtime governance and managed agents** — [`packages/adapters/runtime-governance/`](packages/adapters/runtime-governance/) records observations from Microsoft Agent Governance Toolkit, Claude Managed Agents, and custom runtime control planes.
- **Observability and audit linkage** — PEAC records can be referenced from traces, reports, bundles, and audit repositories without replacing OpenTelemetry, SIEMs, or log pipelines.
- **A2A handoff records** — [`docs/specs/A2A-HANDOFF-RECORDS.md`](docs/specs/A2A-HANDOFF-RECORDS.md) and [`integrator-kits/a2a/`](integrator-kits/a2a/).
- **CLI execution records** — `peac observe command`, `peac record command`, and [`docs/specs/CLI-CARRIER-PROFILE.md`](docs/specs/CLI-CARRIER-PROFILE.md).
- **Lifecycle observation records** — `peac emit lifecycle` and [`docs/specs/LIFECYCLE-OBSERVATION-PROFILE.md`](docs/specs/LIFECYCLE-OBSERVATION-PROFILE.md).
- **Provisioning lifecycle records** — [`examples/provisioning-lifecycle/`](examples/provisioning-lifecycle/), [`examples/agent-provisioning-demo/`](examples/agent-provisioning-demo/), and [`docs/SOLUTIONS/verify-agent-provisioning.md`](docs/SOLUTIONS/verify-agent-provisioning.md).
- **Supply-chain and provenance mappings** — [`packages/mappings/intoto/`](packages/mappings/intoto/) and [`packages/mappings/slsa/`](packages/mappings/slsa/) for records that sit beside existing provenance systems.
- **Reference verifier (self-hostable)** — [`apps/api/`](apps/api/) with deployment recipes under [`surfaces/reference-verifier/`](surfaces/reference-verifier/).

Long tail (A2A, gRPC, DID, managed agents, and more): [`docs/README_LONG.md`](docs/README_LONG.md).

## Artifacts

| Artifact                | Role                                                      |
| ----------------------- | --------------------------------------------------------- |
| `/.well-known/peac.txt` | Machine-readable terms                                    |
| `PEAC-Receipt`          | HTTP response header carrying a signed interaction record |
| `verifyLocal()`         | Offline verification once issuer keys are available       |
| `peac-bundle/0.1`       | Portable audit and dispute package                        |

## CLI

```bash
# One-off
pnpm dlx @peac/cli verify 'eyJhbGc...'

# Installed in your workspace
pnpm add -D @peac/cli
pnpm exec peac verify 'eyJhbGc...'
```

Other commands: `peac observe command`, `peac record command`, `peac emit lifecycle`, `peac conformance run`, `peac reconcile a.bundle b.bundle`, `peac policy init|validate|generate`, `peac doctor`. Reference: [`packages/cli/README.md`](packages/cli/README.md).

## Protocol boundary

PEAC is a records layer, not a runtime control plane. It records what another system attested and makes that record portable, signed, and verifiable across boundaries.

PEAC does not authorize actions, validate credentials, process payments, settle transactions, operate agents, host workflows, manage vaults, assign trust scores, or replace observability systems. Full boundary: [`docs/WHERE-IT-FITS.md`](docs/WHERE-IT-FITS.md).

## Security

- JWS signature verification required before trusting any receipt claim.
- Key discovery via `/.well-known/peac-issuer.json` JWKS with SSRF guards.
- Kernel constraints enforced at issuance and verification (fail-closed).
- No silent network fallback for offline verification.
- Errors mapped to RFC 9457 Problem Details.

See [`SECURITY.md`](SECURITY.md), [`docs/TRUST-ARTIFACTS.md`](docs/TRUST-ARTIFACTS.md), [`docs/specs/PROTOCOL-BEHAVIOR.md`](docs/specs/PROTOCOL-BEHAVIOR.md), [`docs/COMPATIBILITY_MATRIX.md`](docs/COMPATIBILITY_MATRIX.md), and [`docs/specs/VERSIONING.md`](docs/specs/VERSIONING.md).

## Privacy-aware verification

PEAC ships privacy-aware defaults and deployment guidance. Interaction evidence is hash-by-default on the receipt side (`docs/specs/PRIVACY-PROFILE.md`); the verifier separates immutable signed evidence from mutable derived metadata so retention, deletion, and rights-handling act on the right layer. Operator-facing guidance for privacy-sensitive and regulated environments (data classification, retention and deletion, deployment roles, data-subject rights, and a DPIA starter) lives in [`docs/privacy/`](docs/privacy/README.md). PEAC supports privacy-aware verification; it does not replace operator legal review, lawful-basis decisions, or controller obligations.

## Versioning

- **Current default format:** `interaction-record+jwt` (Wire 0.2).
- **Legacy:** `peac-receipt/0.1` (Wire 0.1) is frozen and legacy-only; `verifyLocal()` returns `E_UNSUPPORTED_WIRE_VERSION` on legacy input.

Full doctrine: [`docs/specs/VERSIONING.md`](docs/specs/VERSIONING.md).

## Documentation

- [Start Here](docs/START_HERE.md) — path by role.
- [How it works](docs/HOW-IT-WORKS.md), [Artifacts](docs/ARTIFACTS.md), [Where it fits](docs/WHERE-IT-FITS.md), [What PEAC standardizes](docs/WHAT-PEAC-STANDARDIZES.md).
- [Use cases](docs/SOLUTIONS/) — practical recipes.
- [Spec Index](docs/SPEC_INDEX.md) — normative specifications, including [Resource limits](docs/specs/RESOURCE-LIMITS.md).
- [Standards ledger](docs/STANDARDS_LEDGER.md) — every external standard PEAC cites or implements, by status.
- [Release-line baselines](docs/baselines/) — historical invariant snapshots and release-line references.
- [Developer Guide](docs/README_LONG.md) — package catalog and extended examples.

## Contributing and license

Contributions are welcome. For substantial changes, please open an issue first.

Apache-2.0. See [`LICENSE`](LICENSE).

---

PEAC Protocol is an open-source project stewarded by [Originary](https://www.originary.xyz/) and community contributors.

[Docs](https://www.peacprotocol.org) &middot; [GitHub](https://github.com/peacprotocol/peac) &middot; [Discussions](https://github.com/peacprotocol/peac/discussions)
