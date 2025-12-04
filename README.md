# PEAC Protocol

**Policy • Economics • Attribution • Compliance**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-0.9.15--dev-yellow.svg)](https://github.com/peacprotocol/peac)

PEAC is an open protocol for **verifiable receipts in agentic commerce**.

It provides cryptographically signed receipts that prove "who paid whom, for what, using which rail, under which terms" across heterogeneous payment rails and agent protocols. Policy surfaces like `/.well-known/peac.txt` let websites and APIs publish machine-readable rules that those receipts must honor.

PEAC is implemented and stewarded by contributors from [Originary](https://www.originary.xyz) and the broader community. See [https://peacprotocol.org](https://peacprotocol.org) for protocol documentation and use cases.

---

## Ecosystem fit

PEAC does not replace existing protocols. It is the **receipts and verification layer** that works alongside:

**Payment and HTTP 402 rails (examples):**

- [x402 (Coinbase)](https://github.com/coinbase/x402) – HTTP 402 "Payment Required" for agentic interactions
- Stripe, Razorpay, and other payment processors (via rail adapters)
- Lightning Network and other cryptocurrency rails (planned)

**Agent protocols (examples):**

- [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol) – Tool context for language models
- [Agentic Commerce Protocol (ACP)](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol) – Agent-driven commerce flows
- [AP2 (Google)](https://github.com/google-agentic-commerce/AP2) – Google's agentic commerce profile
- [A2A Project](https://github.com/a2aproject/A2A) – Agent-to-agent coordination

**Web policy surfaces:**

- AIPREF-style AI preference files and well-known endpoints
- robots.txt, ai.txt, llm.txt and similar policy files

PEAC focuses on **cryptographic receipts, payment verification, and policy enforcement** that sits underneath these higher-level protocols. PEAC is designed to coexist with existing policy files (robots.txt, ai.txt, llm.txt, AIPREF-style manifests) rather than replace them.

Names above are illustrative examples for interoperability. PEAC is vendor-neutral and does not imply endorsement by, or affiliation with, these projects. All trademarks and names belong to their respective owners.

---

## At a glance

**Receipts and wire format:**

- Receipt type: `typ: "peac.receipt/0.9"` (frozen across v0.9.x)
- Envelope structure: `PEACEnvelope` with auth, evidence, and metadata blocks
- Signature: Ed25519 JWS (RFC 8032)
- Evidence model: `PaymentEvidence` captures rail, asset, environment, and rail-specific proof

**HTTP and 402 integration:**

- Single `PEAC-Receipt` response header (no X- prefix)
- HTTP 402 Payment Required support
- Errors via `application/problem+json` (RFC 9457)
- DPoP proof-of-possession binding (RFC 9449, planned v0.9.16)

**Rails and mappings:**

- Payment rails: x402, Stripe, Razorpay (planned) (via `@peac/rails-*`)
- Agent protocols: MCP, ACP, A2A mappings (via `@peac/mappings-*`)
- Transport abstraction: HTTP, gRPC, WebSocket (via `@peac/transport-*`)

**Policy surfaces:**

- Primary: `/.well-known/peac.txt` (machine-readable policy file)
- Compatibility: AIPREF, robots.txt, ai.txt, llm.txt
- Note: PEAC receipts work without peac.txt for API-only or internal deployments

For normative specifications, see `docs/SPEC_INDEX.md`.

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

Kernel-first monorepo organized as layers:

```text
peac/
├─ specs/
│  └─ kernel/            # Normative JSON: constants, errors, registries
├─ docs/
│  ├─ specs/             # Receipt schema, protocol behavior, test vectors
│  ├─ api/               # API reference (scaffolded)
│  └─ guides/            # Integration guides (scaffolded)
├─ packages/
│  ├─ kernel/            # Zero-dependency constants from specs/kernel
│  ├─ schema/            # Types, Zod validators, JSON Schema
│  ├─ crypto/            # Ed25519 JWS, JCS, base64url
│  ├─ protocol/          # issue(), verify(), discovery
│  ├─ server/            # HTTP verification server
│  ├─ cli/               # Command-line tools
│  ├─ rails/             # Payment rail adapters
│  │  ├─ x402/
│  │  ├─ stripe/
│  │  └─ razorpay/       # planned
│  ├─ mappings/          # Agent protocol mappings
│  │  ├─ mcp/
│  │  ├─ acp/
│  │  └─ a2a/
│  ├─ transport/         # HTTP, gRPC, WebSocket
│  │  ├─ http/
│  │  ├─ grpc/
│  │  └─ ws/
│  ├─ control/           # Constraint types and enforcement (CAL)
│  ├─ access/            # Access control and policy evaluation
│  ├─ consent/           # Consent lifecycle management
│  ├─ compliance/        # Regulatory compliance helpers
│  ├─ attribution/       # Attribution and revenue sharing
│  ├─ privacy/           # Privacy budgeting and data protection
│  ├─ provenance/        # Content provenance and C2PA integration
│  └─ intelligence/      # Analytics and insights
├─ sdks/                 # Language SDKs (TypeScript, Python, Go, Rust)
└─ surfaces/             # Platform integrations (WordPress, Vercel, etc.)
```

**Core (normative):**

- `specs/kernel/*.json` - Constants, errors, registries
- `docs/specs/PEAC-RECEIPT-SCHEMA-v0.9.json` - Receipt envelope schema
- `docs/specs/PROTOCOL-BEHAVIOR.md` - Issue, verify, discovery rules

**Policy surfaces (recommended, non-normative):**

- `docs/specs/PEAC-TXT.md` - peac.txt specification (planned)
- AIPREF / ai.txt / llm.txt compatibility notes

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

**Core:**

- `@peac/kernel` - Zero-dependency constants and registries
- `@peac/schema` - TypeScript types, Zod validators, JSON Schema
- `@peac/crypto` - Ed25519 JWS signing and verification
- `@peac/protocol` - High-level issue() and verify() functions

**Runtime:**

- `@peac/server` - HTTP verification server with 402 support
- `@peac/cli` - Command-line tools for receipts and policy

**Rails and mappings:**

- `@peac/rails-x402` - x402 payment rail adapter
- `@peac/rails-stripe` - Stripe payment rail adapter
- `@peac/mappings-mcp` - Model Context Protocol integration
- `@peac/mappings-acp` - Agentic Commerce Protocol integration
- `@peac/mappings-a2a` - Agent-to-agent protocol (planned)

**Pillars:**

- `@peac/control` - Constraint types and enforcement
- `@peac/access` - Access control and policy evaluation
- `@peac/consent` - Consent lifecycle management
- `@peac/compliance` - Regulatory compliance helpers
- `@peac/attribution` - Attribution and revenue sharing
- `@peac/privacy` - Privacy budgeting and data protection
- `@peac/provenance` - Content provenance and C2PA integration
- `@peac/intelligence` - Analytics and insights

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

## Versioning and conformance

**Wire format:**

- `peac.receipt/0.9` frozen throughout v0.9.x series
- Libraries may evolve APIs but must emit/accept 0.9 receipts

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
