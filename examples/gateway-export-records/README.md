# Gateway export records example

Generic, vendor-neutral demonstration of issuing and verifying signed
gateway-export records across all 8 `*-observed` event kinds under the
`org.peacprotocol/gateway-export` extension namespace.

The 8 fixtures under [`./fixtures/`](./fixtures/) cover the 7
settlement/recovery state observations plus the 1 facilitator-timeout
trigger observation. Each fixture is a complete extension payload;
every reference is synthetic. No vendor names, no live tokens, no real
gateway / facilitator / payment / transaction identifiers.

## What this proves

- The reporting pattern: a payment gateway, facilitator, or recovery
  middleware reports a settlement-recovery event; PEAC records what
  the caller observed.
- Schema validation through `validateGatewayExport` from `@peac/schema`
  (including the single-canonical-money-field invariant: `amount_minor`
  is the only monetary field; the non-negative profile constraint
  rejects negative values; UTF-8 byte limits on `asset` / `network` /
  `final_state` / `last_known_state`).
- The trigger-vs-state doctrine: 7 type URIs correspond to observed
  settlement/recovery states (`pending` / `confirmed` / `unresolved` /
  `polling` / `confirmed_late` / `failed` / `failed_orphaned`); one
  URI (`gateway-facilitator-timeout-observed`) records the
  facilitator-timeout trigger event itself. PEAC does not introduce an
  additional settlement state.
- Issuance through `issue` from `@peac/protocol` with the `commerce`
  pillar.
- Offline verification through `verifyLocal` from `@peac/protocol`.
- Public-key handoff between issuer and verifier without sharing the
  private key.

## Boundaries

PEAC records what the caller reports. The caller observed the payment
submission, the facilitator timeout, the polling activity, the
settlement outcome, or the failure mode; the caller's issuer signs the
record. PEAC does not settle transactions, route payments, contact
gateways, verify on-chain state, monitor settlements, enforce recovery
policy, compute payment finality, or resolve settlement disputes.
Recovery decisions are reported by the caller; the record describes
what the caller observed, not what PEAC decided. The 8 type URIs all
carry the `*-observed` suffix to make the observer scope explicit at
the record-type layer.

## Run

From the repo root:

```bash
pnpm install
pnpm build
cd examples/gateway-export-records
pnpm issue
pnpm verify
```

`pnpm issue` writes the signed records and the public key to
[`./out/`](./out/). `pnpm verify` reads them back and verifies each
record offline. The `out/` directory is gitignored.

Expected output: 8 records issued, 8 verified, exit code 0.

## Files

```text
fixtures/01-payment-submitted-observed.json            gateway-payment-submitted-observed
fixtures/02-facilitator-timeout-observed.json          gateway-facilitator-timeout-observed (trigger)
fixtures/03-settlement-unresolved-observed.json        gateway-settlement-unresolved-observed
fixtures/04-settlement-polling-observed.json           gateway-settlement-polling-observed
fixtures/05-settlement-confirmed-observed.json         gateway-settlement-confirmed-observed
fixtures/06-settlement-confirmed-late-observed.json    gateway-settlement-confirmed-late-observed
fixtures/07-settlement-failed-observed.json            gateway-settlement-failed-observed
fixtures/08-settlement-failed-orphaned-observed.json   gateway-settlement-failed-orphaned-observed

issue-fixtures.mjs    issues a signed record for each fixture
verify-fixtures.mjs   verifies the signed records offline
```

## Related

- Profile spec:
  [`docs/specs/GATEWAY-EXPORT-RECORDS.md`](../../docs/specs/GATEWAY-EXPORT-RECORDS.md)
- Operator recipe:
  [`docs/SOLUTIONS/verify-gateway-export.md`](../../docs/SOLUTIONS/verify-gateway-export.md)
- Parity corpus:
  [`specs/conformance/parity-corpus/gateway-export/`](../../specs/conformance/parity-corpus/gateway-export/)
