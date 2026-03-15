# PEAC Protocol Developer Guide

Integration examples, package catalog, protocol surfaces, and repo navigation. For a concise overview, see the [main README](../README.md).

---

## Getting oriented

PEAC is a kernel-first monorepo. Dependencies flow down only; higher layers never import from lower layers.

```text
Layer 0: @peac/kernel         -- zero-dependency constants and registries
Layer 1: @peac/schema         -- types, Zod validators, JSON Schema
Layer 2: @peac/crypto         -- Ed25519 JWS, JCS, base64url
Layer 3: @peac/protocol       -- issue(), verifyLocal(), discovery
Layer 3.5: @peac/middleware-*  -- transport-neutral and Express middleware
Layer 4: @peac/rails-*, @peac/mappings-*, @peac/adapter-*
Layer 5: @peac/server, @peac/cli, @peac/mcp-server
Layer 6: @peac/sdk-js
```

**Repository layout:**

```text
peac/
├─ specs/                 # Normative JSON: constants, errors, registries, conformance
├─ docs/                  # Specifications, API reference, guides
├─ packages/              # Published packages (see catalog below)
├─ sdks/go/               # Go SDK (verifier + middleware)
├─ surfaces/              # Distribution artifacts (plugin-pack, workers)
├─ integrator-kits/       # Integration checklists for ecosystem transports
├─ examples/              # Canonical flow examples
└─ archive/               # Legacy pre-v0.9.15 materials (historical)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for full design rationale.

---

## Integration paths

### Settlement fields

Add payment evidence via the commerce extension:

```typescript
import { issue } from '@peac/protocol';

