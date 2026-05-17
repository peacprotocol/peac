# Compose runtime governance with portable signed records

> **Outcome:** A runtime governance toolkit decides what an agent is allowed to do, applies policy, records an audit entry, and reports the next-step context. You want a portable signed record of that decision that any external party can verify offline, without depending on the runtime that produced it or the cloud it runs in.
>
> **Audience:** Platform operator running a runtime governance toolkit (Microsoft Agent Governance Toolkit / AGT and similar) who needs a verifiable record outside the runtime.
>
> **Time:** About 5 minutes from a clean clone, using the shipped demo fixture events.

## The canonical framing

> **AGT runs the runtime; PEAC issues portable signed records.**

The runtime decides. PEAC records what the runtime attested. The two layers compose; they do not replace one another. The recipe below shows the composition in code.

## The problem

A runtime governance toolkit gives an organization a private control plane: policy evaluation, audit entries, authority narrowing, lifecycle transitions, trust observations, compliance assessments. Those artifacts are valuable inside the organization. Outside the organization they are unverifiable: an auditor, counterparty, downstream reviewer, or customer has no portable way to confirm what the runtime reported without trusting the runtime's read-only view of its own logs.

PEAC produces a signed interaction record per runtime-attested event. The record is portable: any party with the issuer's public key can verify it offline, without calling the runtime, without depending on a particular cloud, without imitating the runtime's internal trust system. The runtime keeps owning execution; PEAC carries the proof.

## What PEAC does

PEAC records what the runtime attested, signs it with Ed25519, and emits a Wire 0.2 interaction record (`interaction-record+jwt`). The record carries:

- the runtime's reported governance family (policy decision / audit entry / authority scope / lifecycle event / trust observation / compliance observation);
- the runtime-supplied identifiers and digests, preserved verbatim where supplied;
- the issuer's canonical identity (`iss`);
- the standard PEAC envelope (`kid`, signature, `iat`, optional `occurred_at`, `pillars`, and type URI).

The record is one signed JSON Web Signature whose JOSE header `typ` is `interaction-record+jwt`. There is no new wire format. There is no new signing envelope. There is no new public protocol API.

## What PEAC does NOT

This boundary is non-negotiable:

- PEAC does **not govern** runtime behavior.
- PEAC does **not enforce** runtime policy.
- PEAC does **not score** runtime trust or agent reputation.
- PEAC does **not route** runtime requests or agent calls.
- PEAC does **not authorize** runtime actions.
- PEAC does **not orchestrate** runtime steps or schedule work.
- PEAC does **not host** runtime services or run agents.
- PEAC does **not control** runtime behavior, override decisions, or rewrite policy.

Cloud, identity provider, policy engine, telemetry backend, registry, mesh, relay, and decision-trace storage all stay where they are. PEAC records what those systems reported; it does not become any of them.

## What you'll use

PEAC packages:

- [`@peac/protocol`](https://www.npmjs.com/package/@peac/protocol): issuance and offline verification.
- [`@peac/adapter-runtime-governance`](https://www.npmjs.com/package/@peac/adapter-runtime-governance): generic runtime-governance record families (shipped v0.12.10); the existing concrete mapper accepts runtime-reported governance events without importing the runtime SDK.
- [`@peac/crypto`](https://www.npmjs.com/package/@peac/crypto): Ed25519 signing.

Examples and fixtures:

- [`examples/runtime-composition-records/`](../../examples/runtime-composition-records/): generic, vendor-neutral runnable demo with three composition fixtures (policy decision, authority scope, lifecycle event). The fixtures use a runtime-reported `source.system` value; the example directory, code identifiers, and dependencies are all vendor-neutral.

Prerequisites: Node 22+, pnpm 8+. No external service, no runtime install, no network call.

## Step-by-step

1. Install dependencies and build the workspace.

   ```bash
   pnpm install
   pnpm build
   ```

2. Run the composition demo. The script reads three fixture events (policy decision, authority scope, lifecycle event), maps each through `@peac/adapter-runtime-governance`, signs an interaction record per fixture, verifies it locally, and prints a session summary.

   ```bash
   cd examples/runtime-composition-records
   pnpm demo
   ```

   You should see one `[OK]` line per fixture, a `[VERIFY OK]` line per record, and a deterministic family-ordered summary at the end. All data is synthetic; no live runtime, no network access, no live trust check.

3. Verify the records as a downstream party. Save the issuer's public key and the signed records anywhere off-host. From any environment that can run `@peac/protocol`, call `verifyLocal()` on each record with the issuer's public key. The verifier returns the canonical record contents plus the runtime's reported governance family. No call to the runtime is needed.

## Evidence of output

A successful run prints (abbreviated):

```text
[OK]      runtime-governance-policy-decision   sha256:<digest>
[OK]      runtime-governance-authority-scope   sha256:<digest>
[OK]      runtime-governance-lifecycle-event   sha256:<digest>
[VERIFY OK]  3 records verified, 0 failed
Session summary: 1 authority_scope / 1 lifecycle_event / 1 policy_decision
```

The structure and signature of each record are validated; the truth of the runtime's underlying decision is owned by the runtime, not by PEAC.

## How the composition layers

| Composition surface        | Owned by    | What it produces                                                           |
| -------------------------- | ----------- | -------------------------------------------------------------------------- |
| Policy evaluation          | the runtime | a runtime-internal decision the runtime attests                            |
| Authority narrowing        | the runtime | a runtime-internal scope the runtime attests                               |
| Lifecycle transition       | the runtime | a runtime-internal state change the runtime attests                        |
| Audit logging              | the runtime | a runtime-internal audit chain the runtime attests                         |
| **Portable signed record** | **PEAC**    | **`interaction-record+jwt` over Ed25519, verifiable offline by any party** |

PEAC reads what the runtime reported, records it under the canonical `org.peacprotocol/runtime-governance` extension namespace (six receipt-type URIs, shipped v0.12.10), signs the record, and stops there. The runtime keeps its native exports, its dashboards, its admin UI, its in-tenant trust system. PEAC adds a portable proof artifact alongside them.

## Where to go from here

- [Runtime evidence export](runtime-evidence-export.md): emit and aggregate runtime-governance records inside a tenant.
- [Verify agent-action records](verify-agent-action.md): generic agent action observations (v0.14.3); pairs naturally with runtime governance for callsite-level evidence.
- [Verify commerce-mandate records](verify-commerce-mandate.md): commerce-mandate observations alongside runtime decisions.
- [Compatibility matrix — `@peac/adapter-runtime-governance` row](../COMPATIBILITY_MATRIX.md): record families, fixture-only stability class, and the first runtime-governance mapper note.

## Footnote on an upstream anchoring proposal

Microsoft AGT PR #2244 is an upstream proposal for a pluggable external anchoring slot. This recipe does not cover it. If the upstream project merges the proposal or publishes stable documentation for it, PEAC should document the relationship separately while preserving the same runtime boundary.
