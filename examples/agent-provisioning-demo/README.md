# Agent provisioning demo

Concrete sanitized example of using the
`org.peacprotocol/provisioning-lifecycle` extension to record an agent
or operator-driven provisioning workflow as a portable, signed audit
trail.

## What this shows

An external provisioning CLI is observed performing a small workflow:
initialize a workspace, provision a managed-database resource, issue
a credential for it, and rotate that credential. The caller reads the
upstream JSON envelopes, hashes upstream artifacts via JCS (RFC 8785),
and emits one signed PEAC record per observed event using the
canonical extension namespace and four `*-observed` type URIs:

| Step | Type URI                                            | Sub-event   |
| ---- | --------------------------------------------------- | ----------- |
| 1    | `org.peacprotocol/provisioning-catalog-observed`    | n/a         |
| 2    | `org.peacprotocol/provisioning-resource-observed`   | provisioned |
| 3    | `org.peacprotocol/provisioning-credential-observed` | issued      |
| 4    | `org.peacprotocol/provisioning-credential-observed` | rotated     |

The fixtures under [`./fixtures/`](./fixtures/) are vendor-neutral
synthetic JSON envelopes that follow the shape an upstream provisioning
CLI typically produces. There are no live account identifiers,
secrets, or domains in any fixture.

## Boundaries

PEAC records what the issuer reports happened. Authorization, legal
acceptance, credential validation, payment processing, provider-state
claims, settlement, credential-vault management, and runtime operation
remain responsibilities of the upstream systems and their operators.
PEAC does not authorize the action, verify legal acceptance, validate
credentials, process payments, vouch for provider state, settle
transactions, manage credential vaults, or operate the runtime. The
`*-observed` type URIs make the observer scope explicit at the
record-type layer; credential material is never inlined, and the
`storage_surface` block carries only an abstract storage kind plus
opaque references.

## Where this pattern shows up in the real world

Any tooling that sits between an agent (or operator) and one or more
external service providers and produces structured JSON envelopes per
operation is a good fit: agentic provisioning CLIs (such as the
Stripe Projects provisioning CLI), edge platform tooling (such as
Cloudflare's worker, secret, and route configuration commands),
infrastructure-as-code drivers, and bespoke internal CLIs. The fixture
shapes here intentionally generalize across those tools rather than
binding to any one of them.

## Run

From the repo root:

```bash
pnpm install
pnpm build
cd examples/agent-provisioning-demo
pnpm demo
```

## Files

```text
fixtures/cli-add-response.json         upstream "add resource" envelope
fixtures/cli-rotate-response.json      upstream "rotate credential" envelope
fixtures/cli-llm-context-response.json upstream "llm-context" envelope (informational; not issued)
fixtures/state-after-init.json         workspace state after init
fixtures/state-after-add.json          workspace state after add
fixtures/env-keys.json                 environment-variable name list (no values)
fixtures/meta.json                     capture metadata

demo.ts                                issue + verify the four observed events
```

## Related

- Profile spec:
  [`docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md`](../../docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md)
- Generic example:
  [`examples/provisioning-lifecycle/`](../provisioning-lifecycle/)
- Operator recipe:
  [`docs/SOLUTIONS/verify-agent-provisioning.md`](../../docs/SOLUTIONS/verify-agent-provisioning.md)
- Parity corpus:
  [`specs/conformance/parity-corpus/provisioning-lifecycle/`](../../specs/conformance/parity-corpus/provisioning-lifecycle/)
