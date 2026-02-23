# Evidence Carrier Contract

**Status**: NORMATIVE

**Version**: 0.11.1

**Design Decisions**: DD-124 (type placement), DD-127 (transport size limits), DD-129 (immutability), DD-131 (ASI-04 defense)

---

## 1. Introduction

This document defines the Evidence Carrier Contract: the universal interface that lets any protocol carry PEAC receipts without kernel changes. The carrier is a protocol-neutral envelope that wraps a content-addressed receipt reference with optional verification metadata.

**Key words**: The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

### 1.1 Scope

The Evidence Carrier Contract covers:

1. The `PeacEvidenceCarrier` type: the carrier envelope itself
2. The `CarrierAdapter<TInput, TOutput>` interface: how protocol mappings produce and consume carriers
3. `CarrierMeta`: transport-level metadata for constraint validation
4. `computeReceiptRef()`: canonical receipt reference computation
5. `validateCarrierConstraints()`: transport-aware structural validation
6. `verifyReceiptRefConsistency()`: tamper detection for attached carriers
7. Per-transport placement rules: how carriers map to MCP, A2A, ACP, UCP, x402, and HTTP

The contract does NOT define:

- Wire format changes (the underlying `peac-receipt/0.1` format is FROZEN)
- Receipt signing, verification, or issuance (see `@peac/crypto`, `@peac/protocol`)
- Transport negotiation or capability discovery (see DISCOVERY-PROFILE.md)

### 1.2 Relationship to RFC 9711 (EAT)

The carrier contract shares the content-addressing model with IETF Entity Attestation Tokens (EAT, RFC 9711). A PEAC receipt JWS is a signed claim set; `receipt_ref` provides content-addressing analogous to EAT's `eat_nonce` binding. The carrier wraps this binding for protocol-specific transport without altering the underlying attestation model.

### 1.3 Cross-References

- Wire format: `peac-receipt/0.1` (FROZEN)
- Types: `packages/kernel/src/carrier.ts`
- Schemas and helpers: `packages/schema/src/carrier.ts`
- Conformance fixtures: `specs/conformance/fixtures/carrier/`
- Kernel constraints: `docs/specs/KERNEL-CONSTRAINTS.md`

---

## 2. PeacEvidenceCarrier

The `PeacEvidenceCarrier` is the canonical carrier envelope. All protocol-specific adapters produce and consume this type.

### 2.1 Field Definitions

| Field                     | Type                 | Required       | Description                                                           |
| ------------------------- | -------------------- | -------------- | --------------------------------------------------------------------- |
| `receipt_ref`             | `sha256:<hex64>`     | MUST           | Content-addressed receipt reference: SHA-256 of the compact JWS bytes |
| `receipt_jws`             | string (compact JWS) | SHOULD (embed) | The signed receipt in compact JWS format (header.payload.signature)   |
| `policy_binding`          | string               | MAY            | Policy binding hash for verification                                  |
| `actor_binding`           | string               | MAY            | Actor binding identifier                                              |
| `request_nonce`           | string               | MAY            | Request nonce for replay protection                                   |
| `verification_report_ref` | string               | MAY            | Reference to a verification report                                    |
| `use_policy_ref`          | string               | MAY            | Reference to a use policy document                                    |
| `representation_ref`      | string               | MAY            | Reference to a content representation                                 |
| `attestation_ref`         | string               | MAY            | Reference to an attestation                                           |

### 2.2 Constraints

1. `receipt_ref` MUST match the pattern `sha256:[a-f0-9]{64}` (lowercase hex, exactly 64 characters after the prefix).
2. `receipt_jws` MUST be a valid compact JWS (three base64url-encoded segments separated by periods).
3. If `receipt_jws` is present, `receipt_ref` MUST equal `sha256(receipt_jws)` where the hash is computed over the UTF-8 bytes of the compact JWS string (DD-129).
4. All optional string fields MUST NOT exceed `KERNEL_CONSTRAINTS.MAX_STRING_LENGTH` (8192 bytes).
5. The total serialized carrier MUST NOT exceed the transport-specific size limit (DD-127).

