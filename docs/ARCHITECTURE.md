# PEAC Protocol Architecture

**Version:** 0.9.18
**Status:** Authoritative

This document describes the kernel-first architecture of the PEAC Protocol monorepo.

---

## Design Principles

### 1. Kernel-First

All normative constants, error codes, and registries originate from `specs/kernel/*.json`. TypeScript (and future language SDKs) derive their implementations from these machine-readable specifications.

```
specs/kernel/*.json         ← Normative JSON specifications (source of truth)
       ↓
packages/kernel/src/*.ts    ← TypeScript implementation
       ↓
packages/{schema,protocol,control,crypto}  ← Core packages import from @peac/kernel
```

### 2. Layered Dependencies

Packages follow a strict layering model to prevent circular dependencies and ensure clear separation of concerns:

```
Layer 0: kernel          (zero dependencies)
Layer 1: schema          (depends on kernel)
Layer 2: crypto          (depends on schema)
Layer 3: protocol        (depends on crypto, schema)
         control         (depends on schema)
Layer 4: rails/*         (depends on protocol, schema)
         mappings/*      (depends on protocol)
         transport/*     (depends on protocol)
Layer 5: server          (depends on protocol, crypto)
         cli             (depends on protocol, server)
Layer 6: pillars         (depends on protocol, control)
```

### 3. Vendor Neutrality

- No vendor-specific code in core packages (kernel, schema, crypto, protocol, control)
- All vendor-specific logic isolated in `packages/rails/*` adapters
- PaymentEvidence uses generic fields; rail-specific data goes in `evidence` object
- Agent protocol specifics isolated in `packages/mappings/*`

### 4. Spec-First Development

- Wire format `peac-receipt/0.1` is the canonical wire format identifier (v0.10.0+)
- JSON Schema at `specs/wire/peac-receipt-0.1.schema.json` is normative
- TypeScript is one implementation; Go, Rust, Python SDKs follow same specs

---

## Dependency DAG

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                        LAYER 6                              │
                    │   pillars: access, attribution, compliance, consent,        │
                    │            intelligence, privacy, provenance                │
                    └─────────────────────────────────────────────────────────────┘
                                              │
                    ┌─────────────────────────────────────────────────────────────┐
                    │                        LAYER 5                              │
                    │                   server    cli                             │
                    └─────────────────────────────────────────────────────────────┘
                                              │
                    ┌─────────────────────────────────────────────────────────────┐
                    │                        LAYER 4                              │
                    │   rails/x402   rails/stripe   mappings/mcp   mappings/acp   │
                    │   transport/http   transport/grpc   transport/ws            │
                    └─────────────────────────────────────────────────────────────┘
                                              │
                    ┌─────────────────────────────────────────────────────────────┐
                    │                        LAYER 3                              │
                    │                  protocol       control                     │
                    └─────────────────────────────────────────────────────────────┘
                                              │
                    ┌─────────────────────────────────────────────────────────────┐
                    │                        LAYER 2                              │
                    │                        crypto                               │
                    └─────────────────────────────────────────────────────────────┘
                                              │
                    ┌─────────────────────────────────────────────────────────────┐
                    │                        LAYER 1                              │
                    │                        schema                               │
                    └─────────────────────────────────────────────────────────────┘
                                              │
                    ┌─────────────────────────────────────────────────────────────┐
                    │                        LAYER 0                              │
                    │                        kernel                               │
                    └─────────────────────────────────────────────────────────────┘
