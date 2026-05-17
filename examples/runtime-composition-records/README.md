# Runtime Composition Records Example

Demonstrates how a runtime governance toolkit can compose with PEAC to
produce portable signed records that any external party can verify
offline. The demo uses three fixture events (policy decision, authority
scope, lifecycle event) and the existing
`@peac/adapter-runtime-governance` Layer 4 adapter.

## What this shows

1. Take three runtime-attested events (a policy evaluation, an authority
   narrowing, a lifecycle transition).
2. Map each through the generic runtime-governance adapter without
   importing any runtime-specific SDK.
3. Issue a Wire 0.2 signed interaction record per event.
4. Verify each record locally with the issuer's public key.
5. Aggregate into a deterministic session summary with stable family
   ordering.

## What this does NOT show

PEAC does not govern, enforce, score, route, authorize, orchestrate,
host, or control runtime behavior. The runtime decides what each agent
is allowed to do. PEAC carries a portable signed record of what the
runtime reported. The two layers compose; PEAC does not replace the
runtime.

## Record families demonstrated

| Family          | Type URI                                              | Description                     |
| --------------- | ----------------------------------------------------- | ------------------------------- |
| Policy Decision | `org.peacprotocol/runtime-governance-policy-decision` | Governance decision             |
| Authority Scope | `org.peacprotocol/runtime-governance-authority-scope` | Scope narrowing                 |
| Lifecycle Event | `org.peacprotocol/runtime-governance-lifecycle-event` | Agent / capability state change |

The `@peac/adapter-runtime-governance` Layer 4 adapter (shipped v0.12.10)
covers six families total: policy decision, audit entry, authority scope,
lifecycle event, trust observation, compliance observation. This demo
exercises three of them to keep the composition story focused.

## Why this is "composition"

A runtime governance toolkit like Microsoft Agent Governance Toolkit
(AGT) decides what an agent is allowed to do, applies policy, attests
audit entries, narrows authority, and transitions agent lifecycle. PEAC
reads what the toolkit reported and produces a signed record that any
external party can verify without depending on that toolkit, its cloud,
or its trust system. The two layers do different work and compose
cleanly.

This example uses a vendor-neutral `source.system` value in the fixture
data (`"runtime-governance-toolkit"`). A real integration would set
`source.system` to the runtime's identifier (for example, the AGT system
identifier) and `source.event_type` to the runtime's native event-type
string. PEAC preserves those identifiers as reported inputs to the
signed record; PEAC does not treat them as authorization, routing,
trust, or runtime-control signals.

## Run

```bash
pnpm install
pnpm build
pnpm --filter @peac/example-runtime-composition-records demo
```

Or directly inside the example directory:

```bash
cd examples/runtime-composition-records
pnpm demo
```

## What to expect

```text
Runtime Composition Records Demo

The runtime decides; PEAC records.

[OK]         org.peacprotocol/runtime-governance-policy-decision
[OK]         org.peacprotocol/runtime-governance-authority-scope
[OK]         org.peacprotocol/runtime-governance-lifecycle-event

3 records issued

[VERIFY OK]  3 records verified, 0 failed

Session summary:
  Session:  sess-runtime-composition-demo-001
  Records:  3
  Families: authority_scope / lifecycle_event / policy_decision
  Issuer:   https://composition-demo.example.com

Demo OK
```

All data is synthetic. No live runtime, no network access, no live
trust check. All digests are real SHA-256 values. Each record is a
JWS (`typ` = `interaction-record+jwt`) over Ed25519.

## Verifying offline as a downstream party

Save the signed records (`r.jws`) and the issuer's public key to any
storage. Any environment with `@peac/protocol` installed can call
`verifyLocal(jws, publicKey)` to confirm the structure, signature,
issuer, and reported governance family. The runtime is not consulted.

## See also

- [Runtime evidence export recipe](../../docs/SOLUTIONS/runtime-evidence-export.md)
  for in-tenant emit/aggregate patterns.
- [Compose runtime governance with portable signed records](../../docs/SOLUTIONS/agt-peac-composition.md)
  for the composition framing and the canonical line.
- [Runtime governance records example](../runtime-governance-records/)
  for the six-family demo using pinned runtime-governance fixtures.
