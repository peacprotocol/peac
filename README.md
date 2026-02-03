# PEAC Protocol

**Verifiable interaction records for automated systems**

A record is the portable interaction artifact; a receipt is the signed file format.

[Docs](https://www.peacprotocol.org) | [Spec Index](docs/SPEC_INDEX.md) | [Discussions](https://github.com/peacprotocol/peac/discussions) | [Releases](https://github.com/peacprotocol/peac/releases)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/peacprotocol/peac)](https://github.com/peacprotocol/peac/releases)

**What:** PEAC standardizes a file-discoverable policy surface and a signed receipt format that make automated interactions provable -- consent, attribution, settlement references, decisions, outcomes.

**Who:** APIs, gateways, tool servers, agent platforms, and compliance/security teams operating automated traffic across org boundaries.

**Why:** Internal logs are not neutral proof and integrations do not interoperate. PEAC makes terms machine-readable and outcomes verifiable, without replacing your auth, rails, or observability.

Works over HTTP/REST (headers), MCP/A2A, and streaming transports; verification is offline and deterministic.

## Quick glossary

| Term               | Definition                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------- |
| **Record**         | The portable interaction artifact (concept)                                               |
| **Receipt**        | The signed serialization of a record (JWS file / header value)                            |
| **Dispute Bundle** | Portable export containing receipts + policy snapshot + deterministic verification report |

Use **record(s)** when talking conceptually. Use **receipt(s)** when referring to the serialized file/header/JWS.

## The model

```
1. Publish terms        2. Attach records        3. Verify and export
/.well-known/           Issue receipts on        Deterministic report;
peac.txt                governed interactions    Dispute Bundle for handoff
```

1. **Publish terms**: Services publish terms and record requirements (`/.well-known/peac.txt`)
2. **Attach records**: Gateways issue receipts for governed interactions (identity, purpose, settlement)
3. **Verify and export**: Outcomes are verified offline; Dispute Bundles provide portable evidence

## Where it fits

- HTTP APIs (paid or permissioned), tool invocations, dataset downloads, long-running sessions
- Cross-org audit evidence (security, compliance, billing disputes)
- Crawls, indexing, and AI training access with verifiable terms

This repository contains the **reference TypeScript implementation** (kernel, schema, crypto, protocol, rails, server, CLI) and a **Go SDK** for server-side verification, issuance, and policy evaluation.

---

## Quick start

### Install

```bash
pnpm add @peac/protocol
```

Optional: `@peac/cli` for command-line tools.

### Issue and verify a record

```typescript
import { issue, verifyLocal, generateKeypair } from '@peac/protocol';

// Generate a signing key
const { privateKey, publicKey } = await generateKeypair();

// Issue a receipt (minimal record)
const { jws } = await issue({
  iss: 'https://api.example.com',
  aud: 'https://client.example.com',
  subject: 'https://api.example.com/inference',
  privateKey,
  kid: 'key-2026-01',
});

// Verify with schema validation + binding checks
const result = await verifyLocal(jws, publicKey, {
  issuer: 'https://api.example.com',
  audience: 'https://client.example.com',
});

if (result.valid) {
  console.log('Verified:', result.claims.iss, result.claims.sub);
}
```

**If this interaction includes settlement**, add payment fields:

```typescript
const { jws } = await issue({
  iss: 'https://api.example.com',
  aud: 'https://client.example.com',
  subject: 'https://api.example.com/inference',
  amt: 1000, // Amount in minor units (e.g., cents)
  cur: 'USD', // Currency code
  rail: 'x402', // Payment rail
  reference: 'tx_abc123', // Rail-specific reference
  privateKey,
  kid: 'key-2026-01',
});
```

See [examples/quickstart/](examples/quickstart/) for runnable code.

### HTTP/REST integration

Attach receipts to any HTTP response:

```typescript
import express from 'express';
import { issue } from '@peac/protocol';

const app = express();

app.get('/data', async (req, res) => {
  const body = { items: ['a', 'b', 'c'] };
  const { jws } = await issue({
    iss: 'https://api.example.com',
    aud: req.headers['origin'] || 'https://client.example.com',
    subject: '/data',
    privateKey,
    kid: 'key-2026-01',
  });
  res.setHeader('PEAC-Receipt', jws);
  res.json(body);
});
```

Clients retrieve the receipt from the `PEAC-Receipt` header and verify offline or store for audit.

### Go SDK

```bash
go get github.com/peacprotocol/peac/sdks/go
```

```go
import peac "github.com/peacprotocol/peac/sdks/go"

// Verify a receipt
result, err := peac.Verify(receiptJWS, peac.VerifyOptions{
    Issuer:   "https://api.example.com",
    Audience: "https://client.example.com",
})

// Issue a receipt
result, err := peac.Issue(peac.IssueOptions{
    Issuer:     "https://api.example.com",
    Audience:   "https://client.example.com",
    Subject:    "https://api.example.com/inference",
    SigningKey: signingKey,
})
```

See [sdks/go/README.md](sdks/go/README.md) for full documentation.

### CLI

```bash
pnpm add -g @peac/cli

peac verify 'eyJhbGc...'          # Verify a receipt
peac policy init                  # Create peac-policy.yaml
peac policy validate policy.yaml  # Validate policy syntax
peac policy generate policy.yaml  # Compile to deployment artifacts
```

---

## Core primitives

| Primitive           | Stable | Description                                           |
| ------------------- | ------ | ----------------------------------------------------- |
| Receipt envelope    | Yes    | `typ: peac-receipt/0.1`, Ed25519 JWS signature        |
| Receipt header      | Yes    | `PEAC-Receipt: <jws>`                                 |
| Policy surface      | Yes    | `/.well-known/peac.txt` access terms for agents       |
| Issuer config       | Yes    | `/.well-known/peac-issuer.json` JWKS discovery        |
| Verification report | Yes    | Deterministic JSON output from verify operations      |
| Dispute Bundle      | Yes    | ZIP with receipts + policy + report for offline audit |
| Workflow context    | Yes    | DAG correlation for multi-step agentic workflows      |
| Conformance vectors | Yes    | Golden inputs/outputs in `specs/conformance/`         |

---

## Transports and bindings

PEAC is transport-agnostic. The most common binding is **HTTP/REST**, where receipts travel as a response header and policies are discovered via `/.well-known/peac.txt`.

| Binding             | How receipts travel                                     | Status      |
| ------------------- | ------------------------------------------------------- | ----------- |
| HTTP/REST (default) | Response header `PEAC-Receipt: <jws>`                   | Implemented |
| MCP                 | Tool result metadata (`_meta.org.peacprotocol/receipt`) | Implemented |
| A2A                 | Agent exchange attachments                              | Specified   |
| WebSocket/streaming | Periodic or terminal receipts for long-running sessions | Planned     |
| Queues/batches      | NDJSON receipts verified offline via bundles            | Implemented |

---

## Interoperability and mappings

PEAC records can be carried through other interaction standards via mappings:

| Standard / Rail  | PEAC role                                | Status                             |
| ---------------- | ---------------------------------------- | ---------------------------------- |
| MCP              | Records in tool response metadata        | Implemented (`@peac/mappings-mcp`) |
| ACP              | Agentic Commerce Protocol integration    | Implemented (`@peac/mappings-acp`) |
| A2A              | Agent-to-Agent exchange attachments      | Specified                          |
| AP2              | Evidence for payment authorization flows | Specified                          |
| UCP              | Webhook verification + dispute evidence  | Implemented (`@peac/mappings-ucp`) |
| ERC-8004         | Reputation signals for Trustless Agents  | Implemented (docs/mappings)        |
| x402             | Settlement evidence in receipt claims    | Implemented (`@peac/rails-x402`)   |
| Payment gateways | Payment intent evidence                  | Implemented (`@peac/rails-stripe`) |

PEAC does not orchestrate these protocols. It provides portable proof of what terms applied and what happened.

---

## Dispute Bundle

Portable, offline-verifiable evidence packages for disputes, audits, and cross-org handoffs.

A bundle contains receipts, policy snapshots, and a deterministic verification report -- everything needed to prove what happened without trusting either party's internal logs.

**Design constraints:**

- ZIP archive with deterministic structure (RFC 8785 canonical JSON)
- Offline verification fails if keys are missing (no silent network fallback)
- Cross-language parity: TypeScript and Go produce identical verification reports

```bash
peac bundle create --receipts ./receipts.ndjson --policy ./policy.yaml --output ./evidence.peacbundle
peac bundle verify ./evidence.peacbundle --offline
```

See [docs/specs/DISPUTE.md](docs/specs/DISPUTE.md) for the specification.

---

## Workflow correlation

Track multi-step agentic workflows across orchestration frameworks (MCP, A2A, CrewAI, LangGraph, AutoGen). Each receipt carries a `WorkflowContext` extension linking it to a workflow DAG -- step IDs, parent references, framework metadata, and optional hash chaining.

At workflow completion, a `WorkflowSummaryAttestation` commits the full receipt set (by reference or Merkle root) for proof-of-run verification.

See [docs/specs/WORKFLOW-CORRELATION.md](docs/specs/WORKFLOW-CORRELATION.md) for the specification and [examples/workflow-correlation/](examples/workflow-correlation/) for a working demo.

---

## Use cases

| Use case                   | How PEAC helps                                                          |
| -------------------------- | ----------------------------------------------------------------------- |
| **HTTP 402 micropayments** | Rails settle funds; receipts prove settlement offline.                  |
| **Agent-to-API calls**     | Every call carries signed proof of who, what, when, under which terms.  |
| **Priced datasets**        | Records capture which object or window was paid for.                    |
| **AI training access**     | Policy surfaces describe terms; records prove compliance.               |
| **Audit trails**           | Signed receipts form evidence for internal and external investigations. |
| **Rate limiting**          | Records tie usage to identity and payment for quota enforcement.        |

PEAC is not a paywall, billing engine, or storage system. It is the records layer that sits beside your payment rails and policy files.

---

## What PEAC does not replace

- **OpenTelemetry**: OTel is observability. PEAC is portable proof that can correlate to traces.
- **MCP / A2A**: These coordinate tool use and agent exchanges. PEAC carries proof alongside them.
- **AP2 / ACP / UCP**: These authorize and orchestrate commerce flows. PEAC provides verifiable evidence of terms, decisions, and outcomes around those flows.
- **Payment rails**: Rails move funds. PEAC records settlement references and makes outcomes verifiable.

PEAC is the evidence layer, not a replacement for identity, payment, or observability systems.

---

## What to install

**Public API (stable):**

- `@peac/protocol` - Issue and verify receipts (includes crypto re-exports)
- `@peac/cli` - Command-line tools (optional)

**Go SDK (stable):**

- `github.com/peacprotocol/peac/sdks/go` - Server-side verification, issuance, policy

**Monorepo internals (may change between versions):**

Everything else in this repo (`@peac/kernel`, `@peac/schema`, `@peac/crypto`, rails adapters, surfaces, workers) is used to build the public packages. You can depend on them, but expect more frequent changes.

---

## Security and verification

- JWS signature verification required before trusting any receipt claim
- Key discovery via `/.well-known/peac-issuer.json` JWKS endpoints with SSRF guards and timeouts
- No silent network fallback for offline verification (fail-closed)
- Replay protection via nonce + timestamp validation
- Request binding (DPoP) supported where rail adapter enables it
- Errors mapped to RFC 9457 Problem Details (no internal details exposed)

See [SECURITY.md](.github/SECURITY.md) and [docs/specs/PROTOCOL-BEHAVIOR.md](docs/specs/PROTOCOL-BEHAVIOR.md).

---

## Versioning and compatibility

**Wire format (stable):**

Wire format identifiers use the pattern `peac-<artifact>/<major>.<minor>`:

- `peac-receipt/0.1` - Receipt envelope format
- `peac-bundle/0.1` - Dispute bundle format
- `peac-verification-report/0.1` - Verification report format

These wire identifiers are independent of npm package versions. A wire format change requires a new version number; package updates that do not change wire semantics keep the same wire version.

**Protocol surfaces (stable):**

- Header name: `PEAC-Receipt`
- Policy path: `/.well-known/peac.txt`
- Issuer config path: `/.well-known/peac-issuer.json`
- Conformance vector format

**Implementation/API:**

- `@peac/protocol` and `@peac/cli` aim for API stability
- Internal packages (`@peac/kernel`, `@peac/schema`, etc.) may change between releases
- Rail adapter interfaces are evolving

**Compatibility guarantees:**

- Conformance vectors and changelogs published for every release
- Cross-language parity: TypeScript and Go implementations produce identical outputs

See [docs/specs/VERSIONING.md](docs/specs/VERSIONING.md) for the versioning doctrine.

---

## Documentation

| Document                                               | Purpose                                        |
| ------------------------------------------------------ | ---------------------------------------------- |
| [Spec Index](docs/SPEC_INDEX.md)                       | Normative specifications                       |
| [Architecture](docs/ARCHITECTURE.md)                   | Kernel-first design                            |
| [Policy Kit Quickstart](docs/policy-kit/quickstart.md) | Policy authoring guide                         |
| [Engineering Guide](docs/engineering-guide.md)         | Development patterns                           |
| [CI Behavior](docs/CI_BEHAVIOR.md)                     | CI pipeline and gates                          |
| [Full README](docs/README_LONG.md)                     | Package catalog, layer maps, detailed sections |

---

## Contributing

Contributions are welcome. For substantial changes, please open an issue first to discuss the approach.

See `docs/SPEC_INDEX.md` for normative specifications and `docs/CI_BEHAVIOR.md` for CI guidelines.

---

## License

Apache-2.0. See [LICENSE](LICENSE). Contributions are licensed under Apache-2.0.

Stewardship: [Originary](https://www.originary.xyz/) and the open source community.

---

## Community

- **Source:** [https://github.com/peacprotocol/peac](https://github.com/peacprotocol/peac)
- **Website:** [https://www.peacprotocol.org](https://www.peacprotocol.org)
- **Issues:** Bug reports and feature requests via GitHub Issues
- **Discussions:** Design questions and ecosystem proposals via GitHub Discussions
- **Contact:** See [https://www.peacprotocol.org](https://www.peacprotocol.org) for working group and contact information

PEAC is designed for multiple independent implementations across languages and platforms. If you are building an implementation, SDK, or rail adapter, please open an issue so it can be linked from ecosystem documentation.