```

### Import Rules

- **Downward only:** A package may only import from packages in lower layers
- **No cross-layer siblings:** Layer 4 packages should not import from each other
- **kernel is terminal:** No package may be imported by kernel

---

## Repository Structure

```
peac/
├── specs/
│   └── kernel/             # Normative JSON: constants, errors, registries
├── docs/
│   ├── specs/              # Receipt schema, protocol behavior, test vectors
│   ├── api/                # API reference
│   ├── guides/             # Integration guides
│   ├── architecture/       # Architecture deep-dives
│   └── security/           # Threat models and security controls
├── packages/
│   ├── kernel/             # Layer 0: Zero-dependency constants
│   ├── schema/             # Layer 1: Types, Zod validators, JSON Schema
│   ├── crypto/             # Layer 2: Ed25519 JWS, JCS, base64url
│   ├── protocol/           # Layer 3: issue(), verify(), discovery
│   ├── control/            # Layer 3: Constraint types and enforcement
│   ├── policy-kit/         # Layer 3: YAML/JSON policy evaluation
│   ├── server/             # Layer 5: HTTP verification server
│   ├── cli/                # Layer 5: Command-line tools
│   ├── http-signatures/    # Layer 4: RFC 9421 HTTP Message Signatures
│   ├── jwks-cache/         # Layer 4: Edge-safe JWKS fetch
│   ├── rails/              # Layer 4: Payment rail adapters
│   │   ├── x402/
│   │   └── stripe/
│   ├── mappings/           # Layer 4: Agent protocol mappings
│   │   ├── mcp/
│   │   ├── acp/
│   │   ├── rsl/            # Robots Specification Layer (RSL 1.0)
│   │   └── tap/            # Trusted Agent Protocol
│   ├── access/             # Layer 6: Access control
│   ├── attribution/        # Layer 6: Attribution and revenue sharing
│   ├── compliance/         # Layer 6: Regulatory compliance
│   ├── consent/            # Layer 6: Consent lifecycle
│   ├── intelligence/       # Layer 6: Analytics
│   ├── privacy/            # Layer 6: Privacy budgeting
│   └── provenance/         # Layer 6: Content provenance, C2PA
├── surfaces/               # Platform integration surfaces
│   ├── workers/cloudflare/ # Cloudflare Worker TAP verifier
│   └── nextjs/middleware/  # Next.js Edge middleware
├── examples/               # Canonical flow examples
│   ├── pay-per-inference/  # 402 flow: agent obtains receipt, retries
│   ├── pay-per-crawl/      # Policy Kit + receipt flow for AI crawlers
│   └── rsl-collective/     # RSL token mapping + core claims parity
├── tests/                  # Global test harness
│   ├── conformance/
│   ├── performance/
│   ├── vectors/
│   └── e2e/
└── scripts/                # Automation
    ├── ci/
    └── codegen/
```

---

## Package Inventory

### Core (Normative)

| Package            | Layer | Description                                   |
| ------------------ | ----- | --------------------------------------------- |
| `@peac/kernel`     | 0     | Zero-dependency constants from specs/kernel   |
| `@peac/schema`     | 1     | TypeScript types, Zod validators, JSON Schema |
| `@peac/crypto`     | 2     | Ed25519 JWS, JCS canonicalization (RFC 8785)  |
| `@peac/protocol`   | 3     | High-level issue() and verify() functions     |
| `@peac/control`    | 3     | Constraint types and enforcement              |
| `@peac/policy-kit` | 3     | YAML/JSON policy evaluation for CAL semantics |

### Runtime

| Package        | Layer | Description                                |
| -------------- | ----- | ------------------------------------------ |
| `@peac/server` | 5     | HTTP verification server with 402 support  |
| `@peac/cli`    | 5     | Command-line tools for receipts and policy |

### Rails (Payment Adapters)

| Package              | Layer | Description                 |
| -------------------- | ----- | --------------------------- |
| `@peac/rails-x402`   | 4     | x402 payment rail adapter   |
| `@peac/rails-stripe` | 4     | Stripe payment rail adapter |

### Mappings (Agent Protocol Adapters)

| Package              | Layer | Description                           |
| -------------------- | ----- | ------------------------------------- |
| `@peac/mappings-mcp` | 4     | Model Context Protocol integration    |
| `@peac/mappings-acp` | 4     | Agentic Commerce Protocol integration |
| `@peac/mappings-rsl` | 4     | Robots Specification Layer (RSL 1.0)  |
| `@peac/mappings-tap` | 4     | Trusted Agent Protocol (Visa TAP)     |

### Infrastructure

| Package                 | Layer | Description                               |
| ----------------------- | ----- | ----------------------------------------- |
| `@peac/http-signatures` | 4     | RFC 9421 HTTP Message Signatures          |
| `@peac/jwks-cache`      | 4     | Edge-safe JWKS fetch with SSRF protection |

### Surfaces (Platform Integrations)

| Package                   | Layer | Description                          |
| ------------------------- | ----- | ------------------------------------ |
| `@peac/worker-cloudflare` | 5     | Cloudflare Worker TAP verifier       |
| `@peac/middleware-nextjs` | 5     | Next.js Edge middleware TAP verifier |

### Pillars

| Package              | Layer | Description                             |
| -------------------- | ----- | --------------------------------------- |
| `@peac/access`       | 6     | Access control and policy evaluation    |
| `@peac/attribution`  | 6     | Attribution and revenue sharing         |
| `@peac/compliance`   | 6     | Regulatory compliance helpers           |
| `@peac/consent`      | 6     | Consent lifecycle management            |
| `@peac/intelligence` | 6     | Analytics and insights                  |
| `@peac/privacy`      | 6     | Privacy budgeting and data protection   |
| `@peac/provenance`   | 6     | Content provenance and C2PA integration |

---

## Wire Format

The PEAC receipt envelope follows this structure:

```typescript
interface PEACEnvelope {
  // Header (JWS protected header)
  typ: 'peac-receipt/0.1';
  alg: 'EdDSA';
  kid: string;

