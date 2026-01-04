# EU AI Act Compliance with PEAC

How PEAC receipts and attestations support EU AI Act traceability requirements.

**Version:** 0.9.26+
**Relevant Deadline:** August 2026 (transparency rules apply)

---

## Overview

The EU AI Act establishes requirements for AI systems regarding transparency, traceability, and accountability. PEAC provides cryptographic primitives that support these requirements through:

- **Receipts**: Auditable proof of access decisions and enforcement
- **Attribution Attestations**: Traceable chain from AI outputs to source content
- **Purpose Tracking**: Declared and enforced purpose for each interaction

This document explains how PEAC artifacts map to EU AI Act requirements.

---

## EU AI Act Requirements

### Traceability (Article 12)

AI systems must keep logs that enable tracing of system operation.

**PEAC Support:**

| Requirement        | PEAC Artifact             | How It Helps                                   |
| ------------------ | ------------------------- | ---------------------------------------------- |
| Operation logging  | PEAC Receipt              | Cryptographically signed record of each access |
| Data traceability  | Attribution Attestation   | Links outputs to source receipts               |
| Decision auditing  | `purpose_enforced` claim  | Records what purpose was allowed/denied        |
| Timestamp evidence | `issued_at`, `expires_at` | ISO 8601 timestamps on all artifacts           |

### Transparency (Article 13)

AI systems must be designed to enable oversight.

**PEAC Support:**

| Requirement              | PEAC Feature      | How It Helps                           |
| ------------------------ | ----------------- | -------------------------------------- |
| Understandable operation | Purpose claims    | Clear vocabulary for AI intent         |
| Output traceability      | Attribution chain | Link any output to its sources         |
| Decision rationale       | `purpose_reason`  | Explains why access was granted/denied |

### Record-Keeping (Article 18)

Providers must keep documentation and logs.

**PEAC Support:**

| Requirement             | PEAC Artifact     | How It Helps                       |
| ----------------------- | ----------------- | ---------------------------------- |
| Technical documentation | Receipt JWS       | Self-contained, verifiable records |
| Log retention           | Receipt storage   | Standard JSON format for archival  |
| Audit trail             | Attestation chain | Cryptographic proof of derivation  |

---

## PEAC Artifacts for Compliance

### 1. PEAC Receipts

Every access to protected content generates a receipt:

```json
{
  "iss": "https://publisher.example",
  "sub": "agent:crawler-001",
  "aud": "https://agent.example",
  "iat": 1735992000,
  "jti": "rec_abc123",
  "receipt_id": "rec_abc123",
  "decision": "allow",
  "purpose_declared": ["train", "search"],
  "purpose_enforced": "search",
  "purpose_reason": "downgraded"
}
```

**Compliance Value:**

- Signed by issuer (cryptographic authenticity)
- Contains timestamp (temporal evidence)
- Records purpose (intent transparency)
- Captures decision (access control audit)

### 2. Attribution Attestations

Links AI outputs to source content:

```json
{
  "type": "peac/attribution",
  "issuer": "https://ai.example.com",
  "issued_at": "2026-01-04T12:00:00Z",
  "evidence": {
    "sources": [
      {
        "receipt_ref": "jti:rec_abc123",
        "usage": "rag_context",
        "weight": 0.7
      },
      {
        "receipt_ref": "jti:rec_def456",
        "usage": "synthesis_source",
        "weight": 0.3
      }
    ],
    "derivation_type": "synthesis",
    "model_id": "model-v2.1",
    "output_hash": {
      "alg": "sha-256",
      "value": "n4bQgYhMfWWaL28IoEbM8Qa8jG7x0QXJZJqL-w_zZdA",
      "enc": "base64url"
    }
  }
}
```

**Compliance Value:**

- Traces output to specific source receipts
- Quantifies contribution weight
- Records derivation type (training, inference, RAG, synthesis)
- Hashes enable verification without exposing content

### 3. Obligations Extension

Records credit and contribution requirements:

```json
{
  "extensions": {
    "peac/obligations": {
      "credit": {
        "required": true,
        "citation_url": "https://publisher.example/collection",
        "method": "model-card"
      },
      "contribution": {
        "type": "ecosystem",
        "destination": "https://fund.example.org"
      }
    }
  }
}
```

**Compliance Value:**

- Documents licensing obligations
- Creates auditable record of terms
- Supports rights holder transparency

---

## Compliance Workflows

### Workflow 1: Training Data Audit

**Scenario:** Auditor requests proof of training data provenance.

**PEAC Evidence Chain:**

```
1. Model Card -> Attribution Attestations (derivation_type: "training")
   |
   v
2. Attribution -> Source Receipts (receipt_ref: "jti:rec_...")
   |
   v
3. Receipts -> Original Access Records (iss, sub, iat, purpose)
```

**Audit Output:**

- List of all sources used for training
- When each source was accessed
- What purpose was declared
- Whether credit obligations were met

### Workflow 2: Output Traceability

