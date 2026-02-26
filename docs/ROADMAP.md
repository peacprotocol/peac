# PEAC Protocol Roadmap

## Current Release: v0.11.2

**Wire Format:** `peac-receipt/0.1` (stable, frozen until v1.0)

### Key Capabilities

- Receipt issuance and verification (TypeScript + Go)
- MCP server with 5 tools (verify, inspect, decode, issue, bundle)
- Evidence Carrier Contract across 5 transports (MCP, A2A, ACP, UCP, x402)
- Content signals mapping (robots.txt, AIPREF, TDM Rep)
- OpenAI-compatible inference receipt adapter (hash-first)
- Agent-retryable errors with `next_action` recovery hints
- Unified receipt parser (commerce + attestation)
- Middleware for Express.js (automatic receipt issuance)
- Conformance runner with category-aware validation
- Policy Kit for declarative access control
- Evidence bundles for offline verification
- Workflow correlation for multi-agent DAGs
- SSRF-safe networking with DNS pinning
- Streamable HTTP transport with session isolation
- Kernel constraint enforcement (fail-closed)
- 141 design decisions, 4642 tests, 28 packages on npm

## Next: v0.11.3 (Zero Trust + Identity)

| Theme                   | Deliverables                                                              |
| ----------------------- | ------------------------------------------------------------------------- |
| Zero Trust Profile Pack | Access, toolcall, decision, risk signal profiles with compliance mappings |
| Agent Identity Profile  | Multi-root proof types, ActorBinding, RATS/EAT alignment                  |
| ZT Extensions           | credential_event, tool_registry, control_action with conformance vectors  |
| Deferred from v0.11.2   | Reconciliation CLI, key rotation lifecycle spec                           |

## After Next: v0.12.0 (Wire Format 0.2)

| Theme           | Deliverables                               |
| --------------- | ------------------------------------------ |
| Wire 0.2 Kernel | `kind` discriminator with 9 receipt kinds  |
| Policy Binding  | Full `peac.policy` block with typed digest |
| Identity Types  | `FingerprintRef`, `ActorBinding`           |
| Conformance     | ~35 vectors (3 per kind + 5 cross-kind)    |

Wire 0.2 will ship as a preview release (`next` npm tag) first, with Wire 0.1 remaining the stable default. Promotion criteria: 2+ independent ecosystem integrations, performance targets met, security review complete.

## Version History

See [GitHub Releases](https://github.com/peacprotocol/peac/releases) for detailed release notes.

| Version  | Date         | Highlights                                                                                     |
| -------- | ------------ | ---------------------------------------------------------------------------------------------- |
| v0.11.2  | Feb 24, 2026 | Error recovery hints, content signals, OpenAI adapter, evidence locators, MCP server manifests |
| v0.11.1  |              | Evidence Carrier Contract, A2A/MCP/ACP/UCP/x402 carrier adoption, discovery profile            |
| v0.11.0  |              | Zod 4 migration, MCP Streamable HTTP transport, kernel constraints, OWASP ASI alignment        |
| v0.10.13 |              | MCP server (5 tools), handler-transport separation, SSRF prevention                            |
| v0.10.x  |              | Capture pipeline, supply chain hardening, dev toolchain modernization                          |
| v0.9.x   | 2025         | Core protocol, attestations, Go SDK, Policy Kit                                                |

## Design Principles

- **Portable:** Receipts verify offline with no network calls
- **Rail-neutral:** Evidence only; never custody, settlement, or identity mandates
- **Transport-agnostic:** Same receipt format works across MCP, A2A, HTTP, x402
- **Fail-closed:** Invalid or missing evidence is always a verification failure
- **Additive:** Extensions use reverse-DNS namespacing; unknown keys pass through
