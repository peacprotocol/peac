<p align="center">
  <a href="https://www.peacprotocol.org">
    <h1 align="center">PEAC Protocol</h1>
  </a>
</p>

<p align="center">
  <strong>Portable signed records for agent, API, MCP, and cross-runtime interactions</strong>
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

PEAC is an open standard for verifiable interaction records across agent, tool, API, and cross-runtime systems. Publish machine-readable terms, return signed records, and verify them offline: portable audit records across organizational boundaries, without replacing auth, payment rails, or observability.

**For** API providers, MCP tool hosts, agent operators, platforms, and auditors who need portable signed records that cross boundaries.

## How it works

```text
1. Publish terms at /.well-known/peac.txt
2. Return PEAC-Receipt with a signed interaction record
3. Verify offline with the issuer's public key
```

What a governed HTTP response looks like:

```text
HTTP/1.1 200 OK
PEAC-Receipt: eyJhbGciOiJFZERTQSIsInR5cCI6ImludGVyYWN0aW9uLXJlY29yZCtqd3QifQ...
Link: </.well-known/peac-issuer.json>; rel="issuer"
```

## Quick start

**Requirements:** Node 24 (tested); Node 22+ (compatible). [Go 1.26+](sdks/go/) and [Python 3.12+](examples/python/) also supported.

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
  extensions: {
    'org.peacprotocol/access': {
      resource: 'https://api.example.com/inference/v1',
      action: 'execute',
      decision: 'allow',
    },
  },
  privateKey,
  kid: 'key-2026-03',
});

// Return jws in the PEAC-Receipt header
```

### Run the example

```bash
pnpm install && pnpm build
pnpm --filter @peac/example-minimal demo
```

See [examples/minimal/](examples/minimal/) for the full source. For HTTP/REST, Express middleware, and Go examples, see [docs/README_LONG.md](docs/README_LONG.md).

---

## Common use cases

PEAC is most useful where logs are not enough: payments, cross-boundary verification, audit, dispute review, and multi-agent workflows.

- **Agentic commerce and payments:** Prove what was offered, challenged, paid, or settled across paymentauth, x402, Agentic Commerce Protocol (ACP), Stripe SPT, and other commerce flows. See [paymentauth Kit](integrator-kits/paymentauth/README.md), [ACP Kit](integrator-kits/acp/README.md), [x402 Kit](integrator-kits/x402/README.md).
- **Audit and dispute review:** Keep signed evidence that survives organizational boundaries, not just local logs. See [Governance Mappings](docs/governance/).
- **MCP tools and APIs:** Verify, issue, and carry signed receipts for tool calls, API responses, and automated actions. See [MCP Integration Kit](integrator-kits/mcp/README.md).
- **Agent-to-agent workflows:** Carry verifiable receipts across A2A task/state transitions and multi-agent chains. See [A2A Integration Kit](integrator-kits/a2a/README.md).
- **Runtime governance:** Record governance decisions from managed runtimes (Microsoft AGT, Claude Managed Agents, OpenAI ACP) as portable signed records. See [`@peac/adapter-runtime-governance`](packages/adapters/runtime-governance/).

## Start here

**[Full decision tree with quickstarts and integration kits](docs/START_HERE.md)**

- **I run an API**: [API Provider Quickstart](docs/guides/quickstart-api-provider.md) (5 minutes, Express middleware)
- **I run an MCP server**: [MCP Integration Kit](integrator-kits/mcp/README.md) or `npx -y @peac/mcp-server`
- **I want to verify a receipt**: [Agent Operator Quickstart](docs/guides/quickstart-agent-operator.md) (5 minutes)
- **I build A2A agents**: [A2A Integration Kit](integrator-kits/a2a/README.md)

More paths: [Go SDK](sdks/go/) | [Python examples](examples/python/) | [paymentauth Kit](integrator-kits/paymentauth/README.md) | [ACP Kit](integrator-kits/acp/README.md) | [x402 Kit](integrator-kits/x402/README.md) | [Governance Mappings](docs/governance/)

---

## Where it fits

| Existing system                                 | What PEAC adds                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| **Logs**                                        | Portable signed records that survive organizational boundaries   |
| **OpenTelemetry**                               | Signed records that correlate to traces                          |
| **MCP / A2A**                                   | Signed receipts carried alongside tool calls and agent exchanges |
| **AP2 / ACP (Agentic Commerce Protocol) / UCP** | Signed records of terms and outcomes across commerce protocols   |
| **paymentauth**                                 | Receipts from HTTP Payment authentication challenges             |
| **x402**                                        | Settlement record mapping with offline verification              |
| **Stripe SPT / Payment rails**                  | Delegation and settlement references made verifiable             |
| **Runtime governance (AGT, Claude MA, ACP)**    | Portable records of governance decisions across boundaries       |

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

- **Current stable:** Interaction Record format (`interaction-record+jwt`)
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

| Document                                                             | Purpose                                           |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| [Spec Index](docs/SPEC_INDEX.md)                                     | Normative specifications                          |
| [Interaction Record Spec](docs/specs/WIRE-0.2.md)                    | Receipt envelope, kinds, extensions               |
| [Architecture](docs/ARCHITECTURE.md)                                 | Kernel-first design                               |
| [Kernel Constraints](docs/specs/KERNEL-CONSTRAINTS.md)               | Structural limits enforced at issue and verify    |
| [Policy Kit Quickstart](docs/policy-kit/quickstart.md)               | Policy authoring guide                            |
| [Profiles](docs/profiles/)                                           | Integration profiles (Stripe x402, etc.)          |
| [Evidence Carrier Contract](docs/specs/EVIDENCE-CARRIER-CONTRACT.md) | Transport-neutral carrier placement rules         |
| [Developer Guide](docs/README_LONG.md)                               | Package catalog, integration examples, layer maps |

---

## Implementations

- **TypeScript** (this repo): issuance, verification, CLI, middleware
- **Go**: [sdks/go/](sdks/go/) issuance and verification
- **MCP**: [MCP server](packages/mcp-server/) evidence emission and verification tools
- **A2A**: [A2A carrier mapping](packages/mappings/a2a/) metadata carrier, OAuth PKCE auth surface
- **gRPC**: [gRPC transport](packages/transport/grpc/) carrier adapter with HTTP/2 metadata binding
- **DID**: [DID resolution](packages/adapters/did/) did:key and did:web resolver with caching
- **Express**: [Express middleware](packages/middleware-express/) receipt middleware
- **x402**: [x402 adapter](packages/adapters/x402/) payment evidence adapter (V1 + V2)
- **Runtime governance**: [Runtime governance adapter](packages/adapters/runtime-governance/) records from AGT and other runtimes
- **Managed agents**: [Managed agents adapter](packages/adapters/managed-agents/) session lifecycle records
- **Supply chain**: [in-toto](packages/mappings/intoto/) and [SLSA](packages/mappings/slsa/) provenance mappings

Building an implementation? [Open an issue](https://github.com/peacprotocol/peac/issues/new).

---

## Contributing and license

Contributions are welcome. For substantial changes, please open an issue first. See [docs/SPEC_INDEX.md](docs/SPEC_INDEX.md) for normative specifications and [docs/CI_BEHAVIOR.md](docs/CI_BEHAVIOR.md) for CI guidelines.

Apache-2.0. See [LICENSE](LICENSE).

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz) | [Discussions](https://github.com/peacprotocol/peac/discussions)
