# x402 Scheme Coverage in PEAC

**Snapshot date:** upstream x402 state as of April 10, 2026. For current
upstream status, see
[x402-foundation/x402](https://github.com/x402-foundation/x402) and the
per-facilitator docs linked below.

This document distinguishes three truth surfaces so readers can reason about
where a given capability lives.

1. **Upstream x402 protocol truth** — what the x402 specification documents
   as stable across schemes and SDKs.
2. **Upstream facilitator surfaces** — what individual facilitators document
   as supported in their own docs. Narrower than upstream protocol truth and
   varies per operator (for example, Coinbase Developer Platform's production
   facilitator, the community testnet facilitator at x402.org, and others).
3. **PEAC-tested truth** — what PEAC verifies and documents end-to-end in
   this repo. Narrower than both.

Collapsing these into one blended "supported" statement leads to drift and
overclaim. PEAC deliberately keeps them separate.

## Payment schemes (upstream protocol truth)

| Scheme  | Upstream protocol status                             | PEAC-tested (this repo)                                             |
| ------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| `exact` | Stable; multiple networks (see upstream spec folder) | Covered end-to-end by the adapter and conformance fixtures          |
| `upto`  | Stable on EVM; SVM unresolved ([#1642][rfc-1642])    | Scheme-agnostic pass-through; fixture-backed (overclaim-guard test) |

[rfc-1642]: https://github.com/x402-foundation/x402/issues/1642

PEAC does not publish a blanket "supported networks" claim for `exact` or
`upto`. The adapter is scheme-agnostic, so any network an upstream
facilitator surfaces works at the PEAC evidence layer provided the signed
artifacts carry valid `network`, `asset`, `payTo`, `amount`, and `scheme`
values.

## SDK coverage (upstream protocol truth)

| SDK        | `exact` | `upto`                     |
| ---------- | ------- | -------------------------- |
| TypeScript | Yes     | Yes                        |
| Go         | Yes     | Yes                        |
| Python     | Yes     | Not yet (tracked upstream) |

**Note on upstream import paths:** the canonical upstream repository has
migrated to `github.com/x402-foundation/x402`. Some external code snippets
still reference the older `github.com/coinbase/x402` path. PEAC docs use the
current canonical path.

## Facilitator surfaces (per-operator, check upstream sources)

Facilitator support is per-operator and changes outside PEAC's release
cadence. PEAC does not republish a live facilitator matrix because it would
drift fast and is not PEAC's source of truth. For current facilitator
support — scheme, network, asset, and operational constraints — consult the
relevant operator directly. Examples at the snapshot date above:

- **Coinbase Developer Platform production facilitator** —
  [docs.cdp.coinbase.com/x402/network-support](https://docs.cdp.coinbase.com/x402/network-support)
  (check this page for current EVM network list, Solana status, and whether
  `upto` is exposed on a given network).
- **x402.org testnet facilitator** — [x402.org](https://x402.org) for the
  community testnet endpoints.
- **Any self-hosted facilitator** — operator documentation.

PEAC's scheme-agnostic pass-through means the PEAC evidence layer works with
any operator that emits valid x402 signed offers and receipts, independent
of which networks or schemes that operator exposes at a given moment.

## PEAC's role, stated precisely

PEAC is the evidence, export, and audit layer above x402, not a payment rail
and not a scheme enforcer.

**PEAC does:**

- Preserve the `scheme` string identifier verbatim in the raw artifact at
  `proofs.x402.offer` (and in the V2 `evidence.scheme` field)
- Term-match required fields already present in x402 artifacts: `network`,
  `asset`, `payTo`, `amount`, `scheme`
- Validate wire shape, required fields, and offer-receipt consistency
- Offer opt-in cryptographic verification of EIP-712 and JWS-formatted
  artifacts
- Preserve the full raw offer and receipt for downstream auditors and
  dispute review

**PEAC does NOT:**

- Enforce scheme-specific invariants such as `upto` single-use authorization,
  time bounds, recipient binding, facilitator binding, or max-amount
  enforcement
- Audit max-vs-actual settlement correctness for `upto` flows
- Participate in on-chain settlement or finality
- Select or validate facilitators
- Interpret scheme-specific `extra` fields (preserved as opaque in v2)
- Claim `upto` support on Solana while the upstream RFC is unresolved

Those properties are the x402 scheme layer's responsibility and are enforced
on-chain or by the facilitator, not by PEAC.

## Deferred to future PEAC releases

This document records the current PEAC position on upstream features that are
not in scope for v0.12.9. Each row is an explicit gap, not a silent omission.

| Feature                                        | Upstream status                  | PEAC position                        |
| ---------------------------------------------- | -------------------------------- | ------------------------------------ |
| `upto` on Solana                               | [RFC #1642][rfc-1642] unresolved | Not claimed; watch upstream          |
| Payment Identifier extension                   | Stable                           | Not mapped yet; tracked for v0.12.10 |
| Gas sponsoring (EIP-2612, ERC-20)              | Stable                           | Out of scope for v0.12.9             |
| Bazaar discovery                               | Stable                           | Out of scope for v0.12.9             |
| Sign-in-with-X                                 | Stable                           | Out of scope for v0.12.9             |
| Facilitator attestation                        | [#1921][rfc-1921] open           | Watch upstream                       |
| Negotiated BCP                                 | [#1960][rfc-1960] open           | Watch upstream                       |
| State channels                                 | [#1909][rfc-1909] open           | Watch upstream                       |
| Commerce lifecycle (authorize / settle phases) | Scheme layer                     | Tracked for a future PEAC release    |

[rfc-1921]: https://github.com/x402-foundation/x402/issues/1921
[rfc-1960]: https://github.com/x402-foundation/x402/issues/1960
[rfc-1909]: https://github.com/x402-foundation/x402/issues/1909

## Upstream references

- `specs/schemes/exact/scheme_exact.md` in
  [x402-foundation/x402](https://github.com/x402-foundation/x402)
- `specs/schemes/upto/scheme_upto.md` in
  [x402-foundation/x402](https://github.com/x402-foundation/x402)
- [`docs/specs/X402-PROFILE.md § 3.0`](../specs/X402-PROFILE.md) — PEAC
  normative statement
- [`docs/adapters/x402.md`](../adapters/x402.md) — adapter enforcement
  boundary
- [`docs/guides/x402-peac.md`](../guides/x402-peac.md) — integration guide
