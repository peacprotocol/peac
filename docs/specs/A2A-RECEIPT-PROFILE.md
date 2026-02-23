# A2A Receipt Profile

**Version:** 0.1
**Status:** Normative
**Package:** `@peac/mappings-a2a`
**A2A Spec Version:** v0.3.0 (stable)
**Extension URI:** `https://www.peacprotocol.org/ext/traceability/v1`
**Depends on:** Evidence Carrier Contract (DD-124)

This document specifies how PEAC evidence carriers are placed within A2A (Agent-to-Agent Protocol) messages and metadata. It covers Agent Card declaration, metadata layout, header conventions, and security considerations.

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

## 1. Overview

A2A (Linux Foundation) defines a protocol for agent-to-agent communication. PEAC provides an evidence layer that agents can use to carry payment receipts, consent records, and other traceability data alongside A2A messages.

PEAC evidence is carried as an A2A extension, registered via the Agent Card and transmitted in metadata maps on TaskStatus, Message, and Artifact objects.

## 2. Extension Registration

### 2.1 Agent Card Declaration

Agents that support PEAC evidence MUST declare the extension in their Agent Card's `capabilities.extensions` array (A2A v0.3.0):

```json
{
  "name": "ExampleAgent",
  "url": "https://agent.example.com",
  "capabilities": {
    "extensions": [
      {
        "uri": "https://www.peacprotocol.org/ext/traceability/v1",
        "description": "PEAC receipt evidence for agent interactions",
        "required": false,
        "params": {
          "supported_kinds": ["peac-receipt/0.1"],
          "carrier_formats": ["embed", "reference"],
          "jwks_uri": "https://agent.example.com/.well-known/jwks.json"
        }
      }
    ]
  }
}
```

**Fields:**

| Field         | Type      | Required | Description                                      |
| ------------- | --------- | -------- | ------------------------------------------------ |
| `uri`         | `string`  | MUST     | Extension URI (exactly as shown above)           |
| `description` | `string`  | SHOULD   | Human-readable description                       |
| `required`    | `boolean` | MUST     | Whether counterparty MUST support this extension |
| `params`      | `object`  | MAY      | Extension parameters (schema below)              |

**Params schema:**

| Field             | Type       | Description                                     |
| ----------------- | ---------- | ----------------------------------------------- |
| `supported_kinds` | `string[]` | Wire format versions (e.g., `peac-receipt/0.1`) |
| `carrier_formats` | `string[]` | Supported carrier formats: `embed`, `reference` |
| `jwks_uri`        | `string`   | URI for public keys used to verify receipts     |

### 2.2 Discovery

The Agent Card is discoverable at `/.well-known/agent-card.json` (A2A v0.3.0 canonical path). Implementations SHOULD also check `/.well-known/agent.json` as a fallback for pre-v0.3.0 agents.

## 3. Metadata Layout

### 3.1 Placement Convention

Per A2A spec v0.3.0, extension data is placed as a value under the extension URI key in a `metadata` map:

```
metadata[EXTENSION_URI] = { ...extension_payload }
```

For PEAC, the extension URI key is:

```
https://www.peacprotocol.org/ext/traceability/v1
```

### 3.2 Payload Schema

The value under the extension URI key MUST be an object with the following structure:

```json
{
  "https://www.peacprotocol.org/ext/traceability/v1": {
    "carriers": [
      {
        "receipt_ref": "sha256:abc123...",
        "receipt_jws": "eyJhbGciOi..."
      }
    ],
    "meta": {
      "transport": "a2a",
      "format": "embed",
      "max_size": 65536
    }
  }
}
```

| Field      | Type                    | Required | Description                |
| ---------- | ----------------------- | -------- | -------------------------- |
| `carriers` | `PeacEvidenceCarrier[]` | MUST     | Array of evidence carriers |
| `meta`     | `CarrierMeta`           | MAY      | Transport metadata         |

The `carriers` array uses the `PeacEvidenceCarrier` schema defined in the Evidence Carrier Contract. The `meta` object follows the `CarrierMeta` schema.

### 3.3 Applicable Objects

PEAC evidence MAY be attached to:

| A2A Object | Metadata Field           | Typical Use Case                      |
| ---------- | ------------------------ | ------------------------------------- |
| TaskStatus | `status.metadata[URI]`   | Payment for task execution            |
| Message    | `message.metadata[URI]`  | Per-message evidence                  |
| Artifact   | `artifact.metadata[URI]` | Evidence attached to output artifacts |

Implementers SHOULD prefer `TaskStatus.metadata` for receipts that apply to the entire task lifecycle.

## 4. Header Convention

### 4.1 A2A-Extensions Header

When evidence is present, the `A2A-Extensions` header SHOULD be set to indicate which extensions are active:

```
A2A-Extensions: https://www.peacprotocol.org/ext/traceability/v1
```

Multiple extensions are comma-separated:

```
A2A-Extensions: https://www.peacprotocol.org/ext/traceability/v1, https://example.com/ext/audit
```

This header is informational; the authoritative source of extension data is always the metadata map. No `X-` prefixed headers are used (DD-86).

## 5. Carrier Size Limits

| Transport | Max Carrier Size | Format | Rationale                 |
| --------- | ---------------- | ------ | ------------------------- |
| A2A       | 64 KB (65,536 B) | embed  | Metadata map in JSON body |

Carriers exceeding 64 KB MUST be rejected at attachment time. For larger evidence payloads, use `reference` format with `receipt_ref` only.

## 6. Lifecycle

### 6.1 When to Attach

Receipts SHOULD be attached at the following TaskStatus transitions:

| State       | Action                                                       |
| ----------- | ------------------------------------------------------------ |
| `working`   | Attach receipt after payment is confirmed, before processing |
| `completed` | Attach final receipt with full evidence                      |
| `failed`    | Attach receipt if payment was captured before failure        |

### 6.2 Extraction

Consumers extract evidence using:

1. **Sync extraction:** Validates carrier structure (schema + size limits)
2. **Async extraction (DD-129):** Additionally verifies `receipt_ref` consistency when `receipt_jws` is present

Async extraction is the RECOMMENDED path. Sync extraction is suitable for read-only display of carrier metadata.

## 7. Security Considerations

### 7.1 Namespace Isolation (ASI-04)

All PEAC data MUST be placed under the `https://www.peacprotocol.org/ext/traceability/v1` URI key. This prevents collision with other extensions.

### 7.2 Carrier Validation (DD-131)

Every `extract()` call validates carrier structure before returning data to the consumer. Invalid carriers (malformed `receipt_ref`, invalid JWS format, oversized payloads) are silently dropped and return `null`.

### 7.3 No Raw Prompt Leakage

PEAC evidence carriers MUST NOT include raw user prompts, conversation content, or PII. Carriers contain only cryptographic references (`receipt_ref`), signed receipts (`receipt_jws`), and structural metadata.

### 7.4 Discovery SSRF

Discovery functions that fetch Agent Cards from remote URLs MUST implement SSRF protections: DNS rebinding defense, private IP rejection, scheme allowlist (`https:` only), redirect rejection, response size cap (256 KB), and Content-Type validation.

## 8. Conformance

An implementation is conformant with this profile if it:

1. Places PEAC carriers under the correct extension URI key in metadata
2. Uses `PeacEvidenceCarrier` schema for all carrier objects
3. Enforces the 64 KB size limit
4. Validates carrier structure at extraction time
5. Declares the extension in Agent Card when advertising support
