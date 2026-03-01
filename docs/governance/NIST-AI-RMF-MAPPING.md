# NIST AI Risk Management Framework Mapping

**Framework:** NIST AI 100-1 (AI RMF 1.0) + CAISI (Companion for AI Safety and Identity)
**Version:** 0.1
**Since:** v0.11.3

This document maps NIST AI RMF functions and categories to PEAC Protocol packages and capabilities.

## Framework Overview

The NIST AI RMF organizes AI risk management into four functions: Govern, Map, Measure, and Manage. PEAC provides evidence infrastructure for the Measure and Manage functions, where verifiable records of AI system behavior are required.

## Mapping

### GOVERN Function

| Category | Subcategory                       | PEAC Relevance                               | Package          |
| -------- | --------------------------------- | -------------------------------------------- | ---------------- |
| GV-1     | Policies for AI risk management   | `peac.txt` policy declaration surfaces       | `@peac/protocol` |
| GV-2     | Accountability structures         | Control chain with decision audit trail      | `@peac/control`  |
| GV-3     | Workforce diversity and expertise | Not directly applicable                      | N/A              |
| GV-4     | Organizational commitments        | Treaty extension (`org.peacprotocol/treaty`) | `@peac/schema`   |

### MAP Function

| Category | Subcategory                  | PEAC Relevance                                         | Package          |
| -------- | ---------------------------- | ------------------------------------------------------ | ---------------- |
| MP-1     | Context establishment        | Purpose declaration (`PEAC-Purpose` header)            | `@peac/protocol` |
| MP-2     | Categorization of AI systems | Receipt `sub` identifies AI agent                      | `@peac/kernel`   |
| MP-3     | Benefits and costs           | Settlement evidence in receipts                        | `@peac/schema`   |
| MP-4     | Risks and impacts            | Risk signal extension (`org.peacprotocol/risk_signal`) | ZT Profile Pack  |
| MP-5     | Stakeholder engagement       | Not directly applicable                                | N/A              |

### MEASURE Function

| Category | Subcategory            | PEAC Relevance                              | Package                    |
| -------- | ---------------------- | ------------------------------------------- | -------------------------- |
| MS-1     | Metrics and monitoring | Interaction evidence with hashed I/O        | `@peac/schema`             |
| MS-2     | AI system evaluation   | Verification reports                        | `@peac/protocol`           |
| MS-3     | Risk tracking          | Credential event and risk signal extensions | ZT Profile Pack            |
| MS-4     | Feedback mechanisms    | Dispute bundles and reconciliation          | `@peac/audit`, `@peac/cli` |

### MANAGE Function

| Category | Subcategory            | PEAC Relevance                                               | Package          |
| -------- | ---------------------- | ------------------------------------------------------------ | ---------------- |
| MG-1     | Risk response          | Control action extension (`org.peacprotocol/control_action`) | `@peac/schema`   |
| MG-2     | Risk treatment         | Key rotation lifecycle (revocation, deprecation)             | `@peac/protocol` |
| MG-3     | Continuous improvement | Receipt chaining and workflow correlation                    | `@peac/protocol` |

## CAISI Alignment

NIST CAISI (Companion for AI Safety and Identity) extends the AI RMF with agent-specific considerations:

| CAISI Area               | PEAC Mechanism                               |
| ------------------------ | -------------------------------------------- |
| Agent identification     | ActorBinding with 8 proof types (DD-143)     |
| Action attribution       | Interaction evidence with tool_registry      |
| Delegation tracking      | Delegation chain in AgentIdentityAttestation |
| Key management           | Key rotation lifecycle (DD-148)              |
| Audit trail completeness | MVIS enforcement (DD-144)                    |
| Evidence preservation    | Dispute bundles with reconciliation          |

## References

- NIST AI 100-1: Artificial Intelligence Risk Management Framework
- NIST CAISI: AI Safety and Identity Companion (in development)
- [ZERO-TRUST-PROFILE-PACK.md](../specs/ZERO-TRUST-PROFILE-PACK.md)
- [AGENT-IDENTITY-PROFILE.md](../specs/AGENT-IDENTITY-PROFILE.md)
