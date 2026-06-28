# Standards Compliance

**Last reviewed:** 2026-06 documentation alignment pass. Update this document and re-verify draft-tracked entries when standards advance or new releases ship.

This document is a descriptive compatibility overview for PEAC-related standards, ecosystem protocols, and content signals. It is not a certification claim and not a per-row conformance ledger.

For formal RFC, W3C, ISO/IEC, and FIPS status with code-level citation sites, see [`STANDARDS_LEDGER.md`](STANDARDS_LEDGER.md).

## Status definitions

| Status            | Meaning                                                      |
| ----------------- | ------------------------------------------------------------ |
| **Normative**     | PEAC implementation MUST conform to this standard            |
| **Compatible**    | PEAC interoperates with this standard; deviations documented |
| **Draft-tracked** | Standard is in draft; PEAC tracks the current draft version  |
| **Informational** | Referenced for context; no conformance requirement           |
| **Planned**       | Not yet implemented; tracked for a future release            |

## Cryptographic and Wire Standards

| Standard                       | Version | Status        | PEAC surface                                                                          |
| ------------------------------ | ------- | ------------- | ------------------------------------------------------------------------------------- |
| JWS (RFC 7515)                 | Current | **Normative** | `@peac/crypto`: compact JWS serialization for all signed records                      |
| JWK (RFC 7517)                 | Current | **Normative** | `@peac/crypto`, JWKS resolver: key representation and discovery                       |
| EdDSA / Ed25519 (RFC 8032)     | Current | **Normative** | `@peac/crypto`: sole signing algorithm (`alg: EdDSA`)                                 |
| JCS (RFC 8785)                 | Current | **Normative** | Policy binding: deterministic JSON canonicalization for digest comparison             |
| Base64url (RFC 4648 Section 5) | Current | **Normative** | JWS encoding: all base64url without padding                                           |
| I-JSON (RFC 7493)              | Current | **Normative** | Raw I-JSON gate on JWS header and payload bytes before parse (`@peac/crypto`, Go SDK) |

## HTTP and API Standards

| Standard                                                 | Version | Status            | PEAC surface                                                                   |
| -------------------------------------------------------- | ------- | ----------------- | ------------------------------------------------------------------------------ |
| Problem Details (RFC 9457)                               | Current | **Normative**     | API error responses: all HTTP errors use Problem Details JSON                  |
| HTTP Message Signatures (RFC 9421)                       | Current | **Compatible**    | `@peac/http-signatures`: optional request/response signing                     |
| RateLimit headers (draft-ietf-httpapi-ratelimit-headers) | Draft   | **Draft-tracked** | API rate limiting: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` |
| Sunset (RFC 8594)                                        | Current | **Compatible**    | Deprecated endpoint signaling                                                  |
| Web Linking (RFC 8288)                                   | Current | **Compatible**    | Deprecation `Link` header with `rel="deprecation"`                             |

## Identity and Discovery Standards

| Standard             | Version | Status         | PEAC surface                                               |
| -------------------- | ------- | -------------- | ---------------------------------------------------------- |
| DID Core (W3C)       | v1.0    | **Compatible** | `@peac/adapter-did`: `did:key` and `did:web` resolution    |
| DID Resolution (W3C) | v1.0    | **Compatible** | `@peac/adapter-did`: document retrieval and key extraction |

## Agent and Protocol Standards

| Standard                   | Version | Status         | PEAC surface                                                                |
| -------------------------- | ------- | -------------- | --------------------------------------------------------------------------- |
| A2A Protocol               | v1.0    | **Compatible** | `@peac/mappings-a2a`: evidence carriers for agent-to-agent exchanges        |
| MCP                        | Current | **Compatible** | `@peac/mappings-mcp`, `@peac/mcp-server`: tool-call evidence and MCP server |
| MCP Registry `server.json` | Preview | **Compatible** | MCP Registry metadata for `@peac/mcp-server`                                |

## Commerce and Payment Standards

| Standard                                     | Version         | Status            | PEAC surface                                                    |
| -------------------------------------------- | --------------- | ----------------- | --------------------------------------------------------------- |
| x402 protocol                                | Foundation spec | **Compatible**    | `@peac/adapter-x402`: offer/receipt evidence mapping (V1 + V2)  |
| paymentauth (draft-ryan-httpauth-payment-01) | Draft           | **Draft-tracked** | `@peac/mappings-paymentauth`: HTTP Payment auth scheme evidence |

## Supply Chain and Provenance Standards

| Standard         | Version | Status         | PEAC surface                                        |
| ---------------- | ------- | -------------- | --------------------------------------------------- |
| SLSA             | v1.2    | **Compatible** | `@peac/mappings-slsa`: provenance statement mapping |
| in-toto          | v1.0    | **Compatible** | `@peac/mappings-intoto`: attestation bundle mapping |
| SPDX / CycloneDX | Current | **Planned**    | Release SBOM generation                             |

## Content and Signal Standards

| Standard              | Version | Status         | PEAC surface                                                   |
| --------------------- | ------- | -------------- | -------------------------------------------------------------- |
| robots.txt (RFC 9309) | Current | **Compatible** | `@peac/mappings-content-signals`: crawl directive parsing      |
| AIPREF                | Current | **Compatible** | `@peac/mappings-aipref`: AI preference signal mapping          |
| TDM-Rep (W3C)         | Current | **Compatible** | `@peac/mappings-content-signals`: text/data mining reservation |
