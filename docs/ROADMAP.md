# PEAC Protocol Roadmap

## Current Release: v0.9.23

Shipped:

- Policy Profiles - Pre-built policy templates (news-media, api-provider, open-source, saas-docs)
- Decision Enforcement - enforceDecision() with strict review semantics
- CLI profile commands - list-profiles, show-profile, --profile flag
- Build-time YAML->TypeScript compilation with CI drift check
- Tarball smoke test for publish verification

## Version History

| Version | Highlights                                                  |
| ------- | ----------------------------------------------------------- |
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

| Version  | Theme          | Key Deliverables                                       |
| -------- | -------------- | ------------------------------------------------------ |
| v0.9.24  | Adoption       | Purpose vocabulary, policy profiles, robots.txt bridge |
| v0.9.25  | Infrastructure | Agent identity (HTTP signatures), Go SDK (verifier)    |
| v0.9.26  | Credibility    | Attribution, conformance suite, registry publish       |
| v0.9.27  | Resolution     | Dispute and audit                                      |
| v0.9.28+ | Distribution   | Edge workers, full Go SDK, WebSocket transport         |
| v0.10.0  | GA             | Wire format freeze, multi-implementation validation    |

## Future Development

For the latest release notes and shipped features, see [GitHub Releases](https://github.com/peacprotocol/peac/releases).
