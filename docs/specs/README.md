# PEAC Protocol Specifications

This directory contains the normative and informative specifications for PEAC Protocol.

## Specification Status Tiers

| Status           | Meaning                                                        |
| ---------------- | -------------------------------------------------------------- |
| **FROZEN**       | Wire format locked until v1.0 - no changes allowed             |
| **NORMATIVE**    | Stable specification - breaking changes require migration path |
| **INFORMATIVE**  | Guidance and best practices - may evolve                       |
| **EXPERIMENTAL** | Under development - subject to change                          |

See [STABILITY-POLICY.md](STABILITY-POLICY.md) for full stability guarantees.

## Core Protocol

| Specification                                | Status    | Description                                   |
| -------------------------------------------- | --------- | --------------------------------------------- |
| [PROTOCOL-BEHAVIOR.md](PROTOCOL-BEHAVIOR.md) | NORMATIVE | Core receipt format and verification behavior |
| [PEAC-ISSUER.md](PEAC-ISSUER.md)             | NORMATIVE | Issuer discovery and JWKS format              |
| [ERRORS.md](ERRORS.md)                       | NORMATIVE | Error codes and RFC 9457 problem details      |
| [VERSIONING.md](VERSIONING.md)               | NORMATIVE | Wire format versioning (`peac-receipt/0.1`)   |

## Transport and Delivery

| Specification                                      | Status    | Description                                 |
| -------------------------------------------------- | --------- | ------------------------------------------- |
| [TRANSPORT-PROFILES.md](TRANSPORT-PROFILES.md)     | NORMATIVE | Header, Body, and Pointer delivery profiles |
| [PEAC-HTTP402-PROFILE.md](PEAC-HTTP402-PROFILE.md) | NORMATIVE | HTTP 402 payment integration                |
| [X402-PROFILE.md](X402-PROFILE.md)                 | NORMATIVE | x402 protocol mapping                       |

## Security and Operations

| Specification                                            | Status    | Description                                   |
| -------------------------------------------------------- | --------- | --------------------------------------------- |
| [VERIFIER-SECURITY-MODEL.md](VERIFIER-SECURITY-MODEL.md) | NORMATIVE | SSRF protection, resource limits, error codes |
| [ISSUER-OPS-BASELINE.md](ISSUER-OPS-BASELINE.md)         | NORMATIVE | Key management, rotation, incident response   |
| [TRUST-PINNING-POLICY.md](TRUST-PINNING-POLICY.md)       | NORMATIVE | Issuer allowlists and key pinning             |
| [PRIVACY-PROFILE.md](PRIVACY-PROFILE.md)                 | NORMATIVE | Data minimization and redaction               |

## Verification and Conformance

| Specification                                                  | Status    | Description                              |
| -------------------------------------------------------------- | --------- | ---------------------------------------- |
| [VERIFICATION-REPORT-FORMAT.md](VERIFICATION-REPORT-FORMAT.md) | NORMATIVE | Deterministic verification report format |
| [CONFORMANCE-REPORT-FORMAT.md](CONFORMANCE-REPORT-FORMAT.md)   | NORMATIVE | Conformance test report format           |
| [TEST_VECTORS.md](TEST_VECTORS.md)                             | NORMATIVE | Test vectors for implementations         |

## Integration Patterns

| Specification                                              | Status      | Description                         |
| ---------------------------------------------------------- | ----------- | ----------------------------------- |
| [GATEWAY-ISSUANCE-RECIPES.md](GATEWAY-ISSUANCE-RECIPES.md) | INFORMATIVE | Cloudflare, nginx, Envoy patterns   |
| [INTEROP.md](INTEROP.md)                                   | INFORMATIVE | Interoperability guidance           |
| [HOT-PATH-RESILIENCE.md](HOT-PATH-RESILIENCE.md)           | INFORMATIVE | Performance and resilience patterns |

## Domain Extensions

| Specification                                      | Status    | Description                          |
| -------------------------------------------------- | --------- | ------------------------------------ |
| [INTERACTION-EVIDENCE.md](INTERACTION-EVIDENCE.md) | NORMATIVE | AI agent interaction evidence claims |
| [ATTRIBUTION.md](ATTRIBUTION.md)                   | NORMATIVE | Content attribution claims           |
| [WORKFLOW-CORRELATION.md](WORKFLOW-CORRELATION.md) | NORMATIVE | Multi-receipt workflow correlation   |
| [AGENT-IDENTITY.md](AGENT-IDENTITY.md)             | NORMATIVE | Agent identity claims                |
| [DISPUTE.md](DISPUTE.md)                           | NORMATIVE | Dispute resolution mechanisms        |

## Registries and Discovery

| Specification                                      | Status    | Description                          |
| -------------------------------------------------- | --------- | ------------------------------------ |
| [REGISTRIES.md](REGISTRIES.md)                     | NORMATIVE | Claim type and error code registries |
| [PEAC-TXT.md](PEAC-TXT.md)                         | NORMATIVE | DNS TXT record discovery             |
| [SCHEMA-NORMALIZATION.md](SCHEMA-NORMALIZATION.md) | NORMATIVE | JSON canonicalization rules          |

## Policy

| Specification                              | Status    | Description                                  |
| ------------------------------------------ | --------- | -------------------------------------------- |
| [STABILITY-POLICY.md](STABILITY-POLICY.md) | NORMATIVE | Stability tiers and compatibility guarantees |

## Wire Format

The receipt wire format `peac-receipt/0.1` is **FROZEN** and will not change until v1.0.

```text
Header:  {"alg":"EdDSA","typ":"peac-receipt/0.1"}
Payload: {...claims...}
Signature: Ed25519 per RFC 8032
Encoding: JWS Compact Serialization (RFC 7515)
```

## Algorithm Requirements

- Signing: Ed25519 (RFC 8032) is REQUIRED; ES256 MAY be supported for interoperability
- Digest: SHA-256 is REQUIRED for pointer profiles and content hashing
- Encoding: Base64url (RFC 4648) for JWS components
- JWK Thumbprint: RFC 7638 with SHA-256, base64url (no padding)

## Canonical URLs

- Protocol home: `https://www.peacprotocol.org`
- Error namespace: `https://www.peacprotocol.org/errors/`
- Issuer discovery: `https://<issuer>/.well-known/peac-issuer.json`
