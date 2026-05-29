# PEAC Protocol

**Portable signed records for automated interactions.**

When logs are not enough, PEAC gives teams records another party can verify outside the system that produced them.

PEAC records what APIs, MCP tools, agent workflows, gateways, payment-adjacent flows, provisioning systems, runtimes, and audit systems report. It does not run those systems or make their decisions.

**Record locally. Verify across boundaries.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/peacprotocol/peac?color=brightgreen)](https://github.com/peacprotocol/peac/releases)
[![npm downloads](https://img.shields.io/npm/dm/@peac/protocol?style=flat&color=brightgreen)](https://www.npmjs.com/package/@peac/protocol)
[![CI Status](https://img.shields.io/github/actions/workflow/status/peacprotocol/peac/ci.yml?branch=main&label=CI&color=brightgreen)](https://github.com/peacprotocol/peac/actions/workflows/ci.yml)

## What PEAC records

PEAC is useful when a system does work and another party later needs to
verify what happened without trusting that system's logs.

| Event              | Familiar surfaces                                                                                     | Example record                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| API call           | Stripe-style APIs, Cloudflare Workers, Vercel functions, internal HTTP services                       | request, response, usage, access decision, policy-visible outcome                                                  |
| MCP tool run       | MCP servers, Smithery-listed tools, internal MCP servers                                              | tool input/output reference, tool result, issuer, timestamp, signature                                             |
| Agent action       | A2A handoffs, agent-framework steps, Microsoft AGT-style runtime events                               | action invoked, delegated, approved, denied, cancelled, or timed out                                               |
| Gateway decision   | Cloudflare, Portkey, Kong, API gateways, AI gateways                                                  | access, routing, export, or boundary decision reported by a gateway                                                |
| Payment event      | x402, paymentauth / MPP, ACP, AP2-style commerce flows                                                | payment request, authorization, settlement observation, mandate, dispute context                                   |
| Provisioning event | Stripe Projects-style provider setup, Vercel deployments, GitHub Actions, Terraform-managed resources | catalog, provider link, account, credential, budget, subscription, domain, deployment, or resource lifecycle event |

These are orientation examples, not partnership claims or exclusive
integration targets. PEAC records what those systems report; it does not
replace them.

PEAC does not make those decisions. It records what another system
reported, binds it to an issuer and time, and makes it portable for
verification.

## What a PEAC record preserves

A PEAC record is signed evidence about an interaction.

| Field             | Meaning                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Facts             | what the producing system reported happened                                                          |
| Policy or context | the terms, policy, protocol, or configuration context that applied                                   |
| Result            | allowed, denied, completed, failed, observed, settled, disputed, or another profile-specific outcome |
| Time              | when the interaction was recorded                                                                    |
| Issuer            | which service, runtime, gateway, or agent system issued the record                                   |
| Signature         | a verifiable signature over the record                                                               |

A counterparty can verify the record locally with the issuer's public key
or through a self-hosted verifier. Records can also be exported into
portable bundles for audit, review, dispute, compliance, or incident
workflows.

## How it works

```text
1. A system performs work
   API call, MCP tool run, agent action, gateway decision,
   payment event, provisioning event, runtime observation, or audit event

2. The system issues a signed PEAC record
   facts + policy/context + result + time + issuer + signature

3. A counterparty verifies the record
   locally, in CI, or through a self-hosted verifier using issuer keys

4. The record travels
   audit review, dispute review, compliance workflow, incident report,
   exported bundle, or another system boundary
```

PEAC records what another system reported. It does not decide whether an
action was allowed, authenticate the actor, settle payment, operate the
runtime, or replace logs and traces.

Full loop: [`docs/HOW-IT-WORKS.md`](docs/HOW-IT-WORKS.md). Artifact
vocabulary (record, receipt, bundle, report):
[`docs/ARTIFACTS.md`](docs/ARTIFACTS.md). Where PEAC sits next to other
systems: [`docs/WHERE-IT-FITS.md`](docs/WHERE-IT-FITS.md). Protocol
scope: [`docs/WHAT-PEAC-STANDARDIZES.md`](docs/WHAT-PEAC-STANDARDIZES.md).

## Choose your path

| If you...                                       | PEAC helps you...                                                                                                                   | Start here                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Run an API or metered service                   | issue signed records for requests, responses, usage, and policy-visible outcomes                                                    | [API Provider Quickstart](docs/guides/quickstart-api-provider.md)                 |
| Build MCP tools or agent workflows              | attach records to tool runs, command execution, handoffs, lifecycle events, and agent actions                                       | [MCP Integration Kit](integrator-kits/mcp/README.md) or `npx -y @peac/mcp-server` |
| Build payment, gateway, or commerce flows       | preserve signed evidence around access, payment, settlement, mandate, gateway, and dispute events without becoming the payment rail | [Commerce evidence bundle](docs/SOLUTIONS/commerce-evidence-bundle.md)            |
| Track provisioning or resource lifecycle events | record catalog, provider-link, account, credential, budget, subscription, domain, deployment, and resource events                   | [Provisioning lifecycle records](docs/SOLUTIONS/verify-agent-provisioning.md)     |
| Need audit or review evidence                   | export portable records and bundles that can be referenced beside logs, traces, SIEMs, reports, and audit repositories              | [Where PEAC fits](docs/WHERE-IT-FITS.md)                                          |
| Need to verify a record                         | verify a signed PEAC record with the issuer's public key or a self-hosted verifier                                                  | [Agent Operator Quickstart](docs/guides/quickstart-agent-operator.md)             |

Full path-by-role tree: [`docs/START_HERE.md`](docs/START_HERE.md).

## Quickstart: verify one record

```bash
npm install @peac/protocol @peac/crypto
```

```typescript
import { verifyLocal } from '@peac/protocol';

const recordJws = response.headers.get('PEAC-Receipt');

if (!recordJws) {
  throw new Error('Missing PEAC-Receipt header');
}

const result = await verifyLocal(recordJws, publicKey, {
  issuer: 'https://api.example.com',
});

if (!result.valid) {
  throw new Error(result.reason ?? 'PEAC record verification failed');
}

console.log(result.claims.iss, result.claims.kind, result.claims.type);
```

This quickstart shows the developer path for one record. Operational
latency and throughput baselines are tracked separately in
[`docs/SLO.md`](docs/SLO.md).

Node 24 tested, Node 22+ compatible. Go middleware and examples
supported (Go 1.26+). Python via API-first examples and OpenAPI-driven
flows.

## Where PEAC fits

PEAC is useful when an action crosses a system, organization, protocol,
agent, gateway, payment, provisioning, or audit boundary and the local
log is not enough.

| Surface                         | What PEAC adds                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| APIs and HTTP services          | signed records for requests, responses, usage, and policy-visible outcomes                                     |
| MCP tools and agent workflows   | records for tool runs, command execution, handoffs, lifecycle events, and agent actions                        |
| Gateway and commerce systems    | records for access, payment, settlement, mandate, gateway, export, and dispute events                          |
| Provisioning systems            | records for provider links, accounts, credentials, budgets, subscriptions, domains, deployments, and resources |
| Runtime and evaluation systems  | portable observations from local runtime, policy, evaluation, and control systems                              |
| Observability and audit systems | verifiable records that complement logs, traces, SIEMs, reports, bundles, and audit repositories               |

PEAC does not replace those systems. It gives them a portable records
layer: what was reported, by whom, when, under which context, and with
which verifiable signature.

If you work around MCP, A2A, x402, paymentauth / MPP, ACP, AP2-style
commerce, UCP-style commerce, runtime governance, OpenTelemetry, or
internal platform workflows, PEAC is the signed-record layer beside
those systems, not a replacement for them.

## Why PEAC

Modern systems often need proof that travels beyond the system that
produced the log.

- Logs are local. PEAC records are portable and independently verifiable.
- Traces correlate execution. PEAC records preserve signed claims across
  organizational boundaries.
- Auth, policy, runtime, and payment systems decide whether actions may
  happen. PEAC records what another system reported happened.

## For reviewers and operators

PEAC is designed to be reviewed as protocol infrastructure, not as a
hosted control plane.

| Need                                      | Read                                                           |
| ----------------------------------------- | -------------------------------------------------------------- |
| Supported versions and disclosure process | [`SECURITY.md`](SECURITY.md)                                   |
| Measured local verification baselines     | [`docs/SLO.md`](docs/SLO.md)                                   |
| Stability classes and archived surfaces   | [`docs/STABILITY-CONTRACT.md`](docs/STABILITY-CONTRACT.md)     |
| Compatibility and deprecation status      | [`docs/COMPATIBILITY_MATRIX.md`](docs/COMPATIBILITY_MATRIX.md) |
| External standards references             | [`docs/STANDARDS_LEDGER.md`](docs/STANDARDS_LEDGER.md)         |
| Release-line invariant snapshots          | [`docs/baselines/`](docs/baselines/)                           |

The reference verifier is self-hostable. Verification can also be
performed locally when the record and issuer public key are available.

## Use cases

Practical recipes under [`docs/SOLUTIONS/`](docs/SOLUTIONS/):

- [API record issuance](docs/SOLUTIONS/api-receipt-issuance.md)
- [MCP tool-call records](docs/SOLUTIONS/mcp-tool-call-receipts.md)
- [Agent action records](docs/SOLUTIONS/verify-agent-action.md)
- [Gateway export records](docs/SOLUTIONS/verify-gateway-export.md)
- [Commerce mandate records](docs/SOLUTIONS/verify-commerce-mandate.md)
- [Commerce evidence bundle](docs/SOLUTIONS/commerce-evidence-bundle.md)
- [Cloudflare x402 + PEAC](docs/SOLUTIONS/cloudflare-x402-peac.md)
- [Runtime evidence export](docs/SOLUTIONS/runtime-evidence-export.md)
- [Provisioning lifecycle verification](docs/SOLUTIONS/verify-agent-provisioning.md)
- [Regulatory audit trail](docs/SOLUTIONS/regulatory-audit-trail.md)

## Try it in 5 minutes

- Verify a record locally with `verifyLocal()` or `pnpm dlx @peac/cli verify`.
- Start the MCP server: `npx -y @peac/mcp-server`.
- Run the minimal example: `pnpm --filter @peac/example-minimal demo`.
- Run the provisioning lifecycle example:
  ```bash
  pnpm --filter @peac/example-provisioning-lifecycle run issue
  pnpm --filter @peac/example-provisioning-lifecycle run verify
  ```
- Self-host the reference verifier: [`surfaces/reference-verifier/`](surfaces/reference-verifier/).

## Implementations and surfaces

| Surface                                              | Where                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| TypeScript issuance and verification                 | [`@peac/protocol`](packages/protocol/)                                                   |
| CLI and local tools                                  | [`@peac/cli`](packages/cli/)                                                             |
| MCP server                                           | [`@peac/mcp-server`](packages/mcp-server/)                                               |
| HTTP middleware and Go support                       | [`packages/middleware-express/`](packages/middleware-express/), [`sdks/go/`](sdks/go/)   |
| Commerce, runtime, provenance, and protocol mappings | [`packages/mappings/`](packages/mappings/), [`packages/adapters/`](packages/adapters/)   |
| Self-hostable reference verifier                     | [`apps/api/`](apps/api/), [`surfaces/reference-verifier/`](surfaces/reference-verifier/) |
| Examples and recipes                                 | [`examples/`](examples/), [`docs/SOLUTIONS/`](docs/SOLUTIONS/)                           |

Extended package catalog: [`docs/README_LONG.md`](docs/README_LONG.md).

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

PEAC is a records layer, not a runtime control plane. It records what
another system attested and makes that record portable, signed, and
verifiable across boundaries.

PEAC does not authorize actions, validate credentials, process payments,
settle transactions, operate agents, host workflows, manage vaults,
assign trust scores, or replace observability systems. Full boundary:
[`docs/WHERE-IT-FITS.md`](docs/WHERE-IT-FITS.md).

## Security

- JWS signature verification is required before trusting any record claim.
- Key discovery via `/.well-known/peac-issuer.json` JWKS with SSRF guards.
- Kernel constraints enforced at issuance and verification (fail-closed).
- No silent network fallback for offline verification.
- Errors mapped to RFC 9457 Problem Details.

See [`SECURITY.md`](SECURITY.md), [`docs/TRUST-ARTIFACTS.md`](docs/TRUST-ARTIFACTS.md), [`docs/specs/PROTOCOL-BEHAVIOR.md`](docs/specs/PROTOCOL-BEHAVIOR.md), [`docs/COMPATIBILITY_MATRIX.md`](docs/COMPATIBILITY_MATRIX.md), and [`docs/specs/VERSIONING.md`](docs/specs/VERSIONING.md).

## Privacy-aware verification

PEAC ships privacy-aware defaults and deployment guidance. Interaction
evidence is hash-by-default on the record side
(`docs/specs/PRIVACY-PROFILE.md`); the verifier separates immutable
signed evidence from mutable derived metadata so retention, deletion,
and rights-handling act on the right layer. Operator-facing guidance
for privacy-sensitive and regulated environments (data classification,
retention and deletion, deployment roles, data-subject rights, and a
DPIA starter) lives in [`docs/privacy/`](docs/privacy/README.md). PEAC
supports privacy-aware verification; it does not replace operator legal
review, lawful-basis decisions, or controller obligations.

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
