# PEAC Protocol

Portable signed records for agent, API, MCP, and cross-runtime interactions.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/peacprotocol/peac?color=brightgreen)](https://github.com/peacprotocol/peac/releases)
[![npm downloads](https://img.shields.io/npm/dm/@peac/protocol?style=flat&color=brightgreen)](https://www.npmjs.com/package/@peac/protocol)
[![CI Status](https://img.shields.io/github/actions/workflow/status/peacprotocol/peac/ci.yml?branch=main&label=CI&color=brightgreen)](https://github.com/peacprotocol/peac/actions/workflows/ci.yml)

PEAC is the open standard for verifiable interaction records across APIs, MCP servers, x402-powered payment flows, paymentauth / MPP, ACP, A2A workflows, runtime governance, and other cross-runtime systems.

Use PEAC when local logs are not enough and another party needs a signed, portable record of what happened. Do not use PEAC when local logs inside one system are sufficient and no external party needs to verify those records. PEAC does not replace auth, payment rails, observability, or transport protocols; it adds portable signed records across them.

> **Keep auth, keep payments, keep observability.** Add `/.well-known/peac.txt`, return `PEAC-Receipt`, and verify records offline across organizational boundaries.

## The PEAC loop

```text
1. Publish terms at /.well-known/peac.txt
2. Return PEAC-Receipt with a signed interaction record
3. Verify offline with the issuer's public key
```

## Why PEAC

- Logs are local. PEAC records are portable.
- Traces correlate systems. PEAC records survive organizational boundaries.
- Auth and payments authorize actions. PEAC records prove what happened.

## Quick start

**In under a minute, you can verify a PEAC receipt offline.**

**Requirements:** Node 24 tested, Node 22+ compatible. Go middleware and examples are supported (Go 1.26+). Python is available through API-first examples and OpenAPI-driven flows.

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

A governed HTTP response looks like:

```text
HTTP/1.1 200 OK
PEAC-Receipt: eyJhbGciOiJFZERTQSIsInR5cCI6ImludGVyYWN0aW9uLXJlY29yZCtqd3QifQ...
Link: </.well-known/peac-issuer.json>; rel="issuer"
```

## Try PEAC in 5 minutes

- Verify a receipt locally with `verifyLocal()` or `pnpm dlx @peac/cli verify`.
- Start the MCP server: `npx -y @peac/mcp-server`.
- Run the x402 settlement mapping demo: `pnpm install && pnpm build && pnpm --filter @peac/example-x402-upto-evidence demo`.
- Open an editor plugin-pack surface under [`surfaces/plugin-pack/`](surfaces/plugin-pack/) (Cursor, Codex, Claude Code, VS Code, Continue, Windsurf, OpenCode).
- Run the minimal example: `pnpm --filter @peac/example-minimal demo`.
- Follow the [API Provider Quickstart](docs/guides/quickstart-api-provider.md) or [Agent Operator Quickstart](docs/guides/quickstart-agent-operator.md).

## Choose your path

- **I run an API.** [API Provider Quickstart](docs/guides/quickstart-api-provider.md) with Express middleware.
- **I run an MCP server.** [MCP Integration Kit](integrator-kits/mcp/README.md) or `npx -y @peac/mcp-server`; editor surfaces under [`surfaces/plugin-pack/`](surfaces/plugin-pack/).
- **I verify receipts.** [Agent Operator Quickstart](docs/guides/quickstart-agent-operator.md).
- **I build A2A agents.** [A2A Integration Kit](integrator-kits/a2a/README.md).
- **I build x402, paymentauth / MPP, ACP, or metered API flows.** [x402](integrator-kits/x402/README.md), [paymentauth](integrator-kits/paymentauth/README.md), [ACP](integrator-kits/acp/README.md); coverage at [`docs/compatibility/commerce-protocol-coverage.md`](docs/compatibility/commerce-protocol-coverage.md).
- **I operate governed runtimes.** [`@peac/adapter-runtime-governance`](packages/adapters/runtime-governance/) records decisions from managed runtimes (for example Microsoft Agent Governance Toolkit).
- **I need portable audit evidence.** [Core use-case coverage](docs/compatibility/core-use-case-coverage.md) and [governance mappings](docs/governance/).
- **I want editor or plugin integration.** Cursor, Codex, Claude Code, VS Code, Continue, Windsurf, and OpenCode under [`surfaces/plugin-pack/`](surfaces/plugin-pack/); canonical [Smithery deployment config](packages/mcp-server/smithery.yaml).

See [`docs/START_HERE.md`](docs/START_HERE.md) for the full decision tree.

## Where PEAC fits

- **Attach signed records to metered or paid API responses** so consumers can verify what was offered, measured, charged, or delivered.
- **Carry verifiable receipts across MCP and agent workflows** instead of relying on local execution logs.
- **Preserve evidence for audit, dispute, and reconciliation** across system and organizational boundaries.
- **Record governance and control-plane decisions** from managed runtimes such as Microsoft Agent Governance Toolkit.
- **Map commerce and payment events into verifiable records** across x402, paymentauth ([`draft-ryan-httpauth-payment-01`](https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment-01/); MPP), Agentic Commerce Protocol (ACP), and Stripe SPT.

## Implementations and surfaces

- **TypeScript core** — issuance, verification, CLI, middleware (this repo).
- **Go SDK** — [`sdks/go/`](sdks/go/) with production HTTP middleware.
- **MCP tools** — [`packages/mcp-server/`](packages/mcp-server/) evidence tools.
- **Editor and plugin-pack surfaces** — Cursor, Codex, Claude Code, VS Code, Continue, Windsurf, OpenCode under [`surfaces/plugin-pack/`](surfaces/plugin-pack/); canonical [Smithery config](packages/mcp-server/smithery.yaml).
- **Express middleware** — [`packages/middleware-express/`](packages/middleware-express/).
- **Commerce mappings** — [`packages/adapters/x402/`](packages/adapters/x402/) (v1 + v2), [`packages/mappings/paymentauth/`](packages/mappings/paymentauth/) (paymentauth and MPP), [`packages/mappings/acp/`](packages/mappings/acp/) (ACP delegated payment).
- **Runtime governance** — [`packages/adapters/runtime-governance/`](packages/adapters/runtime-governance/) records from Microsoft Agent Governance Toolkit and other managed runtimes.
- **Supply-chain mappings** — [`packages/mappings/intoto/`](packages/mappings/intoto/) and [`packages/mappings/slsa/`](packages/mappings/slsa/).

Long tail (A2A, gRPC, DID, managed agents, and more): [`docs/README_LONG.md`](docs/README_LONG.md).

## Artifacts

| Artifact                | Role                                                |
| ----------------------- | --------------------------------------------------- |
| `/.well-known/peac.txt` | Machine-readable terms                              |
| `PEAC-Receipt`          | Signed interaction record on governed responses     |
| `verifyLocal()`         | Offline verification once issuer keys are available |
| `peac-bundle/0.1`       | Portable audit/dispute package                      |

## CLI

Use the CLI to verify receipts, run conformance checks, reconcile bundles, validate policy artifacts, and run installability diagnostics without writing integration code first.

```bash
# One-off
pnpm dlx @peac/cli verify 'eyJhbGc...'

# Installed in your workspace
pnpm add -D @peac/cli
pnpm exec peac verify 'eyJhbGc...'

# From this repo
pnpm --filter @peac/cli exec peac verify 'eyJhbGc...'
```

Other commands: `peac conformance run`, `peac reconcile a.bundle b.bundle`, `peac policy init|validate|generate`, `peac doctor`. Full reference: [`packages/cli/README.md`](packages/cli/README.md).

## Security

- JWS signature verification required before trusting any receipt claim.
- Key discovery via `/.well-known/peac-issuer.json` JWKS with SSRF guards.
- Kernel constraints enforced at issuance and verification (fail-closed).
- No silent network fallback for offline verification.
- Errors mapped to RFC 9457 Problem Details.

See [`SECURITY.md`](.github/SECURITY.md), [`docs/specs/PROTOCOL-BEHAVIOR.md`](docs/specs/PROTOCOL-BEHAVIOR.md), [`docs/COMPATIBILITY_MATRIX.md`](docs/COMPATIBILITY_MATRIX.md), and [`docs/specs/VERSIONING.md`](docs/specs/VERSIONING.md).

## Versioning

- **Current default format:** `interaction-record+jwt`.
- **Legacy:** `peac-receipt/0.1` is frozen and legacy-only; `verifyLocal()` returns `E_UNSUPPORTED_WIRE_VERSION` on legacy input.

Full doctrine: [`docs/specs/VERSIONING.md`](docs/specs/VERSIONING.md).

## Documentation

- [Spec Index](docs/SPEC_INDEX.md) — normative specifications.
- [Interaction Record Spec](docs/specs/WIRE-0.2.md) — envelope, kinds, extensions.
- [Architecture](docs/ARCHITECTURE.md) — kernel-first design.
- [Developer Guide](docs/README_LONG.md) — package catalog, extended examples.

## Contributing and license

Contributions are welcome. For substantial changes, please open an issue first. See [`docs/SPEC_INDEX.md`](docs/SPEC_INDEX.md) for normative specifications.

Apache-2.0. See [`LICENSE`](LICENSE).

---

PEAC Protocol is an open-source project stewarded by [Originary](https://www.originary.xyz/) and community contributors.

[Docs](https://www.peacprotocol.org) &middot; [GitHub](https://github.com/peacprotocol/peac) &middot; [Discussions](https://github.com/peacprotocol/peac/discussions)
