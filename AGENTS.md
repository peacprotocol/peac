# AGENTS.md

Agent-readable metadata for PEAC Protocol.

## Identity

- **Protocol**: PEAC/0.9
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

PEAC receipts can be attached to MCP (Model Context Protocol) messages:

**JSON-RPC Response (stdio transport):**

Per MCP specification, use reverse-DNS keys in `_meta` to avoid collisions:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [...],
    "_meta": {
      "org.peacprotocol/receipt": "eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMucmVjZWlwdC8wLjkifQ...",
      "org.peacprotocol/agent_id": "assistant:example",
      "org.peacprotocol/verified_at": "2026-01-04T12:00:00Z"
    }
  }
}
```

**HTTP Transport:**

```http
PEAC-Receipt: eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMucmVjZWlwdC8wLjkifQ...
PEAC-Agent-Identity: eyJ0eXBlIjoicGVhYy9hZ2VudC1pZGVudGl0eSJ9...
```

## A2A Agent Card Extension

For A2A (Agent-to-Agent) discovery via `/.well-known/agent.json`:

```json
{
  "name": "Example Agent",
  "url": "https://agent.example",
  "capabilities": ["search", "inference"],
  "extensions": {
    "org.peacprotocol": {
      "version": "0.9",
      "discovery_url": "/.well-known/peac.txt",
      "key_directory": "/.well-known/jwks.json",
      "control_type": "operator",
      "receipts_endpoint": "/api/receipts"
    }
  }
}
```

## Discovery

| Path                            | Content                              |
| ------------------------------- | ------------------------------------ |
| `/.well-known/peac.txt`         | PEAC discovery manifest              |
| `/.well-known/peac-policy.yaml` | Policy document                      |
| `/.well-known/jwks.json`        | JWKS key directory                   |
| `/.well-known/agent.json`       | A2A Agent Card (with PEAC extension) |

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
