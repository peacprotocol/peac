# x402 upto -> PEAC settlement evidence

Offline demo: extract a settlement proof from x402 response headers in dual-header precedence order, map it to PEAC commerce evidence with `commerce.event=settlement` using the `upto` scheme, and show that offer-only (empty proof) data is rejected as a finality-rule violation in every strictness mode.

## Run

```bash
pnpm install
pnpm --filter @peac/example-x402-upto-evidence demo
```

## What it shows

1. `extractSettlementProofFromHeaders` returns proofs in the canonical order `PEAC-Receipt > PAYMENT-RESPONSE (v2) > X-PAYMENT-RESPONSE (v1)`.
2. `fromX402SettlementObservation` produces settlement evidence only when the supplied proof has a non-empty `raw_value`. The raw proof is preserved verbatim under `proofs.x402.settlement`.
3. Scheme (`upto`), network, `pay_to`, facilitator, and offer reference are preserved without PEAC verifying any scheme invariants. Scheme-specific checks remain upstream responsibility; see `docs/compatibility/x402-scheme-coverage.md`.
4. A proof whose `raw_value` is an empty string (offer-only) throws `MapperBoundaryError` with code `commerce.finality_synthesis_blocked` in strict, interop, and legacy modes.
