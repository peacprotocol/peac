# Start Here

**Govern locally. Prove across boundaries.**

When logs aren't enough, PEAC gives you portable signed records anyone can verify offline.

Portable signed records for agent, API, MCP, and cross-runtime interactions.

Pick the path that matches what you are building.

## I run an API or HTTP service

You want to issue signed receipts proving what terms applied and what happened on every response.

1. Install: `pnpm add @peac/middleware-express @peac/crypto @peac/protocol`
2. Follow the [API Provider Quickstart](guides/quickstart-api-provider.md) (5 minutes)
3. See [examples/hello-world](../examples/hello-world/) for the minimal standalone version
4. Outcome-led recipe: [`docs/SOLUTIONS/api-receipt-issuance.md`](SOLUTIONS/api-receipt-issuance.md)

Key packages: `@peac/middleware-express`, `@peac/protocol`, `@peac/crypto`.

## I run an MCP server

You want to add receipt operations (verify, inspect, issue, bundle) to your MCP server, or attach signed records to tool-call responses.

1. Try it now: `npx -y @peac/mcp-server --help`
2. Read the [MCP Integration Kit](../integrator-kits/mcp/README.md) for full setup
3. See [examples/mcp-tool-call](../examples/mcp-tool-call/) for a paid-tool example
4. Outcome-led recipe: [`docs/SOLUTIONS/mcp-tool-call-receipts.md`](SOLUTIONS/mcp-tool-call-receipts.md)

Key packages: `@peac/mcp-server`, `@peac/mappings-mcp`.

## I want to verify a receipt

You have a receipt (JWS string) and want to verify it offline with a public key.

1. Install: `pnpm add @peac/protocol @peac/crypto`
2. Follow the [Agent Operator Quickstart](guides/quickstart-agent-operator.md) (5 minutes)
3. See [examples/minimal](../examples/minimal/) for typed accessor helpers
4. Self-host the reference verifier: recipes under [`surfaces/reference-verifier/`](../surfaces/reference-verifier/)

Key packages: `@peac/protocol`, `@peac/crypto`.

## I want to prove my runtime decisions

You run a managed agent runtime (or an adjacent governance system) and want to export signed records of its observations, decisions, or transitions so other parties can verify them offline.

1. Review the [runtime-governance adapter](../packages/adapters/runtime-governance/) and its conformance fixtures.
2. Outcome-led recipe: [`docs/SOLUTIONS/runtime-evidence-export.md`](SOLUTIONS/runtime-evidence-export.md)
3. See [examples/managed-agents-export](../examples/managed-agents-export/) for the Claude Managed Agents mapping.

Key packages: `@peac/adapter-runtime-governance`, `@peac/adapter-managed-agents`, `@peac/protocol`.

## I build A2A agents

You want to carry records across Agent-to-Agent Protocol flows, including handoff observations for agent-card discovery, task lifecycle, and human-review boundaries.

1. Install: `pnpm add @peac/mappings-a2a @peac/protocol @peac/crypto`
2. Read the [A2A Integration Kit](../integrator-kits/a2a/README.md) and the [A2A Handoff Records spec](specs/A2A-HANDOFF-RECORDS.md)
3. See [examples/a2a-gateway-pattern](../examples/a2a-gateway-pattern/) for the gateway pattern

Key packages: `@peac/mappings-a2a`, `@peac/protocol`.

## I record command execution

You want to create an observational record of a local command execution without turning PEAC into a shell runner or automation framework.

1. Use `peac observe command` for unsigned local observations.
2. Use `peac record command` with issuer material for signed command-execution records.
3. Read the [CLI Carrier Profile](specs/CLI-CARRIER-PROFILE.md) for capture modes, redaction defaults, and signing requirements.

Key package: `@peac/cli`.

## I emit lifecycle events from another system

You want to issue records for lifecycle events reported by another system, such as evaluation completion, approval, experiment result, mode change, or workflow transition.

1. Use `peac emit lifecycle` with caller-provided issuer material.
2. Read the [Lifecycle Observation Profile](specs/LIFECYCLE-OBSERVATION-PROFILE.md).
3. Keep lifecycle records observational: PEAC records what another system reported; it does not approve, evaluate, score, schedule, transition, or orchestrate.

Key package: `@peac/cli`.

## Integration areas

### Commerce and payment evidence

You want verifiable evidence from commerce and payment flows across x402, paymentauth / MPP (Machine Payments Protocol), ACP, Stripe SPT, or UCP. Prove what was offered, challenged, paid, or settled across organizational boundaries.

1. Choose your protocol:
   - **paymentauth / MPP**: [paymentauth Integration Kit](../integrator-kits/paymentauth/README.md)
   - **ACP**: [ACP Integration Kit](../integrator-kits/acp/README.md)
   - **x402**: [x402 Integration Kit](../integrator-kits/x402/README.md)
2. See [Commerce Evidence Spec](specs/COMMERCE-EVIDENCE.md) for boundary rules
3. See [examples/](../examples/) for runnable demos
4. Outcome-led recipe: [`docs/SOLUTIONS/commerce-evidence-bundle.md`](SOLUTIONS/commerce-evidence-bundle.md)

Key packages: `@peac/mappings-paymentauth`, `@peac/mappings-acp`, `@peac/rails-stripe`, `@peac/adapter-x402`, `@peac/mappings-ucp`.

