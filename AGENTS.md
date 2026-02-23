# AGENTS.md

Agent-readable metadata for PEAC Protocol.

## Identity

- **Protocol**: PEAC (wire format: `peac-receipt/0.1`)
- **Specification**: https://www.peacprotocol.org/specs/agent-identity
- **Key Directory**: Discovered via `/.well-known/jwks.json` or `Link` header with `rel="jwks"`
- **Algorithms**: EdDSA (Ed25519)

## Capabilities

PEAC Protocol provides:

- **Receipt Verification**: Cryptographic proof of access decisions
- **Purpose Declaration**: Structured intent via `PEAC-Purpose` header
- **Agent Identity**: Proof-of-control binding with `operator` and `user-delegated` control types
- **Policy Evaluation**: Profile-based access control (strict/balanced/open)

## Proof Methods

Supported agent proof methods:

| Method                   | Standard | Description                   |
| ------------------------ | -------- | ----------------------------- |
| `http-message-signature` | RFC 9421 | HTTP Message Signatures       |
| `dpop`                   | RFC 9449 | DPoP token binding            |
| `mtls`                   | RFC 8705 | Mutual TLS client certificate |
| `jwk-thumbprint`         | RFC 7638 | JWK Thumbprint confirmation   |

## MCP Integration

PEAC receipts are attached to MCP (Model Context Protocol) messages via the Evidence Carrier Contract.

**JSON-RPC Response (`_meta` carrier, v0.11.1+):**

Per MCP specification (2025-11-25), use reverse-DNS keys in `_meta` to avoid collisions.
The `org.peacprotocol/` prefix is not reserved (second label is `peacprotocol`, not `modelcontextprotocol` or `mcp`).

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [...],
    "_meta": {
      "org.peacprotocol/receipt_ref": "sha256:abc123...",
      "org.peacprotocol/receipt_jws": "eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMtcmVjZWlwdC8wLjEifQ...",
      "org.peacprotocol/agent_id": "assistant:example",
      "org.peacprotocol/verified_at": "2026-01-30T12:00:00Z"
    }
  }
}
```

**Legacy format (v0.10.13):** The `org.peacprotocol/receipt` key (JWS string without `receipt_ref`) is still readable for backward compatibility. New integrations SHOULD use the carrier format above.

**HTTP Transport:**

```http
PEAC-Receipt: eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMtcmVjZWlwdC8wLjEifQ...
```

The `PEAC-Receipt` header always carries a compact JWS (never a bare `receipt_ref`).

## A2A Agent Card Extension

For A2A (Agent-to-Agent Protocol, Linux Foundation) discovery via `/.well-known/agent-card.json` (v0.3.0):

**Agent Card (`capabilities.extensions[]` array per A2A v0.3.0):**

```json
{
  "name": "Example Agent",
  "url": "https://agent.example",
  "capabilities": {
    "extensions": [
      {
        "uri": "https://www.peacprotocol.org/ext/traceability/v1",
        "description": "PEAC evidence traceability for agent interactions",
        "required": false
      }
    ]
  }
}
```

**Evidence carrier in A2A metadata (TaskStatus, Message, Artifact):**

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

The extension URI key maps to a nested object containing the carrier array. This follows the A2A v0.3.0 metadata convention.

## Discovery

| Path                            | Content                                      |
| ------------------------------- | -------------------------------------------- |
| `/.well-known/peac.txt`         | PEAC discovery manifest                      |
| `/.well-known/peac-issuer.json` | PEAC issuer configuration                    |
| `/.well-known/peac-policy.yaml` | Policy document                              |
| `/.well-known/jwks.json`        | JWKS key directory                           |
| `/.well-known/agent-card.json`  | A2A Agent Card (v0.3.0, with PEAC extension) |

## Purpose Tokens

Canonical PEAC purpose vocabulary:

| Token         | Description                    |
| ------------- | ------------------------------ |
| `train`       | Model training data collection |
| `search`      | Traditional search indexing    |
| `user_action` | Agent acting on user behalf    |
| `inference`   | Runtime inference / RAG        |
| `index`       | Content indexing (store)       |

## Contact

- **Specification**: https://www.peacprotocol.org
- **Repository**: https://github.com/peacprotocol/peac
- **Issues**: https://github.com/peacprotocol/peac/issues
