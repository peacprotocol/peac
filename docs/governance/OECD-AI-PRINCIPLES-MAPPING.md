# OECD AI Principles Mapping

**Framework:** OECD Recommendation on Artificial Intelligence (2019, updated 2024)
**Version:** 0.1
**Since:** v0.11.3

This document maps the OECD AI Principles to PEAC Protocol capabilities.

## Framework Overview

The OECD AI Principles provide values-based principles and policy recommendations for trustworthy AI. They are adopted by 46 countries and serve as the basis for many national AI strategies. PEAC provides verifiable evidence infrastructure aligned with these principles.

## Principle Mapping

### Principle 1: Inclusive Growth, Sustainable Development, and Well-Being

| Aspect | PEAC Mechanism |
| ------ | -------------- |
| Benefit tracking | Receipt evidence of AI-assisted interactions |
| Impact measurement | Interaction evidence with structured outcomes |
| Stakeholder inclusion | Open protocol (vendor-neutral, interoperable) |

### Principle 2: Human-Centred Values and Fairness

| Aspect | PEAC Mechanism | Package |
| ------ | -------------- | ------- |
| Privacy protection | Hash-first evidence (SHA-256 digests, no raw PII) | `@peac/schema` |
| Non-discrimination evidence | Control chain recording decision reasons | `@peac/control` |
| Human override | Control action with manual_review trigger | `@peac/schema` |
| Consent recording | Purpose declaration + content signals | `@peac/protocol` |

### Principle 3: Transparency and Explainability

| Aspect | PEAC Mechanism | Package |
| ------ | -------------- | ------- |
| Disclosure of AI use | Agent identity in receipt `sub` claim | `@peac/kernel` |
| Decision explanation | Control chain with reasons per step | `@peac/control` |
| Data provenance | Content signals source precedence | `@peac/mappings-content-signals` |
| Audit trail | Signed receipts with offline verification | `@peac/protocol` |

### Principle 4: Robustness, Security, and Safety

| Aspect | PEAC Mechanism | Package |
| ------ | -------------- | ------- |
| Cryptographic security | EdDSA signatures, key rotation lifecycle | `@peac/crypto` |
| SSRF protection | URL validation, private IP blocking | `@peac/protocol` |
| Replay resistance | Unique `jti` per receipt, temporal bounds | `@peac/protocol` |
| Key compromise response | Emergency revocation, revoked_keys in issuer config | `@peac/protocol` |
| Risk monitoring | Risk signal observations | ZT Profile Pack |

### Principle 5: Accountability

| Aspect | PEAC Mechanism | Package |
| ------ | -------------- | ------- |
| Actor identification | ActorBinding with 8 proof types | `@peac/schema` |
| Action attribution | Interaction evidence per tool invocation | `@peac/schema` |
| Evidence preservation | Dispute bundles with reconciliation | `@peac/audit`, `@peac/cli` |
| Deterministic reporting | Reconcile CLI `--format json` output | `@peac/cli` |
| Identity completeness | MVIS enforcement (5 required fields) | `@peac/schema` |

## OECD Policy Recommendations

| Recommendation | PEAC Alignment |
| -------------- | -------------- |
| Investing in AI R&D | Open-source protocol; permissive licensing |
| Fostering a digital ecosystem | Interoperable evidence carriers (MCP, A2A, HTTP, x402) |
| Providing an enabling policy environment | Policy discovery via `peac.txt` and `peac-issuer.json` |
| Building human capacity | Plugin Pack for developer tools |
| International cooperation | Vendor-neutral, standards-aligned (RFC 8032, RFC 9711) |

## References

- OECD Recommendation on Artificial Intelligence (OECD/LEGAL/0449)
- [ZERO-TRUST-PROFILE-PACK.md](../specs/ZERO-TRUST-PROFILE-PACK.md)
- [AGENT-IDENTITY-PROFILE.md](../specs/AGENT-IDENTITY-PROFILE.md)
