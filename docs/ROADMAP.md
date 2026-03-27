# PEAC Protocol Roadmap

## Current Release: v0.12.5

**Wire Format:** Interaction Record format (`interaction-record+jwt`, Wire 0.2, stable since v0.12.0). Legacy `peac-receipt/0.1` (Wire 0.1) frozen until v1.0.

### Key Capabilities

- Receipt issuance and verification (TypeScript + Go)
- Interaction Record format (Wire 0.2): 2 structural kinds (`evidence`/`challenge`), open semantic `type`, multi-valued `pillars` (10-pillar closed taxonomy)
- 12 typed extension groups with type-to-extension enforcement
- Policy binding: JCS (RFC 8785) + SHA-256, 3-state verification result
- JOSE hardening: Ed25519 only, reject embedded keys, `crit`, `b64:false`, `zip`
- 9 pillar usage profiles as documentary overlays
- MCP server with 5 tools (verify, inspect, decode, issue, bundle)
- Evidence Carrier Contract across 5 transports (MCP, A2A, ACP (Agentic Commerce Protocol), UCP, x402)
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
- 185 design decisions, 6428 tests across 28 packages on npm

## Next: v0.12.3 (Truth, Adoption, and A2A v1.0 Readiness)

| Theme            | Deliverables                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Truth Lock       | Public doc sync, version reconciliation, stale-claim fixes across all surfaces                   |
| A2A v1.0         | Dual-version transition normalizer for A2A v1.0.0 Agent Card, enums, parts model                 |
| Adoption Surface | Canonical "Start Here" decision tree, persona quickstarts, integration kit completion (A2A, MCP) |
| Distribution     | MCP Registry, Smithery, mcpservers.org, mcp.so, awesome-mcp-servers submissions                  |
| Standards        | NIST NCCoE Agent Identity submission (April 2, 2026 deadline)                                    |
| Measurement      | Weekly market loop baseline, proof-of-action discipline                                          |

## Planned: v0.12.4 (Semantic Corrections + Integration Depth)

| Theme              | Deliverables                                                                          |
| ------------------ | ------------------------------------------------------------------------------------- |
| UCP Semantics      | Order-vs-payment separation: commerce extension only for real PSP settlement evidence |
| ACP Semantics      | Checkout/session vs delegated payment split with fail-closed rail validation          |
| Integration Kits   | x402 and ACP integration kits                                                         |
| Language Expansion | Go SDK publication, Python SDK minimal slice (gated on v0.12.3 adoption signal)       |
| Adapters           | adapter-did (DID document resolution)                                                 |

## Planned: v0.12.5 (Supply Chain + Strategic Bridges)

| Theme         | Deliverables                                      |
| ------------- | ------------------------------------------------- |
| Supply Chain  | in-toto predicate, SLSA provenance mapping        |
| Bridges       | AP2/ERC-8004/ERC-8128 bridges                     |
| Observability | OTel tracing expansion                            |
| Examples      | Mem0 verifiable memory, content signals streaming |

## Planned: v0.12.6+ (Governance / Registry / Strategic)

| Theme      | Deliverables                                                    |
| ---------- | --------------------------------------------------------------- |
| Governance | Governance export (ISO 42001, NIST AI RMF), EU AI Act packaging |
| Registry   | SCITT registration, evidence registry                           |
| On-Chain   | Solidity verifier, OPA bridge, W3C VC wrapper                   |

## Version History

See [GitHub Releases](https://github.com/peacprotocol/peac/releases) for detailed release notes.

| Version           | Date         | Highlights                                                                                     |
| ----------------- | ------------ | ---------------------------------------------------------------------------------------------- |
| v0.12.2           | Mar 16, 2026 | Profile-defined types, 12 extension groups, type-to-extension enforcement, 9 pillar profiles   |
| v0.12.1           | Mar 14, 2026 | x402 upstream wire sync, 4-layer adapter architecture, security hardening                      |
| v0.12.0           | Mar 9, 2026  | Interaction Record format (Wire 0.2) promoted to stable, 28 packages on npm                    |
| v0.12.0-preview.2 | Mar 6, 2026  | Release integrity, EAT passport adapter, quality gates hardening                               |
| v0.12.0-preview.1 | Mar 3, 2026  | Wire 0.2 preview: 2 structural kinds, policy binding, JOSE hardening                           |
| v0.11.3           | Mar 2, 2026  | Zero Trust profiles, agent identity, key rotation, reconcile CLI, governance mappings          |
| v0.11.2           | Feb 25, 2026 | Error recovery hints, content signals, OpenAI adapter, evidence locators, MCP server manifests |
| v0.11.1           | Feb 24, 2026 | Evidence Carrier Contract, A2A/MCP/ACP/UCP/x402 carrier adoption, discovery profile            |
| v0.11.0           | Feb 23, 2026 | Zod 4 migration, MCP Streamable HTTP transport, kernel constraints, OWASP ASI alignment        |
| v0.10.13          | Feb 19, 2026 | MCP server (5 tools), handler-transport separation, SSRF prevention                            |
| v0.10.x           |              | Capture pipeline, supply chain hardening, dev toolchain modernization                          |
| v0.9.x            | 2025         | Core protocol, attestations, Go SDK, Policy Kit                                                |

## Design Principles

- **Portable:** Receipts verify offline with no network calls
- **Rail-neutral:** Evidence only; never custody, settlement, or identity mandates
- **Transport-agnostic:** Same receipt format works across MCP, A2A, HTTP, x402
- **Fail-closed:** Invalid or missing evidence is always a verification failure
- **Additive:** Extensions use reverse-DNS namespacing; unknown keys pass through
