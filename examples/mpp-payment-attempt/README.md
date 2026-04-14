# MPP / paymentauth payment-attempt -> PEAC commerce evidence

Offline demo: record a paymentauth payment-attempt and a separate settlement as PEAC commerce evidence, with the `artifact_kind` discriminator preventing cross-kind misuse and optional facilitator attestations preserved verbatim.

## Run

```bash
pnpm install
pnpm --filter @peac/example-mpp-payment-attempt demo
```

## What it shows

1. `fromMPPPaymentAttempt` with `artifact_kind='authorization'` emits `commerce.event=authorization`. Optional `facilitator_attestation` is preserved verbatim under `proofs.paymentauth.attempt.facilitator_attestation`.
2. `fromMPPSettlement` with `artifact_kind='settlement'` emits `commerce.event=settlement`. Settlement attestation is preserved under `proofs.paymentauth.settlement.facilitator_attestation`.
3. Pairing `fromMPPSettlement` with `artifact_kind='authorization'` throws `MapperBoundaryError` (`commerce.finality_synthesis_blocked`) in all strictness modes.
4. `paymentauth` is the canonical code and registry term aligned with the active draft `draft-ryan-httpauth-payment-01`. MPP is an ecosystem prose term; token material is never carried.

See also: [`docs/profiles/mpp-payment-evidence.md`](../../docs/profiles/mpp-payment-evidence.md).
