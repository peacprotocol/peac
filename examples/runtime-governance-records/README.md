# Runtime Governance Records Example

Demonstrates how to issue, verify, and summarize runtime governance
records using `@peac/adapter-runtime-governance`.

## What this shows

1. Map AGT-shaped governance artifacts to the generic runtime-governance model
2. Issue signed PEAC Interaction Records for 6 record families
3. Verify each record locally with the issuer's public key
4. Aggregate records into a deterministic session summary

## Record families demonstrated

| Family                 | Type URI                                                     | Description          |
| ---------------------- | ------------------------------------------------------------ | -------------------- |
| Policy Decision        | `org.peacprotocol/runtime-governance-policy-decision`        | Governance decision  |
| Audit Entry            | `org.peacprotocol/runtime-governance-audit-entry`            | Audit log entry      |
| Authority Scope        | `org.peacprotocol/runtime-governance-authority-scope`        | Scope narrowing      |
| Lifecycle Event        | `org.peacprotocol/runtime-governance-lifecycle-event`        | State transition     |
| Trust Observation      | `org.peacprotocol/runtime-governance-trust-observation`      | Trust signal         |
| Compliance Observation | `org.peacprotocol/runtime-governance-compliance-observation` | Framework assessment |

## Run

```bash
pnpm demo
```

## What to expect

The demo issues 6 signed records, verifies all 6, and prints a session
summary with deterministic family ordering. All data is synthetic (no
network access, no live runtime required). All digests are real SHA-256
values, not placeholders.

PEAC validates the structure and signature of the PEAC record, not the
truth of the upstream governance decision or the operating effectiveness
of the upstream control plane.
