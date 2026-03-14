<p align="center">
  <a href="https://www.peacprotocol.org">
    <h1 align="center">PEAC Protocol</h1>
  </a>
</p>

<p align="center">
  <strong>Verifiable interaction records for AI agents, APIs, and automated systems</strong>
  <br />
  Publish machine-readable terms, return signed receipts, verify outcomes offline.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg" alt="License: Apache 2.0" /></a>
  <a href="https://github.com/peacprotocol/peac/releases"><img src="https://img.shields.io/github/v/release/peacprotocol/peac?color=brightgreen" alt="Latest Release" /></a>
  <a href="https://www.npmjs.com/package/@peac/protocol"><img src="https://img.shields.io/npm/dm/@peac/protocol?style=flat&color=brightgreen" alt="npm downloads" /></a>
  <a href="https://github.com/peacprotocol/peac/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/peacprotocol/peac/ci.yml?branch=main&label=CI&color=brightgreen" alt="CI Status" /></a>
</p>

<p align="center">
  <a href="https://www.peacprotocol.org">Website</a> &middot;
  <a href="docs/SPEC_INDEX.md">Spec Index</a> &middot;
  <a href="https://github.com/peacprotocol/peac/discussions">Discussions</a> &middot;
  <a href="https://github.com/peacprotocol/peac/releases">Releases</a>
</p>

**Use PEAC when:**

- you need proof of interactions across organizational boundaries
- you need machine-readable access, payment, or usage terms
- you need portable evidence for audits, disputes, or incident review

## How it works

```text
1. Service publishes policy    -->  /.well-known/peac.txt (machine-readable terms)
2. Agent makes request         -->  Service returns PEAC-Receipt: <jws> (signed proof)
3. Anyone verifies offline     -->  Check signature + claims using issuer's public keys
```

**Setup (out of band):** Service publishes policy at `/.well-known/peac.txt` and verification keys at `/.well-known/peac-issuer.json`.

### What the artifacts look like

`/.well-known/peac.txt`: machine-readable terms (YAML):

```yaml
version: 'peac-policy/0.1'
usage: conditional
purposes: [crawl, index, inference]
receipts: required
attribution: required
rate_limit: '100/hour'
```

`PEAC-Receipt` header: signed proof returned on governed responses:

```text
PEAC-Receipt: eyJhbGciOiJFZERTQSIsInR5cCI6ImludGVyYWN0aW9uLXJlY29yZCtqd3QifQ...
```

The receipt is a standard JWS (Ed25519) that can be verified offline using the issuer's published keys. Full specification: [Spec Index](docs/SPEC_INDEX.md).

---

## Quick start

**Requirements:** Node 24 (tested); Node 22+ (compatible)

```bash
pnpm add @peac/protocol @peac/crypto
```

```typescript
import { generateKeypair } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';

const { privateKey, publicKey } = await generateKeypair();

const { jws } = await issue({
  iss: 'https://api.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/access-decision',
  pillars: ['access'],
  privateKey,
  kid: 'key-2026-03',
});

const result = await verifyLocal(jws, publicKey);
console.log(result.valid, result.claims.type);
// true org.peacprotocol/access-decision
```

```bash
peac verify 'eyJhbGciOiJFZERTQSIsInR5cCI6ImludGVyYWN0aW9uLXJlY29yZCtqd3QifQ...'
```

> **Legacy:** Wire 0.1 (`peac-receipt/0.1`) is frozen. See [examples/quickstart/](examples/quickstart/) for Wire 0.1 code.

See [examples/wire-02-minimal/](examples/wire-02-minimal/) for a runnable example. For settlement, HTTP/REST, Express middleware, and Go SDK examples, see [docs/README_LONG.md](docs/README_LONG.md).

---

## Choose your path

