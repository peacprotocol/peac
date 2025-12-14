# PEAC Protocol

**Policy • Economics • Attribution • Compliance**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.9.16-blue.svg)](https://github.com/peacprotocol/peac)

PEAC is an open protocol for verifiable receipts and policy aware access across digital interactions between agents, APIs, crawlers, and web applications.

It helps you prove who accessed what, when, under which terms, and with which payment, across different rails and systems. A single receipt shape covers one off API calls, long running crawls, private data downloads, and agent to agent workflows. This repository contains the reference TypeScript implementation (kernel, crypto, protocol, rails, mappings, server, CLI) for the v0.9.x series.

**Who is this for?**

- API and product teams who want verifiable HTTP 402 billing and receipts for both human and agent traffic.
- Operators of private APIs, tools, and datasets who want priced private or paywalled access with audit ready proof of every call or download.
- AI and agent platform builders who need interoperable receipts across payment rails and agent protocols.
- Compliance, security, and infrastructure teams who need audit grade evidence for AI and API traffic across applications, services, and partners.

PEAC is stewarded by contributors from [Originary](https://www.originary.xyz) and the broader community. See [https://peacprotocol.org](https://peacprotocol.org) for protocol documentation.

---

## Ecosystem fit

PEAC does not replace existing protocols. It is the receipts and verification layer that works alongside them for plain APIs, human driven applications, and agentic workflows.

**Payment rails (v0.9.16 status):**

- [x402](https://github.com/coinbase/x402) HTTP 402 payment flows for agentic interactions. Adapter implemented in `@peac/rails-x402`.
- Card payments via Stripe API. Adapter implemented in `@peac/rails-stripe`.
- Additional rails such as regional gateways and Lightning style networks. Planned.

The protocol is designed to work with generic HTTP 402 services, paywalls, routers, and data stores. Receipts do not depend on any single provider.

**Agent protocols (v0.9.16 status):**

- [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol) Tool context for language models. Mapping implemented.
- [Agentic Commerce Protocol (ACP)](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol) Agent driven commerce. Mapping implemented.
- [A2A Project](https://github.com/a2aproject/A2A) Agent to agent coordination. Planned for v0.9.16.

**Web policy surfaces:**

- `/.well-known/peac.txt` PEAC recommended policy surface.
- Compatibility with robots.txt, ai.txt, llm.txt, and AIPREF style manifests.

PEAC focuses on cryptographic receipts and payment verification. It is designed to coexist with existing policy files rather than replace them, and PEAC aware tools can read these surfaces together so that policy evaluation can consider what is declared in peac.txt alongside existing signals.

_Names above are illustrative examples for interoperability. PEAC is vendor neutral and does not imply endorsement by, or affiliation with, these projects._

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
- DPoP proof-of-possession binding (RFC 9449)

**Rails and mappings (v0.9.16):**

- Payment rails: x402, Stripe (via `@peac/rails-*`)
- Agent protocols: MCP, ACP (via `@peac/mappings-*`)
- Transport bindings: HTTP, gRPC, WebSocket (via `@peac/transport-*`) - _scaffolding_

**Policy surfaces:**

- Receipts work standalone for API-only or internal deployments
- `/.well-known/peac.txt` specification
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

# Policy commands (v0.9.17+)
peac policy init                           # Create new peac-policy.yaml
peac policy validate peac-policy.yaml      # Validate policy syntax
peac policy explain peac-policy.yaml       # Debug rule matching
peac policy generate peac-policy.yaml      # Compile to deployment artifacts
```

### Run verification server

```bash
pnpm add -g @peac/server

PORT=3000 peac-server
```

This exposes `/verify` endpoint for receipt verification with rate limiting and DoS protection.

---

## Use cases

PEAC is designed for scenarios where verifiable proof of payment, access, and policy compliance is essential:

| Use case                              | How PEAC helps                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP 402 micropayments                | HTTP 402 and related rails settle funds. PEAC receipts prove settlement and can be verified offline.                                                          |
| Agent to API or tool interactions     | Every API or tool call carries a signed receipt that proves who called what, under which policy, with which payment evidence.                                 |
| Priced private and private datasets   | Private objects or datasets stay behind gateways. Receipts capture which object, window, or plan was paid for without exposing raw content.                   |
| AI data licensing and training access | Policy surfaces describe terms for indexing and training. Receipts prove that access and payment followed those terms.                                        |
| Agentic marketplaces and hubs         | Agents, tools, and services exchange value and receipts across heterogeneous rails such as x402, cards, or tokens while sharing a single receipt format.      |
| Regulatory and audit trails           | Signed receipts with policy and payment evidence form an auditable trail for internal and external investigations.                                            |
| Rate limiting, quotas, and usage caps | Receipts tie usage to identity and payment, which enables verifiable quota enforcement and replay detection.                                                  |
| Policy aware negotiation              | Policies and receipts capture the terms that were accepted at the time of payment so agents and services can negotiate once and reuse the proof across calls. |

For all of these cases:

- Receipts are the source of truth. They are cryptographically signed, portable, and offline verifiable.
- Policy surfaces such as peac.txt declare what those receipts must prove.
- Rails such as x402, Stripe, and others handle actual settlement.
- Agent protocols such as MCP, ACP, and A2A use receipts for coordination.

PEAC is not a paywall, billing engine, or storage system. It is the common receipts and policy evidence layer that sits beside your payment rails, policy files, and agent protocols.

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
version: 0.9.16
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
version: 0.9.16
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

For the complete peac.txt specification, see `docs/specs/PEAC-TXT.md`.

### Policy discovery and other signals

PEAC is designed to sit alongside existing policy mechanisms rather than replace them. A PEAC aware agent or enforcement service can:

1. Read peac.txt for economic and receipt requirements.
2. Read robots.txt, ai.txt, llm.txt, and AIPREF style manifests for crawl and AI usage guidance.
3. Combine these inputs into a single internal policy view before negotiating or sending a request.

Libraries in this repo are structured so that you do not need to hand parse every policy file type separately. You can give agents and gateways one consistent picture of what is allowed, what must be paid, and what evidence is expected on every call.

### Policy Kit (v0.9.17+)

> **Start here:** [docs/policy-kit/quickstart.md](docs/policy-kit/quickstart.md)

The `@peac/policy-kit` package provides a file-based policy format for authoring policies once and compiling them to multiple deployment surfaces.

**Install:**

```bash
pnpm add @peac/policy-kit
# or use CLI: pnpm add -g @peac/cli
```

**Create a policy file:**

```yaml
# peac-policy.yaml
version: peac-policy/0.1
name: My API Policy

defaults:
  decision: deny
  reason: Requires subscription or verified access

rules:
  - name: allow-subscribed-crawl
    subject:
      type: human
      labels: [subscribed]
    purpose: crawl
    licensing_mode: subscription
    decision: allow

  - name: allow-verified-train
    subject:
      type: org
      labels: [verified]
    purpose: [train, inference]
    decision: allow

  - name: deny-agents-train
    subject:
      type: agent
    purpose: train
    decision: deny
    reason: Agents cannot train on this content
```

**Generate deployment artifacts:**

```bash
# Validate policy syntax
peac policy validate peac-policy.yaml

# Generate artifacts (peac.txt, robots snippet, AIPREF headers, markdown)
peac policy generate peac-policy.yaml --out dist --well-known

# Preview without writing files
peac policy generate peac-policy.yaml --dry-run

# Explain which rule applies for a given context
peac policy explain peac-policy.yaml --type agent --purpose train
```

**Generated artifacts:**

| File                    | Description                                               |
| ----------------------- | --------------------------------------------------------- |
| `.well-known/peac.txt`  | PEAC discovery file with usage, purposes, receipts config |
| `robots-ai-snippet.txt` | AI crawler directives for robots.txt                      |
| `aipref-headers.json`   | Compatibility header templates                            |
| `ai-policy.md`          | Human-readable policy documentation                       |

**Programmatic usage:**

```typescript
import { loadPolicy, evaluate, compilePeacTxt } from '@peac/policy-kit';

// Load and validate policy
const policy = loadPolicy('peac-policy.yaml');

// Evaluate access decision
const result = evaluate(policy, {
  subject: { type: 'agent', labels: ['verified'] },
  purpose: 'inference',
  licensing_mode: 'subscription',
});

console.log(result.decision); // 'allow' | 'deny' | 'review'
console.log(result.matched_rule); // 'allow-verified-train'

// Compile to peac.txt
const peacTxt = compilePeacTxt(policy, {
  contact: 'policy@example.com',
  receipts: 'required',
  rateLimit: '100/hour',
});
```

**Key features:**

- First-match-wins rule semantics (like firewall rules)
- CAL purposes: `crawl`, `index`, `train`, `inference`, `ai_input`, `ai_search`, `search`
- Deterministic, auditable, side-effect free evaluation
- No scripting or dynamic code

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
│  │  ├─ acp/              # Agentic Commerce Protocol mapping
│  │  └─ rsl/              # RSL usage token mapping (v0.9.17)
│  ├─ policy-kit/            # Policy authoring and artifact generation (v0.9.17)
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

- `specs/kernel/*.json` - Constants, errors, registries (source of truth)
- `docs/specs/PEAC-RECEIPT-SCHEMA-v0.9.json` - Receipt envelope schema
- `docs/specs/PROTOCOL-BEHAVIOR.md` - Issue, verify, discovery rules

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

**Core (stable, v0.9.16):**

- `@peac/kernel` - Zero-dependency constants and registries
- `@peac/schema` - TypeScript types, Zod validators, JSON Schema
- `@peac/crypto` - Ed25519 JWS signing and verification
- `@peac/protocol` - High-level issue() and verify() functions

**Runtime (stable, v0.9.16):**

- `@peac/server` - HTTP verification server with 402 support
- `@peac/cli` - Command-line tools for receipts and policy

**Rails (stable, v0.9.16):**

- `@peac/rails-x402` - x402 payment rail adapter
- `@peac/rails-stripe` - Stripe payment rail adapter

**Mappings (stable, v0.9.16):**

- `@peac/mappings-mcp` - Model Context Protocol integration
- `@peac/mappings-acp` - Agentic Commerce Protocol integration

**Policy (stable, v0.9.17):**

- `@peac/policy-kit` - Policy authoring, evaluation, and artifact generation
- `@peac/mappings-rsl` - RSL (Robots Standard Language) mapping to CAL purposes

**Pillars (early scaffolding, APIs may change):**

- `@peac/control` - Constraint types and enforcement
- `@peac/access` - Access control and policy evaluation
- `@peac/consent` - Consent lifecycle management
- `@peac/compliance` - Regulatory compliance helpers
- `@peac/attribution` - Attribution and revenue sharing
- `@peac/privacy` - Privacy budgeting and data protection
- `@peac/provenance` - Content provenance and C2PA integration
- `@peac/intelligence` - Analytics and insights

---

## Seven pillars

PEAC addresses seven protocol capabilities for AI and API infrastructure:

| Pillar          | Package             | Description                                       |
| --------------- | ------------------- | ------------------------------------------------- |
| **Access**      | `@peac/access`      | Access control and policy evaluation              |
| **Attribution** | `@peac/attribution` | Attribution and revenue-share hooks               |
| **Consent**     | `@peac/consent`     | Consent lifecycle types and helpers               |
| **Commerce**    | `@peac/rails-*`     | Payment rails (x402, Stripe) and receipt issuance |
| **Compliance**  | `@peac/compliance`  | Regulatory and audit helpers                      |
| **Privacy**     | `@peac/privacy`     | Privacy budgeting and retention policy hooks      |
| **Provenance**  | `@peac/provenance`  | Content provenance and C2PA integration           |

These are optional higher-layer helpers built on top of the core receipt/kernel stack. The stable, production-ready surface for v0.9.16 is the kernel / schema / crypto / protocol / rails / server / cli stack. PEAC remains vendor-neutral; pillar packages provide building blocks, not a hosted service.

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
- Core packages (kernel, schema, crypto, protocol) are stable for v0.9.16
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

- Node.js 20+
- pnpm >= 8 (for workspace management)

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