### Audit, dispute, and governance evidence

You need signed evidence for audit, dispute review, or regulatory alignment. Evidence that survives organizational boundaries, not just local logs.

1. Start with the [API Provider Quickstart](guides/quickstart-api-provider.md) to understand issuance
2. See [Evidence Bundles](specs/EVIDENCE-CARRIER-CONTRACT.md) for offline verification bundles
3. Review [Governance Mappings](governance/) for NIST AI RMF, EU AI Act, OWASP ASI alignment
4. Outcome-led recipe: [`docs/SOLUTIONS/regulatory-audit-trail.md`](SOLUTIONS/regulatory-audit-trail.md)

Key packages: `@peac/protocol`, `@peac/audit`.

### Privacy-sensitive and regulated environments

You are deploying PEAC in a privacy-sensitive or regulated environment and want data minimization, retention caps, redaction defaults, and clear controller / processor framing. PEAC supports GDPR-aligned deployments; it does not replace operator legal review.

1. Start with [`docs/privacy/README.md`](privacy/README.md) for the boundary-first index.
2. Walk the deployment-shape table in [`docs/privacy/DEPLOYMENT-ROLES.md`](privacy/DEPLOYMENT-ROLES.md).
3. Classify surfaces with [`docs/privacy/DATA-CLASSIFICATION.md`](privacy/DATA-CLASSIFICATION.md).
4. Configure retention / deletion per [`docs/privacy/RETENTION-AND-DELETION.md`](privacy/RETENTION-AND-DELETION.md).
5. Wire a rights-handling playbook with [`docs/privacy/DATA-SUBJECT-RIGHTS.md`](privacy/DATA-SUBJECT-RIGHTS.md).
6. Screen risk with [`docs/privacy/DPIA-STARTER.md`](privacy/DPIA-STARTER.md).

Receipt-side normative profile: [`docs/specs/PRIVACY-PROFILE.md`](specs/PRIVACY-PROFILE.md).

## Core concepts

- **Receipt:** a signed JWS (`interaction-record+jwt`) proving what terms applied and what happened. The JOSE header `typ` is `interaction-record+jwt`; the HTTP request or response body is `application/json` (or the `PEAC-Receipt` HTTP header) carrying the compact JWS string.
- **Kind:** `evidence` (records what happened) or `challenge` (requests proof from a peer).
- **Type:** reverse-DNS identifier for what the receipt represents (for example `org.peacprotocol/payment`).
- **Extensions:** typed data groups (commerce, access, identity, and more) carrying domain-specific content.
- **Offline verification:** receipts verify with just the public key; no network calls required.

See [`docs/HOW-IT-WORKS.md`](HOW-IT-WORKS.md) for the end-to-end publish / issue / verify / share loop and [`docs/ARTIFACTS.md`](ARTIFACTS.md) for the full artifact taxonomy.

## What PEAC is NOT

PEAC is the records layer beneath runtime governance. It does not try to be the runtime, the control plane, or the decision maker. Explicitly:

- **PEAC is not a governance toolkit, policy engine, or runtime control plane.** Those systems (Microsoft Agent Governance Toolkit, OPA / Cedar / Rego, Claude Managed Agents, OpenAI ACP-backed runtimes, custom harnesses) decide and enforce. PEAC records what they attested.
- **PEAC is not a payment protocol.** x402, paymentauth / MPP, ACP, and Stripe SPT authorize and settle. PEAC carries verifiable observational evidence across them and never synthesizes payment finality from non-payment artifacts.
- **PEAC is not an identity protocol or trust-score system.** DIDs, VCs, ERC-8004, and reputation layers own those functions. PEAC accepts `iss` in `https://` or `did:` form and never computes trust.
- **PEAC is not an observability dashboard.** PEAC records are exportable to any observability system via `receipt_ref` as an OTel span attribute.
- **PEAC is not a CLI automation framework, eval platform, approval system, or orchestration / workflow engine.** PEAC now carries CLI command-execution records and caller-reported lifecycle observation records as record/export surfaces. PEAC records what the caller or upstream system reported; it does not choose commands, schedule work, run evaluations, decide approvals, transition workflows, or orchestrate systems.

Full protocol scope and boundary: [`docs/WHAT-PEAC-STANDARDIZES.md`](WHAT-PEAC-STANDARDIZES.md) and [`docs/WHERE-IT-FITS.md`](WHERE-IT-FITS.md).

## Package layering

```text
Layer 0: @peac/kernel       (types, constants)
Layer 1: @peac/schema       (Zod validation)
Layer 2: @peac/crypto       (Ed25519 signing)
Layer 3: @peac/protocol     (issue, verifyLocal)
Layer 4: @peac/mappings-*   (MCP, A2A, x402, and more)
Layer 5: @peac/mcp-server   (MCP server)
```

Dependencies flow down only. Start at the highest layer you need.

## Reference

- [Compatibility Matrix](COMPATIBILITY_MATRIX.md) — wire format support, runtime environments, deprecation schedule, adapter readiness with evidence tags.
- [Migration Guide](MIGRATION_CURRENT.md) — upgrade paths from Wire 0.1, `@peac/core`, legacy API.
- [Deprecation Policy](DEPRECATION_POLICY.md) — surface lifecycle, removal windows, HTTP deprecation headers.
- [Spec Index](SPEC_INDEX.md) — normative specifications.
