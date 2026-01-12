# PEAC Protocol

**Portable receipts and machine-verifiable evidence for automated interactions**

[Docs](https://peacprotocol.org) | [Spec Index](docs/SPEC_INDEX.md) | [Discussions](https://github.com/peacprotocol/peac/discussions) | [Releases](https://github.com/peacprotocol/peac/releases)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/peacprotocol/peac)](https://github.com/peacprotocol/peac/releases)

**What:** PEAC standardizes a file-discoverable policy surface and a signed receipt format that make automated interactions provable (consent, attribution, settlement references, decisions, outcomes).

**Who:** APIs, gateways, tool servers, agent platforms, and compliance/security teams operating automated traffic across org boundaries.

**Why:** Internal logs are not neutral proof and integrations do not interoperate. PEAC makes terms machine-readable and outcomes cryptographically verifiable, without replacing your auth, rails, or observability.

Works over HTTP/REST (headers), MCP/A2A, and streaming transports; verification is offline and deterministic.

## The model

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. DECLARE          2. ENFORCE           3. PROVE                  │
│  /.well-known/       Gateway evaluates    Outcomes sealed into      │
│  peac.txt            policy rules         signed receipts + bundles │
└─────────────────────────────────────────────────────────────────────┘
```

1. **Declare**: Services publish terms and receipt requirements (`/.well-known/peac.txt`)
2. **Enforce**: Gateways evaluate requests against policy (identity, purpose, rate, payment/session)
3. **Prove**: Outcomes are sealed into signed receipts and optional offline evidence bundles

## Core primitives

| Primitive           | Stable | Description                                           |
| ------------------- | ------ | ----------------------------------------------------- |
| Receipt envelope    | Yes    | `typ: peac.receipt/0.9`, Ed25519 JWS signature        |
| Receipt header      | Yes    | `PEAC-Receipt: <jws>`                                 |
| Policy surface      | Yes    | `/.well-known/peac.txt` discovery and parse rules     |
| Verification report | Yes    | Deterministic JSON output from verify operations      |
| Dispute Bundle      | Yes    | ZIP with receipts + policy + report for offline audit |
| Conformance vectors | Yes    | Golden inputs/outputs in `specs/conformance/`         |

**Stable contracts:** Receipt schema, header name, discovery path, and bundle format are frozen for v0.9.x. Breaking changes require a new `typ` version.

## Transports and bindings

PEAC is transport-agnostic. The most common binding is **HTTP/REST**, where receipts travel as a response header (`PEAC-Receipt`) and policies are discovered via `/.well-known/peac.txt`.

| Binding             | How receipts travel                                     |
| ------------------- | ------------------------------------------------------- |
| HTTP/REST (default) | Response header `PEAC-Receipt: <jws>`                   |
| MCP                 | Tool result metadata (`_meta.org.peacprotocol/receipt`) |
| A2A                 | Agent exchange attachments                              |
| WebSocket/streaming | Periodic or terminal receipts for long-running sessions |
| Queues/batches      | NDJSON receipts verified offline via bundles            |

## Where it fits

- HTTP APIs (paid or permissioned), tool invocations, dataset downloads, long-running sessions
- Cross-org audit evidence (security, compliance, billing disputes)
- Crawls, indexing, and AI training access with verifiable terms

This repository contains the **reference TypeScript implementation** (kernel, schema, crypto, protocol, rails, server, CLI) and a **Go SDK** for server-side verification, issuance, and policy evaluation.

---

## Who is this for?

- **API teams** who want verifiable HTTP 402 billing and receipts for both human and agent traffic.
- **Tool and dataset operators** who want priced or gated access with audit-ready proof of every call.
- **Agent platform builders** who need interoperable receipts across payment rails and agent protocols.
- **Compliance and infrastructure teams** who need audit-grade evidence for API and AI traffic.

---

## Quick start

### Install

```bash
pnpm add @peac/protocol
```

Optional: `@peac/cli` for command-line tools.

### Issue and verify

```typescript
import { issue, verifyLocal, generateKeypair } from '@peac/protocol';

// Generate a signing key
const { privateKey, publicKey } = await generateKeypair();

// Issue a receipt
const { jws } = await issue({
  iss: 'https://api.example.com',
  aud: 'https://client.example.com',
  amt: 1000,
  cur: 'USD',
  rail: 'x402',
  reference: 'tx_abc123',
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
  console.log('Verified:', result.claims.iss, result.claims.amt, result.claims.cur);
}
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
    Amount:     1000,
    Currency:   "USD",
    Rail:       "x402",
    Reference:  "tx_abc123",
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

## What to install

**Public API (stable):**

- `@peac/protocol` - Issue and verify receipts (includes crypto re-exports)
- `@peac/cli` - Command-line tools (optional)

**Go SDK (stable):**

- `github.com/peacprotocol/peac/sdks/go` - Server-side verification, issuance, policy

**Monorepo internals (may change between versions):**

Everything else in this repo (`@peac/kernel`, `@peac/schema`, `@peac/crypto`, rails adapters, surfaces, workers) is used to build the public packages. You can depend on them, but expect more frequent changes.

---

## Use cases

| Use case                   | How PEAC helps                                                          |
| -------------------------- | ----------------------------------------------------------------------- |
| **HTTP 402 micropayments** | Rails settle funds; receipts prove settlement offline.                  |
| **Agent-to-API calls**     | Every call carries signed proof of who, what, when, under which terms.  |
| **Priced datasets**        | Receipts capture which object or window was paid for.                   |
| **AI training access**     | Policy surfaces describe terms; receipts prove compliance.              |
| **Audit trails**           | Signed receipts form evidence for internal and external investigations. |
| **Rate limiting**          | Receipts tie usage to identity and payment for quota enforcement.       |

PEAC is not a paywall, billing engine, or storage system. It is the receipts layer that sits beside your payment rails and policy files.

---

## Interoperability and mappings

PEAC receipts can be carried through other interaction standards via mappings:

| Standard / Rail | PEAC role                                | Status                         |
| --------------- | ---------------------------------------- | ------------------------------ |
| MCP             | Receipts in tool response metadata       | `@peac/mappings-mcp`           |
| A2A             | Receipts in agent exchange attachments   | `@peac/mappings-acp`           |
| AP2             | Evidence for payment authorization flows | mapping available              |
| UCP             | Webhook verification + dispute evidence  | `@peac/mappings-ucp` (v0.9.31) |
| x402            | Settlement evidence in receipt claims    | `@peac/rails-x402`             |
| Stripe          | Payment intent evidence                  | `@peac/rails-stripe`           |

PEAC does not orchestrate these protocols. It provides portable proof of what terms applied and what happened.

---

## Dispute Bundle (v0.9.30)

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

## Where PEAC fits (and where it does not)

**PEAC provides:** Policy surfaces, signed receipts, verification rules, and offline evidence bundles.

**PEAC does not replace:**

- **OpenTelemetry**: OTel is observability. PEAC is portable proof that can correlate to traces.
- **MCP / A2A**: These coordinate tool use and agent exchanges. PEAC carries proof alongside them.
- **AP2 / ACP / UCP**: These authorize and orchestrate commerce flows. PEAC provides verifiable evidence of terms, decisions, and outcomes around those flows.
- **C2PA**: C2PA is media provenance. PEAC is access and interaction receipts.
- **Payment rails**: Rails move funds. PEAC records settlement references and makes outcomes verifiable.

PEAC is the evidence layer, not a replacement for identity, payment, or observability systems.

---

## Evidence vocabulary

| Term                    | Definition                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------- |
| **Receipt**             | JWS-signed proof of an interaction (who, what, when, terms, payment evidence)         |
| **Policy surface**      | `/.well-known/peac.txt` file declaring terms, purposes, and receipt requirements      |
| **Rail adapter**        | Maps payment settlement evidence into receipt claims                                  |
| **Verification report** | Deterministic, machine-readable output from verifying a receipt or bundle             |
| **Dispute Bundle**      | ZIP container with receipts + policy snapshot + verification report for offline audit |
| **Conformance vectors** | Golden inputs/outputs for testing independent implementations                         |

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

## Start here

- **`@peac/protocol`** - Issue and verify receipts (recommended entry point)
- **`@peac/cli`** - Command-line tools for verification, policy, and bundles

**Building a server?** Add `@peac/server` for HTTP verification endpoints.

**Integrating payments?** Use rail adapters like `@peac/rails-x402`.

For the full package catalog (34 packages) and layer map, see [docs/README_LONG.md](docs/README_LONG.md).

---

## Security model

- JWS signature verification required before trusting any receipt claim
- Key discovery via JWKS endpoints with SSRF guards and timeouts
- No silent network fallback for offline verification (fail-closed)
- Replay protection via nonce + timestamp validation
- Request binding (DPoP) supported where rail adapter enables it
- Errors mapped to RFC 9457 Problem Details (no internal details exposed)

See [SECURITY.md](.github/SECURITY.md) and [docs/specs/PROTOCOL-BEHAVIOR.md](docs/specs/PROTOCOL-BEHAVIOR.md).

---

## Versioning and compatibility

**Current status:** v0.9.x is pre-1.0. The protocol is usable in production, but expect breaking changes between minor versions.

**What's stable:**

- Receipt envelope format (`typ: peac.receipt/0.9`)
- Header name (`PEAC-Receipt`)
- Discovery path (`/.well-known/peac.txt`)
- Bundle structure and determinism rules
- Conformance vector format

**What may change:**

- Internal package APIs (`@peac/kernel`, `@peac/schema`, etc.)
- Rail adapter interfaces
- CLI command flags

**Compatibility guarantees:**

- Conformance vectors and changelogs published for every release
- Wire format changes require a new `typ` version
- Cross-language parity: TypeScript and Go implementations produce identical outputs

---

## Production readiness

**Status:** v0.9.x - protocol is usable; some adapter surfaces are experimental.

If you're using PEAC in production, please [open an issue](https://github.com/peacprotocol/peac/issues) to be listed in ecosystem documentation.

---

## Contributing

Contributions are welcome. For substantial changes, please open an issue first to discuss the approach.

See `docs/SPEC_INDEX.md` for normative specifications and `docs/CI_BEHAVIOR.md` for CI guidelines.

---

## License

© 2025 PEAC Protocol - Apache 2.0 License - Stewarded by contributors from [Originary](https://www.originary.xyz) and the community.

See [LICENSE](LICENSE) for full details.

---

## Community

- **Source:** [https://github.com/peacprotocol/peac](https://github.com/peacprotocol/peac)
- **Website:** [https://peacprotocol.org](https://peacprotocol.org)
- **Issues:** Bug reports and feature requests via GitHub Issues
- **Discussions:** Design questions and ecosystem proposals via GitHub Discussions
- **Contact:** See [https://peacprotocol.org](https://peacprotocol.org) for working group and contact information

PEAC is designed for multiple independent implementations across languages and platforms. If you are building an implementation, SDK, or rail adapter, please open an issue so it can be linked from ecosystem documentation.
