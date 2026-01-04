# PEAC Attribution Specification

**Version:** 0.9.26
**Status:** Normative
**Last Updated:** 2026-01-04

## Table of Contents

1. [Overview](#1-overview)
2. [ContentHash Object](#2-contenthash-object)
3. [AttributionSource Object](#3-attributionsource-object)
4. [AttributionAttestation Object](#4-attributionattestation-object)
5. [Chain Semantics](#5-chain-semantics)
6. [Transport Binding](#6-transport-binding)
7. [Verification Algorithm](#7-verification-algorithm)
8. [Privacy Considerations](#8-privacy-considerations)
9. [Error Taxonomy](#9-error-taxonomy)
10. [Security Considerations](#10-security-considerations)

- [Appendix A: Interoperability](#appendix-a-interoperability)
- [Appendix B: Extension Mechanism](#appendix-b-extension-mechanism)

---

## 1. Overview

### 1.1 Purpose

This specification defines the **AttributionAttestation** type for proving content derivation and usage in PEAC receipts. It enables:

- **Usage Proof**: Cryptographic evidence that content was used for a specific purpose
- **Chain Tracking**: Tracing derivation chains from source receipts to outputs
- **Compliance Artifacts**: Auditable records for EU AI Act and similar regulations

### 1.2 Scope

This specification covers:

- Schema definitions for attribution attestations
- Content hashing for deterministic verification
- Chain semantics and resolution
- Transport binding patterns
- Privacy-preserving defaults
- Error codes for attribution verification

### 1.3 Terminology

| Term            | Definition                                           |
| --------------- | ---------------------------------------------------- |
| **Attribution** | Claim linking output to source content               |
| **ContentHash** | Deterministic hash of content for verification       |
| **Derivation**  | Process of creating new content from source material |
| **Receipt Ref** | Reference to a PEAC receipt proving source access    |
| **Source**      | Original content that was used in derivation         |
| **Usage**       | Classification of how source content was used        |

### 1.4 Requirements Notation

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

---

## 2. ContentHash Object

### 2.1 Structure

The ContentHash object provides deterministic content identification:

```typescript
interface ContentHash {
  alg: 'sha-256'; // REQUIRED: Hash algorithm (only sha-256 supported)
  value: string; // REQUIRED: Base64url-encoded hash value
  enc: 'base64url'; // REQUIRED: Encoding format
}
```

### 2.2 Algorithm Requirements

Implementations MUST support SHA-256 as the hash algorithm. Future versions MAY add additional algorithms through the extension mechanism.

| Algorithm | Status   | Use Case                   |
| --------- | -------- | -------------------------- |
| `sha-256` | REQUIRED | Default, universal support |

### 2.3 Encoding Requirements

The `value` field MUST be encoded as base64url (RFC 4648 Section 5) without padding.

### 2.4 Computation Rules

To compute a ContentHash:

1. Normalize the content (see Section 2.5)
2. Compute SHA-256 hash of the normalized bytes
3. Encode the 32-byte hash as base64url without padding

```typescript
function computeContentHash(content: Uint8Array): ContentHash {
  const hash = crypto.subtle.digest('SHA-256', content);
  const value = base64url.encode(new Uint8Array(hash));
  return { alg: 'sha-256', value, enc: 'base64url' };
}
```

### 2.5 Content Normalization

For deterministic hashing:

- **Text content**: UTF-8 encode, normalize to NFC, strip trailing whitespace
- **Binary content**: Hash raw bytes directly
- **JSON content**: Serialize with sorted keys, no whitespace

### 2.6 Field Constraints

| Field   | Type    | Constraints                              |
| ------- | ------- | ---------------------------------------- |
| `alg`   | literal | Must be 'sha-256'                        |
| `value` | string  | Base64url without padding, 43 characters |
| `enc`   | literal | Must be 'base64url'                      |

---

## 3. AttributionSource Object

### 3.1 Structure

An AttributionSource links to a source receipt and describes how content was used:

```typescript
interface AttributionSource {
  receipt_ref: string; // REQUIRED: Reference to source PEAC receipt
  content_hash?: ContentHash; // OPTIONAL: Hash of source content
  excerpt_hash?: ContentHash; // OPTIONAL: Hash of used excerpt (privacy-preserving)
  usage: AttributionUsage; // REQUIRED: How the source was used
  weight?: number; // OPTIONAL: Relative contribution (0.0-1.0)
}
```

### 3.2 Usage Types

| Usage              | Description                               | Example                      |
| ------------------ | ----------------------------------------- | ---------------------------- |
| `training_input`   | Used to train a model                     | Fine-tuning dataset          |
| `rag_context`      | Retrieved for RAG context                 | Knowledge base retrieval     |
| `direct_reference` | Directly quoted or referenced             | Citation in generated output |
| `synthesis_source` | Combined with other sources to create new | Multi-source summarization   |
| `embedding_source` | Used to create embeddings/vectors         | Semantic search indexing     |

### 3.3 Receipt Reference Format

The `receipt_ref` field MUST be one of:

- **JTI Reference**: `jti:{receipt_id}` - Direct receipt identifier
- **URL Reference**: `https://...` - Resolvable receipt URL
- **URN Reference**: `urn:peac:receipt:{id}` - URN-formatted identifier

Examples:

```
jti:rec_abc123def456
https://publisher.example/receipts/rec_abc123def456
urn:peac:receipt:rec_abc123def456
```

### 3.4 Weight Semantics

The `weight` field indicates relative contribution:

- `weight` MUST be between 0.0 and 1.0 (inclusive)
- Weights across all sources SHOULD sum to 1.0 when provided
- If `weight` is omitted, sources are considered equally weighted
- `weight: 0.0` indicates minimal contribution (e.g., negative examples)

### 3.5 Field Constraints

| Field          | Type             | Constraints                               |
| -------------- | ---------------- | ----------------------------------------- |
| `receipt_ref`  | string           | 1-2048 characters, valid reference format |
| `content_hash` | ContentHash      | Optional, must be valid ContentHash       |
| `excerpt_hash` | ContentHash      | Optional, must be valid ContentHash       |
| `usage`        | AttributionUsage | Required, one of defined usage types      |
| `weight`       | number           | Optional, 0.0-1.0                         |

---

## 4. AttributionAttestation Object

### 4.1 Top-Level Structure

```typescript
interface AttributionAttestation {
  type: 'peac/attribution'; // REQUIRED: Type literal
  issuer: string; // REQUIRED: Attestation issuer URL
  issued_at: string; // REQUIRED: RFC 3339 datetime
  expires_at?: string; // OPTIONAL: RFC 3339 datetime
  ref?: string; // OPTIONAL: Verification endpoint URL
  evidence: AttributionEvidence; // REQUIRED: Attribution evidence
}
```

### 4.2 Evidence Structure

```typescript
interface AttributionEvidence {
  sources: AttributionSource[]; // REQUIRED: Array of attribution sources
  derivation_type: DerivationType; // REQUIRED: Type of derivation
  output_hash?: ContentHash; // OPTIONAL: Hash of derived output
  model_id?: string; // OPTIONAL: Model identifier
  inference_provider?: string; // OPTIONAL: Inference provider URL
  session_id?: string; // OPTIONAL: Session correlation
  metadata?: Record<string, JsonValue>; // OPTIONAL: Additional metadata
}
```

### 4.3 Derivation Types

| Derivation Type | Description                          |
| --------------- | ------------------------------------ |
| `training`      | Model training or fine-tuning        |
| `inference`     | Runtime inference with RAG/grounding |
| `rag`           | Retrieval-augmented generation       |
| `synthesis`     | Multi-source content synthesis       |
| `embedding`     | Vector embedding generation          |

### 4.4 Field Constraints

| Field                | Type                | Constraints                         |
| -------------------- | ------------------- | ----------------------------------- |
| `sources`            | AttributionSource[] | 1-100 sources, REQUIRED             |
| `derivation_type`    | DerivationType      | REQUIRED, one of defined types      |
| `output_hash`        | ContentHash         | Optional, hash of derived output    |
| `model_id`           | string              | Optional, max 256 characters        |
| `inference_provider` | string              | Optional, valid URL, max 2048 chars |
| `session_id`         | string              | Optional, max 256 characters        |

---

## 5. Chain Semantics

### 5.1 Chain Limits

To prevent denial-of-service and ensure verification feasibility:

```typescript
const ATTRIBUTION_LIMITS = {
  maxSources: 100, // Maximum sources per attestation
  maxDepth: 8, // Maximum chain resolution depth
  maxAttestationSize: 65536, // Maximum attestation size (64KB)
  resolutionTimeout: 5000, // Per-hop resolution timeout (ms)
};
```

### 5.2 Depth Calculation

Chain depth is calculated as:

- **Depth 0**: Direct source receipt (no attribution chain)
- **Depth 1**: Source has one level of attribution
- **Depth N**: Source has N levels of nested attribution

### 5.3 Cycle Detection

Implementations MUST detect and reject circular chains:

```
DETECT_CYCLES(attestation, visited = Set()):
  1. FOR each source IN attestation.evidence.sources:
       a. IF source.receipt_ref IN visited:
            RETURN CycleDetected(source.receipt_ref)
       b. ADD source.receipt_ref TO visited
       c. resolved = RESOLVE(source.receipt_ref)
       d. IF resolved has attribution:
            DETECT_CYCLES(resolved.attribution, visited)
  2. RETURN NoCycle
```

### 5.4 Resolution Modes

| Mode       | Behavior                               | Use Case               |
| ---------- | -------------------------------------- | ---------------------- |
| `offline`  | Only verify local data, no resolution  | Batch processing       |
| `resolver` | Resolve receipt refs to validate chain | Real-time verification |

### 5.5 Chain Verification

Chain verification proceeds recursively with depth limiting:

```
VERIFY_CHAIN(attestation, depth = 0, timeout):
  1. IF depth > ATTRIBUTION_LIMITS.maxDepth:
       RETURN Error("E_ATTRIBUTION_CHAIN_TOO_DEEP")

  2. IF SIZE(attestation) > ATTRIBUTION_LIMITS.maxAttestationSize:
       RETURN Error("E_ATTRIBUTION_SIZE_EXCEEDED")

  3. IF LEN(attestation.evidence.sources) > ATTRIBUTION_LIMITS.maxSources:
       RETURN Error("E_ATTRIBUTION_TOO_MANY_SOURCES")

  4. FOR each source IN attestation.evidence.sources:
       a. VERIFY receipt_ref format is valid
       b. IF mode == 'resolver':
            - resolved = RESOLVE_WITH_TIMEOUT(source.receipt_ref, timeout)
            - IF resolved has attribution attestation:
                VERIFY_CHAIN(resolved.attribution, depth + 1, timeout)

  5. RETURN ChainValid
```

---

## 6. Transport Binding

### 6.1 HTTP Response (Link Header)

Attribution attestations MAY be transported via Link header:

```http
HTTP/1.1 200 OK
Link: <https://example.com/attribution/abc123>; rel="peac-attribution"
Content-Type: application/json

{"generated": "content here"}
```

The linked resource MUST return the AttributionAttestation as JWS:

```http
GET /attribution/abc123
Accept: application/jose

eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMuYXR0cmlidXRpb24ifQ...
```

### 6.2 HTTP Response (Body Payload)

For inline transport, include in response body:

```json
{
  "content": "generated output",
  "peac_attribution": "eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMuYXR0cmlidXRpb24ifQ..."
}
```

### 6.3 JSON-in-Headers Prohibition

Implementations MUST NOT transport attribution as JSON in HTTP headers. Use Link relation or body payload instead.

**Prohibited:**

```http
PEAC-Attribution: {"type":"peac/attribution",...}
```

**Allowed:**

```http
Link: <https://example.com/attribution/abc>; rel="peac-attribution"
```

### 6.4 MCP Transport

For MCP tool responses, use the `_meta` namespace:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [...],
    "_meta": {
      "org.peacprotocol/attribution": "eyJhbGciOiJFZERTQSI..."
    }
  }
}
```

### 6.5 Streaming Responses

For streaming responses (SSE, WebSocket):

- Attribution SHOULD be sent as first or last chunk
- Use message type `peac:attribution` for identification:

```
event: peac:attribution
data: eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMuYXR0cmlidXRpb24ifQ...
```

---

## 7. Verification Algorithm

### 7.1 Pseudocode

```
VERIFY_ATTRIBUTION(attestation, options):
  1. VALIDATE attestation schema
     - IF invalid: RETURN Error("E_ATTRIBUTION_INVALID_FORMAT")

  2. VALIDATE sources array
     - IF empty: RETURN Error("E_ATTRIBUTION_MISSING_SOURCES")
     - IF count > maxSources: RETURN Error("E_ATTRIBUTION_TOO_MANY_SOURCES")

  3. FOR each source IN attestation.evidence.sources:
       a. VALIDATE receipt_ref format
          - IF invalid: RETURN Error("E_ATTRIBUTION_INVALID_REF")

       b. IF content_hash present:
            VALIDATE content_hash structure
            - IF invalid: RETURN Error("E_ATTRIBUTION_HASH_INVALID")

       c. IF excerpt_hash present:
            VALIDATE excerpt_hash structure

       d. VALIDATE usage is known type
          - IF unknown: RETURN Error("E_ATTRIBUTION_UNKNOWN_USAGE")

       e. IF weight present:
            - IF weight < 0 OR weight > 1: RETURN Error("E_ATTRIBUTION_INVALID_WEIGHT")

  4. IF options.mode == 'resolver':
       VERIFY_CHAIN(attestation, 0, options.timeout)

  5. VALIDATE time bounds:
     - IF attestation.issued_at > now + clock_skew:
         RETURN Error("E_ATTRIBUTION_NOT_YET_VALID")
     - IF attestation.expires_at < now - clock_skew:
         RETURN Error("E_ATTRIBUTION_EXPIRED")

  6. RETURN AttributionValid
```

### 7.2 Configuration Parameters

| Parameter    | Default | Range            | Description                     |
| ------------ | ------- | ---------------- | ------------------------------- |
| `mode`       | offline | offline/resolver | Resolution mode                 |
| `maxDepth`   | 8       | 1-16             | Maximum chain depth             |
| `timeout`    | 5000ms  | 1000-30000       | Per-hop resolution timeout      |
| `clock_skew` | 30s     | 0-300s           | Tolerance for clock differences |

### 7.3 Performance Budgets

| Metric                    | Target  | Enforcement |
| ------------------------- | ------- | ----------- |
| P95 `verifyAttribution()` | <= 50ms | CI advisory |
| Maximum attestation size  | 64KB    | Hard limit  |
| Per-hop resolution        | 5s      | Hard limit  |

---

## 8. Privacy Considerations

### 8.1 Privacy Defaults

Attribution attestations SHOULD follow privacy-preserving defaults:

- Use `excerpt_hash` instead of raw text excerpts
- Avoid including PII in metadata
- Use opaque identifiers for session_id

### 8.2 Content Hash vs Excerpt Hash

| Field          | Contains             | Use Case                   |
| -------------- | -------------------- | -------------------------- |
| `content_hash` | Hash of full content | Verify source authenticity |
| `excerpt_hash` | Hash of used portion | Privacy-preserving audit   |

### 8.3 Sensitive Data Handling

For content containing sensitive data:

- `excerpt_hash` MUST be used instead of raw content
- `metadata` MUST NOT contain user-identifiable information
- Implementations SHOULD provide opt-in for detailed logging

### 8.4 Data Minimization

Implementations SHOULD:

- Include only necessary attribution sources
- Omit `weight` when not meaningful
- Use session correlation rather than user tracking

---

## 9. Error Taxonomy

### 9.1 Error Codes

| Error Code                         | HTTP Status | Retriable | Description                   |
| ---------------------------------- | ----------- | --------- | ----------------------------- |
| `E_ATTRIBUTION_MISSING_SOURCES`    | 400         | No        | Sources array empty           |
| `E_ATTRIBUTION_INVALID_FORMAT`     | 400         | No        | Schema validation failed      |
| `E_ATTRIBUTION_INVALID_REF`        | 400         | No        | Invalid receipt reference     |
| `E_ATTRIBUTION_HASH_INVALID`       | 400         | No        | Invalid content hash          |
| `E_ATTRIBUTION_UNKNOWN_USAGE`      | 400         | No        | Unknown usage type            |
| `E_ATTRIBUTION_INVALID_WEIGHT`     | 400         | No        | Weight out of range           |
| `E_ATTRIBUTION_CIRCULAR_CHAIN`     | 400         | No        | Circular reference detected   |
| `E_ATTRIBUTION_CHAIN_TOO_DEEP`     | 400         | No        | Chain exceeds max depth       |
| `E_ATTRIBUTION_TOO_MANY_SOURCES`   | 400         | No        | Too many sources              |
| `E_ATTRIBUTION_SIZE_EXCEEDED`      | 400         | No        | Attestation too large         |
| `E_ATTRIBUTION_RESOLUTION_FAILED`  | 502         | Yes       | Failed to resolve receipt ref |
| `E_ATTRIBUTION_RESOLUTION_TIMEOUT` | 504         | Yes       | Resolution timeout            |
| `E_ATTRIBUTION_NOT_YET_VALID`      | 401         | Yes       | Future issued_at              |
| `E_ATTRIBUTION_EXPIRED`            | 401         | No        | Attestation expired           |

### 9.2 Error Response Format

Errors SHOULD follow RFC 9457 Problem Details:

```json
{
  "type": "https://peacprotocol.org/errors/attribution_chain_too_deep",
  "title": "Attribution Chain Too Deep",
  "status": 400,
  "detail": "Chain depth of 12 exceeds maximum allowed depth of 8",
  "instance": "/api/generate",
  "peac_error": {
    "code": "E_ATTRIBUTION_CHAIN_TOO_DEEP",
    "max_depth": 8,
    "actual_depth": 12
  }
}
```

---

## 10. Security Considerations

### 10.1 Chain Depth Attacks

Deep chains can be used for denial-of-service:

- Implementations MUST enforce `maxDepth` limit
- Resolution MUST timeout per-hop
- Total verification time SHOULD be bounded

### 10.2 Size Attacks

Large attestations can exhaust resources:

- Implementations MUST enforce `maxAttestationSize` (64KB)
- Source count MUST be limited to 100
- Implementations SHOULD validate early and fail fast

### 10.3 Cycle Detection

Circular references can cause infinite loops:

- Implementations MUST detect cycles before resolution
- Use visited set to track resolved receipts
- Fail immediately on cycle detection

### 10.4 Time Validation

Prevent backdated or future-dated attestations:

- Validate `issued_at` is not in the future
- Validate `expires_at` if present
- Use clock skew tolerance of 30 seconds

### 10.5 Hash Collision Resistance

SHA-256 provides adequate collision resistance:

- 256-bit output provides 128-bit security
- No known practical collision attacks
- Suitable for content verification

---

## Appendix A: Interoperability

### A.1 CC Signals Alignment

Attribution supports Creative Commons Signals obligations:

```typescript
extensions: {
  'org.peacprotocol/obligations': {
    credit: {
      required: true,
      citation_url: 'https://example.com/collection',
      method: 'inline' | 'references' | 'model-card',
    },
    contribution?: {
      type: 'direct' | 'ecosystem' | 'open',
      destination?: string,
    }
  }
}
```

### A.2 EU AI Act Traceability

Attribution attestations provide:

- Auditable chain from output to source
- Cryptographic proof of what was used
- Timestamp evidence for compliance

### A.3 MCP Integration

For MCP tool responses:

```json
{
  "result": {
    "content": [...],
    "_meta": {
      "org.peacprotocol/attribution": "eyJhbGciOi...",
      "org.peacprotocol/derivation_type": "rag"
    }
  }
}
```

### A.4 A2A Agent Card

For A2A discovery:

```json
{
  "extensions": {
    "org.peacprotocol": {
      "attribution_endpoint": "https://agent.example/attribution",
      "supports_chain_resolution": true
    }
  }
}
```

---

## Appendix B: Extension Mechanism

### B.1 Namespace Format

Extensions use reverse-DNS namespaced keys:

```
org.peacprotocol/obligations
com.example/custom-field
io.github.user/extension
```

### B.2 Reserved Namespaces

| Namespace             | Owner         | Purpose                |
| --------------------- | ------------- | ---------------------- |
| `org.peacprotocol`    | PEAC Protocol | Official extensions    |
| `org.creativecommons` | CC            | CC Signals integration |

### B.3 Extension Schema

Extensions SHOULD provide JSON Schema for validation:

```json
{
  "$id": "https://peacprotocol.org/schemas/obligations/v1",
  "type": "object",
  "properties": {
    "credit": {
      "type": "object",
      "properties": {
        "required": { "type": "boolean" },
        "citation_url": { "type": "string", "format": "uri" },
        "method": { "enum": ["inline", "references", "model-card"] }
      }
    }
  }
}
```

---

## References

- RFC 2119: Key words for use in RFCs
- RFC 3339: Date and Time on the Internet
- RFC 4648: Base Encodings (Section 5: Base64url)
- RFC 9457: Problem Details for HTTP APIs
- FIPS 180-4: Secure Hash Standard (SHA-256)