### 2.3 Carrier Formats

| Format      | Description                               | `receipt_jws`                             |
| ----------- | ----------------------------------------- | ----------------------------------------- |
| `embed`     | Full receipt inline in carrier            | SHOULD be present                         |
| `reference` | Receipt available via external resolution | MUST be absent; resolve via `receipt_ref` |

When the carrier format is `embed`, the `receipt_jws` field SHOULD be present so recipients can verify the receipt without a network round-trip. When the format is `reference`, the `receipt_jws` field MUST be absent; consumers resolve the receipt via `receipt_ref` through a trusted registry or the issuer's well-known endpoint.

---

## 3. CarrierAdapter Interface

Protocol-specific mapping packages implement `CarrierAdapter<TInput, TOutput>` to bridge between the carrier envelope and the protocol's native message format.

```typescript
interface CarrierAdapter<TInput, TOutput> {
  extract(input: TInput): { receipts: PeacEvidenceCarrier[]; meta: CarrierMeta } | null;
  attach(output: TOutput, carriers: PeacEvidenceCarrier[], meta?: CarrierMeta): TOutput;
  validateConstraints(carrier: PeacEvidenceCarrier, meta: CarrierMeta): CarrierValidationResult;
}
```

### 3.1 extract()

The `extract()` method reads carrier data from a protocol-specific message and returns structured `PeacEvidenceCarrier` objects. It MUST:

1. Validate the carrier structure against `PeacEvidenceCarrierSchema` before returning
2. Return `null` if no carrier data is present in the input
3. Return a `carriers` array (even for single-carrier transports) and a `meta` describing the transport

**Important:** `extract()` on `CarrierAdapter` is synchronous and performs structural validation only (schema checks, size checks). Mapping packages MUST also expose an `extractAsync()` wrapper that runs `verifyReceiptRefConsistency()` when `receipt_jws` is present (DD-129). The async consistency check is performed at the mapping layer, keeping kernel types synchronous.

### 3.2 attach()

The `attach()` method places carrier data into a protocol-specific output message. It MUST:

1. Accept a `carriers` array uniformly (even for single-carrier transports)
2. Call `validateCarrierConstraints()` before placing the carrier
3. Reject carriers that exceed transport size limits
4. Use `computeReceiptRef()` from `@peac/schema` if `receipt_jws` is provided but `receipt_ref` is missing

### 3.3 validateConstraints()

The `validateConstraints()` method checks a carrier against transport-specific constraints using the provided `CarrierMeta`. Implementations SHOULD delegate to the canonical `validateCarrierConstraints()` function from `@peac/schema`.

---

## 4. CarrierMeta

Transport-level metadata describing how a carrier is placed. Used by `validateConstraints()` to enforce transport-specific size limits and format requirements.

| Field       | Type                     | Required | Description                                                                  |
| ----------- | ------------------------ | -------- | ---------------------------------------------------------------------------- |
| `transport` | string                   | MUST     | Transport identifier: `'mcp'`, `'a2a'`, `'acp'`, `'ucp'`, `'x402'`, `'http'` |
| `format`    | `'embed' \| 'reference'` | MUST     | Carrier format                                                               |
| `max_size`  | number (bytes)           | MUST     | Maximum carrier size for this transport                                      |
| `redaction` | `string[]`               | MAY      | List of field names that have been redacted                                  |

---

## 5. Canonical Helpers

### 5.1 computeReceiptRef()

Computes the content-addressed receipt reference from a compact JWS string. This is the single source of truth for receipt reference computation; all carrier adapters MUST use this function rather than computing SHA-256 locally.

**Algorithm:**

