# Commerce mandate records example

Generic, vendor-neutral demonstration of issuing and verifying signed
commerce-mandate records across all 7 `*-observed` event kinds under
the `org.peacprotocol/commerce-mandate` extension namespace.

The 7 fixtures under [`./fixtures/`](./fixtures/) cover mandate,
authorization, capture, void, refund, settlement, and budget events.
Each fixture is a complete extension payload; every reference is
synthetic. No vendor names, no live tokens, no production identifiers.

## What this proves

- The reporting pattern: a payment system reports a commerce-lifecycle
  event; PEAC records what the caller observed.
- Schema validation through `validateCommerceMandate` from
  `@peac/schema` (including the money-boundary invariant: amount
  fields are non-negative `AmountMinorStringSchema` strings, not
  numbers).
- The finality-synthesis boundary: `settlement_state` appears only on
  `commerce-settlement-observed` records and would reject on any
  other event kind. The validator enforces this regardless of caller
  intent.
- Issuance through `issue` from `@peac/protocol` with the `commerce`
  pillar.
- Offline verification through `verifyLocal` from `@peac/protocol`.
- Public-key handoff between issuer and verifier without sharing the
  private key.

## Boundaries

PEAC records what the caller reports. The caller observed the
mandate, authorization, capture, void, refund, settlement, or budget
event; the caller's issuer signs the record. PEAC does not authorize
payments, process payments, settle funds, enforce mandates, compute
payment finality, evaluate budgets, validate payment rails, or vouch
for the legal validity of any commerce decision. Commerce decisions
are reported by the caller; the record describes what the caller
observed, not what PEAC decided. The 7 type URIs all carry the
`*-observed` suffix to make the observer scope explicit at the
record-type layer.

## Run

From the repo root:

```bash
pnpm install
pnpm build
cd examples/commerce-mandate-records
pnpm issue
pnpm verify
```

`pnpm issue` writes the signed records and the public key to
[`./out/`](./out/). `pnpm verify` reads them back and verifies each
record offline. The `out/` directory is gitignored.

Expected output: 7 records issued, 7 verified, exit code 0.

## Files

```text
fixtures/01-mandate-observed.json         commerce-mandate-observed
fixtures/02-authorization-observed.json   commerce-authorization-observed
fixtures/03-capture-observed.json         commerce-capture-observed
fixtures/04-void-observed.json            commerce-void-observed
fixtures/05-refund-observed.json          commerce-refund-observed
fixtures/06-settlement-observed.json      commerce-settlement-observed
fixtures/07-budget-observed.json          commerce-budget-observed

issue-fixtures.mjs    issues a signed record for each fixture
verify-fixtures.mjs   verifies the signed records offline
```

## Related

- Profile spec:
  [`docs/specs/COMMERCE-MANDATE-RECORDS.md`](../../docs/specs/COMMERCE-MANDATE-RECORDS.md)
- Operator recipe:
  [`docs/SOLUTIONS/verify-commerce-mandate.md`](../../docs/SOLUTIONS/verify-commerce-mandate.md)
- Parity corpus:
  [`specs/conformance/parity-corpus/commerce-mandate/`](../../specs/conformance/parity-corpus/commerce-mandate/)
