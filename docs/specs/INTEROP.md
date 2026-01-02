# PEAC Interoperability Guide

**Status**: INFORMATIVE

**Version**: 0.9.24

---

## 1. Introduction

This document describes how PEAC interoperates with adjacent protocols and standards. PEAC is designed as the **enforcement and receipts layer** that complements existing systems rather than replacing them.

**Positioning**: PEAC provides verifiable receipts for access control decisions. It works alongside preference signals, payment rails, and agent protocols.

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
2. **PEAC parses** RSL via `@peac/pref` (includes RSL parsing)
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

`@peac/mappings-mcp` provides MCP context to PEAC receipt mapping:

```typescript
import { mcpContextToIssueOptions } from '@peac/mappings-mcp';

const issueOptions = mcpContextToIssueOptions(mcpRequest);
// Maps MCP budget to PEAC constraints, tool to purpose, etc.
```

---

## 5. A2A (Agent-to-Agent)

**Standard**: Google A2A (Agent-to-Agent Protocol)

**Relationship**: A2A defines agent communication patterns. PEAC receipts can be carried in A2A messages as proof of access rights.

### 5.1 Integration Points

| A2A Concept    | PEAC Integration                   |
| -------------- | ---------------------------------- |
| Agent Card     | Can advertise PEAC policy endpoint |
| Task execution | Receipt proves execution authority |
| Delegation     | Receipt chain proves delegation    |

### 5.2 Integration Pattern

1. **Agent Card** includes PEAC policy URI and capabilities
2. **A2A task request** includes `PEAC-Purpose` header
3. **Receiving agent** evaluates policy and issues receipt
4. **Receipt returned** in A2A response

### 5.3 Package

`@peac/mappings-acp` provides mapping utilities (ACP is the umbrella for A2A-compatible protocols).

---

## 6. Payment Rails

PEAC integrates with payment rails through adapter packages. Receipts capture payment evidence without coupling to specific vendors.

### 6.1 Supported Rails

| Rail     | Package                | Notes             |
| -------- | ---------------------- | ----------------- |
| x402     | `@peac/rails-x402`     | HTTP 402 payments |
| Stripe   | `@peac/rails-stripe`   | Card payments     |
| Razorpay | `@peac/rails-razorpay` | India payments    |

### 6.2 Receipt Pattern

Payment evidence is captured in `evidence.payment`:

```json
{
  "evidence": {
    "payment": {
      "rail": "x402",
      "facilitator": "daydreams",
      "amount_cents": 100,
      "currency": "USD",
      "evidence": { ... }
    }
  }
}
```

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

## 10. Future Interoperability

The following are under consideration for future versions:

| Standard                  | Status                | Target Version |
| ------------------------- | --------------------- | -------------- |
| C2PA (Content Provenance) | ISO standard expected | v0.10.0+       |
| CC Signals                | Stabilizing           | v0.10.0+       |
| EU AI Act traceability    | Aug 2026              | v0.9.26+       |

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
