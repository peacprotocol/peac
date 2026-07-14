# PEAC Protocol

> Portable signed records for agent, API, MCP, and cross-runtime interactions.

Automated systems call APIs, run tools, make gateway decisions, initiate commerce flows, and provision resources across organizational boundaries.

PEAC lets those systems issue portable signed interaction records so another party can verify what the issuer reported, locally, offline, or across system boundaries, without relying only on screenshots or private logs.

**Record locally. Verify across boundaries.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/peacprotocol/peac?color=brightgreen)](https://github.com/peacprotocol/peac/releases)
[![npm downloads](https://img.shields.io/npm/dm/@peac/protocol?style=flat&color=brightgreen)](https://www.npmjs.com/package/@peac/protocol)
[![CI Status](https://img.shields.io/github/actions/workflow/status/peacprotocol/peac/ci.yml?branch=main&label=CI&color=brightgreen)](https://github.com/peacprotocol/peac/actions/workflows/ci.yml)

## Verify a record offline

Generate the shipped sample records, then verify one locally with the generated issuer key set. The verification step does not fetch keys or call a remote verifier. `pnpm dlx` may download the CLI if it is not already cached.

```bash
pnpm dlx @peac/cli samples generate -o ./s
pnpm dlx @peac/cli verify ./s/valid/basic-record.jws --public-key ./s/bundles/sandbox-jwks.json
```

Expected:

```text
Signature valid (offline).
```

- Compare verification paths: [`docs/guides/verification-options.md`](docs/guides/verification-options.md)
- Wire PEAC into MCP, OpenTelemetry, or a gateway: [`docs/guides/integration-patterns.md`](docs/guides/integration-patterns.md)
- Choose a starting point by role: [`docs/START_HERE.md`](docs/START_HERE.md)

## What PEAC records

A PEAC record is a signed statement about an interaction or challenge: what the issuing system reported, not an independently established fact.

| Record family      | What it represents                                                                                                 | Familiar surfaces                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| API call           | request, response, usage, access decision, policy-visible outcome                                                  | HTTP APIs, serverless functions, internal services      |
| MCP tool run       | tool name, input and output digests or references, reported result, and correlation context                        | MCP servers and MCP-based tool integrations             |
| Agent action       | invoked, delegated, approved, denied, cancelled, or timed out                                                      | Agent runtimes and multi-agent handoffs                 |
| Gateway decision   | access, routing, export, or boundary decision                                                                      | API gateways and AI gateways                            |
| Payment event      | request, authorization, settlement observation, mandate, dispute context                                           | Commerce flows such as x402, paymentauth, ACP, AP2, UCP |
| Provisioning event | catalog, provider link, account, credential, budget, subscription, domain, deployment, or resource lifecycle event | Provisioning and resource-lifecycle systems             |

These are orientation examples, not partnership claims or exclusive integration targets. PEAC records what those systems report; it does not replace them.

At a high level, PEAC records can preserve:

| Dimension         | Meaning                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Facts             | what the issuer reports about the interaction                                                              |
| Policy or context | applicable policy, protocol, configuration, or document bindings, when present                             |
| Result            | a profile-specific issuer-reported outcome                                                                 |
| Time              | signed issuance time (`iat`), plus optional issuer-reported event time (`occurred_at`) on evidence records |
| Issuer            | the service or system that signed the record                                                               |
| Signature         | a verifiable signature over the protected record                                                           |

The required Wire 0.2 payload claims are `peac_version`, `kind`, `type`, `iss`, `iat`, and `jti`. The protected JWS header also carries the required signing and type-discrimination parameters, including `alg`, `kid`, and `typ`. Policy, `occurred_at`, actor, representation, pillars, and extensions are optional or profile-dependent. The normative envelope is defined in [`docs/specs/WIRE-0.2.md`](docs/specs/WIRE-0.2.md).

A counterparty can verify the record locally with the issuer's public key or through a self-hosted verifier. Records can also be exported into portable bundles for audit, review, dispute, or compliance workflows.

## How it works

```text
1. A system observes or reports an interaction
   API call, MCP tool run, agent action, gateway decision,
   payment event, or provisioning event

2. An issuer creates a signed PEAC record
   describing what that issuer reports about the interaction

3. A counterparty verifies the signature, structure, and accepted bindings
   locally, in CI, or through a self-hosted verifier, using the issuer's
   public key

4. The record travels
   audit review, dispute review, compliance workflow, incident
   report, exported bundle, or another system boundary
```

The issuer is the entity that signs the record. It may be the system that performed the work, an observer, a gateway, an adapter, or a runtime reporting an event; those roles stay separate.

Full loop: [`docs/HOW-IT-WORKS.md`](docs/HOW-IT-WORKS.md). Artifact vocabulary (record, receipt, bundle, report): [`docs/ARTIFACTS.md`](docs/ARTIFACTS.md).

## What PEAC does not do

PEAC does not authorize actions, validate credentials, process payments, settle transactions, operate agents, assign trust scores, or replace observability systems.

Full boundary, compared surface by surface: [`docs/WHERE-IT-FITS.md`](docs/WHERE-IT-FITS.md). Protocol scope: [`docs/WHAT-PEAC-STANDARDIZES.md`](docs/WHAT-PEAC-STANDARDIZES.md).

## Evidence workflows

Worked, offline-verifiable examples for common evidence shapes. Each adds no new wire format, schema field, or registry entry beyond what already ships. The PEAC records below preserve issuer-reported claims. Any linked payment, timestamp, transparency, or other external proof must also be evaluated under its own verification rules and trust model.

| Workflow                    | Demonstrates                                                       | Start here                                                     |
| --------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Paid resource               | x402 offer and receipt artifacts preserved in a payment record     | [example](examples/x402-paid-resource-records/)                |
| Paid MCP tool               | tool-call digests linked to observed payment artifacts             | [example](examples/mcp-paid-tool-records/)                     |
| Counterparty acknowledgment | one signed record referencing another by `(iss, jti, receipt_ref)` | [example](examples/counterparty-acknowledgment-records/)       |
| Action approval             | consistency across reported approval and invocation records        | [example](examples/action-approval-records/)                   |
| Agent-run lineage           | records, manifest, and coverage commitment verified together       | [guide](docs/guides/agent-runtime-lineage-export.md)           |
| External anchoring          | a record digest registered or timestamped externally               | [guide](docs/guides/anchoring-evidence-digests.md)             |
| Spend attribution           | issuer-observed amounts associated with a workflow                 | [guide](docs/SOLUTIONS/agent-spend-attribution.md)             |
| Merkle commitment           | offline inclusion in a committed sorted set                        | [spec](docs/specs/WORKFLOW-CORRELATION.md#7-merkle-commitment) |

These workflows establish signature validity and the internal consistency of the supplied evidence. They do not, by themselves, establish settlement finality, approver authority, accounting correctness, real-world completeness, or the validity of an underlying event.

Full recipe catalog: [`docs/SOLUTIONS/`](docs/SOLUTIONS/). Full example catalog: [`examples/README.md`](examples/README.md).

## Choose your path

| Goal                                     | Start here                                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Issue records from an API                | [API Provider Quickstart](docs/guides/quickstart-api-provider.md)                                                                       |
| Integrate MCP tools                      | [MCP Integration Kit](integrator-kits/mcp/README.md)                                                                                    |
| Record agent or runtime actions          | [Agent Operator Quickstart](docs/guides/quickstart-agent-operator.md)                                                                   |
| Preserve gateway or commerce evidence    | [Commerce evidence bundle](docs/SOLUTIONS/commerce-evidence-bundle.md) or [MCP gateway records](docs/SOLUTIONS/mcp-gateway-receipts.md) |
| Record provisioning events               | [Provisioning lifecycle records](docs/SOLUTIONS/verify-agent-provisioning.md)                                                           |
| Verify a record                          | [Verification options](docs/guides/verification-options.md) or [offline sample index](docs/guides/offline-sample-index.md)              |
| Review security and operational evidence | [Trust-artifact index](docs/TRUST-ARTIFACTS.md)                                                                                         |

Full path-by-role tree: [`docs/START_HERE.md`](docs/START_HERE.md).

## Use PEAC in code

```bash
pnpm add @peac/protocol
```

`@peac/protocol` re-exports the common crypto helpers, so a single package covers key generation, issuance, and local verification. The example below issues one concrete payment record; the same issuance and local-verification path applies to other PEAC record profiles.

```typescript
import { generateKeypair, issue, verifyLocal } from '@peac/protocol';

const ISSUER = 'https://api.example.com';

async function main(): Promise<void> {
  // The issuer holds the private key; a verifier needs only the public key.
  const { privateKey, publicKey } = await generateKeypair();

  // Issue one signed record in the current Interaction Record Format.
  const { jws } = await issue({
    iss: ISSUER,
    kind: 'evidence',
    type: 'org.peacprotocol/payment',
    pillars: ['commerce'],
    extensions: {
      'org.peacprotocol/commerce': {
        payment_rail: 'x402',
        amount_minor: '1000',
        currency: 'USD',
      },
    },
    privateKey,
    kid: 'https://api.example.com/keys/1',
  });

  // Verify locally with the public key, binding the expected issuer. No network
  // request is made: the key is supplied here, not discovered remotely.
  const result = await verifyLocal(jws, publicKey, { issuer: ISSUER });

  if (!result.valid) {
    throw new Error(`verification failed: ${result.code} ${result.message}`);
  }

  console.log(`verified record from ${result.claims.iss}`);
  console.log(`kind: ${result.claims.kind}, type: ${result.claims.type}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

Expected:

```text
verified record from https://api.example.com
kind: evidence, type: org.peacprotocol/payment
```

For a longer walkthrough that also reads back typed extensions, see [`examples/minimal/`](examples/minimal/) (`pnpm --filter @peac/example-minimal demo`). Full CLI command catalog: [`packages/cli/README.md`](packages/cli/README.md).

### Run repository examples

These commands are repo-local: clone the repository, install, and build first.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm demo:all
```

`pnpm demo:all` runs the start-here examples end to end. Individually:

- Minimal example: `pnpm --filter @peac/example-minimal demo`
- MCP gateway records: `pnpm --filter @peac/example-mcp-gateway-receipts demo` and `pnpm --filter @peac/example-mcp-gateway-receipts demo:tamper`
- Provisioning lifecycle: `pnpm --filter @peac/example-provisioning-lifecycle run issue` and `pnpm --filter @peac/example-provisioning-lifecycle run verify`
- MCP server: see the [`@peac/mcp-server` guide](packages/mcp-server/README.md)
- Self-hosted reference verifier: [`surfaces/reference-verifier/`](surfaces/reference-verifier/)

## Implementations and runtime support

| Runtime              | Status        | Notes                                                                                                                                            |
| -------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript / Node.js | Canonical     | Issuance and verification (`@peac/protocol`, `@peac/crypto`, `@peac/cli`). Node 24 is the canonical tested runtime; Node >=22.13.0 is supported. |
| Go                   | Supported     | Record issuance and local verification (`sdks/go/`): Ed25519, RFC 8785 JCS. Requires Go 1.26+.                                                   |
| Python               | Examples only | API-first examples for the verifier using standard HTTP. An OpenAPI specification is available, but there is no first-party Python SDK.          |

PEAC is pre-1.0. Stability is defined per surface in the [Stability Contract](docs/STABILITY-CONTRACT.md), not by this table. This README is informative; normative requirements live in the [Spec Index](docs/SPEC_INDEX.md).

## Operational and enterprise review

PEAC supports audit and compliance workflows built on portable signed records. Using PEAC does not itself establish compliance with any regulation, framework, or certification.

Verification requires signature validation before relying on record claims. `verifyLocal()` and the documented CLI `--public-key` path do not silently fall back to issuer discovery or other network access. Remote key-discovery paths apply SSRF protections and bounded resource limits.

| Need                                         | Read                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Trust-artifact index                         | [`docs/TRUST-ARTIFACTS.md`](docs/TRUST-ARTIFACTS.md)                                           |
| Supported versions and disclosure process    | [`SECURITY.md`](SECURITY.md)                                                                   |
| Threat model and mitigations                 | [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md)                                                 |
| Stability classes and archived surfaces      | [`docs/STABILITY-CONTRACT.md`](docs/STABILITY-CONTRACT.md)                                     |
| Compatibility and deprecation status         | [`docs/COMPATIBILITY_MATRIX.md`](docs/COMPATIBILITY_MATRIX.md)                                 |
| Conformance requirements and coverage        | [`docs/specs/CONFORMANCE-MATRIX.md`](docs/specs/CONFORMANCE-MATRIX.md)                         |
| Benchmark methodology and measured baselines | [`docs/BENCHMARK-METHODOLOGY.md`](docs/BENCHMARK-METHODOLOGY.md), [`docs/SLO.md`](docs/SLO.md) |
| External standards referenced or implemented | [`docs/STANDARDS_LEDGER.md`](docs/STANDARDS_LEDGER.md)                                         |
| Privacy-aware deployment guidance            | [`docs/privacy/README.md`](docs/privacy/README.md)                                             |
| Key custody and tenancy model                | [`docs/KEY-CUSTODY-AND-TENANCY.md`](docs/KEY-CUSTODY-AND-TENANCY.md)                           |
| Release integrity and provenance             | [`docs/maintainers/RELEASE-INTEGRITY.md`](docs/maintainers/RELEASE-INTEGRITY.md)               |

The reference verifier is self-hostable. Verification can also be performed locally whenever the record and the issuer's public key are available.

## Protocol status and versioning

- Current format: Interaction Record Format 0.2 (`interaction-record+jwt`; repository shorthand: Wire 0.2).
- Legacy: `peac-receipt/0.1` (Wire 0.1) is frozen and legacy-only; `verifyLocal()` returns `E_UNSUPPORTED_WIRE_VERSION` on legacy input.

Full doctrine: [`docs/specs/VERSIONING.md`](docs/specs/VERSIONING.md).

## Contributing and license

Bug fixes, documentation, tests, and interoperability reports are welcome as pull requests. Changes to the wire format, schemas, registries, or public API need a design discussion first: open an issue before sending the pull request.

Apache-2.0. See [`LICENSE`](LICENSE).

---

PEAC Protocol is an open-source project stewarded by [Originary](https://www.originary.xyz/) and community contributors.

[Docs](https://www.peacprotocol.org) &middot; [GitHub](https://github.com/peacprotocol/peac) &middot; [Discussions](https://github.com/peacprotocol/peac/discussions)
