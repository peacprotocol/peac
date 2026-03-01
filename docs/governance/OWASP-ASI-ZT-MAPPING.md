# OWASP Agentic Security Initiative Mapping

**Framework:** OWASP ASI (Agentic Security Initiative), ASI-01 through ASI-10
**Version:** 0.1
**Since:** v0.11.3

This document maps OWASP ASI security controls to PEAC Protocol mechanisms.

## Framework Overview

The OWASP Agentic Security Initiative defines ten security controls for AI agent systems. PEAC addresses these through its evidence layer, carrier contract, and zero trust profiles.

## Control Mapping

### ASI-01: Excessive Agency

| Aspect | PEAC Mechanism |
| ------ | -------------- |
| Scope limitation | Purpose declaration (`PEAC-Purpose` header) |
| Action bounding | Control chain with policy evaluation |
| Evidence | Interaction evidence capturing tool calls with hashed I/O |
| Detection | Risk signal extension for behavioral drift |
| Package | `@peac/protocol`, `@peac/schema`, ZT Profile Pack |

### ASI-02: Supply Chain Vulnerabilities

| Aspect | PEAC Mechanism |
| ------ | -------------- |
| Dependency attestation | ActorBinding with Sigstore OIDC proof type |
| Provenance tracking | Credential event extension (issued, rotated) |
| Integrity verification | Receipt signature verification (EdDSA) |
| Package | `@peac/crypto`, `@peac/schema` |

### ASI-03: Insecure Output Handling

| Aspect | PEAC Mechanism |
| ------ | -------------- |
| Output recording | Hash-first evidence (SHA-256 digests, no raw text) |
| Output verification | Interaction evidence output_hash |
| Content signals | Observation model (allow/deny/unspecified) |
| Package | `@peac/schema`, `@peac/mappings-content-signals` |

### ASI-04: Prompt Injection

| Aspect | PEAC Mechanism |
| ------ | -------------- |
| Input integrity | Interaction evidence input_hash |
| Evidence carrier validation | `receipt_ref = sha256(receipt_jws)` consistency check |
| Carrier immutability | Evidence Carrier Contract (DD-131) |
| Package | `@peac/schema`, carrier adapters |

### ASI-05: Improper Inventory Management

| Aspect | PEAC Mechanism |
| ------ | -------------- |
| Tool registry | `org.peacprotocol/tool_registry` extension |
| Agent inventory | ActorBinding with stable actor identifiers |
| Key inventory | JWKS with kid-based key management |
| Package | `@peac/schema`, `@peac/protocol` |

### ASI-06: Excessive Permissions

| Aspect | PEAC Mechanism |
| ------ | -------------- |
| Permission evidence | Control action extension (grant, deny, escalate) |
| Least privilege audit | Control chain recording actual decisions |
| Delegation tracking | Delegation chain in AgentIdentityAttestation |
| Package | `@peac/schema`, `@peac/control` |

### ASI-07: Insecure Plugin Design

| Aspect | PEAC Mechanism |
| ------ | -------------- |
| Plugin validation | MCP server skills with default-deny (Read + Bash only) |
| Plugin evidence | Tool registry extension with registry_uri |
| URL validation | HTTPS-only, SSRF prevention (DD-55) |
| Package | `@peac/mcp-server`, `@peac/schema` |

### ASI-08: Model Denial of Service

| Aspect | PEAC Mechanism |
| ------ | -------------- |
| Rate evidence | Interaction evidence with duration_ms |
| Anomaly detection | Risk signal extension for threshold breaches |
| Size limits | Verifier security limits (max receipt bytes, max claims) |
| Package | ZT Profile Pack, `@peac/protocol` |

### ASI-09: Overreliance

| Aspect | PEAC Mechanism |
| ------ | -------------- |
| Confidence recording | Interaction evidence metadata |
| Human oversight | Control action with manual_review trigger |
| Decision transparency | Control chain capturing full evaluation |
| Package | `@peac/schema`, `@peac/control` |

### ASI-10: Data Poisoning

| Aspect | PEAC Mechanism |
| ------ | -------------- |
| Input provenance | Receipt chains linking data sources |
| Hash-first integrity | SHA-256 digests for all data references |
| Source attribution | Content signals with source precedence |
| Package | `@peac/schema`, `@peac/mappings-content-signals` |

## Zero Trust Alignment

OWASP ASI presumes zero trust: no agent is trusted by default. PEAC Zero Trust Profile Pack directly supports this with:

- **Verify explicitly**: Every interaction produces a signed receipt
- **Least privilege**: Control actions record grant/deny decisions
- **Assume breach**: Risk signals record anomaly observations

## References

- OWASP Agentic Security Initiative (ASI-01 through ASI-10)
- [ZERO-TRUST-PROFILE-PACK.md](../specs/ZERO-TRUST-PROFILE-PACK.md)
- [VERIFIER-SECURITY-MODEL.md](../specs/VERIFIER-SECURITY-MODEL.md)
