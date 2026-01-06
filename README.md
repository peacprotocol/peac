# PEAC Protocol

**Portable Evidence for Agent Coordination**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.9.27-blue.svg)](https://github.com/peacprotocol/peac)

PEAC is an open protocol for **verifiable receipts** and **policy-aware access** across machine-to-machine interactions.

It helps APIs, gateways, tool servers, and agents prove **who** accessed **what**, **when**, under **which terms**, and with **which payment evidence** (if any).

PEAC is intentionally narrow: one portable receipt format + verification rules that plug into existing identity, policy, and payment systems.

PEAC is stewarded by contributors from [Originary](https://www.originary.xyz) and the broader community. See [https://peacprotocol.org](https://peacprotocol.org) for protocol documentation.

**What you get:**

- One receipt format (`typ: peac.receipt/0.9`) signed with Ed25519 JWS
- One canonical header: `PEAC-Receipt: <jws>`
- A web discovery surface: `/.well-known/peac.txt` for terms, purposes, and receipt requirements
- Rail-agnostic payment evidence (x402 today; adapters for Stripe, Razorpay, others)
- Conformance vectors so independent implementations match

**Where it fits:**

- HTTP APIs (paid or permissioned), tool invocations, dataset downloads, long-running sessions, agent-to-agent exchanges
- Cross-org audit evidence (security, compliance, billing disputes)
- Crawls, indexing, and AI training access with verifiable terms

This repository contains the **reference TypeScript implementation** for the v0.9.x series (kernel, schema, crypto, protocol, rails, server, CLI).

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
pnpm add @peac/protocol @peac/crypto @peac/schema
```

### Verify a receipt

```typescript
import { verifyReceipt } from '@peac/protocol';

const result = await verifyReceipt(receiptJWS);

if (result.ok) {
  console.log('Issuer:', result.claims.iss);
  console.log('Amount:', result.claims.amt, result.claims.cur);
  console.log('Rail:', result.claims.payment?.rail);
}
```

### Issue a receipt

```typescript
import { issue } from '@peac/protocol';
import { generateKeypair } from '@peac/crypto';

const { privateKey } = await generateKeypair();

const { jws } = await issue({
  iss: 'https://api.example.com',
  aud: 'https://client.example.com',
  amt: 1000,
  cur: 'USD',
  rail: 'x402',
  reference: 'inv_123',
  asset: 'USD',
  env: 'live',
  evidence: { invoice_id: 'inv_123' },
  subject: 'https://api.example.com/resource/123',
  privateKey,
  kid: new Date().toISOString(),
});

console.log('PEAC-Receipt:', jws);
```

### CLI

```bash
pnpm add -g @peac/cli

peac verify 'eyJhbGc...'          # Verify a receipt
peac policy init                  # Create peac-policy.yaml
peac policy validate policy.yaml  # Validate policy syntax
peac policy generate policy.yaml  # Compile to deployment artifacts
```

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

## Core packages

| Package            | Description                              |
| ------------------ | ---------------------------------------- |
| `@peac/kernel`     | Zero-dependency constants and registries |
| `@peac/schema`     | Types, Zod validators, JSON Schema       |
| `@peac/crypto`     | Ed25519 JWS signing and verification     |
| `@peac/protocol`   | High-level `issue()` and `verify()`      |
| `@peac/server`     | HTTP verification server                 |
| `@peac/cli`        | Command-line tools                       |
| `@peac/rails-x402` | x402 payment rail adapter                |
| `@peac/policy-kit` | Policy authoring and artifact generation |

For the full package catalog and layer map, see [docs/README_LONG.md](docs/README_LONG.md).

---

## Security

- Verify JWS signatures and validate receipt structure
- Use DPoP binding to tie receipts to specific requests
- Treat external policy files as untrusted input
- Enforce timeouts and SSRF guards when fetching JWKS
- Map errors to RFC 9457 Problem Details

See [SECURITY.md](SECURITY.md) and [docs/specs/PROTOCOL-BEHAVIOR.md](docs/specs/PROTOCOL-BEHAVIOR.md).

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
