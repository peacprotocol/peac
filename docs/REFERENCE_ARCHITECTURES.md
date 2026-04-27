# Reference Architectures

> Version: 0.12.7 | Status: Current

This document describes three canonical deployment patterns for PEAC Protocol evidence. Each pattern shows how receipts are issued, carried, and verified across organizational boundaries.

For the package layering model, see [Architecture](ARCHITECTURE.md). For the normative issuance and verification flows, see [Protocol Behavior](specs/PROTOCOL-BEHAVIOR.md).

## 1. API Gateway Evidence Flow

An API provider issues a signed receipt for every billable or auditable API call. The receipt travels as an HTTP response header.

```
Client                    API Gateway              Backend Service
  |                          |                          |
  |  POST /v1/inference      |                          |
  |------------------------->|  forward request         |
  |                          |------------------------->|
  |                          |       response + claims   |
  |                          |<-------------------------|
  |                          |                          |
  |                          |  issue() with claims     |
  |                          |  sign with Ed25519 key   |
  |                          |  attach PEAC-Receipt hdr |
  |                          |                          |
  |  200 OK                  |                          |
  |  PEAC-Receipt: <JWS>     |                          |
  |<-------------------------|                          |
  |                          |                          |
  |  verifyLocal(jws, pubKey)|                          |
  |  (offline, no network)   |                          |
```

### Key characteristics

- Receipt is a compact JWS in the `PEAC-Receipt` response header (max 8 KB for HTTP)
- Signing key is held by the API provider; consumer verifies with the provider's public key
- Verification is offline: `verifyLocal()` requires no network I/O
- The gateway is the issuer; the backend service provides the claims (amount, purpose, model, etc.)
- Discovery: consumer resolves `/.well-known/peac-issuer.json` from the `iss` domain to obtain JWKS

### Packages involved

| Layer | Package                    | Role                                                      |
| ----- | -------------------------- | --------------------------------------------------------- |
| 3     | `@peac/protocol`           | `issue()` at the gateway; `verifyLocal()` at the consumer |
| 2     | `@peac/crypto`             | Ed25519 signing and verification                          |
| 3.5   | `@peac/middleware-express` | Express middleware for automatic receipt attachment       |
| 1     | `@peac/schema`             | Claims validation                                         |

## 2. MCP Tool-Call Evidence Flow

An MCP server issues a receipt for each tool invocation. The receipt is embedded in the MCP tool response metadata.

```
MCP Client (Claude, Cursor)     MCP Server (@peac/mcp-server)
  |                                  |
  |  tools/call: peac_verify         |
  |  { jws: "...", publicKey: "..." }|
  |--------------------------------->|
  |                                  |
  |                                  |  verifyLocal(jws, pubKey)
  |                                  |  build structured result
  |                                  |
  |  result + _meta                  |
  |  _meta:                          |
  |    org.peacprotocol/receipt_ref   |
  |    org.peacprotocol/receipt_jws   |
  |<---------------------------------|
  |                                  |
  |  extract receipt from _meta      |
  |  verify or store for audit       |
```

### Key characteristics

- Receipt is embedded in the MCP `_meta` response object (max 64 KB for MCP)
- `receipt_ref` is `sha256(receipt_jws)` for compact reference
- The MCP server is both the tool provider and the evidence issuer
- Five tools: `peac_verify`, `peac_inspect`, `peac_decode`, `peac_issue`, `peac_create_bundle`
- Transport: stdio (local) or streamable HTTP (session-isolated per CVE-2026-25536 defense)

### Packages involved

| Layer | Package              | Role                                                |
| ----- | -------------------- | --------------------------------------------------- |
| 5     | `@peac/mcp-server`   | MCP tool handlers; record issuance and verification |
| 3     | `@peac/protocol`     | `issue()` and `verifyLocal()`                       |
| 4     | `@peac/mappings-mcp` | MCP-specific carrier adapter; `_meta` key mapping   |

## 3. A2A Handoff Evidence Flow

Two agents exchange evidence during an Agent-to-Agent (A2A) task handoff. The receipt is carried in the A2A task metadata.

```
Agent A (Requester)         A2A Gateway          Agent B (Provider)
  |                            |                      |
  |  tasks/send               |                      |
  |  { task, metadata }       |                      |
  |--------------------------->|  route to Agent B    |
  |                            |--------------------->|
  |                            |                      |
  |                            |     task result      |
  |                            |     + metadata with  |
  |                            |     receipt evidence  |
  |                            |<---------------------|
  |                            |                      |
  |  task result               |                      |
  |  metadata:                 |                      |
  |    extensionURI:           |                      |
  |      carriers:             |                      |
  |        - receipt_jws       |                      |
  |        - receipt_ref       |                      |
  |<---------------------------|                      |
  |                            |                      |
  |  extract receipt           |                      |
  |  verifyLocal(jws, pubKey)  |                      |
```

### Key characteristics

- Receipt is carried in A2A task `metadata[extensionURI].carriers[]` (max 64 KB)
- Agent B is the issuer; Agent A is the verifier
- The A2A gateway routes but does not modify the evidence payload
- Supports A2A v1.0 (Linux Foundation); v0.3.0 compatibility was deprecated in v0.12.3 and removed in v0.13.0 (DD-186)
- OAuth PKCE (S256) for agent authentication; Device Code flow for non-browser agents

### Packages involved

| Layer | Package              | Role                                                               |
| ----- | -------------------- | ------------------------------------------------------------------ |
| 4     | `@peac/mappings-a2a` | A2A carrier adapter; metadata extraction and embedding             |
| 3     | `@peac/protocol`     | `issue()` and `verifyLocal()`                                      |
| 4     | `@peac/adapter-did`  | DID-based key resolution for agent identity (`did:key`, `did:web`) |

## Cross-Cutting Patterns

### Evidence carrier contract

All three architectures use the same `PeacEvidenceCarrier` interface from `@peac/kernel`. Transport-specific adapters handle embedding and extraction:

| Transport     | Carrier location                          | Size limit |
| ------------- | ----------------------------------------- | ---------- |
| HTTP headers  | `PEAC-Receipt` response header            | 8 KB       |
| MCP `_meta`   | `org.peacprotocol/receipt_jws` key        | 64 KB      |
| A2A metadata  | `metadata[extensionURI].carriers[]`       | 64 KB      |
| gRPC metadata | `peac-receipt` metadata key               | 8 KB       |
| x402 headers  | `PEAC-Receipt` + upstream `X-402-Receipt` | 8 KB       |

### Verification trust model

In all architectures, the verifier calls `verifyLocal(jws, publicKey)` with a caller-provided public key. The protocol does not perform implicit key resolution. Key discovery paths (JWKS, DID documents) are always explicit and opt-in.

### Offline verification

All three patterns support fully offline verification. Once a verifier has the issuer's public key (via JWKS, DID resolution, or direct provisioning), no network I/O is required for signature verification or claims validation.

## Related Documents

- [Architecture](ARCHITECTURE.md): Package layering, dependency DAG
- [Protocol Behavior](specs/PROTOCOL-BEHAVIOR.md): Normative issuance and verification flows
- [Evidence Carrier Contract](specs/EVIDENCE-CARRIER-CONTRACT.md): Transport-neutral carrier interface
- [Key custody and tenancy](KEY-CUSTODY-AND-TENANCY.md): Key custody, tenancy, procurement
- [Security operations](SECURITY-OPERATIONS.md): Support windows, provenance, logging
