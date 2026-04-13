# PEAC Interoperability Guide

**Status**: INFORMATIVE

**Version**: 0.12.9

---

## 1. Introduction

This document describes how PEAC interoperates with adjacent protocols and standards. PEAC is the **portable signed evidence layer** that complements existing systems rather than replacing them.

**Positioning**: PEAC records signed interaction evidence across agent, API, MCP, commerce, and cross-runtime workflows. It works alongside preference signals, payment rails, agent protocols, and runtime governance systems.

---

## 2. IETF AIPREF (AI Preferences)

**Standard**: IETF AIPREF Working Group (Proposed Standard track)

**Relationship**: PEAC consumes AIPREF vocabulary for purpose declarations and produces receipts that prove enforcement.

### 2.1 Vocabulary Alignment

AIPREF defines purpose scopes that map to PEAC `ControlPurpose`:

| AIPREF Scope                | PEAC Purpose | Notes                       |
| --------------------------- | ------------ | --------------------------- |
| Foundation Model Production | `train`      | Model training data         |
| AI Output                   | `inference`  | Runtime inference, RAG      |
| Search                      | `search`     | Traditional search indexing |

### 2.2 Integration Pattern

1. **Publisher declares preferences** via AIPREF headers or manifest
2. **PEAC Policy Kit** imports AIPREF preferences into `peac-policy.yaml`
3. **Server evaluates** incoming `PEAC-Purpose` against policy
4. **PEAC issues receipt** proving what purpose was declared and enforced

### 2.3 Package

`@peac/mappings-aipref` provides bidirectional mapping functions:

```typescript
import { aiprefScopeToControlPurposes, controlPurposeToAiprefScope } from '@peac/mappings-aipref';

// AIPREF -> PEAC
const purposes = aiprefScopeToControlPurposes('foundation-model-production');
// Result: ['train']

// PEAC -> AIPREF
const scope = controlPurposeToAiprefScope('inference');
// Result: 'ai-output'
```

---

## 3. RSL (Robots Specification Layer)

**Standard**: RSL 1.0 (rslstandard.org/rsl)

**Relationship**: PEAC imports RSL usage tokens into its purpose taxonomy. Receipts prove enforcement of RSL-declared preferences.

### 3.1 Token Mapping

| RSL Token  | PEAC Purpose(s)                           | Notes              |
| ---------- | ----------------------------------------- | ------------------ |
| `all`      | `train`, `ai_input`, `ai_index`, `search` | All usage types    |
| `ai-all`   | `train`, `ai_input`, `ai_index`           | All AI usage types |
| `ai-train` | `train`                                   | Model training     |
| `ai-input` | `ai_input`                                | RAG, grounding     |
| `ai-index` | `ai_index`                                | AI-powered search  |
| `search`   | `search`                                  | Traditional search |

### 3.2 Integration Pattern

1. **Publisher declares** RSL directives in `robots.txt` or RSL manifest
2. **PEAC parses** RSL via `@peac/mappings-rsl`
3. **Policy Kit** generates policy rules from RSL declarations
4. **Receipt** captures which RSL-derived purpose was enforced

### 3.3 Package

`@peac/mappings-rsl` provides the RSL to PEAC mapping:

```typescript
import { rslToControlPurposes } from '@peac/mappings-rsl';

const result = rslToControlPurposes(['ai-all', 'search']);
// Result: { purposes: ['train', 'ai_input', 'ai_index', 'search'], unknownTokens: [] }
```

---

## 4. MCP (Model Context Protocol)

**Standard**: MCP (Linux Foundation Agentic AI Foundation)

**Relationship**: MCP provides the context layer for agent interactions. PEAC provides the receipts layer for proving access decisions.

### 4.1 Integration Points

| MCP Concept     | PEAC Integration                        |
| --------------- | --------------------------------------- |
| Tool calls      | Receipt captures tool access decision   |
| Resource access | Receipt proves resource was accessed    |
| Budget/quota    | Constraints in receipt match MCP budget |

### 4.2 Integration Pattern

1. **MCP tool call** requests access to a resource
2. **PEAC verifies** purpose and issues receipt
3. **Receipt embedded** in MCP response metadata
4. **Client verifies** receipt to confirm legitimate access

### 4.3 Package

`@peac/mcp-server` provides 8 tools for issuing and verifying receipts over MCP (stdio and Streamable HTTP transports). Evidence is carried in MCP `_meta` keys `org.peacprotocol/receipt_ref` and `org.peacprotocol/receipt_jws`:

```typescript
// MCP server issues and verifies receipts as tool responses.
// See integrator-kits/mcp/README.md for full quickstart.
// Install: npx -y @peac/mcp-server --transport http
```

---

## 5. A2A (Agent-to-Agent)

**Standard**: A2A Protocol v1.0.0 (Linux Foundation, 150+ organizations). Official SDKs: Python, Go, Java, JavaScript, C#/.NET, Rust.

**Relationship**: A2A defines agent-to-agent communication patterns. PEAC receipts travel as Evidence Carriers inside A2A TaskStatus metadata using the `org.peacprotocol` extension URI.

### 5.1 Integration Points

| A2A Concept   | PEAC Integration                                        |
| ------------- | ------------------------------------------------------- |
| Agent Card    | Advertises PEAC evidence support via extension URI      |
| Task metadata | Receipts carried in `metadata[extensionURI].carriers[]` |
| Delegation    | Receipt chain proves delegation authority               |

### 5.2 Integration Pattern

1. **Agent Card** declares PEAC evidence capability
2. **A2A task execution** produces signed Interaction Record
3. **Receipt embedded** in A2A TaskStatus metadata
4. **Receiving agent** extracts and verifies offline

### 5.3 Package

