<p align="center">
  <a href="https://www.peacprotocol.org">
    <h1 align="center">PEAC Protocol</h1>
  </a>
</p>

<p align="center">
  <strong>Portable signed proof for agent, API, and MCP interactions</strong>
  <br />
  Publish machine-readable terms, return signed interaction records, and verify them offline.
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

PEAC is an open standard for publishing machine-readable terms, returning signed interaction records, and verifying them offline. It is the evidence layer: portable proof across organizational boundaries, without replacing auth, payment rails, or observability.

**For** API providers, MCP tool hosts, agent operators, platforms, and auditors who need proof that crosses boundaries.

## How it works

```text
1. Publish terms at /.well-known/peac.txt
2. Return PEAC-Receipt with signed proof
3. Verify offline with the issuer's public key
```

What a governed HTTP response looks like:

```text
HTTP/1.1 200 OK
PEAC-Receipt: eyJhbGciOiJFZERTQSIsInR5cCI6ImludGVyYWN0aW9uLXJlY29yZCtqd3QifQ...
Link: </.well-known/peac-issuer.json>; rel="issuer"
```

## Quick start

**Requirements:** Node 24 (tested); Node 22+ (compatible)

### Verify a receipt

```bash
pnpm add @peac/protocol @peac/crypto
```

```typescript
import { verifyLocal } from '@peac/protocol';

const receipt = response.headers.get('PEAC-Receipt');
const result = await verifyLocal(receipt, publicKey, {
  issuer: 'https://api.example.com',
});

if (result.valid) {
  console.log(result.claims.iss, result.claims.kind, result.claims.type);
}
```

Or from the CLI:

```bash
peac verify 'eyJhbGciOiJFZERTQSIsInR5cCI6ImludGVyYWN0aW9uLXJlY29yZCtqd3QifQ...'
```

### Issue a receipt

```typescript
import { generateKeypair } from '@peac/crypto';
import { issue } from '@peac/protocol';

const { privateKey, publicKey } = await generateKeypair();

const { jws } = await issue({
  iss: 'https://api.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/access-decision',
  pillars: ['access'],
  privateKey,
  kid: 'key-2026-03',
});

// Return jws in the PEAC-Receipt header
```

### Run the example

```bash
pnpm install && pnpm build
pnpm --filter @peac/example-wire-02-minimal demo
```

See [examples/wire-02-minimal/](examples/wire-02-minimal/) for the full source. For HTTP/REST, Express middleware, and Go examples, see [docs/README_LONG.md](docs/README_LONG.md).

---

## Start with the outcome you want

- **Add signed proof to an HTTP API**: [Quickstart](docs/README_LONG.md#httprest-integration) or [Express middleware](docs/README_LONG.md#express-middleware)
- **Add evidence to an MCP server**: [MCP server](packages/mcp-server/)
- **Carry proof through A2A**: [A2A carrier mapping](packages/mappings/a2a/)
- **Author machine-readable terms**: [Policy Kit](docs/policy-kit/quickstart.md)
- **Verify a receipt locally**: [Quick start](#verify-a-receipt) above or [CLI](#cli)
- **Create an evidence bundle**: [Dispute Bundles](docs/README_LONG.md#dispute-bundle)
- **Build in Go**: [Go SDK](sdks/go/)

---

## Where it fits

| Existing system     | What PEAC adds                                         |
| ------------------- | ------------------------------------------------------ |
| **Logs**            | Portable proof that survives organizational boundaries |
| **OpenTelemetry**   | Signed evidence that correlates to traces              |
| **MCP / A2A**       | Proof carried alongside tool calls and agent exchanges |
| **AP2 / ACP / UCP** | Proof of terms and outcomes                            |
| **x402**            | Settlement proof mapping with offline verification     |
| **Payment rails**   | Settlement references made verifiable offline          |

**What changes in your stack:** keep auth, keep payments, keep observability. Add `/.well-known/peac.txt` and return `PEAC-Receipt` on governed responses.

---

## What the artifacts look like

| Artifact                | Description                                               |
| ----------------------- | --------------------------------------------------------- |
| `/.well-known/peac.txt` | Machine-readable terms                                    |
| `PEAC-Receipt`          | Signed interaction proof in headers or transport metadata |
| `verifyLocal()`         | Local verification once keys are available                |
| `peac-bundle/0.1`       | Portable audit/dispute package                            |

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

## Versioning

- **Current stable:** Interaction Record format (`interaction-record+jwt`, v0.12.1+)
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

- **TypeScript** (this repo): issuance, verification, CLI, middleware
- **Go**: [sdks/go/](sdks/go/) issuance and verification
- **MCP**: [MCP server](packages/mcp-server/) evidence emission and verification tools
- **A2A**: [A2A carrier mapping](packages/mappings/a2a/) metadata carrier mapping
- **Express**: [Express middleware](packages/middleware-express/) receipt middleware
- **x402**: [x402 adapter](packages/adapters/x402/) payment evidence adapter

Building an implementation? [Open an issue](https://github.com/peacprotocol/peac/issues/new).

---

## Contributing and license

Contributions are welcome. For substantial changes, please open an issue first. See [docs/SPEC_INDEX.md](docs/SPEC_INDEX.md) for normative specifications and [docs/CI_BEHAVIOR.md](docs/CI_BEHAVIOR.md) for CI guidelines.

Apache-2.0. See [LICENSE](LICENSE). Stewardship: [Originary](https://www.originary.xyz/) and the open source community.

**Source:** [github.com/peacprotocol/peac](https://github.com/peacprotocol/peac) | **Website:** [peacprotocol.org](https://www.peacprotocol.org) | **Discussions:** [GitHub Discussions](https://github.com/peacprotocol/peac/discussions)
