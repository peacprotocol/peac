# MCP Evidence Profile

**Version:** 0.1
**Status:** Normative
**Package:** `@peac/mappings-mcp`
**MCP Spec Version:** 2025-11-25
**Depends on:** Evidence Carrier Contract (DD-124)

This document specifies how PEAC evidence carriers are placed within MCP (Model Context Protocol) tool responses using the `_meta` field. It covers key naming, reserved key guards, legacy compatibility, and security considerations.

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 (RFC 2119, RFC 8174) when, and only when, they appear in all capitals, as shown here.

## 1. Overview

MCP (Anthropic) provides a protocol for connecting AI models to external tools and data sources. PEAC provides an evidence layer that MCP servers can use to attach payment receipts and traceability data to tool responses.

Evidence is carried in the `_meta` field of MCP tool results using reverse-DNS-prefixed keys, following MCP 2025-11-25 conventions.

## 2. Key Schema

### 2.1 Carrier Keys

PEAC evidence uses the `org.peacprotocol/` prefix. The following keys are defined:

| Key                               | Type     | Required | Description                              |
| --------------------------------- | -------- | -------- | ---------------------------------------- |
| `org.peacprotocol/receipt_ref`    | `string` | MUST     | Content-addressed reference (`sha256:*`) |
| `org.peacprotocol/receipt_jws`    | `string` | MAY      | Compact JWS of the PEAC receipt          |
| `org.peacprotocol/policy_binding` | `string` | MAY      | Policy binding reference                 |
| `org.peacprotocol/actor_binding`  | `string` | MAY      | Actor binding reference                  |
| `org.peacprotocol/request_nonce`  | `string` | MAY      | Request nonce for replay protection      |

### 2.2 Metadata Keys (non-carrier)

These keys carry server metadata and are not part of the carrier structure:

| Key                            | Type     | Description                      |
| ------------------------------ | -------- | -------------------------------- |
| `org.peacprotocol/agent_id`    | `string` | Agent identifier (from v0.10.13) |
| `org.peacprotocol/verified_at` | `string` | ISO 8601 verification timestamp  |

### 2.3 Example

```json
{
  "content": [
    {
      "type": "text",
      "text": "Search results for: quantum computing"
    }
  ],
  "_meta": {
    "org.peacprotocol/receipt_ref": "sha256:abc123def456...",
    "org.peacprotocol/receipt_jws": "eyJhbGciOiJFZERTQSJ9.eyJpc3MiOi...",
    "org.peacprotocol/agent_id": "https://api.example.com",
    "org.peacprotocol/verified_at": "2026-02-23T12:00:00Z"
  }
}
```

## 3. Reserved Key Guard

### 3.1 MCP Reserved Key Rule

Per MCP spec 2025-11-25, certain `_meta` key prefixes are reserved:

> "Any prefix where the **second label** is `modelcontextprotocol` or `mcp` is reserved."

The "second label" is the second segment in the dot-separated prefix (before the `/`):

| Key                            | Second Label           | Reserved? |
| ------------------------------ | ---------------------- | --------- |
| `io.modelcontextprotocol/data` | `modelcontextprotocol` | Yes       |
| `dev.mcp/data`                 | `mcp`                  | Yes       |
| `com.example.mcp/data`         | `example`              | No        |
| `org.peacprotocol/receipt_ref` | `peacprotocol`         | No        |

### 3.2 Implementation

All PEAC keys use the `org.peacprotocol/` prefix, where the second label is `peacprotocol`. This is NOT reserved per the MCP rule.

Implementations MUST validate that dynamically constructed keys do not use reserved prefixes. The `assertNotMcpReservedKey()` guard function enforces this:

```typescript
const MCP_RESERVED_SECOND_LABELS = ['modelcontextprotocol', 'mcp'];

function assertNotMcpReservedKey(key: string): void {
  const slashIndex = key.indexOf('/');
  if (slashIndex === -1) return;
  const prefix = key.substring(0, slashIndex);
  const labels = prefix.split('.');
  if (labels.length >= 2 && MCP_RESERVED_SECOND_LABELS.includes(labels[1].toLowerCase())) {
    throw new Error(`Reserved MCP _meta key: ${key}`);
  }
}
```

