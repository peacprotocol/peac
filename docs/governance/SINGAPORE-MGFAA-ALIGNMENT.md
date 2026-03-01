# Singapore Model Governance Framework for AI Alignment

**Framework:** Singapore IMDA Model AI Governance Framework (2nd Edition) + AI Verify
**Version:** 0.1
**Since:** v0.11.3

This document maps the Singapore Model Governance Framework for AI to PEAC Protocol capabilities.

## Framework Overview

Singapore's Model AI Governance Framework provides practical guidance for organizations deploying AI. AI Verify is the companion testing framework. PEAC provides verifiable evidence infrastructure for both governance and testing requirements.

## Principle Mapping

### Principle 1: Internal Governance Structures and Measures

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| Clear accountability | ActorBinding with organizational origin | `@peac/schema` |
| Risk management process | Control action extension with policy_ref | `@peac/schema` |
| Data management | Hash-first evidence, content signals | `@peac/schema` |
| Algorithm governance | Interaction evidence with tool_registry | `@peac/schema` |

### Principle 2: Determining AI Decision-Making Model

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| Human-in-the-loop evidence | Control action with manual_review trigger | `@peac/schema` |
| Decision recording | Control chain with full evaluation trail | `@peac/control` |
| Override capability | Control action: escalate, delegate | `@peac/schema` |

### Principle 3: Operations Management

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| Monitoring and alerting | Risk signal extension | ZT Profile Pack |
| Incident response | Key revocation, credential lifecycle | `@peac/protocol` |
| Performance tracking | Interaction evidence (duration_ms, status) | `@peac/schema` |

### Principle 4: Stakeholder Interaction and Communication

| Requirement | PEAC Mechanism | Package |
| ----------- | -------------- | ------- |
| Transparency to users | Purpose declaration, agent identity in receipts | `@peac/protocol` |
| Explanation of decisions | Control chain reasons | `@peac/control` |
| Feedback mechanisms | Dispute bundles for disagreement resolution | `@peac/audit` |

## AI Verify Testing Framework Alignment

| AI Verify Pillar | PEAC Evidence |
| ---------------- | ------------- |
| Transparency | Receipt chains, control chain reasons, MVIS identity |
| Safety | Risk signal observations, key rotation lifecycle |
| Accountability | ActorBinding, interaction evidence, dispute bundles |
| Fairness | Control chain decision reasons (auditable) |
| Data Governance | Hash-first evidence, content signals |
| Robustness | EdDSA signatures, SSRF protection, replay resistance |
| Human Agency | Control action manual_review, escalate triggers |

## References

- Singapore IMDA Model AI Governance Framework (2nd Edition, 2020)
- AI Verify Foundation: https://aiverifyfoundation.sg/
- [ZERO-TRUST-PROFILE-PACK.md](../specs/ZERO-TRUST-PROFILE-PACK.md)
- [AGENT-IDENTITY-PROFILE.md](../specs/AGENT-IDENTITY-PROFILE.md)
