# ACP delegated-payment observation -> PEAC commerce evidence

Offline demo: record an ACP-shaped delegated-payment authorization and a separate settlement as PEAC commerce evidence, with the `artifact_kind` discriminator preventing a settlement from being synthesized off an authorization-only artifact.

## Run

```bash
pnpm install
pnpm --filter @peac/example-acp-delegated-checkout demo
```

## What it shows

1. `fromACPDelegatedPaymentObservation` with `observed_payment_state='authorized'` + `artifact_kind='authorization'` emits `commerce.event=authorization`.
2. A separate observation with `observed_payment_state='settled'` + `artifact_kind='settlement'` emits `commerce.event=settlement`.
3. Non-finality states (`pending`, `failed`, `revoked`) produce evidence with no commerce event; downstream consumers cannot infer settlement from a non-settlement observation.
4. Pairing `observed_payment_state='settled'` with `artifact_kind='authorization'` throws `MapperBoundaryError` (`commerce.finality_synthesis_blocked`) in all strictness modes. Token material is never carried; only `payment_method_token_ref` is preserved.

See also: [`docs/profiles/acp-delegated-payment.md`](../../docs/profiles/acp-delegated-payment.md).
