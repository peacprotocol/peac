# PEAC Protocol Architecture

**Version:** 0.12.9
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

**Schema source-of-truth policy:** `specs/kernel/*.json` files are the normative source for constants, error codes, and registries. Codegen scripts generate TypeScript from these specs. Runtime validation schemas (Zod) in `@peac/schema` are hand-maintained but must stay consistent with the JSON specs. JSON Schema files in `specs/kernel/` (e.g., `registries.schema.json`, JSON Schema 2020-12) validate the spec files themselves. Future evaluation: Zod 4 supports native JSON Schema conversion, which could reduce dual-maintenance risk by generating JSON Schema from Zod or vice versa.

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

### 4. Runtime Support Policy

PEAC packages declare `engines.node: ">=22.0.0"` and follow this support policy:

- **Canonical production target:** Node 24 (Active LTS). `.node-version` pins to the latest 24.x LTS patch.
- **Compatibility floor:** Node 22 (Maintenance LTS). Supported because it is declared in `engines.node`. CI exercises Node 22 in a compatibility lane.
- **Forward-compatibility lane:** Node 25 (Current release line). CI exercises Node 25 to catch upcoming breakage early. Not a production support target.

CI runs the full test suite on Node 24 (primary) and Node 22 + 25 (compatibility matrix). Packages must pass all three.

### 5. Spec-First Development

- Wire format `peac-receipt/0.1` is the frozen legacy wire format identifier (v0.10.0+); the Interaction Record format (`interaction-record+jwt`) is current
- JSON Schema at `specs/wire/peac-receipt-0.1.schema.json` is normative for Wire 0.1
- Go SDK provides Wire 0.1 issuance, verification, and policy evaluation; additional implementations can follow the same specs

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
│   ├── kernel/             # Layer 0: Zero-dependency constants, types, errors
│   ├── schema/             # Layer 1: Zod validators, Wire 0.2 extension groups
│   ├── crypto/             # Layer 2: Ed25519 JWS, JCS (RFC 8785), base64url
│   ├── protocol/           # Layer 3: issue(), verifyLocal(), discovery
│   ├── control/            # Layer 3: Constraint types and enforcement
│   ├── middleware-core/    # Layer 3.5: Framework-agnostic receipt middleware
│   ├── middleware-express/  # Layer 3.5: Express.js receipt middleware
│   ├── server/             # Layer 5: HTTP verification server
│   ├── mcp-server/         # Layer 5: MCP server (8 tools, stdio + HTTP)
│   ├── cli/                # Layer 5: Command-line tools
│   ├── adapters/           # Layer 4: Evidence adapters
│   │   ├── x402/           # x402 v1+v2 (Linux Foundation)
│   │   ├── did/            # DID resolution (did:key, did:web)
│   │   ├── eat/            # EAT passport (COSE_Sign1, RFC 9052)
│   │   ├── managed-agents/ # Vendor-neutral managed runtime evidence
│   │   └── openclaw/       # OpenClaw agent framework
│   ├── mappings/           # Layer 4: Protocol mappings
│   │   ├── a2a/            # A2A v1.0.0 (Linux Foundation)
│   │   ├── acp/            # Agentic Commerce Protocol (OpenAI/Stripe)
│   │   ├── paymentauth/    # MPP/paymentauth (Stripe/Tempo)
│   │   ├── ucp/            # Unified Commerce Protocol (Google)
│   │   ├── content-signals/ # Content signals observation
│   │   ├── intoto/         # in-toto v1.0 provenance
│   │   └── slsa/           # SLSA v1.2 provenance
│   ├── rails/              # Layer 4: Payment rail adapters
│   │   ├── x402/           # x402 payment rail
│   │   └── stripe/         # Stripe payment rail
│   ├── transport-grpc/     # Layer 4: gRPC carrier binding
│   ├── net-node/           # Layer 4: SSRF-safe network utilities
│   ├── http-signatures/    # Layer 4: RFC 9421 HTTP Message Signatures
│   └── jwks-cache/         # Layer 4: Edge-safe JWKS fetch
├── apps/                   # Internal applications (not published)
│   ├── api/                # Reference verifier (self-hostable, tenantless)
│   └── sandbox-issuer/     # Sandbox receipt issuer
├── examples/               # 30 canonical flow examples
│   ├── minimal/            # Minimal issue + verify
│   ├── mcp-http-quickstart/ # MCP Streamable HTTP quickstart
│   ├── external-pilot/     # External pilot kit with JSON Schema gate
│   └── ...                 # (27 more; see examples/ directory)
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

## Package Inventory (36 published packages as of v0.12.9)

### Core (Normative, Layers 0-3)

| Package          | Layer | Description                                                                          |
| ---------------- | ----- | ------------------------------------------------------------------------------------ |
| `@peac/kernel`   | 0     | Zero-dependency constants, types, errors                                             |
| `@peac/schema`   | 1     | Zod validators, Wire 0.2 extension groups (12 groups), type-to-extension enforcement |
| `@peac/crypto`   | 2     | Ed25519 JWS, JCS canonicalization (RFC 8785), JOSE hardening                         |
| `@peac/protocol` | 3     | `issue()`, `issueWire02()`, `verifyLocal()` with strict/interop profiles             |
| `@peac/control`  | 3     | Constraint types and kernel constraint enforcement                                   |

### Middleware (Layer 3.5)

| Package                    | Layer | Description                           |
| -------------------------- | ----- | ------------------------------------- |
| `@peac/middleware-core`    | 3.5   | Framework-agnostic receipt middleware |
| `@peac/middleware-express` | 3.5   | Express.js receipt middleware         |

### Adapters (Layer 4)