```
Input:  jws (string, compact JWS format)
Output: receipt_ref (string, "sha256:<hex64>")

1. Assert crypto.subtle is available (WebCrypto runtime guard)
2. Encode jws as UTF-8 bytes
3. Compute SHA-256 digest of the bytes
4. Encode digest as lowercase hex
5. Return "sha256:" + hex
```

**Runtime portability:** Requires WebCrypto (`crypto.subtle`). Supported runtimes: Node >= 20, Cloudflare Workers, Deno, Bun. Missing `crypto.subtle` is a hard error with a diagnostic message identifying supported runtimes.

### 5.2 validateCarrierConstraints()

Validates a carrier against transport-specific constraints. This is the canonical validator that all `CarrierAdapter.validateConstraints()` implementations delegate to.

**Checks performed:**

1. `receipt_ref` format: MUST match `sha256:[a-f0-9]{64}`
2. `receipt_jws` format (if present): MUST be a valid compact JWS
3. Total serialized size: MUST NOT exceed `meta.max_size`
4. String field lengths: all optional string fields MUST NOT exceed `MAX_STRING_LENGTH`

Returns a `CarrierValidationResult` with `valid: boolean` and `violations: string[]`.

### 5.3 verifyReceiptRefConsistency()

Verifies that `receipt_ref` matches `sha256(receipt_jws)` when both are present (DD-129). This async check prevents carrier tampering after attachment.

**Algorithm:**

```
Input:  carrier (PeacEvidenceCarrier)
Output: null (consistent) | error string (inconsistent)

1. If receipt_jws is absent, return null (nothing to verify)
2. Compute expected = computeReceiptRef(receipt_jws)
3. If expected != carrier.receipt_ref, return error
4. Return null
```

---

## 6. Transport Size Limits (DD-127)

Each transport has a maximum carrier size. These limits are defined in `CARRIER_TRANSPORT_LIMITS`:

| Transport           | Max Size | Default Format | Rationale                |
| ------------------- | -------- | -------------- | ------------------------ |
| MCP (`_meta`)       | 64 KB    | embed          | JSON in memory           |
| A2A (`metadata`)    | 64 KB    | embed          | Metadata map             |
| ACP (body)          | 64 KB    | embed          | Body envelope            |
| ACP (headers)       | 8 KB     | reference      | Header limits            |
| UCP (webhook)       | 64 KB    | embed          | Webhook body             |
| x402 (body)         | 64 KB    | embed          | Offer/settlement body    |
| x402 (headers)      | 8 KB     | reference      | Header limits            |
| HTTP (headers only) | 8 KB     | reference      | Generic header transport |

---

## 7. Protocol-Specific Carrier Placement

### 7.1 MCP

Carriers are placed in the `_meta` object of JSON-RPC responses using reverse-DNS keys:

```json
{
  "_meta": {
    "org.peacprotocol/receipt_ref": "sha256:abc123...",
    "org.peacprotocol/receipt_jws": "eyJhbGciOi..."
  }
}
```

The `org.peacprotocol/` prefix is NOT reserved under MCP 2025-11-25 rules because the second label is `peacprotocol` (not `modelcontextprotocol` or `mcp`).

**Legacy compatibility (DD-125):** The `extractReceipt()` function reads BOTH the new `_meta` keys and the legacy `peac_receipt` field. New `attachReceipt()` defaults to `_meta` format; `opts.legacyFormat: true` enables legacy format.

### 7.2 A2A

Carriers are placed in the `metadata` map of A2A messages using the PEAC extension URI as the key:

```json
{
  "metadata": {
    "https://www.peacprotocol.org/ext/traceability/v1": {
      "carriers": [
        {
          "receipt_ref": "sha256:abc123...",
          "receipt_jws": "eyJhbGciOi..."
        }
      ]
    }
  }
}
```

The extension URI (`https://www.peacprotocol.org/ext/traceability/v1`) is registered in the A2A Agent Card's `capabilities.extensions[]` array per A2A spec v0.3.0.

### 7.3 ACP

Carriers are attached via HTTP headers and/or body depending on the carrier format:

