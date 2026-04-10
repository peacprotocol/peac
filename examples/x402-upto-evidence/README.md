# x402 upto Evidence Preservation Demo

Demonstrates how `@peac/adapter-x402` handles the upstream x402 `upto` scheme
as pure evidence capture. PEAC preserves the scheme identifier and the raw
signed artifacts; it does not interpret or enforce scheme-specific
invariants.

## What this demo shows

1. A resource server offers a metered API at up to USDC 100000 per call
   using the x402 `upto` scheme
2. The payer authorizes that maximum
3. The facilitator settles for an actual charged amount below the authorized
   maximum
4. PEAC consumes the offer and the receipt, verifies term-matching and wire
   shape, and produces a canonical interaction record
5. The record preserves `scheme: "upto"` and the raw artifacts for downstream
   audit

## What this demo proves

- PEAC term-matches the scheme identifier as a required string alongside
  `network`, `asset`, `payTo`, and `amount`
- PEAC preserves the full raw signed offer and receipt verbatim at
  `proofs.x402.offer` and `proofs.x402.receipt`
- PEAC does not mutate or normalize the scheme identifier

## What this demo does NOT prove

- That the `upto` single-use authorization invariant is enforced (that is an
  x402 scheme-layer concern, enforced on-chain or by the facilitator)
- That the authorized maximum is enforced on-chain
- That the actual charged amount is within the authorized maximum (the
  max-vs-actual delta audit is a scheme-layer concern)
- That the facilitator is authorized (scheme-layer and on-chain)

PEAC is the evidence, export, and audit layer above x402, not a payment rail
and not a scheme enforcer. The demo logs both the authorized maximum and an
out-of-band actual charged amount so auditors can see the shape of the data
that downstream tooling would reason about. PEAC itself does not audit the
delta.

## Run the demo

```bash
cd examples/x402-upto-evidence
pnpm install
pnpm demo
```

No network calls. No crypto spend. Deterministic output based on fixture
data.

## References

- [`docs/specs/X402-PROFILE.md § 3.0`](../../docs/specs/X402-PROFILE.md) — PEAC normative statement on payment schemes
- [`docs/compatibility/x402-scheme-coverage.md`](../../docs/compatibility/x402-scheme-coverage.md) — current compatibility matrix (upstream, facilitator, PEAC-tested)
- [`docs/adapters/x402.md`](../../docs/adapters/x402.md) — adapter enforcement boundary
- [`docs/guides/x402-peac.md`](../../docs/guides/x402-peac.md) — x402 + PEAC integration guide
- Upstream x402 `upto` scheme spec: `specs/schemes/upto/scheme_upto.md` in [`x402-foundation/x402`](https://github.com/x402-foundation/x402)
