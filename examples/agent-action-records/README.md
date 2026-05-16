# Agent action records example

Generic, vendor-neutral demonstration of issuing and verifying signed
agent-action records across all 6 `*-observed` event kinds under the
`org.peacprotocol/agent-action` extension namespace.

The 6 fixtures under [`./fixtures/`](./fixtures/) cover invoked,
delegated, approved, denied, cancelled, and timed-out events. Each
fixture is a complete extension payload; every reference is synthetic.
No vendor names, no live tokens, no production identifiers.

## What this proves

- The reporting pattern: a harness, runtime, or reviewer observes an
  agent action; PEAC records what the caller reported.
- Schema validation through `validateAgentAction` from `@peac/schema`.
- Issuance through `issue` from `@peac/protocol` with the correct
  pillar per event kind (`attribution` for invoked / delegated /
  cancelled; `compliance` for approved / denied / timed-out).
- Offline verification through `verifyLocal` from `@peac/protocol`.
- Public-key handoff between issuer and verifier without sharing the
  private key.

## Boundaries

PEAC records what the caller reports. The caller observed the action,
the decision, or the timeout; the caller's issuer signs the record.
PEAC does not approve, deny, authorize, schedule, execute, govern,
enforce, monitor, score, or orchestrate actions. The 6 type URIs all
carry the `*-observed` suffix to make the observer scope explicit at
the record-type layer.

`approved` and `denied` are caller-reported decision observations.
PEAC records that a decision was reported, not that PEAC decided.

## Run

From the repo root:

```bash
pnpm install
pnpm build
cd examples/agent-action-records
pnpm issue
pnpm verify
```

`pnpm issue` writes the signed records and the public key to
[`./out/`](./out/). `pnpm verify` reads them back and verifies each
record offline. The `out/` directory is gitignored.

Expected output: 6 records issued, 6 verified, exit code 0.

## Files

```text
fixtures/01-invoked-observed.json     agent-action-invoked-observed
fixtures/02-delegated-observed.json   agent-action-delegated-observed
fixtures/03-approved-observed.json    agent-action-approved-observed
fixtures/04-denied-observed.json      agent-action-denied-observed
fixtures/05-cancelled-observed.json   agent-action-cancelled-observed
fixtures/06-timed-out-observed.json   agent-action-timed-out-observed

issue-fixtures.mjs    issues a signed record for each fixture
verify-fixtures.mjs   verifies the signed records offline
```

## Related

- Profile spec:
  [`docs/specs/AGENT-ACTION-RECORDS.md`](../../docs/specs/AGENT-ACTION-RECORDS.md)
- Operator recipe:
  [`docs/SOLUTIONS/verify-agent-action.md`](../../docs/SOLUTIONS/verify-agent-action.md)
- Parity corpus:
  [`specs/conformance/parity-corpus/agent-action/`](../../specs/conformance/parity-corpus/agent-action/)
