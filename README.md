# PEAC Protocol

**Govern locally. Prove across boundaries.**

When logs aren't enough, PEAC gives you portable signed records anyone can verify offline.

Portable signed records for agent, API, MCP, and cross-runtime interactions.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/peacprotocol/peac?color=brightgreen)](https://github.com/peacprotocol/peac/releases)
[![npm downloads](https://img.shields.io/npm/dm/@peac/protocol?style=flat&color=brightgreen)](https://www.npmjs.com/package/@peac/protocol)
[![CI Status](https://img.shields.io/github/actions/workflow/status/peacprotocol/peac/ci.yml?branch=main&label=CI&color=brightgreen)](https://github.com/peacprotocol/peac/actions/workflows/ci.yml)

## What you can do

- **I run an API or HTTP service.** Issue signed receipts on every response. [API Provider Quickstart](docs/guides/quickstart-api-provider.md).
- **I run an MCP server.** Attach signed records to tool calls. [MCP Integration Kit](integrator-kits/mcp/README.md) or `npx -y @peac/mcp-server`.
- **I want to verify a receipt.** Verify offline with the issuer's public key. [Agent Operator Quickstart](docs/guides/quickstart-agent-operator.md).
- **I want to prove my runtime decisions.** Record governance observations from managed runtimes. [`@peac/adapter-runtime-governance`](packages/adapters/runtime-governance/).

Full path-by-role tree: [`docs/START_HERE.md`](docs/START_HERE.md).

## Verify a PEAC receipt in 60 seconds

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

Node 24 tested, Node 22+ compatible. Go middleware and examples supported (Go 1.26+). Python via API-first examples and OpenAPI-driven flows.

## How it works

```text
1. Publish terms at /.well-known/peac.txt
2. Return PEAC-Receipt with a signed interaction record
3. Verify offline with the issuer's public key
```

Full loop: [`docs/HOW-IT-WORKS.md`](docs/HOW-IT-WORKS.md). Artifact vocabulary (record, receipt, bundle, report): [`docs/ARTIFACTS.md`](docs/ARTIFACTS.md). Where PEAC sits next to other systems: [`docs/WHERE-IT-FITS.md`](docs/WHERE-IT-FITS.md). Protocol scope: [`docs/WHAT-PEAC-STANDARDIZES.md`](docs/WHAT-PEAC-STANDARDIZES.md).

## Solutions

Outcome-led recipes under [`docs/SOLUTIONS/`](docs/SOLUTIONS/):

- [Runtime evidence export](docs/SOLUTIONS/runtime-evidence-export.md)
- [API receipt issuance](docs/SOLUTIONS/api-receipt-issuance.md)
- [MCP tool-call receipts](docs/SOLUTIONS/mcp-tool-call-receipts.md)
- [Commerce evidence bundle](docs/SOLUTIONS/commerce-evidence-bundle.md)
- [Regulatory audit trail](docs/SOLUTIONS/regulatory-audit-trail.md)

## Why PEAC

- Logs are local. PEAC records are portable.
- Traces correlate systems. PEAC records survive organizational boundaries.
- Auth and payments authorize actions. PEAC records prove what happened.

## Try it in 5 minutes

- Verify a receipt locally with `verifyLocal()` or `pnpm dlx @peac/cli verify`.
- Start the MCP server: `npx -y @peac/mcp-server`.
- Run the x402 settlement mapping demo: `pnpm install && pnpm build && pnpm --filter @peac/example-x402-upto-evidence demo`.
- Open an editor plugin-pack under [`surfaces/plugin-pack/`](surfaces/plugin-pack/) (Cursor, Codex, Claude Code, VS Code, Continue, Windsurf, OpenCode).
- Run the minimal example: `pnpm --filter @peac/example-minimal demo`.
- Self-host the reference verifier: [`surfaces/reference-verifier/`](surfaces/reference-verifier/).

## Implementations and surfaces

- **TypeScript core** — issuance, verification, CLI, middleware (this repo).
- **Go SDK** — [`sdks/go/`](sdks/go/) with production HTTP middleware.
- **MCP tools** — [`packages/mcp-server/`](packages/mcp-server/) evidence tools.
- **Editor and plugin-pack surfaces** — Cursor, Codex, Claude Code, VS Code, Continue, Windsurf, OpenCode under [`surfaces/plugin-pack/`](surfaces/plugin-pack/); canonical [Smithery config](packages/mcp-server/smithery.yaml).
- **Express middleware** — [`packages/middleware-express/`](packages/middleware-express/).
- **Commerce mappings** — [`packages/adapters/x402/`](packages/adapters/x402/) (v1 + v2), [`packages/mappings/paymentauth/`](packages/mappings/paymentauth/) (paymentauth and MPP), [`packages/mappings/acp/`](packages/mappings/acp/) (ACP delegated payment).
- **Runtime governance** — [`packages/adapters/runtime-governance/`](packages/adapters/runtime-governance/) records observations from managed runtimes including Microsoft Agent Governance Toolkit.
- **Supply-chain mappings** — [`packages/mappings/intoto/`](packages/mappings/intoto/) and [`packages/mappings/slsa/`](packages/mappings/slsa/).
- **Reference verifier (self-hostable)** — [`apps/api/`](apps/api/) with deployment recipes under [`surfaces/reference-verifier/`](surfaces/reference-verifier/).

Long tail (A2A, gRPC, DID, managed agents, and more): [`docs/README_LONG.md`](docs/README_LONG.md).

## Artifacts

| Artifact                | Role                                                |
| ----------------------- | --------------------------------------------------- |
| `/.well-known/peac.txt` | Machine-readable terms                              |
| `PEAC-Receipt`          | Signed interaction record on governed responses     |
| `verifyLocal()`         | Offline verification once issuer keys are available |
| `peac-bundle/0.1`       | Portable audit and dispute package                  |

## CLI

```bash
# One-off
pnpm dlx @peac/cli verify 'eyJhbGc...'

# Installed in your workspace
pnpm add -D @peac/cli
pnpm exec peac verify 'eyJhbGc...'
```

Other commands: `peac conformance run`, `peac reconcile a.bundle b.bundle`, `peac policy init|validate|generate`, `peac doctor`. Reference: [`packages/cli/README.md`](packages/cli/README.md).

## Protocol boundary

PEAC is the records layer beneath runtime governance. PEAC records what another system attested; it is not a governance toolkit, policy engine, runtime control plane, payment protocol, identity protocol, trust-score system, observability dashboard, or hosted runtime. Full boundary: [`docs/WHERE-IT-FITS.md`](docs/WHERE-IT-FITS.md).

## Security

- JWS signature verification required before trusting any receipt claim.
- Key discovery via `/.well-known/peac-issuer.json` JWKS with SSRF guards.
- Kernel constraints enforced at issuance and verification (fail-closed).
- No silent network fallback for offline verification.
- Errors mapped to RFC 9457 Problem Details.

See [`SECURITY.md`](SECURITY.md), [`docs/TRUST-ARTIFACTS.md`](docs/TRUST-ARTIFACTS.md), [`docs/specs/PROTOCOL-BEHAVIOR.md`](docs/specs/PROTOCOL-BEHAVIOR.md), [`docs/COMPATIBILITY_MATRIX.md`](docs/COMPATIBILITY_MATRIX.md), and [`docs/specs/VERSIONING.md`](docs/specs/VERSIONING.md).

## Privacy-aware verification

PEAC ships privacy-aware defaults and deployment guidance. Interaction evidence is hash-by-default on the receipt side (`docs/specs/PRIVACY-PROFILE.md`); the verifier separates immutable signed evidence from mutable derived metadata so retention, deletion, and rights-handling act on the right layer. Operator-facing guidance for privacy-sensitive and regulated environments (data classification, retention and deletion, deployment roles, data-subject rights, and a DPIA starter) lives in [`docs/privacy/`](docs/privacy/README.md). PEAC supports privacy-aware verification; it does not replace operator legal review, lawful-basis decisions, or controller obligations.

## Versioning

- **Current default format:** `interaction-record+jwt` (Wire 0.2).
- **Legacy:** `peac-receipt/0.1` (Wire 0.1) is frozen and legacy-only; `verifyLocal()` returns `E_UNSUPPORTED_WIRE_VERSION` on legacy input.

Full doctrine: [`docs/specs/VERSIONING.md`](docs/specs/VERSIONING.md).

## Documentation

- [Start Here](docs/START_HERE.md) — path by role.
- [How it works](docs/HOW-IT-WORKS.md), [Artifacts](docs/ARTIFACTS.md), [Where it fits](docs/WHERE-IT-FITS.md), [What PEAC standardizes](docs/WHAT-PEAC-STANDARDIZES.md).
- [Solutions](docs/SOLUTIONS/) — five outcome-led recipes.
- [Spec Index](docs/SPEC_INDEX.md) — normative specifications.
- [Developer Guide](docs/README_LONG.md) — package catalog and extended examples.

## Contributing and license

Contributions are welcome. For substantial changes, please open an issue first.

Apache-2.0. See [`LICENSE`](LICENSE).

---

PEAC Protocol is an open-source project stewarded by [Originary](https://www.originary.xyz/) and community contributors.

[Docs](https://www.peacprotocol.org) &middot; [GitHub](https://github.com/peacprotocol/peac) &middot; [Discussions](https://github.com/peacprotocol/peac/discussions)
