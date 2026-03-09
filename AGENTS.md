# AGENTS.md

Agent-readable metadata for PEAC Protocol.

## Identity

- **Protocol**: PEAC (wire formats: `interaction-record+jwt` (current), `peac-receipt/0.1` (frozen legacy))
- **Specification**: <https://www.peacprotocol.org>
- **Key Discovery**: `iss` -> `/.well-known/peac-issuer.json` -> `jwks_uri` -> JWKS
- **Algorithm**: EdDSA (Ed25519)

## Capabilities

- **Receipt Issuance and Verification**: Signed receipts (`interaction-record+jwt` JWS) for verifiable interaction evidence
- **Purpose Declaration**: Structured intent via `PEAC-Purpose` header
- **Agent Identity**: Proof-of-control binding (see [AGENT-IDENTITY.md](docs/specs/AGENT-IDENTITY.md))
- **Policy Discovery**: Machine-readable terms at `/.well-known/peac.txt`

## Proof Methods

| Method                   | Standard | Description                   |
| ------------------------ | -------- | ----------------------------- |
| `http-message-signature` | RFC 9421 | HTTP Message Signatures       |
| `dpop`                   | RFC 9449 | DPoP token binding            |
| `mtls`                   | RFC 8705 | Mutual TLS client certificate |
| `jwk-thumbprint`         | RFC 7638 | JWK Thumbprint confirmation   |

## MCP Integration

PEAC receipts attach to MCP tool responses via the Evidence Carrier Contract.

**JSON-RPC Response (`_meta` carrier):**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [...],
    "_meta": {
      "org.peacprotocol/receipt_ref": "sha256:abc123...",
      "org.peacprotocol/receipt_jws": "eyJhbGciOiJFZERTQSIsInR5cCI6ImludGVyYWN0aW9uLXJlY29yZCtqd3QiLC..."
    }
  }
}
```

**HTTP Transport:**

```http
PEAC-Receipt: eyJhbGciOiJFZERTQSIsInR5cCI6ImludGVyYWN0aW9uLXJlY29yZCtqd3QiLC...
```

The `PEAC-Receipt` header carries a compact JWS (never a bare `receipt_ref`).

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

| Path                            | Content                         | Specification                                           |
| ------------------------------- | ------------------------------- | ------------------------------------------------------- |
| `/.well-known/peac.txt`         | Policy manifest                 | [PEAC-TXT.md](docs/specs/PEAC-TXT.md)                   |
| `/.well-known/peac-issuer.json` | Issuer config and key discovery | [PEAC-ISSUER.md](docs/specs/PEAC-ISSUER.md)             |
| `/.well-known/agent-card.json`  | A2A Agent Card (PEAC extension) | [DISCOVERY-PROFILE.md](docs/specs/DISCOVERY-PROFILE.md) |

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

- **Specification**: <https://www.peacprotocol.org>
- **Repository**: <https://github.com/peacprotocol/peac>
- **Issues**: <https://github.com/peacprotocol/peac/issues>
