# PEAC Protocol

**Policy • Economics • Attribution • Compliance**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.9.15-blue.svg)](https://github.com/peacprotocol/peac)

PEAC is an open protocol for **verifiable receipts in the agentic web**: AI agents, crawlers, and applications calling APIs and accessing content.

It makes "who paid whom, for what, using which rail, under which terms" cryptographically provable across payment rails and agent protocols. This repository contains the reference TypeScript implementation (kernel, crypto, protocol, rails, mappings, server, CLI) for the v0.9.x series.

**Who is this for?**

- API providers who want verifiable HTTP 402 billing and receipts
- AI and agent platform builders who need interoperable receipts across payment rails
- Compliance and infrastructure teams who need audit-grade evidence for AI and API traffic

PEAC is stewarded by contributors from [Originary](https://www.originary.xyz) and the broader community. See [https://peacprotocol.org](https://peacprotocol.org) for protocol documentation.

---

## Ecosystem fit

PEAC does not replace existing protocols. It is the **receipts and verification layer** that works alongside them - for plain APIs, human-driven applications, and agentic workflows alike.

**Payment rails (v0.9.15 status):**

- [x402 (Coinbase)](https://github.com/coinbase/x402) – HTTP 402 for agentic interactions → **adapter implemented**
- Stripe – Card payments via Stripe API → **adapter implemented**
- Razorpay, Lightning Network, and others → _planned_

**Agent protocols (v0.9.15 status):**

- [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol) – Tool context for language models → **mapping implemented**
- [Agentic Commerce Protocol (ACP)](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol) – Agent-driven commerce → **mapping implemented**
- [A2A Project](https://github.com/a2aproject/A2A) – Agent-to-agent coordination → _planned for v0.9.16_

**Web policy surfaces:**

- `/.well-known/peac.txt` – PEAC's recommended policy surface → _specification planned for v0.9.16_
- Compatibility with robots.txt, ai.txt, llm.txt, AIPREF-style manifests

PEAC focuses on **cryptographic receipts and payment verification**. It is designed to coexist with existing policy files rather than replace them.

_Names above are illustrative examples for interoperability. PEAC is vendor-neutral and does not imply endorsement by, or affiliation with, these projects._

---

## At a glance

**Receipts and wire format:**

- Receipt type: `typ: "peac.receipt/0.9"` (frozen across v0.9.x)
- Envelope structure: `PEACEnvelope` with auth, payment evidence, and metadata
- Signature: Ed25519 JWS (RFC 8032)
- Evidence model: `PaymentEvidence` captures rail, asset, environment, and rail-specific proof

**HTTP and 402 integration:**

- Single `PEAC-Receipt` response header (no X- prefix)
- HTTP 402 Payment Required support
- Errors via `application/problem+json` (RFC 9457)
- DPoP proof-of-possession binding (RFC 9449) → _planned for v0.9.16_

**Rails and mappings (v0.9.15):**

- Payment rails: x402, Stripe (via `@peac/rails-*`)
- Agent protocols: MCP, ACP (via `@peac/mappings-*`)
- Transport bindings: HTTP, gRPC, WebSocket (via `@peac/transport-*`) - _scaffolding_
- _Additional rails (Razorpay, Lightning) and mappings (A2A) planned for future releases_

**Policy surfaces:**

- Receipts work standalone for API-only or internal deployments
- `/.well-known/peac.txt` specification → _planned for v0.9.16_
- Compatibility with AIPREF, robots.txt, ai.txt, llm.txt

For normative specifications, see [`docs/SPEC_INDEX.md`](docs/SPEC_INDEX.md).

---

## Quick start

### Install

```bash
# with pnpm (recommended for development)
pnpm add @peac/protocol @peac/crypto @peac/schema

# or npm
npm install @peac/protocol @peac/crypto @peac/schema
```

### Verify a receipt

```typescript
import { verifyReceipt } from '@peac/protocol';

const result = await verifyReceipt(receiptJWS);

if (result.ok) {
  console.log('Receipt verified');
  console.log('Issuer:', result.claims.iss);
  console.log('Amount:', result.claims.amt, result.claims.cur);
  console.log('Rail:', result.claims.payment?.rail);
  console.log('Asset:', result.claims.payment?.asset);
} else {
  console.error('Verification failed:', result.error);
}
```

### Issue a receipt

```typescript
import { issue } from '@peac/protocol';
import { generateKeypair } from '@peac/crypto';

const { privateKey } = await generateKeypair();

const jws = await issue({
  iss: 'https://api.example.com',
  aud: 'https://app.example.com',
  amt: 1000, // Amount in smallest currency unit (cents)
  cur: 'USD',
  rail: 'x402',
  reference: 'inv_123',
  asset: 'USD',
  env: 'live',
  evidence: {
    invoice_id: 'inv_123',
    payment_ref: 'pay_456',
  },
  subject: 'https://app.example.com/resource/123',

  privateKey,
  kid: new Date().toISOString(),
});

console.log('PEAC-Receipt:', jws);
```

### CLI

```bash
# Install CLI
pnpm add -g @peac/cli

# Verify a receipt
peac verify 'eyJhbGc...'

# Decode without verification
peac decode receipt.jws

# Validate discovery manifest
peac validate-discovery https://api.example.com
```

### Run verification server

```bash
pnpm add -g @peac/server

PORT=3000 peac-server
```

This exposes `/verify` endpoint for receipt verification with rate limiting and DoS protection.

---

## Use cases

PEAC is designed for scenarios where verifiable proof of payment and policy compliance is essential:

| Use case                      | How PEAC helps                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| **HTTP 402 micropayments**    | x402 and other rails settle funds; PEAC receipts prove settlement happened and can be verified offline |
| **Agent-to-API interactions** | Every API call carries a signed receipt proving payment, consent, and policy compliance                |
| **AI data licensing**         | Training/commercial terms in policy; receipts prove compliant use and payment for audit                |
| **Agentic marketplaces**      | Agents exchange value and receipts across heterogeneous rails (x402, cards, L2s, etc.)                 |
| **Regulatory compliance**     | Signed receipts with policy evidence form auditable trails for investigations                          |
| **Rate limiting and quotas**  | Receipts tie usage to identity and payment, enabling verifiable quota enforcement                      |
| **Multi-rail settlement**     | Same receipt format works across x402, Stripe, Lightning, and future rails                             |

For all these cases:

- **Receipts** are the source of truth (cryptographically signed, portable, offline-verifiable)
- **Policy surfaces** (like peac.txt) declare what those receipts must prove
- **Rails** (x402, Stripe, etc.) handle actual settlement
- **Agent protocols** (MCP, ACP, A2A) use receipts for coordination

---

## Web policy surface: peac.txt

PEAC can be used purely as a receipts protocol, but for web-facing services, `/.well-known/peac.txt` is the **recommended policy surface** for publishing machine-readable terms.

**Location:**

- Primary: `https://your-domain/.well-known/peac.txt`
- Fallback: `https://your-domain/peac.txt`

**Purpose:**
Declares what purposes are allowed, quotas, attribution requirements, payment terms, and whether receipts are required. Agents discover this file to determine if and how they can interact with your service.

peac.txt is an optional, web-facing policy surface. The core of the protocol is the receipt envelope, signature, and verification behavior; peac.txt is one recommended way to publish the policies those receipts are expected to honor.

**Example: Open documentation**

```yaml
# /.well-known/peac.txt
version: 0.9.15
usage: open

purposes: [indexing, research, documentation]
attribution: optional
attribution_format: 'Source: PEAC Protocol ({url})'

receipts: optional
rate_limit: unlimited

license: Apache-2.0
repository: https://github.com/peacprotocol/peac
```

**Example: Conditional API access**

```yaml
version: 0.9.15
usage: conditional

purposes: [research, commercial]
attribution: required

receipts: required
rate_limit: 600/hour
daily_limit: 3000

price: 0.01
currency: USD
payment_methods: [x402, stripe]
payment_endpoint: https://api.example.com/pay

negotiate: https://api.example.com/negotiate
```

**Protocol flow:**

1. Agent fetches `/.well-known/peac.txt`
2. Checks if purpose and volume comply with published policy
3. If payment required, settles via rail (x402, Stripe, etc.)
4. Obtains signed PEAC receipt
5. Calls API with `PEAC-Receipt: <jws>` header
6. Server verifies receipt and grants access

For the complete peac.txt specification, see `docs/specs/PEAC-TXT.md` (planned v0.9.16).

---

## Repository layout

Kernel-first monorepo:

```text
peac/
├─ specs/
│  └─ kernel/              # Normative JSON: constants, errors, registries
├─ docs/
│  ├─ specs/               # Receipt schema, protocol behavior, test vectors
│  ├─ api/                 # API reference (scaffolded)
│  └─ guides/              # Integration guides (scaffolded)
├─ packages/
│  ├─ kernel/              # Zero-dependency constants from specs/kernel
│  ├─ schema/              # Types, Zod validators, JSON Schema
│  ├─ crypto/              # Ed25519 JWS, JCS, base64url
│  ├─ protocol/            # issue(), verify(), discovery
│  ├─ server/              # HTTP verification server
│  ├─ cli/                 # Command-line tools
│  ├─ rails/
│  │  ├─ x402/             # HTTP 402 / x402 payment rail
│  │  └─ stripe/           # Stripe payment rail
│  ├─ mappings/
│  │  ├─ mcp/              # Model Context Protocol mapping
│  │  └─ acp/              # Agentic Commerce Protocol mapping
│  ├─ transport/
│  │  ├─ http/             # HTTP transport binding (scaffolding)
│  │  ├─ grpc/             # gRPC transport binding (scaffolding)
│  │  └─ ws/               # WebSocket transport binding (scaffolding)
│  ├─ control/             # Constraint types and enforcement (CAL)
│  ├─ access/              # Access control and policy evaluation
│  ├─ consent/             # Consent lifecycle management
│  ├─ compliance/          # Regulatory compliance helpers
│  ├─ attribution/         # Attribution and revenue sharing
│  ├─ privacy/             # Privacy budgeting and data protection
│  ├─ provenance/          # Content provenance and C2PA integration
│  ├─ intelligence/        # Analytics and insights
│  └─ receipts/            # Receipt helpers, schema, codecs
├─ sdks/                   # Language SDKs (TS, Python, Go, Rust; scaffolding)
├─ surfaces/               # Platform integrations (WordPress, Vercel, etc.; scaffolding)
└─ archive/                # Legacy pre-v0.9.15 materials (historical)
```

**Layer map:**

- Layer 0: `@peac/kernel`
- Layer 1: `@peac/schema`
- Layer 2: `@peac/crypto`
- Layer 3: `@peac/protocol`, `@peac/control`
- Layer 4: `@peac/rails-*`, `@peac/mappings-*`, `@peac/transport-*`
- Layer 5: `@peac/server`, `@peac/cli`
- Layer 6 (scaffolding): `@peac/access`, `@peac/consent`, `@peac/compliance`, `@peac/attribution`, `@peac/privacy`, `@peac/provenance`, `@peac/intelligence`

**Core (normative):**

- `specs/kernel/*.json` – Constants, errors, registries (source of truth)
- `docs/specs/PEAC-RECEIPT-SCHEMA-v0.9.json` – Receipt envelope schema
- `docs/specs/PROTOCOL-BEHAVIOR.md` – Issue, verify, discovery rules

**Scaffolding (not yet stable):**

- `sdks/` and `surfaces/` are placeholders for future language SDKs and platform integrations. They are not stable or published yet.
- Layer 6 pillar packages (`@peac/access`, `@peac/consent`, etc.) are early scaffolding; APIs may change.

---

## Documentation

| Document                                                       | Purpose                                |
| -------------------------------------------------------------- | -------------------------------------- |
| [`docs/CANONICAL_DOCS_INDEX.md`](docs/CANONICAL_DOCS_INDEX.md) | Master index of all documentation      |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                 | Kernel-first architecture and design   |
| [`docs/SPEC_INDEX.md`](docs/SPEC_INDEX.md)                     | Normative specifications index         |
| [`docs/engineering-guide.md`](docs/engineering-guide.md)       | Development patterns and practices     |
| [`docs/CI_BEHAVIOR.md`](docs/CI_BEHAVIOR.md)                   | CI pipeline and gate behavior          |
| [`RELEASE.md`](RELEASE.md)                                     | Release policy and versioning strategy |
| [`RELEASING.md`](RELEASING.md)                                 | Release checklist and commands         |

---

## Packages

**Core (stable, v0.9.15):**

- `@peac/kernel` – Zero-dependency constants and registries
- `@peac/schema` – TypeScript types, Zod validators, JSON Schema
- `@peac/crypto` – Ed25519 JWS signing and verification
- `@peac/protocol` – High-level issue() and verify() functions

**Runtime (stable, v0.9.15):**

- `@peac/server` – HTTP verification server with 402 support
- `@peac/cli` – Command-line tools for receipts and policy

**Rails (stable, v0.9.15):**

- `@peac/rails-x402` – x402 payment rail adapter
- `@peac/rails-stripe` – Stripe payment rail adapter

**Mappings (stable, v0.9.15):**

- `@peac/mappings-mcp` – Model Context Protocol integration
- `@peac/mappings-acp` – Agentic Commerce Protocol integration

**Pillars (early scaffolding, APIs may change):**

- `@peac/control` – Constraint types and enforcement
- `@peac/access` – Access control and policy evaluation
- `@peac/consent` – Consent lifecycle management
- `@peac/compliance` – Regulatory compliance helpers
- `@peac/attribution` – Attribution and revenue sharing
- `@peac/privacy` – Privacy budgeting and data protection
- `@peac/provenance` – Content provenance and C2PA integration
- `@peac/intelligence` – Analytics and insights

---

## Seven pillars

PEAC addresses seven protocol capabilities for AI and API infrastructure:

| Pillar          | Package                | Description                                      |
| --------------- | ---------------------- | ------------------------------------------------ |
| **Access**      | `@peac/access`         | Access control and policy evaluation             |
| **Attribution** | `@peac/attribution`    | Attribution and revenue-share hooks              |
| **Consent**     | `@peac/consent`        | Consent lifecycle types and helpers              |
| **Commerce**    | `@peac/rails-*`        | Payment rails (x402, Stripe) and receipt issuance |
| **Compliance**  | `@peac/compliance`     | Regulatory and audit helpers                     |
| **Privacy**     | `@peac/privacy`        | Privacy budgeting and retention policy hooks     |
| **Provenance**  | `@peac/provenance`     | Content provenance and C2PA integration          |

These are optional higher-layer helpers built on top of the core receipt/kernel stack. The stable, production-ready surface for v0.9.15 is the kernel / schema / crypto / protocol / rails / server / cli stack. PEAC remains vendor-neutral; pillar packages provide building blocks, not a hosted service.

---

## Architecture principles

**Layered:**

- Crypto primitives isolated from protocol logic
- Protocol logic isolated from rails, mappings, and transports
- Policy surfaces built on top, not baked into core

**Vendor neutral:**

- No hard-coded lists of specific rails or agent protocols
- All vendors share the same `PaymentEvidence` shape
- Extensions via adapters and PEIPs

**Spec-first:**

- Normative JSON specs drive all implementations
- TypeScript is one of multiple independent implementations
- SDKs for Go, Rust, Python follow same specs

**Defense in depth:**

- SSRF protection and strict URL validation (v0.9.16)
- DPoP proof-of-possession for tokens (v0.9.16)
- JWKS rotation and emergency revocation plans
- Rate limiting and circuit breakers

---

## Stability and versioning

**Wire format:**

- `peac.receipt/0.9` is frozen throughout the v0.9.x series
- Libraries may evolve APIs but must emit/accept 0.9 receipts

**Library surface:**

- TypeScript APIs are pre-1.0 and may have breaking changes between minor releases
- Core packages (kernel, schema, crypto, protocol) are stable for v0.9.15
- Pillar packages (access, consent, etc.) are early scaffolding; APIs may change

For forward-looking details, see the docs in `docs/` and the CHANGELOG.

**HTTP semantics:**

- `PEAC-Receipt` is the canonical header (no X- prefix)
- RFC 9457 Problem Details for errors
- HTTP 402 Payment Required for missing or invalid payment

**Conformance levels** (documented in `docs/specs/`):

- L0: Parse peac.txt discovery manifests
- L1: HTTP semantics and Problem Details
- L2: Policy enforcement (purposes, quotas, retention)
- L3: Negotiation, payment, and receipts
- L4: Provenance, attestation, and audit trails

Test vectors live in `tests/vectors/` and `docs/specs/TEST_VECTORS.md`.

---

## Development

**Prerequisites:**

- Node.js 18+
- pnpm ≥ 8 (for workspace management)

**Setup:**

```bash
git clone https://github.com/peacprotocol/peac
cd peac
pnpm install

# Build all packages
pnpm -r build

# Run tests
pnpm -r test
```

---

## Security

- Always verify JWS signatures and validate receipt structure
- Use DPoP binding to tie receipts to specific requests (v0.9.16)
- Treat external policy files as untrusted input
- Enforce timeouts and SSRF guards when fetching JWKS or discovery manifests
- Map all errors to RFC 9457 Problem Details

See `SECURITY.md` and `docs/specs/PROTOCOL-BEHAVIOR.md` for security considerations.

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