`@peac/mappings-a2a` provides A2A v1.0.0 artifact embedding, Agent Card discovery, and carrier extraction. A2A v0.3.0 compat shim retained through v0.12.x; removal in v0.13.0.

---

## 6. Commerce and Payment Evidence

PEAC integrates with commerce and payment protocols through adapter and mapping packages. Evidence is captured in the `org.peacprotocol/commerce` extension group using the Interaction Record format (Wire 0.2).

### 6.1 Supported Protocols

| Protocol                       | Package                      | Notes                                                                 |
| ------------------------------ | ---------------------------- | --------------------------------------------------------------------- |
| x402 (Linux Foundation)        | `@peac/adapter-x402`         | v1+v2 dual-header read, scheme-agnostic (exact, upto, future schemes) |
| MPP/paymentauth (Stripe/Tempo) | `@peac/mappings-paymentauth` | Envelope-first HTTP Payment scheme parsing                            |
| ACP (OpenAI/Stripe)            | `@peac/mappings-acp`         | Session lifecycle + payment observation (two-function boundary)       |
| UCP (Google)                   | `@peac/mappings-ucp`         | Order-vs-payment separation with `payment_state_source` marker        |
| Stripe SPT                     | `@peac/rails-stripe`         | Delegation vocabulary, PaymentIntent observation                      |

### 6.2 Evidence Pattern (Wire 0.2)

Commerce evidence uses the `org.peacprotocol/commerce` extension group with `amount_minor` as a string:

```json
{
  "kind": "evidence",
  "type": "org.peacprotocol/commerce.payment",
  "extensions": {
    "org.peacprotocol/commerce": {
      "amount_minor": "10000",
      "currency": "USD",
      "event": "authorization"
    }
  }
}
```

Commerce evidence mappings MUST preserve raw upstream artifacts and MUST NOT synthesize payment finality from non-payment artifacts.

---

## 7. HTTP Message Signatures

**Standard**: RFC 9421 (HTTP Message Signatures)

**Relationship**: PEAC uses HTTP message signatures for agent authentication in edge environments.

### 7.1 Integration Points

| Concept                | PEAC Usage                        |
| ---------------------- | --------------------------------- |
| Ed25519 signatures     | Default signing algorithm         |
| Key directory          | `.well-known/` discovery patterns |
| Signature verification | Edge worker verification          |

### 7.2 Package

`@peac/http-signatures` provides RFC 9421-compatible signing and verification:

```typescript
import { verifySignature } from '@peac/http-signatures';

const result = await verifySignature(request, { keyDirectory });
```

---

## 8. robots.txt Bridge

PEAC provides a migration path from robots.txt to receipts.

### 8.1 Import (robots.txt to PEAC)

```bash
peac import robots robots.txt > peac-policy-starter.yaml
```

- One-way import (not round-trippable)
- Generates starter policy for review
- Does not capture all PEAC capabilities

### 8.2 Export (PEAC to robots.txt)

```bash
peac export robots peac-policy.yaml > robots-ai-snippet.txt
```

- Generates AI bots section only (snippet)
- Includes advisory banner
- Best-effort mapping (robots.txt is less expressive)

**Advisory Banner** (always prepended):

```text
# ADVISORY: This robots.txt snippet is for crawler compatibility only.
# Normative enforcement uses peac-policy.yaml + PEAC receipts.
```

---

## 9. Design Principles

### 9.1 Complement, Don't Replace

PEAC works alongside existing systems:

- AIPREF defines preferences; PEAC enforces them
- Payment rails handle transactions; PEAC captures evidence
- Agent protocols define communication; PEAC proves decisions

### 9.2 Category-First

Interoperability is defined at the category level:

- "Edge Agent Authentication" (not "Cloudflare Web Bot Auth")
- "Card payment rail" (not "Stripe integration")
- "AI purpose vocabulary" (not "AIPREF-only")

### 9.3 Vendor Adapters

Vendor-specific details live in adapter packages:

- Core defines interfaces
- Adapters implement vendor specifics
- Adapters are optional (core works standalone)

---

## 10. Additional Interoperability Surfaces

| Standard                               | PEAC Status                            | Package                                                          |
| -------------------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| in-toto v1.0 (supply-chain provenance) | Shipped (v0.12.6)                      | `@peac/mappings-intoto`                                          |
| SLSA v1.2 (build provenance)           | Shipped (v0.12.6)                      | `@peac/mappings-slsa`                                            |
| ERC-8128 (on-chain agent trust)        | Conformance fixtures shipped (v0.12.6) | Conformance only                                                 |
| DID resolution (did:key, did:web)      | Shipped (v0.12.6)                      | `@peac/adapter-did`                                              |
| gRPC transport carrier binding         | Shipped (v0.12.6)                      | `@peac/transport-grpc`                                           |
| EAT passport (COSE_Sign1, RFC 9052)    | Shipped (v0.12.0-preview.2)            | `@peac/adapter-eat`                                              |
| Content signals observation            | Shipped (v0.11.2)                      | `@peac/mappings-content-signals`                                 |
| Managed runtime evidence               | Shipped (v0.12.9)                      | `@peac/adapter-managed-agents`                                   |
| EU AI Act Annex IV evidence            | Planned (v0.12.12)                     | Extension groups + compliance profile shipped; packaging planned |

---

## 11. Related Documents

- [PROTOCOL-BEHAVIOR.md](PROTOCOL-BEHAVIOR.md) - Wire protocol behavior
- [REGISTRIES.md](REGISTRIES.md) - Payment rails and agent protocols
- `specs/kernel/constants.json` - Canonical constants

---

## 12. Version History

- **v0.9.24**: Initial interoperability specification
  - AIPREF vocabulary alignment
  - RSL token mapping
  - MCP/A2A integration patterns
  - robots.txt bridge documentation