const { jws } = await issue({
  iss: 'https://api.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/payment',
  pillars: ['commerce'],
  extensions: {
    'org.peacprotocol/commerce': {
      payment_rail: 'x402',
      amount_minor: '100000',
      currency: 'USD',
      reference: 'tx_abc123',
    },
  },
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
    kind: 'evidence',
    type: 'org.peacprotocol/access-decision',
    pillars: ['access'],
    extensions: {
      'org.peacprotocol/access': {
        resource: '/data',
        action: 'read',
        decision: 'allow',
      },
    },
    privateKey,
    kid: 'key-2026-01',
  });
  res.setHeader('PEAC-Receipt', jws);
  res.json(body);
});
```

### Express middleware

`@peac/middleware-express` provides automatic receipt issuance:

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

### x402 integration

PEAC works as the receipts and verification layer for [x402](https://x402.org) payment flows. x402 handles the payment; PEAC proves it happened.

1. Client requests a protected resource
2. Server returns `402 Payment Required` with x402 payment details
3. Client pays via x402 (Base/USDC or other supported networks)
4. Server issues a signed `PEAC-Receipt` header proving payment
5. Client verifies the receipt offline

**Package:** `@peac/rails-x402` (payment rail) and `@peac/adapter-x402` (evidence carrier).

See [examples/x402-node-server](../examples/x402-node-server) for a working implementation.

### Dispute bundle

Portable, offline-verifiable evidence packages for disputes, audits, and cross-org handoffs.

A bundle contains receipts, policy snapshots, and a deterministic verification report: everything needed to prove what happened without trusting either party's internal logs.

```bash
peac bundle create --receipts ./receipts.ndjson --policy ./policy.yaml --output ./evidence.peacbundle
peac bundle verify ./evidence.peacbundle --offline
```

Design: ZIP archive with deterministic structure (RFC 8785 canonical JSON). Verification fails if keys are missing (no silent network fallback). See [specs/DISPUTE.md](specs/DISPUTE.md).

### Go SDK

Wire 0.1 receipt issuance, verification, and policy evaluation with Ed25519 + JWS + JWKS support.

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

See [guides/go-middleware.md](guides/go-middleware.md) for net/http middleware.

---

## Protocol surfaces

### peac.txt

`/.well-known/peac.txt` declares machine-readable terms: allowed purposes, quotas, attribution requirements, payment terms, and whether receipts are required.

**Open documentation example:**

```yaml
version: 'peac-policy/0.1'
usage: open
purposes: [crawl, index, search]
attribution: optional
receipts: optional
rate_limit: unlimited
```

**Conditional API example:**

```yaml
version: 'peac-policy/0.1'
usage: conditional
purposes: [inference, ai_input]
receipts: required
rate_limit: 100/hour
price: 10
currency: USD
payment_methods: [x402, stripe]
```

See [docs/specs/PEAC-TXT.md](specs/PEAC-TXT.md) for the full specification.

### peac-issuer.json

`/.well-known/peac-issuer.json` enables verifiers to discover JWKS endpoints for validating receipts.

```json
{
  "version": "peac-issuer/0.1",
  "issuer": "https://api.example.com",
  "jwks_uri": "https://api.example.com/.well-known/jwks.json",
  "algorithms": ["EdDSA"]
}
```

| Field             | Required | Description                           |
| ----------------- | -------- | ------------------------------------- |
| `version`         | Yes      | Configuration format version          |
| `issuer`          | Yes      | Issuer URL (must match receipt `iss`) |
| `jwks_uri`        | Yes      | JWKS endpoint for key discovery       |
| `verify_endpoint` | No       | Verification endpoint URL             |
| `algorithms`      | No       | Supported signing algorithms          |

See [docs/specs/PEAC-ISSUER.md](specs/PEAC-ISSUER.md).

### Wire formats

**Interaction Record format** (`interaction-record+jwt`, stable on `latest`, v0.12.0+):

- Two structural kinds: `evidence` and `challenge`
- Open semantic `type` (reverse-DNS or absolute URI)
- Multi-valued `pillars` from 10-value closed taxonomy
- 12 typed extension groups with type-to-extension enforcement
- Policy binding: JCS (RFC 8785) + SHA-256 digest comparison
- JOSE hardening: embedded keys rejected, `kid` required

**Wire 0.1** (`peac-receipt/0.1`): frozen legacy format. `verifyLocal()` returns `E_UNSUPPORTED_WIRE_VERSION`.

Normative spec: [WIRE-0.2.md](specs/WIRE-0.2.md). Versioning doctrine: [VERSIONING.md](specs/VERSIONING.md).

### Receipt header

Single `PEAC-Receipt` response header carries the signed JWS for both wire versions. Errors use `application/problem+json` (RFC 9457).

---

## Transports and mappings

PEAC is transport-agnostic. Receipts travel via the binding appropriate to each protocol:

| Binding        | How receipts travel                          | Status      |
| -------------- | -------------------------------------------- | ----------- |
| HTTP/REST      | Response header `PEAC-Receipt: <jws>`        | Implemented |
| MCP            | Tool result `_meta` (carrier format)         | Implemented |
| A2A            | Task/message metadata (extension URI)        | Implemented |
| ACP            | State transition metadata                    | Implemented |
| UCP            | Webhook verification metadata                | Implemented |
| x402           | Settlement response evidence                 | Implemented |
| Queues/batches | NDJSON receipts verified offline via bundles | Implemented |

**Mapping packages:**

| Package                          | Protocol                        |
| -------------------------------- | ------------------------------- |
| `@peac/mappings-mcp`             | Model Context Protocol          |
| `@peac/mappings-a2a`             | Agent-to-Agent Protocol         |
| `@peac/mappings-acp`             | Agentic Commerce Protocol       |
| `@peac/mappings-ucp`             | Universal Commerce Protocol     |
| `@peac/mappings-content-signals` | robots.txt, AIPREF, tdmrep.json |
| `@peac/mappings-rsl`             | RSL usage token mapping         |
| `@peac/mappings-aipref`          | IETF AIPREF vocabulary          |
| `@peac/mappings-tap`             | Visa TAP mapping                |

---

## Policy Kit

> **Start here:** [policy-kit/quickstart.md](policy-kit/quickstart.md) | **Profiles:** [policy-kit/profiles.md](policy-kit/profiles.md)

Author policies once, compile to multiple deployment surfaces.

```yaml
# peac-policy.yaml
version: peac-policy/0.1
name: My API Policy
defaults:
  decision: deny
rules:
  - name: allow-subscribed-crawl
    subject: { type: human, labels: [subscribed] }
    purpose: crawl
    decision: allow
  - name: deny-agents-train
    subject: { type: agent }
    purpose: train
    decision: deny
