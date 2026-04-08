# When Not to Use PEAC

> Version: 0.12.7 | Status: Current

PEAC Protocol is a signed evidence layer for recording what happened during automated interactions. It is not a general-purpose infrastructure tool. This document describes scenarios where PEAC is the wrong choice.

## When internal logging is sufficient

If all parties to an interaction are within the same organization and trust boundary, and there is no requirement for portable or independently verifiable evidence, standard application logging (structured logs, APM, SIEM) is simpler and more appropriate. PEAC is designed for evidence that crosses organizational boundaries.

## When you need a payment rail

PEAC records evidence of payment-related interactions (authorization, capture, settlement). It does not move money, authorize transactions, or settle payments. If you need a payment rail, use Stripe, x402, or your existing payment processor. PEAC can record evidence of what happened on that rail.

## When you need agent messaging or orchestration

PEAC does not route messages, coordinate tasks, or manage agent lifecycles. For agent-to-agent communication, use A2A (Google/Linux Foundation), MCP (Anthropic), or ACP (OpenAI). PEAC can carry evidence alongside those protocols, but it does not replace them.

## When you need policy evaluation or enforcement

PEAC records what terms applied. It does not evaluate or enforce policies. If you need a policy engine, use OPA/Rego, Cedar, or your organization's policy framework. PEAC's `policy_binding` feature records that a specific policy was in effect, but it does not decide whether an action is allowed.

## When you need real-time observability

PEAC receipts are signed artifacts created after an interaction completes. They are not designed for real-time monitoring, alerting, or streaming telemetry. For real-time observability, use OpenTelemetry, Datadog, Grafana, or equivalent. PEAC complements observability by providing offline-verifiable evidence that survives system restarts and organizational boundaries.

## When you need identity management

PEAC does not issue, verify, or manage identities. It uses existing identity systems (Ed25519 keys, DIDs, JWKS) to sign and verify receipts. If you need identity infrastructure, use your organization's IdP, DID methods, or key management system. PEAC's `actor` and `iss` fields reference identities but do not create them.

## When you need a trust score or reputation system

PEAC provides raw, verifiable evidence. It does not compute trust scores, reputation metrics, or risk assessments. If you need reputation, use ERC-8004, Observer Protocol, or a dedicated reputation layer. PEAC evidence can serve as input to a reputation system, but it does not replace one.

## When a simpler format is enough

If your use case requires only a signed timestamp or a simple attestation with no structured claims, extension groups, or cross-boundary portability, a plain JWS with a minimal payload may be sufficient. PEAC's value is in its structured claim model, wire format stability, and transport-neutral carrier contract. If you do not need those, the protocol overhead may not be justified.

## Summary

PEAC is the right tool when you need:

- Signed, portable evidence of what happened during an automated interaction
- Offline verification without contacting the issuer at verify time
- Evidence that crosses organizational boundaries (different teams, companies, or trust domains)
- Structured claims with typed extensions (commerce, consent, identity, etc.)
- A neutral evidence layer that works across MCP, A2A, x402, ACP, UCP, gRPC, and HTTP

PEAC is the wrong tool when you need infrastructure that PEAC intentionally does not provide: payment rails, agent messaging, policy engines, real-time observability, identity management, or reputation scoring.
