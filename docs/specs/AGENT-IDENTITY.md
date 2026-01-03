# PEAC Agent Identity Specification

**Version:** 0.9.25
**Status:** Normative
**Last Updated:** 2026-01-04

## Table of Contents

1. [Overview](#1-overview)
2. [AgentIdentityAttestation Object](#2-agentidentityattestation-object)
3. [Proof-of-Control Binding](#3-proof-of-control-binding)
4. [Binding Message Construction](#4-binding-message-construction)
5. [Verification Algorithm](#5-verification-algorithm)
6. [Key Rotation Semantics](#6-key-rotation-semantics)
7. [Key Directory Discovery](#7-key-directory-discovery)
8. [Error Taxonomy](#8-error-taxonomy)
9. [Security Considerations](#9-security-considerations)

- [Appendix A: Interoperability](#appendix-a-interoperability)
- [Appendix B: CNCF Adapter Patterns](#appendix-b-cncf-adapter-patterns)

---

## 1. Overview

### 1.1 Purpose

This specification defines the **AgentIdentityAttestation** type for cryptographic proof-of-control binding in PEAC receipts. It enables publishers to distinguish between:

- **Operator-verified bots**: Agents operated by known organizations (e.g., search crawlers)
- **User-delegated agents**: Agents acting on behalf of human users (e.g., AI assistants)

### 1.2 Scope

This specification covers:

- Schema definitions for agent identity attestations
- Cryptographic binding of identity to HTTP requests
- Verification algorithms for publishers
- Key lifecycle management (rotation, revocation)
- Error codes for identity verification failures

### 1.3 Terminology

| Term             | Definition                                                   |
| ---------------- | ------------------------------------------------------------ |
| **Agent**        | Automated software making HTTP requests                      |
| **Attestation**  | Cryptographically signed claim about agent identity          |
| **Binding**      | Cryptographic link between identity and request              |
| **Control Type** | Classification of agent control (operator vs user-delegated) |
| **Proof**        | Evidence that agent controls the claimed identity            |

### 1.4 Requirements Notation

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

---

## 2. AgentIdentityAttestation Object

### 2.1 Top-Level Structure

```typescript
interface AgentIdentityAttestation {
  type: 'peac/agent-identity'; // REQUIRED: Type literal
  issuer: string; // REQUIRED: Attestation issuer URL
  issued_at: string; // REQUIRED: RFC 3339 datetime
  expires_at?: string; // OPTIONAL: RFC 3339 datetime
  ref?: string; // OPTIONAL: Verification endpoint URL
  evidence: AgentIdentityEvidence; // REQUIRED: Identity evidence
}
```

### 2.2 Evidence Structure

```typescript
interface AgentIdentityEvidence {
  agent_id: string; // REQUIRED: Stable agent identifier (1-256 chars)
  control_type: ControlType; // REQUIRED: 'operator' | 'user-delegated'
  capabilities?: string[]; // OPTIONAL: Agent capabilities (max 32)
  delegation_chain?: string[]; // OPTIONAL: Delegation chain (max 8)
  proof?: AgentProof; // OPTIONAL: Cryptographic proof
  key_directory_url?: string; // OPTIONAL: JWKS endpoint URL
  operator?: string; // OPTIONAL: Operator organization name
  user_id?: string; // OPTIONAL: Opaque user identifier
  metadata?: Record<string, JsonValue>; // OPTIONAL: Additional metadata
}
```

### 2.3 Control Types

| Control Type     | Description                          | Use Case                          |
| ---------------- | ------------------------------------ | --------------------------------- |
| `operator`       | Bot operated by a known organization | Search crawlers, monitoring bots  |
| `user-delegated` | Agent acting on behalf of a user     | AI assistants, browser extensions |

### 2.4 Field Constraints

| Field               | Type     | Constraints                              |
| ------------------- | -------- | ---------------------------------------- |
| `agent_id`          | string   | 1-256 characters, REQUIRED               |
| `control_type`      | enum     | 'operator' or 'user-delegated', REQUIRED |
| `capabilities`      | string[] | Max 32 items, each max 64 chars          |
| `delegation_chain`  | string[] | Max 8 items, each max 256 chars          |
| `key_directory_url` | string   | Valid URL, max 2048 chars                |

---

## 3. Proof-of-Control Binding

### 3.1 Proof Structure

```typescript
interface AgentProof {
  method: ProofMethod; // REQUIRED: Proof method
  key_id: string; // REQUIRED: Key identifier (1-256 chars)
  alg?: string; // OPTIONAL: Algorithm (default: 'EdDSA')
  signature?: string; // OPTIONAL: Base64url signature
  dpop_proof?: string; // OPTIONAL: DPoP proof JWT
  cert_thumbprint?: string; // OPTIONAL: Certificate thumbprint
  binding?: BindingDetails; // OPTIONAL: Request binding details
}
```

### 3.2 Proof Methods

| Method                   | Standard | Description                       |
| ------------------------ | -------- | --------------------------------- |
| `http-message-signature` | RFC 9421 | HTTP Message Signatures           |
| `dpop`                   | RFC 9449 | Demonstrating Proof of Possession |
| `mtls`                   | RFC 8705 | Mutual TLS Client Certificate     |
| `jwk-thumbprint`         | RFC 7638 | JWK Thumbprint Confirmation       |

### 3.3 Default Algorithm

Implementations MUST support Ed25519 (EdDSA) as the default signing algorithm. The `alg` field defaults to `'EdDSA'` when not specified.

### 3.4 Binding Details

When using `http-message-signature`, the binding details specify which request components are covered:

```typescript
interface BindingDetails {
  method: string; // REQUIRED: HTTP method
  target: string; // REQUIRED: Request target URI
  headers_included: string[]; // REQUIRED: Headers covered by signature
  body_hash?: string; // OPTIONAL: SHA-256 of request body
  signed_at: string; // REQUIRED: RFC 3339 datetime
}
```

---

## 4. Binding Message Construction

### 4.1 Canonical Binding Message

The binding message ties agent identity to the specific HTTP request. Agents MUST construct the binding message as follows:

```
BINDING_MESSAGE = CANONICAL_REQUEST || RECEIPT_CONTEXT

CANONICAL_REQUEST = HTTP_METHOD || "\n" ||
                    TARGET_URI || "\n" ||
                    SORTED_HEADERS || "\n" ||
                    BODY_HASH

RECEIPT_CONTEXT = issuer || "\n" ||
                  nonce || "\n" ||
                  timestamp
```

### 4.2 Field Normalization

| Field            | Normalization                                          |
| ---------------- | ------------------------------------------------------ |
| `HTTP_METHOD`    | Uppercase (GET, POST, etc.)                            |
| `TARGET_URI`     | Full URI, URL-encoded, no fragment                     |
| `SORTED_HEADERS` | Lowercase keys, sorted alphabetically, colon-separated |
| `BODY_HASH`      | Base64url-encoded SHA-256, empty string if no body     |
| `issuer`         | Verbatim from receipt context                          |
| `nonce`          | `jti` claim or dedicated nonce header                  |
| `timestamp`      | RFC 3339 format                                        |

### 4.3 Required Headers

The following headers MUST be included in binding when present:

- `host`
- `content-type` (if body present)
- `peac-purpose` (if declared)
- `peac-receipt` (if present in request)

### 4.4 Example Binding Message

```
POST
https://publisher.example/api/content
content-type:application/json
host:publisher.example
peac-purpose:inference
n4bQgYhMfWWaL28IoEbM8Qa8jG7x0QXJZJqL+w/zZdA=
https://publisher.example
req_abc123
2026-01-03T12:00:00Z
```

---

## 5. Verification Algorithm

### 5.1 Pseudocode

Publishers MUST verify identity binding using this algorithm:

```
VERIFY_IDENTITY(attestation, request, receipt_context):
  1. PARSE attestation.evidence.proof
  2. IF proof.method NOT IN supported_methods:
       RETURN IdentityError("E_IDENTITY_PROOF_UNSUPPORTED")

  3. RESOLVE public_key FROM proof.key_id:
     - Fetch JWKS from attestation.evidence.key_directory_url
     - Find key with matching kid
     - IF key not found: RETURN IdentityError("E_IDENTITY_KEY_UNKNOWN")
     - IF key expired: RETURN IdentityError("E_IDENTITY_KEY_EXPIRED")
     - IF key revoked: RETURN IdentityError("E_IDENTITY_KEY_REVOKED")

  4. RECONSTRUCT binding_message FROM request + receipt_context
     - Use same canonicalization as agent
     - MUST match proof.binding fields exactly

  5. VERIFY signature:
     - ed25519.verify(binding_message, proof.signature, public_key)
     - IF invalid: RETURN IdentityError("E_IDENTITY_SIG_INVALID")

  6. VALIDATE time bounds:
     - IF attestation.issued_at > now + clock_skew:
         RETURN IdentityError("E_IDENTITY_NOT_YET_VALID")
     - IF attestation.expires_at < now - clock_skew:
         RETURN IdentityError("E_IDENTITY_EXPIRED")

  7. VALIDATE binding freshness:
     - IF proof.binding.signed_at > now + clock_skew:
         RETURN IdentityError("E_IDENTITY_BINDING_FUTURE")
     - IF proof.binding.signed_at < now - max_binding_age:
         RETURN IdentityError("E_IDENTITY_BINDING_STALE")

  8. RETURN IdentityVerified(attestation.evidence.agent_id)
```

### 5.2 Configuration Parameters

| Parameter           | Default                    | Range   | Description                      |
| ------------------- | -------------------------- | ------- | -------------------------------- |
| `clock_skew`        | 30s                        | 0-300s  | Tolerance for clock differences  |
| `max_binding_age`   | 300s                       | 60-600s | Maximum age of binding signature |
| `supported_methods` | ["http-message-signature"] | -       | Allowed proof methods            |

### 5.3 Receipt Binding Output

When issuing a receipt for a verified agent, publishers MUST include:

```typescript
interface AgentIdentityVerified {
  agent_id: string; // From attestation
  control_type: ControlType; // 'operator' | 'user-delegated'
  verified_at: string; // When publisher verified
  key_id: string; // Which key was used
  binding_hash: string; // SHA-256 of binding message
}
```

---

## 6. Key Rotation Semantics

### 6.1 Key Lifecycle States

```
PENDING -> ACTIVE -> DEPRECATED -> RETIRED
    |         |           |            |
    |         +-----------+            +--- (removed from JWKS)
    |                     |
    +-----> ACTIVE -------+--- REVOKED (emergency)
```

| State      | Can Sign? | Can Verify? | JWKS Presence                        |
| ---------- | --------- | ----------- | ------------------------------------ |
| PENDING    | No        | No          | Optional (pre-distribution)          |
| ACTIVE     | Yes       | Yes         | MUST be present                      |
| DEPRECATED | No        | Yes         | MUST be present (during grace)       |
| RETIRED    | No        | No          | MAY be absent (after grace)          |
| REVOKED    | No        | No          | MUST NOT be present (emergency only) |

> **Note**: DEPRECATED vs RETIRED: DEPRECATED keys remain in JWKS during the grace period so in-flight attestations continue to verify. RETIRED keys have been removed after grace period. REVOKED is for emergency compromise scenarios.

### 6.2 JWKS Key Metadata

Keys in the JWKS MAY include PEAC-specific metadata:

```json
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "kid": "agent-key-2026-01",
      "x": "base64url-encoded-public-key",
      "peac:status": "active",
      "peac:valid_from": "2026-01-01T00:00:00Z",
      "peac:deprecated_at": null,
      "peac:revoked_at": null
    }
  ]
}
```

### 6.3 Rotation Protocol

**Step 1: Publish New Key (T=0)**

- Add new key with `peac:status: "pending"`
- Old key remains `peac:status: "active"`

**Step 2: Activate New Key (T=rotation_date)**

- New key becomes `peac:status: "active"`
- Old key becomes `peac:status: "deprecated"`
- Old attestations continue to verify during grace period

**Step 3: Retire Old Key (T=rotation_date + grace_period)**

- Old key becomes `peac:status: "retired"`
- MAY remove retired key from JWKS
- Grace period RECOMMENDED: 7 days minimum
- Attestations signed with retired keys may fail verification

### 6.4 Emergency Revocation

For compromised keys:

1. Remove key from JWKS immediately (no grace period)
2. Optionally set `peac:revoked_at` timestamp
3. Issue new attestations with replacement key

---

## 7. Key Directory Discovery

### 7.1 JWKS Endpoint (RECOMMENDED)

Agents SHOULD expose a JWKS endpoint at a well-known URL:

```
GET https://agent.example/.well-known/jwks.json
```

Response:

```json
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "kid": "agent-key-2026-01",
      "x": "base64url-encoded-public-key"
    }
  ]
}
```

### 7.2 Link Header Discovery

Agents MAY include a Link header pointing to their key directory:

```
Link: <https://agent.example/.well-known/jwks.json>; rel="jwks"
```

### 7.3 DID Document

For decentralized identity scenarios:

```
did:web:agent.example -> https://agent.example/.well-known/did.json
```

### 7.4 Verifier Caching Guidance

| Scenario              | Recommended TTL | Refresh Strategy                 |
| --------------------- | --------------- | -------------------------------- |
| High-traffic API      | 5 minutes       | Background refresh before expiry |
| Batch processing      | 1 hour          | Refresh on 404/unknown kid       |
| Real-time enforcement | 1 minute        | Stale-while-revalidate           |

---

## 8. Error Taxonomy

### 8.1 Error Codes

| Error Code                         | HTTP Status | Retriable | Description                   |
| ---------------------------------- | ----------- | --------- | ----------------------------- |
| `E_IDENTITY_MISSING`               | 401         | No        | No attestation in request     |
| `E_IDENTITY_INVALID_FORMAT`        | 400         | No        | Schema validation failed      |
| `E_IDENTITY_EXPIRED`               | 401         | No        | Attestation expired           |
| `E_IDENTITY_NOT_YET_VALID`         | 401         | Yes       | Future issued_at              |
| `E_IDENTITY_SIG_INVALID`           | 401         | No        | Signature verification failed |
| `E_IDENTITY_KEY_UNKNOWN`           | 401         | Yes       | Key ID not found              |
| `E_IDENTITY_KEY_EXPIRED`           | 401         | No        | Key expired                   |
| `E_IDENTITY_KEY_REVOKED`           | 401         | No        | Key revoked                   |
| `E_IDENTITY_BINDING_MISMATCH`      | 400         | No        | Binding mismatch              |
| `E_IDENTITY_BINDING_STALE`         | 401         | Yes       | Binding too old               |
| `E_IDENTITY_BINDING_FUTURE`        | 400         | No        | Future binding timestamp      |
| `E_IDENTITY_PROOF_UNSUPPORTED`     | 400         | No        | Unsupported proof method      |
| `E_IDENTITY_DIRECTORY_UNAVAILABLE` | 503         | Yes       | Key directory fetch failed    |

### 8.2 Error Response Format

Errors SHOULD follow RFC 9457 Problem Details:

```json
{
  "type": "https://peacprotocol.org/errors/identity_sig_invalid",
  "title": "Identity Signature Invalid",
  "status": 401,
  "detail": "Ed25519 signature verification failed for key 'agent-key-2026-01'",
  "instance": "/api/content/12345",
  "peac_error": {
    "code": "E_IDENTITY_SIG_INVALID",
    "key_id": "agent-key-2026-01",
    "agent_id": "bot:crawler-prod-001"
  }
}
```

---

## 9. Security Considerations

### 9.1 Replay Resistance

- Binding signatures MUST include a timestamp (`signed_at`)
- Verifiers MUST reject bindings older than `max_binding_age`
- Nonce values SHOULD be used for high-security scenarios

### 9.2 Time Synchronization

- Agents and verifiers SHOULD use NTP-synchronized clocks
- Clock skew tolerance SHOULD be 30 seconds or less
- Large clock differences indicate potential attacks

### 9.3 Key Security

- Ed25519 private keys MUST be stored securely
- Key rotation SHOULD occur at least annually
- Compromised keys MUST be revoked immediately

### 9.4 Binding Freshness

- Fresh bindings prevent request capture and replay
- `max_binding_age` of 300 seconds balances security and usability
- Batch operations MAY use longer windows with nonce protection

### 9.5 Privacy Considerations

- `user_id` SHOULD be an opaque identifier, not PII
- Delegation chains SHOULD NOT expose end-user identity
- Metadata MUST NOT contain personally identifiable information

---

## Appendix A: Interoperability

### A.1 AAIF AGENTS.md

Agent identity can be advertised via the `AGENTS.md` convention:

```markdown
# AGENTS.md

## Identity

- **Protocol**: PEAC/0.9
- **Key Directory**: https://agent.example/.well-known/jwks.json
- **Control Type**: operator
- **Capabilities**: [inference, search]

## Authentication

- **Method**: HTTP Message Signatures (RFC 9421)
- **Algorithm**: Ed25519
- **Covered Components**: @method, @target-uri, host, peac-purpose
```

### A.2 MCP Receipt Attachment

**HTTP Transport:**

```http
POST /mcp/v1/tools/invoke
Host: mcp-server.example
Mcp-Session-Id: session-abc123
PEAC-Receipt: eyJhbGciOiJFZERTQSI...
PEAC-Agent-Identity: eyJ0eXBlIjoicGVhYy9hZ2VudC1pZGVudGl0eSI...
```

**stdio Transport (JSON-RPC):**

Per MCP specification, use the `_meta` namespace with reverse-DNS key to avoid collisions:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [...],
    "_meta": {
      "org.peacprotocol/receipt": "eyJhbGciOiJFZERTQSI...",
      "org.peacprotocol/agent_id": "assistant:claude-v1",
      "org.peacprotocol/control_type": "user-delegated",
      "org.peacprotocol/verified_by": "mcp-server.example"
    }
  }
}
```

### A.3 A2A Agent Card Extension

For A2A discovery via `/.well-known/agent.json`:

```json
{
  "name": "Example Agent",
  "url": "https://agent.example",
  "authentication": {
    "schemes": ["peac-identity"]
  },
  "extensions": {
    "org.peacprotocol": {
      "version": "0.9",
      "discovery_url": "https://agent.example/.well-known/peac.txt",
      "key_directory": "https://agent.example/.well-known/jwks.json",
      "control_type": "operator",
      "receipts_endpoint": "https://agent.example/receipts"
    }
  }
}
```

---

## Appendix B: CNCF Adapter Patterns

### B.1 Envoy ext_authz

```yaml
http_filters:
  - name: envoy.filters.http.ext_authz
    typed_config:
      '@type': type.googleapis.com/envoy.extensions.filters.http.ext_authz.v3.ExtAuthz
      grpc_service:
        envoy_grpc:
          cluster_name: peac-authz
```

The adapter:

1. Extracts `peac-agent-identity` header (Envoy normalizes to lowercase)
2. Verifies identity attestation
3. Sets verified claims in request context for upstream

> **Note**: Envoy normalizes HTTP/2 headers to lowercase. Use `peac-agent-identity` in lookups.

### B.2 OPA Policy Example

```rego
package peac.identity

default allow = false

allow {
  # Envoy normalizes header names to lowercase
  identity := input.attributes.request.http.headers["peac-agent-identity"]
  verified := peac.verify_identity(identity)
  verified.valid == true
  verified.control_type == "operator"
  verified.agent_id in data.allowed_agents
}
```

### B.3 SPIFFE Identity Profile

PEAC identity can be issued as a SPIFFE ID:

```
spiffe://peacprotocol.org/agent/bot:crawler-prod-001
```

### B.4 OpenTelemetry Correlation

```typescript
span.setAttribute('peac.agent_id', verifiedIdentity.agent_id);
span.setAttribute('peac.control_type', verifiedIdentity.control_type);
span.setAttribute('peac.key_id', verifiedIdentity.key_id);
```

Baggage header:

```
baggage: peac-agent-id=bot%3Acrawler-prod-001,peac-control-type=operator
```

---

## References

- RFC 2119: Key words for use in RFCs
- RFC 3339: Date and Time on the Internet
- RFC 7638: JSON Web Key (JWK) Thumbprint
- RFC 8705: OAuth 2.0 Mutual-TLS Client Authentication
- RFC 9421: HTTP Message Signatures
- RFC 9449: OAuth 2.0 Demonstrating Proof of Possession
- RFC 9457: Problem Details for HTTP APIs
- RFC 9651: Structured Field Values for HTTP (supersedes RFC 8941)
