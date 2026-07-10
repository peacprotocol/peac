# When Not to Use PEAC

> Status: Current

PEAC Protocol produces portable signed records of what happened during automated interactions. It is not a general-purpose infrastructure tool. This document describes scenarios where PEAC is the wrong choice.

## When internal logging is sufficient

If all parties to an interaction are within the same organization and trust boundary, and there is no requirement for portable or independently verifiable evidence, standard application logging (structured logs, APM, SIEM) is simpler and more appropriate. PEAC is designed for evidence that crosses organizational boundaries.

## When you need a payment rail

PEAC records evidence of payment-related interactions (authorization, capture, settlement). It does not move money, authorize transactions, or settle payments. If you need a payment rail, use Stripe, x402, or your existing payment processor. PEAC can record evidence of what happened on that rail.

## When you need agent messaging or orchestration

PEAC does not route messages, coordinate tasks, or manage agent lifecycles. For agent-to-agent communication, use A2A or another dedicated agent communication protocol. For model and tool integration, use MCP. PEAC records can accompany those protocols, but PEAC does not replace them.

## When you need policy evaluation or enforcement

PEAC records what terms applied. It does not evaluate or enforce policies. If you need a policy engine, use OPA/Rego, Cedar, or your organization's policy framework. PEAC's `policy_binding` feature records that a specific policy was in effect, but it does not decide whether an action is allowed.

## When you need real-time observability

PEAC records are signed artifacts created after an interaction completes. They are not designed for real-time monitoring, alerting, or streaming telemetry. For real-time observability, use OpenTelemetry, Datadog, Grafana, or equivalent. PEAC complements observability by providing offline-verifiable evidence that survives system restarts and organizational boundaries.

## When you need identity management

PEAC does not perform identity proofing, credential issuance, account lifecycle management, or directory management. It verifies records using externally established identifiers, keys, and trust material; it does not determine the real-world identity or authority behind them. If you need identity infrastructure, use your organization's IdP, DID methods, or key management system.

## When you need runtime governance enforcement

PEAC records what runtime governance systems decided. It does not enforce policies, manage sandboxes, evaluate trust, or make allow/deny decisions. If you need runtime governance enforcement, use Microsoft Agent Governance Toolkit, your managed runtime's native controls, or a dedicated policy engine. PEAC can record signed, portable records of what those systems reported, enabling cross-boundary verification by third parties.

## When you need a trust score or reputation system

PEAC provides raw, verifiable records. It does not compute trust scores, reputation metrics, or risk assessments. Use a dedicated reputation system or applicable external registry. PEAC records may serve as signed inputs to that system, but PEAC does not calculate, aggregate, endorse, or enforce reputation scores.

## When a simpler format is enough

If your use case requires only a signed timestamp or a simple attestation with no structured claims, extension groups, or cross-boundary portability, a plain JWS with a minimal payload may be sufficient. PEAC's value is in its structured claim model, wire format stability, and transport-neutral carrier contract. If you do not need those, the protocol overhead may not be justified.

## When you need encrypted evidence storage or selective disclosure

If your requirement is to keep record contents confidential at rest or to
disclose only selected fields to different parties, that is a layer above
PEAC, not inside it. PEAC's posture is redaction and digest-binding:
record only what should be retained, and bind externally retained
material by digest where appropriate. Where a profile defines it (for
example, the provisioning-lifecycle profile's never-capture policy), use
it.

External systems can encrypt whole PEAC records or produce separate
disclosure or zero-knowledge artifacts that bind to a PEAC record or its
digest. PEAC does not define field-level selective-disclosure or
zero-knowledge formats. Some constructions require additional
issuance-time commitments, alternate signature formats, or proof systems
that are outside the PEAC wire format.

## Summary

PEAC is the right tool when you need:

- Signed, portable evidence of what happened during an automated interaction
- Offline verification without contacting the issuer at verify time
- Evidence that crosses organizational boundaries (different teams, companies, or trust domains)
- Structured claims with typed extensions (commerce, consent, identity, etc.)
- A neutral record protocol that works across MCP, A2A, x402, ACP, UCP, gRPC, and HTTP

PEAC is the wrong tool when you need infrastructure that PEAC intentionally does not provide: payment rails, agent messaging, policy engines, real-time observability, identity management, or reputation scoring.
