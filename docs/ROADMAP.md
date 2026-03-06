# PEAC Protocol Roadmap

## Current Release: v0.11.3

**Wire Format:** `peac-receipt/0.1` (stable, frozen until v1.0)

### Key Capabilities

- Receipt issuance and verification (TypeScript + Go)
- MCP server with 5 tools (verify, inspect, decode, issue, bundle)
- Evidence Carrier Contract across 5 transports (MCP, A2A, ACP, UCP, x402)
- Zero Trust Profile Pack: 7 sub-profiles as documentation overlays
- Agent Identity Profile: 8 proof types, ActorBinding, MVIS, RATS/EAT alignment
- Key rotation lifecycle: FSM, 30-day overlap, kid reuse detection, emergency revocation
- Reconciliation CLI: evidence bundle merge and conflict detection
- ZT extension schemas: credential_event, tool_registry, control_action, treaty
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
- 8 governance framework mappings (NIST AI RMF, EU AI Act, OWASP ASI, ISO 42001, IEEE 7001, OECD, Singapore MGFAA)
- 156 design decisions, 5400+ tests across 28+ packages on npm

## Next: v0.12.0-preview.1 (Wire Format 0.2 Preview)

| Theme            | Deliverables                                                                |
| ---------------- | --------------------------------------------------------------------------- |
| Wire 0.2 Kernel  | 2 structural kinds (`evidence` / `challenge`) + open semantic `type`        |
| Pillar Taxonomy  | Multi-valued `pillars` field (closed 10-value vocabulary)                   |
| Extension Groups | Typed extension groups (commerce, access, challenge, identity, correlation) |
| Policy Binding   | Full `peac.policy` block with typed digest                                  |
| Conformance      | Wire 0.2 conformance vectors                                                |

Wire 0.2 will ship as a preview release (`next` npm tag) first, with Wire 0.1 remaining the stable default. Promotion criteria: 2+ independent ecosystem integrations, performance targets met, security review complete.

## Version History

See [GitHub Releases](https://github.com/peacprotocol/peac/releases) for detailed release notes.

| Version  | Date        | Highlights                                                                                     |
| -------- | ----------- | ---------------------------------------------------------------------------------------------- |
| v0.11.3  | Mar 2, 2026 | Zero Trust profiles, agent identity, key rotation, reconcile CLI, governance mappings          |
| v0.11.2  |             | Error recovery hints, content signals, OpenAI adapter, evidence locators, MCP server manifests |
| v0.11.1  |             | Evidence Carrier Contract, A2A/MCP/ACP/UCP/x402 carrier adoption, discovery profile            |
| v0.11.0  |             | Zod 4 migration, MCP Streamable HTTP transport, kernel constraints, OWASP ASI alignment        |
| v0.10.13 |             | MCP server (5 tools), handler-transport separation, SSRF prevention                            |
| v0.10.x  |             | Capture pipeline, supply chain hardening, dev toolchain modernization                          |
| v0.9.x   | 2025        | Core protocol, attestations, Go SDK, Policy Kit                                                |

## Design Principles

- **Portable:** Receipts verify offline with no network calls
- **Rail-neutral:** Evidence only; never custody, settlement, or identity mandates
- **Transport-agnostic:** Same receipt format works across MCP, A2A, HTTP, x402
- **Fail-closed:** Invalid or missing evidence is always a verification failure
- **Additive:** Extensions use reverse-DNS namespacing; unknown keys pass through
