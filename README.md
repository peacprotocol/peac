# PEAC Protocol

**Portable evidence for automated interactions**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.9.30-blue.svg)](https://github.com/peacprotocol/peac/releases/tag/v0.9.30)

**What:** Signed receipts that prove who accessed what, when, under which terms, with which payment evidence.

**Who:** APIs, gateways, tool servers, and agents that need audit-grade proof of every interaction.

**Why:** Plugs into existing identity, policy, and payment systems -- no new platform to adopt.

PEAC is stewarded by contributors from [Originary](https://www.originary.xyz) and the broader community. See [https://peacprotocol.org](https://peacprotocol.org) for protocol documentation.

**What you get:**

- One receipt format (`typ: peac.receipt/0.9`) signed with Ed25519 JWS
- One canonical header: `PEAC-Receipt: <jws>`
- A web discovery surface: `/.well-known/peac.txt` for terms, purposes, and receipt requirements
- Rail-agnostic payment evidence (x402 and other rail adapters)
- Conformance vectors so independent implementations match

**Where it fits:**

- HTTP APIs (paid or permissioned), tool invocations, dataset downloads, long-running sessions, agent-to-agent exchanges
- Cross-org audit evidence (security, compliance, billing disputes)
- Crawls, indexing, and AI training access with verifiable terms

This repository contains the **reference TypeScript implementation** for the v0.9.x series (kernel, schema, crypto, protocol, rails, server, CLI) and a **Go SDK** for server-side verification, issuance, and policy evaluation.

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

**PEAC provides:** Signed receipts, verification rules, policy surfaces, and evidence bundles.

**PEAC does not replace:**

- **OpenTelemetry**: Receipts correlate with OTel traces via W3C Trace Context. OTel for observability, PEAC for evidence.
- **MCP/ACP**: Receipts travel inside MCP tool responses. MCP handles transport, PEAC handles proof.
- **C2PA**: PEAC covers access/usage receipts. C2PA covers media provenance. Both can coexist.
- **Payment rails**: Payment rails settle funds. Receipts prove settlement. Rail adapters bridge the two.

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

For the full package catalog (33 packages) and layer map, see [docs/README_LONG.md](docs/README_LONG.md).

---

## Security

- Verify JWS signatures and validate receipt structure before trusting claims
- Treat external policy files as untrusted input
- Enforce timeouts and SSRF guards when fetching JWKS
- Map errors to RFC 9457 Problem Details (no internal details in responses)
- Optional request binding (DPoP) where enabled by rail adapter

See [SECURITY.md](.github/SECURITY.md) and [docs/specs/PROTOCOL-BEHAVIOR.md](docs/specs/PROTOCOL-BEHAVIOR.md).

---

## Contributing

Contributions are welcome. For substantial changes, please open an issue first to discuss the approach.

See `docs/SPEC_INDEX.md` for normative specifications and `docs/CI_BEHAVIOR.md` for CI guidelines.

---

## License

© 2025 PEAC Protocol - Apache 2.0 License - Stewarded by contributors from Originary and the community.

See [LICENSE](LICENSE) for full details.

---

## Community

- **Source:** [https://github.com/peacprotocol/peac](https://github.com/peacprotocol/peac)
- **Website:** [https://peacprotocol.org](https://peacprotocol.org)
- **Issues:** Bug reports and feature requests via GitHub Issues
- **Discussions:** Design questions and ecosystem proposals via GitHub Discussions
- **Contact:** See [https://peacprotocol.org](https://peacprotocol.org) for working group and contact information

PEAC is designed for multiple independent implementations across languages and platforms. If you are building an implementation, SDK, or rail adapter, please open an issue so it can be linked from ecosystem documentation.