```

```bash
peac policy validate peac-policy.yaml
peac policy generate peac-policy.yaml --out dist --well-known
```

**Generated artifacts:** `/.well-known/peac.txt`, `robots-ai-snippet.txt`, `aipref-headers.json`, `ai-policy.md`.

**Profiles:** `news-media`, `api-provider`, `open-source`, `saas-docs`. Run `peac policy list-profiles`.

---

## Package catalog

**Core:**

| Package          | Description                                  |
| ---------------- | -------------------------------------------- |
| `@peac/kernel`   | Zero-dependency constants and registries     |
| `@peac/schema`   | Types, Zod validators, JSON Schema           |
| `@peac/crypto`   | EdDSA (Ed25519) JWS signing and verification |
| `@peac/protocol` | High-level `issue()` and `verifyLocal()`     |
| `@peac/control`  | Constraint types and enforcement (CAL)       |

**Runtime:**

| Package                    | Description                                                  |
| -------------------------- | ------------------------------------------------------------ |
| `@peac/server`             | HTTP verification server with 402 support                    |
| `@peac/cli`                | Command-line tools for receipts and policy                   |
| `@peac/mcp-server`         | MCP server (5 tools: verify, inspect, decode, issue, bundle) |
| `@peac/middleware-core`    | Transport-neutral middleware logic                           |
| `@peac/middleware-express` | Express middleware for auto-issuance                         |

**Rails:**

| Package                | Description           |
| ---------------------- | --------------------- |
| `@peac/rails-x402`     | x402 payment rail     |
| `@peac/rails-stripe`   | Stripe payment rail   |
| `@peac/rails-razorpay` | Razorpay payment rail |
| `@peac/rails-card`     | Card billing bridge   |

**Adapters:**

| Package                           | Description                                |
| --------------------------------- | ------------------------------------------ |
| `@peac/adapter-x402`              | x402 evidence carrier (upstream wire sync) |
| `@peac/adapter-openclaw`          | OpenClaw agent framework                   |
| `@peac/adapter-openai-compatible` | Hash-first inference receipt adapter       |

**Infrastructure:** `@peac/contracts`, `@peac/http-signatures`, `@peac/jwks-cache`, `@peac/net-node`, `@peac/adapter-core`, `@peac/privacy`, `@peac/telemetry`, `@peac/telemetry-otel`, `@peac/transport-grpc`, `@peac/capture-core`, `@peac/capture-node`, `@peac/attribution`, `@peac/audit`, `@peac/policy-kit`, `@peac/sdk-js`.

**Publication status:** Core, runtime, and adapter packages are published to npm. See [npm](https://www.npmjs.com/search?q=%40peac) and [Releases](https://github.com/peacprotocol/peac/releases). Install via `pnpm add <package>`.

---

## Advanced topics

### Workflow correlation

Multi-step agentic workflows produce multiple receipts. Workflow correlation links them into a verifiable DAG for reconstruction and audit.

```typescript
import { issue } from '@peac/protocol';
import { generateWorkflowId, generateStepId } from '@peac/schema';

const { jws } = await issue({
  iss: 'https://api.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/tool-call',
  pillars: ['commerce'],
  extensions: {
    'org.peacprotocol/commerce': {
      payment_rail: 'x402',
      amount_minor: '1000',
      currency: 'USD',
    },
    'org.peacprotocol/correlation': {
      workflow_id: generateWorkflowId(),
      step_id: generateStepId(),
      parent_step_ids: [],
      tool_name: 'web_search',
    },
  },
  privateKey,
  kid: 'key-2026-01',
});
```

**Key invariants:** Workflow IDs match `wf_[a-zA-Z0-9_-]{20,48}`, step IDs match `step_[a-zA-Z0-9_-]{20,48}`, no self-loops, max 16 parent steps, hash chaining via `prev_receipt_hash`.

Normative spec: [WORKFLOW-CORRELATION.md](specs/WORKFLOW-CORRELATION.md). Example: [examples/workflow-correlation/](../examples/workflow-correlation/).

### Content signal parsing

`@peac/mappings-content-signals` parses robots.txt (RFC 9309), Content-Usage headers (AIPREF), and tdmrep.json (EU TDM Directive) with source precedence resolution: `tdmrep.json` > `Content-Signal` > `Content-Usage` > `robots.txt`.

### Security model

- SSRF protection and strict URL validation in all network paths
- JWKS rotation and emergency revocation support
- DPoP proof-of-possession binding (RFC 9449)
- Kernel constraints enforced at issuance and verification (fail-closed)
- No silent network fallback for offline verification

See [SECURITY.md](../.github/SECURITY.md), [PROTOCOL-BEHAVIOR.md](specs/PROTOCOL-BEHAVIOR.md), and [HTTP-TRANSPORT-SECURITY.md](security/HTTP-TRANSPORT-SECURITY.md).

---

## Development

**Prerequisites:** Node.js 24 (tested); Node.js 22+ (compatible). pnpm >= 9.

```bash
git clone https://github.com/peacprotocol/peac
cd peac
pnpm install
pnpm build
pnpm test
```

**Common commands:**

```bash
pnpm lint                    # ESLint
pnpm typecheck:core          # TypeScript strict
pnpm test                    # Vitest (all packages)
pnpm ci:all                  # Full CI simulation
./scripts/guard.sh           # Safety invariants
pnpm format:check            # Prettier
```

See [CI_BEHAVIOR.md](CI_BEHAVIOR.md) for pipeline details and [engineering-guide.md](engineering-guide.md) for development patterns.

---

Apache-2.0. See [LICENSE](../LICENSE). Stewardship: [Originary](https://www.originary.xyz/) and the open source community.