**Scenario:** User requests explanation of AI output sources.

**PEAC Evidence Chain:**

```
1. AI Output Hash -> Attribution Attestation
   |
   v
2. Attestation.sources[] -> Receipt References
   |
   v
3. Each Receipt -> Publisher, Timestamp, Access Terms
```

**Audit Output:**

- Which sources contributed to this specific output
- Weight/contribution of each source
- Access terms that were in effect

### Workflow 3: Access Decision Review

**Scenario:** Reviewing why certain content was used.

**PEAC Evidence:**

```json
{
  "receipt_id": "rec_xyz789",
  "purpose_declared": ["train"],
  "purpose_enforced": "train",
  "purpose_reason": "allowed",
  "decision": "allow",
  "constraints": {
    "rate_limit": {
      "window_s": 3600,
      "max": 1000
    }
  }
}
```

**Audit Output:**

- Declared intent (training)
- Policy decision (allowed)
- Constraints applied (rate limits)
- Cryptographic proof of legitimacy

---

## Implementation Guide

### Step 1: Enable Receipt Issuance

Configure your publisher to issue PEAC receipts:

```typescript
import { issue } from '@peac/protocol';

const receipt = await issue({
  issuer: 'https://publisher.example',
  subject: agent.id,
  audience: agent.origin,
  purpose: request.headers.get('PEAC-Purpose'),
});

response.headers.set('PEAC-Receipt', receipt.jws);
```

### Step 2: Generate Attribution Attestations

When producing AI outputs, create attestations:

```typescript
import { createAttribution } from '@peac/attribution';

const attribution = createAttribution({
  issuer: 'https://ai.example.com',
  sources: [
    { receipt_ref: 'jti:rec_abc123', usage: 'rag_context', weight: 0.7 },
    { receipt_ref: 'jti:rec_def456', usage: 'synthesis_source', weight: 0.3 },
  ],
  derivation_type: 'synthesis',
  model_id: 'model-v2.1',
  output_hash: computeHash(output),
});
```

### Step 3: Store for Audit

Archive receipts and attestations for compliance:

```typescript
// Store receipts
await auditLog.store({
  type: 'receipt',
  jws: receipt.jws,
  timestamp: new Date(),
  trace_id: context.traceId,
});

// Store attestations
await auditLog.store({
  type: 'attribution',
  attestation: attribution,
  timestamp: new Date(),
  trace_id: context.traceId,
});
```

### Step 4: Export for Auditors

Generate compliance reports:

```typescript
// Query by date range
const records = await auditLog.query({
  start: '2026-01-01',
  end: '2026-06-30',
  type: ['receipt', 'attribution'],
});

// Export as JSONL (normative format)
const jsonl = records.map((r) => JSON.stringify(r)).join('\n');

// Or generate CSV summary
const csv = generateComplianceSummary(records);
```

---

## Audit Log Format

### JSONL (Normative)

```jsonl
{"type":"receipt","jws":"eyJ...","timestamp":"2026-01-04T12:00:00Z","trace_id":"trace_abc"}
{"type":"attribution","attestation":{...},"timestamp":"2026-01-04T12:00:01Z","trace_id":"trace_abc"}
```

### CSV Summary (Informative)

```csv
timestamp,type,receipt_id,purpose_declared,purpose_enforced,decision
2026-01-04T12:00:00Z,receipt,rec_abc123,"train,search",search,allow
2026-01-04T12:00:01Z,attribution,attr_xyz,,,
```

---

## Compliance Checklist

### Before August 2026

- [ ] Enable PEAC receipt issuance on all AI-accessed content
- [ ] Configure purpose tracking (`PEAC-Purpose` header)
- [ ] Implement attribution attestation for AI outputs
- [ ] Set up audit log storage with appropriate retention
- [ ] Test export workflow for compliance reports

### Ongoing

- [ ] Monitor receipt issuance and verification rates
- [ ] Review purpose enforcement decisions periodically
- [ ] Archive attestations with appropriate retention policy
- [ ] Validate attribution chain integrity
- [ ] Respond to audit requests with PEAC artifacts

---

## Limitations

PEAC provides cryptographic primitives, not compliance certification:

- **PEAC proves WHAT was declared**, not WHAT will actually happen
- **Purpose is declared intent**, not verified constraint
- **Attestations require trust** in the issuer
- **Receipts prove access**, not that content was used correctly

Organizations must:

- Implement appropriate internal controls
- Validate attestation issuers
- Maintain receipt and attestation archives
- Consult legal counsel for compliance interpretation

---

## See Also

- [Attribution Attestation Spec](../specs/ATTRIBUTION.md) - Technical specification
- [Purpose Headers](../specs/PROTOCOL-BEHAVIOR.md#7-http-header-semantics) - Purpose tracking (v0.9.24+)
- [Obligations Extension](../specs/ATTRIBUTION.md#a1-cc-signals-alignment) - Credit/contribution requirements
- [Conformance Tests](../../specs/conformance/) - Golden vectors for validation
