# What PEAC standardizes

PEAC standardizes portable signed interaction records and the verification surfaces around them. It defines how records are issued, carried, verified, and preserved across organizational, vendor, and runtime boundaries. PEAC does not standardize the control plane, business logic, policy engine, payment rail, identity provider, or orchestration layer around those records.

For the boundary next to each adjacent system, see [`docs/WHERE-IT-FITS.md`](WHERE-IT-FITS.md).

---

## 1. Portable, offline-verifiable signed records for agent, API, MCP, and cross-runtime interactions

PEAC defines a compact JWS (JOSE `typ: interaction-record+jwt`) that any party with the issuer's public key can verify offline, without a network round-trip to the issuer. The JWS is Ed25519-signed over JCS-canonicalized claims (RFC 8785), with kernel constraints enforced fail-closed at issue and verify time.

Evidence you can point at:

- The conformance fixture corpus under [`specs/conformance/`](../specs/conformance/) covers positive and negative vectors for the core issue and verify path across Wire 0.2.
- The hello-world quickstart at [`examples/hello-world/`](../examples/hello-world/) issues a record and verifies it offline in under a minute using `@peac/protocol` and `@peac/crypto`.
- The JOSE hardening test suite at [`packages/protocol/__tests__/`](../packages/protocol/__tests__/) enforces the stability-contract rules (no embedded keys, no `crit`, no `zip`, Ed25519 only).
- Cross-language parity: the Go SDK ([`sdks/go/`](../sdks/go/)) emits byte-equivalent JCS output against 22 shared fixtures.

## 2. Cross-protocol record normalization across MCP, A2A, x402, ACP, paymentauth, and runtime-governance ecosystems

PEAC defines a single record shape that composes with every major agent, commerce, and runtime ecosystem PEAC integrates with. The adapter and mapping layer translates each ecosystem's native attestations into a Wire 0.2 record, preserves the upstream artifact verbatim, and never synthesizes semantics the upstream did not claim.

Evidence you can point at:

- The Adapter Readiness column in [`docs/COMPATIBILITY_MATRIX.md`](COMPATIBILITY_MATRIX.md) classifies every Layer-4 surface with a conservative rubric; each row carries an evidence tag pointing at per-mapper conformance fixtures and test suites.
- Mapper-boundary finality guard: [`@peac/adapter-core.assertExplicitFinality`](../packages/adapters/core/) raises `MapperBoundaryError` (stable code `commerce.finality_synthesis_blocked`) when a commerce mapper would synthesize payment finality from non-payment artifacts.
- Per-protocol profiles under [`docs/profiles/`](profiles/) and [`docs/compatibility/`](compatibility/) describe the boundary for each ecosystem PEAC integrates with.

## 3. Portable audit records aligned with EU AI Act Annex IV, NIST AI RMF, and ISO 42001 Clause 8

PEAC records double as audit-trail entries suitable for the interaction-logging requirements of current AI governance frameworks. The signed records preserve what the runtime attested, bind policy and config digests, and survive organizational boundaries — the three properties auditors consistently ask for.

Evidence you can point at:

- [`docs/governance/`](governance/) carries the in-progress mapping from PEAC record fields to the relevant clauses and controls. The formal compliance mappings (ISO 42001 Clause 8, EU AI Act Annex IV) publish in a near-term release; the mapping directory is the forward link.
- The policy-binding three-state result (`verified` / `failed` / `unavailable`) is normatively specified at [`docs/specs/PROTOCOL-BEHAVIOR.md`](specs/PROTOCOL-BEHAVIOR.md) and preserves policy-digest traceability.
- Records are portable in a bundle format (`peac-bundle/0.1`, spec at [`docs/specs/EVIDENCE-CARRIER-CONTRACT.md`](specs/EVIDENCE-CARRIER-CONTRACT.md)) so audit packages can be verified offline months or years after issuance.

---

## What PEAC does not standardize

PEAC is the records layer. It defines issuance, carriage, verification, and preservation. It does not define:

- **Decision logic.** Auth systems, policy engines, runtime-governance toolkits, and approval systems define the decision. PEAC records what they attested.
- **Enforcement.** Runtime control planes define enforcement. PEAC records what was enforced.
- **Execution.** Shell runners, task runners, and orchestration engines define execution. PEAC records what was executed where another system emits that observation; PEAC does not execute commands itself.
- **Evaluation.** Eval platforms, experiment frameworks, and rubric managers define evaluation. PEAC records eval observations emitted by another system; PEAC does not run evaluations itself.
- **Approval workflows.** Approval systems and reviewer queues define approval logic. PEAC records approval observations emitted by another system; PEAC does not route or decide approvals itself.
- **Orchestration.** Workflow engines define orchestration. PEAC records workflow observations emitted by another system; PEAC does not orchestrate workflows itself.
- **Payment finality.** Payment rails (x402, paymentauth / MPP, ACP, Stripe SPT, card networks) define settlement. PEAC preserves upstream attestations verbatim and blocks finality synthesis at the mapper boundary.
- **Identity or trust scoring.** Identity protocols (DIDs, VCs, OAuth) and trust-score / reputation systems (ERC-8004 and derivatives) define those. PEAC accepts `iss` in `https://` or `did:` form; PEAC does not compute trust.
- **Observability presentation.** Observability tooling (Datadog, Grafana, Langfuse, OpenTelemetry collectors) defines visualization. PEAC records are exportable to any observability system via `receipt_ref` as an OTel span attribute.
- **Managed SaaS operation.** PEAC's reference verifier at [`apps/api/`](../apps/api/) is self-hostable and tenantless. Multi-tenant hosted operation is a separate product concern.

Full boundary with each adjacent category: [`docs/WHERE-IT-FITS.md`](WHERE-IT-FITS.md).

---

## Why this scope

Every adjacent category has strong incumbents and active specification work. PEAC defining decision logic, enforcement, execution, settlement, or identity would duplicate work the adjacent systems already do and would lose PEAC's defining property — neutrality. PEAC composes with those systems rather than competing with them: every one of them can export signed proof into PEAC records without PEAC picking favorites.

The result is a protocol with a narrow definition that composes across a wide surface area.