- **Embed format:** Carrier JSON in the ACP message body
- **Header transport:** `PEAC-Receipt` header carries a compact JWS (never a bare `receipt_ref`)
- **Reference format:** `Link: <url>; rel="peac-receipt"` header for reference-only transport

### 7.4 UCP

Carriers are placed in the `peac_evidence` field of webhook payloads. Backward compatibility with the `extensions["org.peacprotocol/interaction@0.1"]` key is maintained.

### 7.5 x402

Carriers are embedded in the x402 offer/settlement body. The `PEAC-Receipt` HTTP header carries a compact JWS if present (never a bare `receipt_ref`). This keeps headers stable while the carrier data travels in the body.

### 7.6 HTTP (generic)

For generic HTTP transport where only headers are available:

- `PEAC-Receipt` header: MUST contain a compact JWS (never a bare `receipt_ref`)
- `Link: <url>; rel="peac-receipt"` header: for reference-only transport

---

## 8. HTTP Header Conventions

### 8.1 Canonical Header Spelling

The wire token is exactly `PEAC-Receipt` (mixed-case, hyphenated). This is the only valid spelling in conformance fixtures and `attach()` output. Alternative casings (`Peac-Receipt`, `peac-receipt`, `PEAC-RECEIPT`) are non-conformant.

HTTP header lookups in code SHOULD be case-insensitive per RFC 9110, but conformance fixtures and `attach()` output MUST use `PEAC-Receipt` exactly.

The `PEAC_RECEIPT_HEADER` constant in `@peac/kernel` provides the canonical spelling.

### 8.2 Header Content

The `PEAC-Receipt` header MUST always carry a compact JWS, never a bare `receipt_ref` or a JSON carrier object. For reference-only transport without an available JWS, use the `Link` header with `rel="peac-receipt"` instead.

---

## 9. Security Considerations

### 9.1 Carrier Validation at Extraction (DD-131, ASI-04)

Every `extract()` implementation MUST validate carrier structure before returning. This prevents poisoned extension data in `_meta`, `metadata`, or other protocol-specific containers from propagating as valid carriers. This aligns with OWASP ASI-04 (Supply Chain) defense.

### 9.2 Receipt Reference Integrity (DD-129)

When `receipt_jws` is present, mapping packages MUST verify receipt_ref consistency via `verifyReceiptRefConsistency()` in their `extractAsync()` path. Tampered carriers (where `receipt_ref` does not match `sha256(receipt_jws)`) MUST be rejected with a validation error. The sync `extract()` returns structurally valid carriers only; the async consistency check is performed by the mapping-level `extractAsync()` wrapper.

### 9.3 Size Limit Enforcement

Carriers exceeding transport size limits MUST be rejected at `attach()` time. This prevents denial-of-service via oversized carriers that could overwhelm protocol-specific containers (MCP `_meta` memory, HTTP header buffers, A2A metadata maps).

### 9.4 No Raw Prompt Leakage

Carrier fields MUST NOT contain raw user prompts, conversation context, or other sensitive content. The carrier envelope contains only receipt references, cryptographic bindings, and protocol metadata.

---

## 10. Conformance

An implementation is conformant if it:

1. Implements `CarrierAdapter<TInput, TOutput>` with correct `extract()`, `attach()`, and `validateConstraints()` methods
2. Uses `computeReceiptRef()` from `@peac/schema` for all receipt reference computation
3. Validates carrier structure at extraction time (DD-131)
4. Provides an `extractAsync()` wrapper that runs `verifyReceiptRefConsistency()` when `receipt_jws` is present (DD-129)
5. Enforces transport-specific size limits per DD-127
6. Uses `PEAC-Receipt` as the canonical header spelling (DD-127)
7. Passes all conformance fixtures in `specs/conformance/fixtures/carrier/`

---

## 11. Version History

- **v0.11.1**: Initial specification (DD-124, DD-127, DD-129, DD-131)