| Package                           | Layer | Description                                                      |
| --------------------------------- | ----- | ---------------------------------------------------------------- |
| `@peac/adapter-x402`              | 4     | x402 v1+v2 evidence (4-layer architecture, scheme-agnostic)      |
| `@peac/adapter-did`               | 4     | DID resolution (did:key Ed25519 zero-I/O, did:web SSRF-hardened) |
| `@peac/adapter-eat`               | 4     | EAT passport (COSE_Sign1, RFC 9052/9053, Ed25519)                |
| `@peac/adapter-managed-agents`    | 4     | Vendor-neutral managed runtime evidence (6 event families)       |
| `@peac/adapter-openclaw`          | 4     | OpenClaw agent framework integration                             |
| `@peac/adapter-openai-compatible` | 4     | Hash-first inference receipts (OpenAI-compatible APIs)           |

### Mappings (Layer 4)

| Package                          | Layer | Description                                                       |
| -------------------------------- | ----- | ----------------------------------------------------------------- |
| `@peac/mappings-a2a`             | 4     | A2A v1.0.0 artifact embedding + Agent Card discovery              |
| `@peac/mappings-acp`             | 4     | Agentic Commerce Protocol session lifecycle + payment observation |
| `@peac/mappings-paymentauth`     | 4     | MPP/paymentauth envelope-first HTTP Payment scheme parsing        |
| `@peac/mappings-ucp`             | 4     | Unified Commerce Protocol order-vs-payment separation             |
| `@peac/mappings-content-signals` | 4     | Content signals observation (3-state, source precedence)          |
| `@peac/mappings-intoto`          | 4     | in-toto v1.0 provenance mapping                                   |
| `@peac/mappings-slsa`            | 4     | SLSA v1.2 provenance mapping                                      |

### Infrastructure (Layer 4)

| Package                 | Layer | Description                                                |
| ----------------------- | ----- | ---------------------------------------------------------- |
| `@peac/net-node`        | 4     | SSRF-safe network utilities with DNS pinning               |
| `@peac/transport-grpc`  | 4     | gRPC carrier binding (metadata interceptor, status parity) |
| `@peac/http-signatures` | 4     | RFC 9421 HTTP Message Signatures                           |
| `@peac/jwks-cache`      | 4     | Edge-safe JWKS fetch with SSRF protection                  |

### Applications (Layer 5)

| Package            | Layer | Description                                                 |
| ------------------ | ----- | ----------------------------------------------------------- |
| `@peac/server`     | 5     | HTTP verification server                                    |
| `@peac/mcp-server` | 5     | MCP server (8 tools, stdio + Streamable HTTP, RFC 9728 PRM) |
| `@peac/cli`        | 5     | Command-line tools for receipts, policy, reconciliation     |

See `scripts/publish-manifest.json` and `REPO_SURFACE_STATUS.json` for the full authoritative package list. Additional published packages (rails, telemetry, audit, pillar-specific) are listed there.

---

## Wire Format

Two wire formats exist. The Interaction Record format is the current stable format; Wire 0.1 is frozen legacy.

### Interaction Record format (current)

```typescript
// JWS protected header
interface Wire02Header {
  typ: 'interaction-record+jwt';
  alg: 'EdDSA';
  kid: string;
}

// JWS payload (Wire02Claims)
interface Wire02Claims {
  iss: string; // Issuer URL (https:// or did:)
  iat: number; // Issued at (Unix timestamp)
  exp?: number; // Expiration (Unix timestamp)
  jti: string; // Unique receipt ID
  peac_version: '0.2'; // Wire version
  kind: 'evidence' | 'challenge';
  type: string; // Reverse-DNS or URI (e.g., org.peacprotocol/payment)
  pillars?: string[]; // 10-value closed taxonomy
  extensions?: Record<string, unknown>; // Typed extension groups
  policy?: PolicyBlock; // JCS + SHA-256 policy binding
  actor?: ActorBlock; // Agent identity
}
```

See [docs/specs/WIRE-0.2.md](specs/WIRE-0.2.md) for the normative specification.

### Wire 0.1 (frozen legacy)

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
- Key discovery: `/.well-known/peac-issuer.json` -> `jwks_uri` -> JWKS

### Verification

1. Parse JWS and extract header/payload
2. Fetch issuer's `peac-issuer.json`, resolve `jwks_uri`, fetch JWKS (all SSRF-safe)
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

| Version | Changes                                                                       |
| ------- | ----------------------------------------------------------------------------- |
| 0.11.3  | ZT profiles, agent identity, key rotation, reconcile CLI, governance mappings |
| 0.11.2  | Error recovery hints, content signals, OpenAI adapter, distribution surfaces  |
| 0.11.1  | Evidence Carrier Contract, A2A/MCP/ACP/UCP/x402 carrier adoption              |
| 0.11.0  | Zod 4 migration, MCP Streamable HTTP, kernel constraints, OWASP ASI           |
| 0.10.13 | MCP server (5 tools), handler-transport separation, SSRF prevention           |
| 0.10.11 | Runtime deps (@noble/ed25519 v3, OTel v2), Stripe crypto, registry v0.3.0     |
| 0.10.10 | Dev toolchain modernization, Node 22 baseline                                 |
| 0.9.18  | TAP, HTTP signatures, surfaces, examples, schema normalization                |
| 0.9.17  | x402 v2, Policy Kit, RSL alignment, subject binding                           |
| 0.9.16  | CAL semantics, PaymentEvidence, SubjectProfile                                |
| 0.9.15  | Kernel-first architecture, vendor neutrality                                  |
| 0.9.14  | Initial wire format freeze                                                    |
