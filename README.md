# PEAC Protocol

**Verifiable interaction records for automated systems**

A record is the portable interaction artifact; a receipt is the signed file format.

[Website](https://www.peacprotocol.org) | [Spec Index](docs/SPEC_INDEX.md) | [Discussions](https://github.com/peacprotocol/peac/discussions) | [Releases](https://github.com/peacprotocol/peac/releases)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/peacprotocol/peac)](https://github.com/peacprotocol/peac/releases)
[![npm downloads](https://img.shields.io/npm/dm/@peac/protocol?style=flat)](https://www.npmjs.com/package/@peac/protocol)

**What:** PEAC standardizes a file-discoverable policy surface and a signed receipt format that make automated interactions provable -- consent, attribution, settlement references, decisions, outcomes.

**Who:** APIs, gateways, tool servers, agent platforms, and compliance/security teams operating automated traffic across org boundaries.

**Why:** Internal logs are not neutral proof and integrations do not interoperate. PEAC makes terms machine-readable and outcomes verifiable, without replacing your auth, rails, or observability.

Works over HTTP/REST (headers), MCP/A2A, and streaming transports; verification is offline and deterministic.

## The model

```mermaid
flowchart LR
    subgraph "1. Publish policy"
        A[Service] -->|hosts| B["/.well-known/peac.txt"]
    end
    subgraph "2. Issue receipt"
        C[Gateway] -->|signs| D[PEAC-Receipt]
    end
    subgraph "3. Verify + bundle"
        E[Verifier] -->|exports| F[Dispute Bundle]
    end
    B -.->|policy discovery| C
    D -.->|offline verify| E
```

1. **Publish policy**: Services publish terms and record requirements (`/.well-known/peac.txt`)
2. **Issue receipt**: Gateways issue signed receipts for governed interactions (identity, purpose, settlement, extensions)
3. **Verify + bundle**: Receipts verified offline; Dispute Bundles provide portable evidence for audits

## Where it fits

- HTTP APIs (paid or permissioned), tool invocations, dataset downloads, long-running sessions
- Cross-org audit evidence (security, compliance, billing disputes)
- Crawls, indexing, and AI training access with verifiable terms

PEAC is the evidence layer. It does not replace identity, payment, or observability systems:

- **OpenTelemetry** is observability. PEAC is portable proof that can correlate to traces.
- **MCP / A2A** coordinate tool use and agent exchanges. PEAC carries proof alongside them.
- **AP2 / ACP / UCP** authorize and orchestrate commerce flows. PEAC provides verifiable evidence around those flows.
- **Payment rails** move funds. PEAC records settlement references and makes outcomes verifiable.

This repository contains the **reference TypeScript implementation** and a **Go SDK** ([sdks/go/](sdks/go/)).

---

## Quick start

```bash
pnpm add @peac/protocol
```

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

See [examples/quickstart/](examples/quickstart/) for runnable code. For settlement fields, HTTP/REST integration, Express middleware, and Go SDK examples, see [docs/README_LONG.md](docs/README_LONG.md).

---

## CLI

> **Note:** `@peac/cli` publishes to npm with v0.10.9. Until then, run from source: `pnpm --filter @peac/cli exec peac`.

```bash
peac verify 'eyJhbGc...'                # Verify a receipt
peac conformance run                     # Run conformance tests
peac conformance run --level full        # Full conformance suite
peac samples list                        # List sample receipts
peac policy init                         # Create peac-policy.yaml
peac policy validate policy.yaml         # Validate policy syntax
peac policy generate policy.yaml         # Compile to deployment artifacts
```

See [packages/cli/README.md](packages/cli/README.md) for the full command reference.

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

## Versioning

Wire format identifiers (`peac-receipt/0.1`, `peac-bundle/0.1`) are independent of npm package versions and frozen for the v0.x series. Protocol surfaces (`PEAC-Receipt` header, `/.well-known/peac.txt`, `/.well-known/peac-issuer.json`) are stable. Implementation APIs (`@peac/protocol`, `@peac/cli`) aim for stability; internal packages may change between releases.

See [docs/specs/VERSIONING.md](docs/specs/VERSIONING.md) for the versioning doctrine.

---

## Security

- JWS signature verification required before trusting any receipt claim
- Key discovery via `/.well-known/peac-issuer.json` JWKS endpoints with SSRF guards and timeouts
- No silent network fallback for offline verification (fail-closed)
- Replay protection via nonce + timestamp validation
- Errors mapped to RFC 9457 Problem Details (no internal details exposed)

See [SECURITY.md](.github/SECURITY.md) and [docs/specs/PROTOCOL-BEHAVIOR.md](docs/specs/PROTOCOL-BEHAVIOR.md).

---

## Documentation

| Document                                               | Purpose                                           |
| ------------------------------------------------------ | ------------------------------------------------- |
| [Spec Index](docs/SPEC_INDEX.md)                       | Normative specifications                          |
| [Architecture](docs/ARCHITECTURE.md)                   | Kernel-first design                               |
| [Policy Kit Quickstart](docs/policy-kit/quickstart.md) | Policy authoring guide                            |
| [Engineering Guide](docs/engineering-guide.md)         | Development patterns                              |
| [CI Behavior](docs/CI_BEHAVIOR.md)                     | CI pipeline and gates                             |
| [Extended README](docs/README_LONG.md)                 | Package catalog, integration examples, layer maps |

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