  // Claims (JWS payload)
  iss: string; // Issuer URL
  aud: string; // Audience URL
  iat: number; // Issued at (Unix timestamp)
  exp?: number; // Expiration (Unix timestamp)
  jti: string; // Unique receipt ID

  // Payment evidence
  amt: number; // Amount in smallest unit
  cur: string; // ISO 4217 currency code
  payment: PaymentEvidence;

  // Optional
  sub?: string; // Subject (resource URL)
  scope?: string[]; // Granted scopes
}

interface PaymentEvidence {
  rail: string; // Payment rail ID (x402, stripe, etc.)
  asset: string; // Asset transferred
  env: 'live' | 'test'; // Environment
  reference: string; // Payment reference
  evidence: unknown; // Rail-specific proof
}
```

---

## Security Model

### Signature

- Algorithm: Ed25519 (EdDSA with Curve25519)
- Format: JWS Compact Serialization (RFC 7515)
- Key discovery: JWKS at `/.well-known/jwks.json`

### Verification

1. Parse JWS and extract header/payload
2. Fetch issuer's JWKS (with SSRF protection)
3. Verify signature against public key identified by `kid`
4. Validate claims (iss, aud, exp, iat)
5. Validate payment evidence structure

### Defense in Depth

- SSRF protection on all URL fetches (v0.9.16)
- DPoP proof-of-possession binding (v0.9.16)
- JWKS rotation with 90-day key lifecycle
- Rate limiting on verification endpoints
- RFC 9457 Problem Details for all errors

---

## Conformance Levels

| Level | Capability                                       |
| ----- | ------------------------------------------------ |
| L0    | Parse peac.txt discovery manifests               |
| L1    | HTTP semantics and Problem Details               |
| L2    | Policy enforcement (purposes, quotas, retention) |
| L3    | Negotiation, payment, and receipts               |
| L4    | Provenance, attestation, and audit trails        |

---

## Related Documentation

- [SPEC_INDEX.md](SPEC_INDEX.md) - Entry point for normative specifications
- [specs/PROTOCOL-BEHAVIOR.md](specs/PROTOCOL-BEHAVIOR.md) - Issuance and verification flows
- [specs/ERRORS.md](specs/ERRORS.md) - Error codes and HTTP mappings
- [specs/REGISTRIES.md](specs/REGISTRIES.md) - Payment rails and control engines
- [CI_BEHAVIOR.md](CI_BEHAVIOR.md) - CI pipeline behavior

---

## Version History

| Version | Date       | Changes                                                        |
| ------- | ---------- | -------------------------------------------------------------- |
| 0.9.18  | 2025-12-19 | TAP, HTTP signatures, surfaces, examples, schema normalization |
| 0.9.17  | 2025-12-14 | x402 v2, Policy Kit, RSL alignment, subject binding            |
| 0.9.16  | 2025-12-07 | CAL semantics, PaymentEvidence, SubjectProfile                 |
| 0.9.15  | 2025-11-18 | Kernel-first architecture, vendor neutrality                   |
| 0.9.14  | -          | Initial wire format freeze                                     |