- **Issue and verify receipts**: [Quick start](#quick-start) above
- **Add receipts to an HTTP API**: [HTTP integration](docs/README_LONG.md#httprest-integration)
- **Add middleware to Express**: [Express middleware](docs/README_LONG.md#express-middleware)
- **Use x402 payments**: [x402 adapter](packages/adapters/x402/) and [Stripe x402 profile](docs/profiles/stripe-x402-machine-payments.md)
- **Author policies**: [Policy Kit](docs/policy-kit/quickstart.md)
- **Verify or bundle evidence**: [Dispute Bundles](docs/README_LONG.md#dispute-bundle)
- **Build in Go**: [Go SDK](sdks/go/) (Wire 0.1)
- **Read the spec**: [Spec Index](docs/SPEC_INDEX.md)

---

## Where it fits

PEAC is the evidence layer. It does not replace auth, payment rails, or observability. It complements them with portable, verifiable proof.

| Existing system     | What PEAC adds                                                      |
| ------------------- | ------------------------------------------------------------------- |
| **Internal logs**   | Portable proof that survives organizational boundaries              |
| **OpenTelemetry**   | Cryptographic evidence that correlates to traces                    |
| **MCP / A2A**       | Verifiable records carried alongside tool calls and agent exchanges |
| **AP2 / ACP / UCP** | Proof of outcomes for commerce authorization and orchestration      |
| **Payment rails**   | Settlement references made verifiable offline                       |

**Use cases:** HTTP APIs (paid or permissioned), agent-to-API calls, dataset downloads, AI training access, cross-org audit evidence, safety and incident response workflows.

This repository contains the **reference TypeScript implementation** and a **Go SDK** ([sdks/go/](sdks/go/)).

---

## CLI

> Install: `pnpm add @peac/cli` or run from this repo: `pnpm --filter @peac/cli exec peac --help`.

```bash
peac verify 'eyJhbGc...'                # Verify a receipt
peac conformance run                     # Run conformance tests
peac reconcile a.bundle b.bundle         # Merge and diff evidence bundles
peac policy init                         # Create peac-policy.yaml
peac policy validate policy.yaml         # Validate policy syntax
peac policy generate policy.yaml         # Compile to deployment artifacts
```

See [packages/cli/README.md](packages/cli/README.md) for the full command reference.

---

## Protocol primitives

| Primitive      | Description                                           |
| -------------- | ----------------------------------------------------- |
| Policy file    | `/.well-known/peac.txt` machine-readable terms        |
| Receipt        | `PEAC-Receipt: <jws>` signed proof (Ed25519)          |
| Issuer config  | `/.well-known/peac-issuer.json` JWKS discovery        |
| Dispute bundle | ZIP with receipts + policy + report for offline audit |

## Versioning

- **Current stable:** Interaction Record format (`interaction-record+jwt`, v0.12.0+)
- **Legacy:** Wire 0.1 (`peac-receipt/0.1`) is frozen; `verifyLocal()` returns `E_UNSUPPORTED_WIRE_VERSION`

See [docs/specs/VERSIONING.md](docs/specs/VERSIONING.md) for the full versioning doctrine.

---

## Security

- JWS signature verification required before trusting any receipt claim
- Key discovery via `/.well-known/peac-issuer.json` JWKS with SSRF guards
- Kernel constraints enforced at issuance and verification (fail-closed)
- No silent network fallback for offline verification
- Errors mapped to RFC 9457 Problem Details

See [SECURITY.md](.github/SECURITY.md) and [docs/specs/PROTOCOL-BEHAVIOR.md](docs/specs/PROTOCOL-BEHAVIOR.md).

---

## Documentation

| Document                                               | Purpose                                           |
| ------------------------------------------------------ | ------------------------------------------------- |
| [Spec Index](docs/SPEC_INDEX.md)                       | Normative specifications                          |
| [Interaction Record Spec](docs/specs/WIRE-0.2.md)      | Receipt envelope, kinds, extensions               |
| [Architecture](docs/ARCHITECTURE.md)                   | Kernel-first design                               |
| [Kernel Constraints](docs/specs/KERNEL-CONSTRAINTS.md) | Structural limits enforced at issue and verify    |
| [Policy Kit Quickstart](docs/policy-kit/quickstart.md) | Policy authoring guide                            |
| [Profiles](docs/profiles/)                             | Integration profiles (Stripe x402, etc.)          |
| [Developer Guide](docs/README_LONG.md)                 | Package catalog, integration examples, layer maps |

---

## Implementations

- **TypeScript** (this repo): `@peac/protocol`, `@peac/cli`, `@peac/sdk-js`
- **Go**: [sdks/go/](sdks/go/) issuance, verification, and policy evaluation (Wire 0.1)
- **MCP**: [MCP server](packages/mcp-server/) (5 tools) and [MCP carrier mapping](packages/mappings/mcp/)
- **A2A**: [A2A carrier mapping](packages/mappings/a2a/) for agent-to-agent evidence
- **HTTP middleware**: [Express](packages/middleware-express/) automatic receipt issuance
- **x402**: [x402 adapter](packages/adapters/x402/) for machine payment evidence

Building an implementation? [Open an issue](https://github.com/peacprotocol/peac/issues/new).

---

## Contributing and license

Contributions are welcome. For substantial changes, please open an issue first. See [docs/SPEC_INDEX.md](docs/SPEC_INDEX.md) for normative specifications and [docs/CI_BEHAVIOR.md](docs/CI_BEHAVIOR.md) for CI guidelines.

Apache-2.0. See [LICENSE](LICENSE). Stewardship: [Originary](https://www.originary.xyz/) and the open source community.

**Source:** [github.com/peacprotocol/peac](https://github.com/peacprotocol/peac) | **Website:** [peacprotocol.org](https://www.peacprotocol.org) | **Discussions:** [GitHub Discussions](https://github.com/peacprotocol/peac/discussions)
