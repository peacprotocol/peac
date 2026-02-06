# PEAC Protocol - Extended Reference

This document contains detailed package catalogs, layer maps, ecosystem fit, and architecture details for the PEAC Protocol. For a concise overview, see the [main README](../README.md).

---

## Ecosystem fit

PEAC does not replace existing protocols. It is the receipts and verification layer that works alongside them for APIs, applications, and agentic workflows.

**Payment rails:**

- [x402](https://github.com/coinbase/x402) - HTTP 402 payment flows. Adapter: `@peac/rails-x402`

The protocol works with generic HTTP 402 services, paywalls, routers, and data stores. Receipts do not depend on any single provider.

**Agent protocols:**

- [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol) - Tool context for language models. Mapping: `@peac/mappings-mcp`
- [Agentic Commerce Protocol (ACP)](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol) - Agent-driven commerce. Mapping: `@peac/mappings-acp`
- [Agent2Agent Protocol (A2A)](https://github.com/google/A2A) - Agent-to-agent coordination. Planned.

**Agent frameworks/runtimes:**

- [OpenClaw](https://github.com/anthropics/claude-code) - Agent execution framework. Adapter: `@peac/adapter-openclaw`

**Web policy surfaces:**

- `/.well-known/peac.txt` - PEAC policy surface
- Compatibility with robots.txt, ai.txt, llm.txt, and AIPREF-style manifests

_Names above are illustrative examples for interoperability. PEAC is vendor-neutral and does not imply endorsement by, or affiliation with, these projects._

### x402 Integration

PEAC works as the receipts and verification layer for [x402](https://x402.org) payment flows. x402 handles the payment; PEAC proves it happened.

**Live demo:** [x402.peacprotocol.org](https://x402.peacprotocol.org) | [Visual demo repo](https://github.com/peacprotocol/peac-x402-receipts-demo)

**How it works:**

1. Client requests a protected resource
2. Server returns `402 Payment Required` with x402 payment details
3. Client pays via x402 (Base/USDC or other supported networks)
4. Server issues a signed `PEAC-Receipt` header proving payment
5. Client can verify the receipt offline and reuse it within its validity window

**Package:** `@peac/rails-x402` provides the adapter with full x402 v2 support (v1 fallback via `X402Dialect`).

See [examples/x402-node-server](../examples/x402-node-server) for a working implementation.

---

## Integration examples

### Settlement fields

If an interaction includes payment, add settlement fields to the receipt:

```typescript
import { issue } from '@peac/protocol';

const { jws } = await issue({
  iss: 'https://api.example.com',
  aud: 'https://client.example.com',
  subject: 'https://api.example.com/inference',
  amt: 1000, // Amount in minor units (e.g., cents)
  cur: 'USD', // Currency code
  rail: 'x402', // Payment rail
  reference: 'tx_abc123', // Rail-specific reference
  privateKey,
  kid: 'key-2026-01',
});
```

### HTTP/REST integration

Attach receipts to any HTTP response:

```typescript
import express from 'express';
import { issue } from '@peac/protocol';

const app = express();

app.get('/data', async (req, res) => {
  const body = { items: ['a', 'b', 'c'] };
  const { jws } = await issue({
    iss: 'https://api.example.com',
    aud: req.headers['origin'] || 'https://client.example.com',
    subject: '/data',
    privateKey,
    kid: 'key-2026-01',
  });
  res.setHeader('PEAC-Receipt', jws);
  res.json(body);
});
```

Clients retrieve the receipt from the `PEAC-Receipt` header and verify offline or store for audit.

### Express middleware

`@peac/middleware-express` provides automatic receipt issuance as Express middleware:

```typescript
import express from 'express';
import { peacMiddleware } from '@peac/middleware-express';

const app = express();

app.use(
  peacMiddleware({
    issuer: 'https://api.example.com',
    privateKey,
    kid: 'key-2026-01',
  })
);

app.get('/data', (req, res) => {
  res.json({ items: ['a', 'b', 'c'] }); // Receipt attached automatically
});
```

See [packages/middleware-core/README.md](../packages/middleware-core/README.md) and [packages/middleware-express/README.md](../packages/middleware-express/README.md).

---

## Transports and bindings

PEAC is transport-agnostic. The most common binding is **HTTP/REST**, where receipts travel as a response header and policies are discovered via `/.well-known/peac.txt`.

| Binding             | How receipts travel                                     | Status      |
| ------------------- | ------------------------------------------------------- | ----------- |
| HTTP/REST (default) | Response header `PEAC-Receipt: <jws>`                   | Implemented |
| MCP                 | Tool result metadata (`_meta.org.peacprotocol/receipt`) | Implemented |
| A2A                 | Agent exchange attachments                              | Specified   |
| WebSocket/streaming | Periodic or terminal receipts for long-running sessions | Planned     |
| Queues/batches      | NDJSON receipts verified offline via bundles            | Implemented |

---

## Interoperability and mappings

PEAC records can be carried through other interaction standards via mappings:

| Standard / Rail  | PEAC role                                | Status                             |
| ---------------- | ---------------------------------------- | ---------------------------------- |
| MCP              | Records in tool response metadata        | Implemented (`@peac/mappings-mcp`) |
| ACP              | Agentic Commerce Protocol integration    | Implemented (`@peac/mappings-acp`) |
| A2A              | Agent-to-Agent exchange attachments      | Specified                          |
| AP2              | Evidence for payment authorization flows | Specified                          |
| UCP              | Webhook verification + dispute evidence  | Implemented (`@peac/mappings-ucp`) |
| ERC-8004         | Reputation signals for Trustless Agents  | Implemented (docs/mappings)        |
| x402             | Settlement evidence in receipt claims    | Implemented (`@peac/rails-x402`)   |
| Payment gateways | Payment intent evidence                  | Implemented (`@peac/rails-stripe`) |

PEAC does not orchestrate these protocols. It provides portable proof of what terms applied and what happened.

---

## Dispute Bundle

Portable, offline-verifiable evidence packages for disputes, audits, and cross-org handoffs.

A bundle contains receipts, policy snapshots, and a deterministic verification report -- everything needed to prove what happened without trusting either party's internal logs.

**Design constraints:**

- ZIP archive with deterministic structure (RFC 8785 canonical JSON)
- Offline verification fails if keys are missing (no silent network fallback)
- Cross-language parity: TypeScript and Go produce identical verification reports

```bash
peac bundle create --receipts ./receipts.ndjson --policy ./policy.yaml --output ./evidence.peacbundle
peac bundle verify ./evidence.peacbundle --offline
```

See [specs/DISPUTE.md](specs/DISPUTE.md) for the specification.

---

## Use cases

| Use case                   | How PEAC helps                                                          |
| -------------------------- | ----------------------------------------------------------------------- |
| **HTTP 402 micropayments** | Rails settle funds; receipts prove settlement offline.                  |
| **Agent-to-API calls**     | Every call carries signed proof of who, what, when, under which terms.  |
| **Priced datasets**        | Records capture which object or window was paid for.                    |
| **AI training access**     | Policy surfaces describe terms; records prove compliance.               |
| **Audit trails**           | Signed receipts form evidence for internal and external investigations. |
| **Rate limiting**          | Records tie usage to identity and payment for quota enforcement.        |

PEAC is not a paywall, billing engine, or storage system. It is the records layer that sits beside your payment rails and policy files.

---

## Wire format and HTTP integration

**Receipts:**

- Receipt type: `typ: "peac-receipt/0.1"` (frozen across v0.9.x)
- Envelope structure: `PEACEnvelope` with auth, payment evidence, and metadata
- Signature: Ed25519 JWS (RFC 8032)
- Evidence model: `PaymentEvidence` captures rail, asset, environment, and rail-specific proof

**HTTP:**

- Single `PEAC-Receipt` response header
- HTTP 402 Payment Required support
- Errors via `application/problem+json` (RFC 9457)
- DPoP proof-of-possession binding (RFC 9449)

For normative specifications, see [`SPEC_INDEX.md`](SPEC_INDEX.md).

---

## Web policy surface: peac.txt

`/.well-known/peac.txt` is the recommended policy surface for publishing machine-readable terms.

**Location:**

- Primary: `https://your-domain/.well-known/peac.txt`
- Fallback: `https://your-domain/peac.txt`

**Purpose:**
Declares allowed purposes, quotas, attribution requirements, payment terms, and whether receipts are required.

**Example: Open documentation**

```yaml
# /.well-known/peac.txt
version: '0.9'
usage: open

purposes: [crawl, index, search]
attribution: optional

receipts: optional
rate_limit: unlimited

license: Apache-2.0
contact: docs@example.com
```

**Example: Conditional API access**

```yaml
version: '0.9'
usage: conditional

purposes: [inference, ai_input]
receipts: required

rate_limit: 100/hour
daily_limit: 1000

price: 10
currency: USD
payment_methods: [x402, stripe]
payment_endpoint: https://api.example.com/pay

negotiate: https://api.example.com/negotiate
contact: api-support@example.com
```

**Protocol flow:**

1. Agent fetches `/.well-known/peac.txt`
2. Checks if purpose and volume comply with published policy
3. If payment required, settles via rail (x402, Stripe, etc.)
4. Obtains signed PEAC receipt
5. Calls API with `PEAC-Receipt: <jws>` header
6. Server verifies receipt and grants access

For the complete peac.txt specification, see `docs/specs/PEAC-TXT.md`.

---

## Issuer configuration: peac-issuer.json

`/.well-known/peac-issuer.json` is the issuer configuration file for PEAC receipt verification.

**Location:**

- `https://issuer-domain/.well-known/peac-issuer.json`

**Purpose:**
Enables verifiers to discover JWKS endpoints and verification configuration for validating PEAC receipts.

**Example:**

```json
{
  "version": "peac-issuer/0.1",
  "issuer": "https://api.example.com",
  "jwks_uri": "https://api.example.com/.well-known/jwks.json",
  "verify_endpoint": "https://api.example.com/verify",
  "receipt_versions": ["peac-receipt/0.1"],
  "algorithms": ["EdDSA"],
  "payment_rails": ["x402", "stripe"],
  "security_contact": "security@example.com"
}
```

**Key fields:**

| Field             | Required | Description                           |
| ----------------- | -------- | ------------------------------------- |
| `version`         | Yes      | Configuration format version          |
| `issuer`          | Yes      | Issuer URL (must match receipt `iss`) |
| `jwks_uri`        | Yes      | JWKS endpoint for key discovery       |
| `verify_endpoint` | No       | Verification endpoint URL             |
| `algorithms`      | No       | Supported signing algorithms          |

For the complete specification, see `docs/specs/PEAC-ISSUER.md`.

### Policy discovery and other signals

PEAC sits alongside existing policy mechanisms rather than replacing them. A PEAC-aware agent or enforcement service can:

1. Read peac.txt for economic and receipt requirements.
2. Read robots.txt, ai.txt, llm.txt, and AIPREF-style manifests for crawl and AI usage guidance.
3. Combine these inputs into a single internal policy view before negotiating or sending a request.

---

## Policy Kit

> **Start here:** [policy-kit/quickstart.md](policy-kit/quickstart.md) | **Profiles:** [policy-kit/profiles.md](policy-kit/profiles.md)

The `@peac/policy-kit` package provides a file-based policy format for authoring policies once and compiling them to multiple deployment surfaces.

**Policy Profiles:**

| Profile ID     | Default | Receipt | Use Case                       |
| -------------- | ------- | ------- | ------------------------------ |
| `news-media`   | deny    | yes     | News sites, journalism         |
| `api-provider` | deny    | yes     | Developer docs, API references |
| `open-source`  | allow   | no      | OSS documentation, wikis       |
| `saas-docs`    | allow   | no      | Product docs, help centers     |

```bash
peac policy list-profiles           # List available profiles
peac policy init --profile news-media  # Initialize from profile
peac policy show-profile api-provider  # View profile details
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
peac policy validate peac-policy.yaml   # Validate policy syntax
peac policy generate peac-policy.yaml --out dist --well-known  # Generate artifacts
peac policy generate peac-policy.yaml --dry-run  # Preview without writing
peac policy explain peac-policy.yaml --type agent --purpose train  # Debug rule matching
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

const policy = loadPolicy('peac-policy.yaml');

const result = evaluate(policy, {
  subject: { type: 'agent', labels: ['verified'] },
  purpose: 'inference',
  licensing_mode: 'subscription',
});

console.log(result.decision); // 'allow' | 'deny' | 'review'
console.log(result.matched_rule); // 'allow-verified-train'

const peacTxt = compilePeacTxt(policy, {
  contact: 'policy@example.com',
  receipts: 'required',
  rateLimit: '100/hour',
});
```

**Key features:**

- First-match-wins rule semantics (like firewall rules)
- CAL purposes: `crawl`, `index`, `train`, `inference`, `ai_input`, `ai_index`, `search`
- Deterministic, auditable, side-effect free evaluation

---

## Repository layout

Kernel-first monorepo:

```text
peac/
├─ specs/
│  └─ kernel/              # Normative JSON: constants, errors, registries
├─ docs/
│  ├─ specs/               # Receipt schema, protocol behavior, test vectors
│  ├─ api/                 # API reference
│  └─ guides/              # Integration guides
├─ packages/
│  ├─ kernel/              # Zero-dependency constants from specs/kernel
│  ├─ schema/              # Types, Zod validators, JSON Schema
│  ├─ crypto/              # Ed25519 JWS, JCS, base64url
│  ├─ protocol/            # issue(), verify(), discovery
│  ├─ server/              # HTTP verification server
│  ├─ cli/                 # Command-line tools
│  ├─ capture/
│  │  └─ core/             # Runtime-neutral capture pipeline
│  ├─ adapters/
│  │  └─ openclaw/         # OpenClaw agent framework adapter
│  ├─ rails/
│  │  ├─ x402/             # HTTP 402 / x402 payment rail
│  │  ├─ stripe/           # Stripe payment rail
│  │  └─ razorpay/         # Razorpay payment rail
│  ├─ mappings/
│  │  ├─ mcp/              # Model Context Protocol mapping
│  │  ├─ acp/              # Agentic Commerce Protocol mapping
│  │  └─ rsl/              # RSL usage token mapping
│  ├─ policy-kit/          # Policy authoring and artifact generation
│  ├─ transport/
│  │  ├─ grpc/             # gRPC transport binding
│  │  └─ ws/               # WebSocket transport binding (scaffolding)
│  ├─ control/             # Constraint types and enforcement (CAL)
│  ├─ attribution/         # Attribution attestations
│  ├─ audit/               # Audit log and bundle generation
│  └─ ...                  # Additional packages
├─ sdks/
│  └─ go/                  # Go SDK (verifier + middleware)
├─ examples/               # Canonical flow examples
└─ archive/                # Legacy pre-v0.9.15 materials (historical)
```

---

## Layer map

```text
Layer 0: @peac/kernel
Layer 1: @peac/schema
Layer 2: @peac/crypto
Layer 3: @peac/protocol, @peac/control
Layer 4: @peac/rails-*, @peac/mappings-*, @peac/adapter-*, @peac/transport-*
Layer 5: @peac/server, @peac/cli
```

Dependencies flow DOWN only. Never import from a higher layer.

---

## Full package catalog

**Core (stable):**

| Package          | Description                                   |
| ---------------- | --------------------------------------------- |
| `@peac/kernel`   | Zero-dependency constants and registries      |
| `@peac/schema`   | TypeScript types, Zod validators, JSON Schema |
| `@peac/crypto`   | Ed25519 JWS signing and verification          |
| `@peac/protocol` | High-level issue() and verify() functions     |

**Runtime (stable):**

| Package        | Description                                |
| -------------- | ------------------------------------------ |
| `@peac/server` | HTTP verification server with 402 support  |
| `@peac/cli`    | Command-line tools for receipts and policy |

**Rails (stable):**

| Package                | Description                                             |
| ---------------------- | ------------------------------------------------------- |
| `@peac/rails-x402`     | x402 payment rail adapter with payment header detection |
| `@peac/rails-stripe`   | Stripe payment rail adapter                             |
| `@peac/rails-razorpay` | Razorpay payment rail adapter                           |
| `@peac/rails-card`     | Card billing bridge                                     |

**Mappings (stable):**

| Package                 | Description                                                 |
| ----------------------- | ----------------------------------------------------------- |
| `@peac/mappings-mcp`    | Model Context Protocol integration with budget utilities    |
| `@peac/mappings-acp`    | Agentic Commerce Protocol integration with budget utilities |
| `@peac/mappings-rsl`    | RSL (Robots Standard Language) mapping to CAL purposes      |
| `@peac/mappings-tap`    | Visa TAP mapping                                            |
| `@peac/mappings-aipref` | IETF AIPREF vocabulary mapping                              |
| `@peac/mappings-ucp`    | Google Universal Commerce Protocol webhook verification     |

**Policy (stable):**

| Package            | Description                                                               |
| ------------------ | ------------------------------------------------------------------------- |
| `@peac/policy-kit` | Policy authoring, evaluation, artifact generation, and pre-built profiles |

**Infrastructure:**

| Package                 | Description                                      |
| ----------------------- | ------------------------------------------------ |
| `@peac/contracts`       | Canonical error codes and verification contracts |
| `@peac/http-signatures` | RFC 9421 HTTP Message Signatures                 |
| `@peac/jwks-cache`      | Edge-safe JWKS fetch with SSRF protection        |
| `@peac/net-node`        | SSRF-safe network utilities with DNS pinning     |
| `@peac/adapter-core`    | Shared utilities for payment rail adapters       |
| `@peac/worker-core`     | Runtime-neutral TAP verification handler         |
| `@peac/telemetry`       | Core telemetry interfaces                        |
| `@peac/telemetry-otel`  | OpenTelemetry adapter with privacy modes         |
| `@peac/privacy`         | Privacy-preserving hashing                       |
| `@peac/transport-grpc`  | gRPC transport binding                           |

**Capture:**

| Package              | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `@peac/capture-core` | Runtime-neutral capture pipeline for agent platforms |

**Adapters:**

| Package                  | Description                          |
| ------------------------ | ------------------------------------ |
| `@peac/adapter-openclaw` | OpenClaw agent framework integration |

**Attestations:**

| Package             | Description                          |
| ------------------- | ------------------------------------ |
| `@peac/attribution` | Attribution attestation verification |
| `@peac/audit`       | Audit log and bundle generation      |

---

## Workflow correlation

Multi-step agentic workflows (MCP tool chains, A2A exchanges, CrewAI crews, LangGraph graphs) produce multiple receipts. Workflow correlation links those receipts into a verifiable DAG so that auditors and downstream systems can reconstruct what happened, in what order, and under which terms.

**Two types:**

| Type                         | Purpose                                               |
| ---------------------------- | ----------------------------------------------------- |
| `WorkflowContext`            | Per-receipt extension for DAG reconstruction          |
| `WorkflowSummaryAttestation` | Proof-of-run artifact committing the full receipt set |

**WorkflowContext** is attached as a receipt extension (`ext['org.peacprotocol/workflow']`):

```typescript
import { issue } from '@peac/protocol';
import { generateWorkflowId, generateStepId } from '@peac/schema';

const workflowId = generateWorkflowId();
const stepId = generateStepId();

const { jws } = await issue({
  iss: 'https://api.example.com',
  aud: 'https://client.example.com',
  subject: '/tools/search',
  privateKey,
  kid: 'key-2026-01',
  ext: {
    'org.peacprotocol/workflow': {
      workflow_id: workflowId,
      step_id: stepId,
      parent_step_ids: [], // root step
      tool_name: 'web_search',
      framework: { name: 'mcp', version: '1.0' },
    },
  },
});
```

**WorkflowSummaryAttestation** commits the receipt set at workflow completion:

```typescript
import { WorkflowSummaryAttestationSchema } from '@peac/schema';

const summary = WorkflowSummaryAttestationSchema.parse({
  type: 'peac/workflow-summary',
  issuer: 'https://orchestrator.example.com',
  issued_at: new Date().toISOString(),
  evidence: {
    workflow_id: workflowId,
    status: 'completed',
    receipt_refs: ['sha256:abc...', 'sha256:def...'],
    agents_involved: ['search-agent', 'synthesis-agent'],
    started_at: '2026-01-27T10:00:00Z',
    completed_at: '2026-01-27T10:00:05Z',
  },
});
```

**Key invariants:**

- Workflow IDs: `wf_[a-zA-Z0-9_-]{20,48}`
- Step IDs: `step_[a-zA-Z0-9_-]{20,48}`
- A step cannot be its own parent (no self-loops)
- No duplicate parent step IDs
- Hash chaining via `prev_receipt_hash` (`sha256:[a-f0-9]{64}`)
- Max 16 parent steps, max 256-char tool names

**External ID interop:**

Bi-directional correlation with OTel trace IDs, Temporal workflow/run IDs, Airflow dag/run/task IDs, Prefect flow/run IDs, Dagster run/step IDs, and Argo workflow/node IDs via the `external_ids` array.

**Conformance vectors:** `specs/conformance/fixtures/workflow/` (valid, invalid, edge-cases)

See [docs/specs/WORKFLOW-CORRELATION.md](specs/WORKFLOW-CORRELATION.md) for the normative specification and [examples/workflow-correlation/](../examples/workflow-correlation/) for a working demo.

---

## Seven pillars

PEAC addresses seven protocol capabilities for AI and API infrastructure:

| Pillar          | Package             | Description                                  |
| --------------- | ------------------- | -------------------------------------------- |
| **Access**      | `@peac/access`      | Access control and policy evaluation         |
| **Attribution** | `@peac/attribution` | Attribution and revenue-share hooks          |
| **Consent**     | `@peac/consent`     | Consent lifecycle types and helpers          |
| **Commerce**    | `@peac/rails-*`     | Payment rails and receipt issuance           |
| **Compliance**  | `@peac/compliance`  | Regulatory and audit helpers                 |
| **Privacy**     | `@peac/privacy`     | Privacy budgeting and retention policy hooks |
| **Provenance**  | `@peac/provenance`  | Content provenance and C2PA integration      |

These are optional higher-layer helpers built on top of the core receipt/kernel stack.

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

- SSRF protection and strict URL validation
- DPoP proof-of-possession for tokens
- JWKS rotation and emergency revocation plans
- Rate limiting and circuit breakers

---

## Stability and versioning

**Wire format:**

- `peac-receipt/0.1` is frozen throughout the v0.9.x series
- Libraries may evolve APIs but must emit/accept 0.9 receipts

**Library surface:**

- TypeScript APIs are pre-1.0 and may have breaking changes between minor releases
- Core packages (kernel, schema, crypto, protocol) are stable

**HTTP semantics:**

- `PEAC-Receipt` is the canonical header
- RFC 9457 Problem Details for errors
- HTTP 402 Payment Required for missing or invalid payment

**Conformance levels:**

- L0: Parse peac.txt discovery manifests
- L1: HTTP semantics and Problem Details
- L2: Policy enforcement (purposes, quotas, retention)
- L3: Negotiation, payment, and receipts
- L4: Provenance, attestation, and audit trails

Test vectors: `tests/vectors/` and `docs/specs/TEST_VECTORS.md`.

---

## Development

**Prerequisites:**

- Node.js 20+
- pnpm >= 8

**Setup:**

```bash
git clone https://github.com/peacprotocol/peac
cd peac
pnpm install
pnpm -r build
pnpm -r test
```

---

## Go SDK

The Go SDK in `sdks/go/` provides receipt verification with Ed25519 + JWS + JWKS support.

```go
import "github.com/peacprotocol/peac/sdks/go/peac"

result, err := peac.Verify(receiptJWS, &peac.VerifyOptions{
    IssuerAllowlist: []string{"https://api.example.com"},
})
if err != nil {
    log.Fatal(err)
}
fmt.Println("Issuer:", result.Claims.Iss)
```

See [guides/go-middleware.md](guides/go-middleware.md) for net/http middleware integration.

---

## Contributing

Contributions are welcome. For substantial changes, please open an issue first to discuss the approach.

See `docs/SPEC_INDEX.md` for normative specifications and `docs/CI_BEHAVIOR.md` for CI guidelines.

---

## License

PEAC Protocol - Apache 2.0 License - Stewarded by contributors from [Originary](https://www.originary.xyz) and the community.

See [LICENSE](LICENSE) for full details.

---

## Community

- **Source:** [https://github.com/peacprotocol/peac](https://github.com/peacprotocol/peac)
- **Website:** [https://www.peacprotocol.org](https://www.peacprotocol.org)
- **Issues:** Bug reports and feature requests via GitHub Issues
- **Discussions:** Design questions and ecosystem proposals via GitHub Discussions
- **Contact:** See [https://www.peacprotocol.org](https://www.peacprotocol.org) for working group and contact information

PEAC is designed for multiple independent implementations across languages and platforms. If you are building an implementation, SDK, or rail adapter, please open an issue so it can be linked from ecosystem documentation.
