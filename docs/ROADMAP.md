# PEAC Protocol Roadmap

## Current Release: v0.9.25

Shipped:

- Agent Identity Attestations - `peac/agent-identity` type with proof-of-control binding
- Identity Binding - `IdentityBinding` type, `constructBindingMessage()`, `verifyIdentityBinding()`
- Control Types - `operator` (verified bots) and `user-delegated` (agents acting on behalf)
- Proof Methods - HTTP message signatures, DPoP, mTLS, JWK thumbprint
- Key Rotation - PENDING -> ACTIVE -> DEPRECATED -> REVOKED lifecycle
- Error Taxonomy - 13 `identity_*` error codes for standardized handling
- Go Middleware Guide - `docs/guides/go-middleware.md` for chi/gin integration

## Version History

| Version | Highlights                                                  |
| ------- | ----------------------------------------------------------- |
| v0.9.25 | Agent identity attestations, Go middleware guide            |
| v0.9.24 | Purpose on wire, enforcement profiles, AIPREF mapping       |
| v0.9.23 | Policy profiles, decision enforcement, CLI profile commands |
| v0.9.22 | OpenTelemetry integration, telemetry hooks, privacy modes   |
| v0.9.21 | Attestations, Extensions, wire schema, DoS protection       |
| v0.9.20 | x402 adapters, card-rails, Fastly/Akamai, gRPC              |
| v0.9.19 | Razorpay adapter, MCP/ACP budget, x402 headers, examples    |
| v0.9.18 | TAP foundation, surfaces, schema normalization              |
| v0.9.17 | x402 v2, RSL 1.0, Policy Kit, subject binding               |
| v0.9.16 | CAL semantics, PaymentEvidence extensions, SubjectProfile   |
| v0.9.15 | Kernel-first architecture, package layering                 |

## Upcoming Releases

| Version  | Theme        | Key Deliverables                                      |
| -------- | ------------ | ----------------------------------------------------- |
| v0.9.26  | Credibility  | Attribution, obligations extension, conformance suite |
| v0.9.27  | Resolution   | Dispute and audit                                     |
| v0.9.28+ | Distribution | Edge workers, full Go SDK, WebSocket transport        |
| v0.10.0  | GA           | Wire format freeze, multi-implementation validation   |

## Future Development

For the latest release notes and shipped features, see [GitHub Releases](https://github.com/peacprotocol/peac/releases).
