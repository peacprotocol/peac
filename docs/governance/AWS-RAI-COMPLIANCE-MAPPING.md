# AWS Responsible AI Compliance Mapping

**Framework:** AWS Responsible AI practices and compliance controls
**Version:** 0.1
**Since:** v0.11.3

This document maps AWS Responsible AI compliance areas to PEAC Protocol capabilities. PEAC is vendor-neutral; this mapping demonstrates interoperability with AWS-hosted AI workloads.

## Framework Overview

AWS provides responsible AI guidance through multiple surfaces: Bedrock Guardrails, SageMaker Model Cards, and service-specific compliance controls. PEAC receipts provide the independent, portable evidence layer that persists beyond any single cloud provider.

## Compliance Area Mapping

### Model Governance

| AWS Mechanism         | PEAC Complement                                | Package         |
| --------------------- | ---------------------------------------------- | --------------- |
| SageMaker Model Cards | Interaction evidence with model reference hash | `@peac/schema`  |
| Bedrock Guardrails    | Control chain recording guardrail evaluation   | `@peac/control` |
| Model registry        | Tool registry extension with registry_uri      | `@peac/schema`  |

### Data Privacy

| AWS Mechanism             | PEAC Complement                                  | Package          |
| ------------------------- | ------------------------------------------------ | ---------------- |
| Macie data classification | Hash-first evidence (no raw data in receipts)    | `@peac/schema`   |
| KMS encryption            | EdDSA signing (independent of KMS)               | `@peac/crypto`   |
| Data residency            | Issuer origin identifies processing jurisdiction | `@peac/protocol` |

### Audit and Compliance

| AWS Mechanism | PEAC Complement                               | Package                    |
| ------------- | --------------------------------------------- | -------------------------- |
| CloudTrail    | Receipt chains (portable, offline-verifiable) | `@peac/protocol`           |
| Config rules  | Conformance fixtures and verification reports | `@peac/protocol`           |
| Audit Manager | Dispute bundles, reconciliation CLI           | `@peac/audit`, `@peac/cli` |

### Identity and Access

| AWS Mechanism          | PEAC Complement                                 | Package                |
| ---------------------- | ----------------------------------------------- | ---------------------- |
| IAM roles              | ActorBinding with proof_type (SPIFFE, x509-pki) | `@peac/schema`         |
| Bedrock agent identity | ActorBinding in receipt extensions              | `@peac/schema`         |
| Cross-account access   | Multi-tenant isolation (Tier 2/3)               | Guide: multi-tenant.md |

### Monitoring and Response

| AWS Mechanism      | PEAC Complement                                | Package          |
| ------------------ | ---------------------------------------------- | ---------------- |
| CloudWatch alarms  | Risk signal extension for anomaly observations | ZT Profile Pack  |
| GuardDuty findings | Risk signal with severity and confidence       | ZT Profile Pack  |
| Incident response  | Key revocation, credential lifecycle events    | `@peac/protocol` |

## Integration Patterns

### Bedrock Agent with PEAC Receipts

1. Agent invokes tool via Bedrock
2. PEAC middleware issues receipt for tool invocation
3. Receipt includes ActorBinding with Bedrock agent identity
4. Receipt stored in S3 or returned via Evidence Carrier

### Lambda Function with Receipt Issuance

1. Lambda processes request
2. `@peac/protocol` issues receipt
3. Receipt returned in `PEAC-Receipt` response header
4. CloudTrail + PEAC receipt provide dual audit trail

### Multi-Account Receipt Isolation

Use Tier 3 (Isolated) multi-tenant model:

- Per-account `iss` origin (e.g., `https://peac.{account-alias}.example`)
- Per-account JWKS and `peac-issuer.json`
- Cross-account verification via standard issuer discovery

## Portability

PEAC receipts are portable across cloud providers:

| Property             | Benefit                                  |
| -------------------- | ---------------------------------------- |
| Offline verification | No AWS dependency for verification       |
| Standard signatures  | EdDSA (RFC 8032), not AWS-specific       |
| Open format          | JWS (RFC 7515), not proprietary          |
| Evidence carriers    | HTTP, MCP, A2A, x402 (transport-neutral) |

## References

- AWS Responsible AI: https://aws.amazon.com/ai/responsible-ai/
- [ZERO-TRUST-PROFILE-PACK.md](../specs/ZERO-TRUST-PROFILE-PACK.md)
- [multi-tenant.md](../guides/multi-tenant.md)
- [EVIDENCE-CARRIER-CONTRACT.md](../specs/EVIDENCE-CARRIER-CONTRACT.md)