## 4. Legacy Compatibility (DD-125)

### 4.1 Deprecation Phases

The original `peac_receipt` field (pre-v0.11.1) is deprecated in three phases:

| Phase   | Version | Behavior                                                                                                                       |
| ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Phase 1 | v0.11.1 | `extractReceipt()` reads BOTH legacy and `_meta`. `attachReceipt()` defaults to `_meta`; `opts.legacyFormat: true` for legacy. |
| Phase 2 | v0.12.x | Console warning on legacy read                                                                                                 |
| Phase 3 | v0.13.0 | Remove legacy read                                                                                                             |

### 4.2 Legacy Key Migration

The v0.10.13 MCP server used these `_meta` keys:

| Legacy Key (v0.10.13)      | New Key (v0.11.1+)             |
| -------------------------- | ------------------------------ |
| `org.peacprotocol/receipt` | `org.peacprotocol/receipt_jws` |
| (not present)              | `org.peacprotocol/receipt_ref` |

When the legacy `org.peacprotocol/receipt` key is found during extraction, implementations MUST:

1. Treat its value as a compact JWS
2. Compute `receipt_ref` from the JWS using `computeReceiptRef()`
3. Return a proper `PeacEvidenceCarrier` with both fields

The `org.peacprotocol/agent_id` and `org.peacprotocol/verified_at` keys are unchanged.

### 4.3 Attach Options

```typescript
attachReceipt(response, receiptJWS);
// Writes to _meta (default, v0.11.1+)

attachReceipt(response, receiptJWS, { legacyFormat: true });
// Writes to peac_receipt field (backward compat)
```

## 5. Carrier Size Limits

| Transport | Max Carrier Size | Format | Rationale      |
| --------- | ---------------- | ------ | -------------- |
| MCP       | 64 KB (65,536 B) | embed  | JSON in memory |

Carriers exceeding 64 KB MUST be rejected at attachment time.

## 6. Server-Signed Only

MCP tool responses are server-signed: the MCP server (tool provider) signs the receipt. Clients do NOT sign evidence in the response path. This constraint aligns with MCP's request-response model where the server is the authoritative evidence source.

## 7. Security Considerations

### 7.1 Carrier Validation (DD-131)

Every `extractReceipt()` and `extractReceiptFromMeta()` call validates carrier structure before returning. Malformed keys, invalid `receipt_ref` format, or invalid JWS format result in `null` return (no throw).

### 7.2 Key Prefix Safety

The `assertNotMcpReservedKey()` guard MUST be applied to any dynamically constructed key before writing to `_meta`. Static keys (`org.peacprotocol/receipt_ref`, etc.) are pre-validated and do not need runtime checks.

### 7.3 No Injection via \_meta

Consumers MUST NOT interpret `_meta` values as executable code. All values are strings (JWS, SHA-256 hashes, URIs, timestamps). There is no eval, template expansion, or dynamic dispatch based on `_meta` content.

## 8. Conformance

An implementation is conformant with this profile if it:

1. Uses `org.peacprotocol/` prefixed keys in `_meta` (not reserved per MCP spec)
2. Writes `receipt_ref` as a `sha256:<hex64>` string
3. Writes `receipt_jws` as a compact JWS (3-part dot-separated)
4. Reads legacy `peac_receipt` field during Phase 1/Phase 2
5. Reads legacy `org.peacprotocol/receipt` key and computes `receipt_ref`
6. Enforces the 64 KB carrier size limit
7. Validates carrier structure at extraction time

## 9. Migration Guide

### From `peac_receipt` (pre-v0.11.1) to `_meta` keys:

**Before (v0.10.x):**

```json
{
  "content": [...],
  "peac_receipt": "eyJhbGciOi..."
}
```

**After (v0.11.1+):**

```json
{
  "content": [...],
  "_meta": {
    "org.peacprotocol/receipt_ref": "sha256:abc123...",
    "org.peacprotocol/receipt_jws": "eyJhbGciOi..."
  }
}
```

No changes are needed on the consumer side during Phase 1: `extractReceipt()` reads both formats automatically.
