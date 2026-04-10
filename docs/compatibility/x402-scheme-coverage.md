# x402 Scheme Coverage in PEAC

**Frozen at:** PEAC v0.12.9 / upstream x402 state as of April 10, 2026.
For current upstream status, see
[x402-foundation/x402](https://github.com/x402-foundation/x402).

This document distinguishes three truth surfaces so readers can reason about
where a given capability lives.

1. **Upstream x402 protocol truth** — what the x402 specification and the
   reference SDKs document as stable.
2. **CDP facilitator truth** — what Coinbase Developer Platform's facilitator
   documents as supported. Narrower than upstream.
3. **PEAC-tested truth** — what PEAC verifies and documents end-to-end in this
   repo. Narrower than both.

Collapsing these into one blended "supported" statement leads to drift and
overclaim. PEAC deliberately keeps them separate.

## Payment schemes

| Scheme  | Upstream protocol                                   | CDP facilitator                                       | PEAC-tested (v0.12.9)                                     |
| ------- | --------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| `exact` | Stable; EVM, SVM, and other networks (see upstream) | Supported on Base / Base Sepolia / Polygon / Solana   | Covered end-to-end by the adapter, fixtures, and examples |
| `upto`  | Stable on EVM; SVM unresolved ([#1642][rfc-1642])   | Supported on Base / Base Sepolia / Polygon (EVM only) | Scheme-agnostic pass-through; fixture-backed              |

[rfc-1642]: https://github.com/x402-foundation/x402/issues/1642

## SDK coverage (upstream)

| SDK        | `exact` | `upto`                     |
| ---------- | ------- | -------------------------- |
| TypeScript | Yes     | Yes                        |
| Go         | Yes     | Yes                        |
| Python     | Yes     | Not yet (tracked upstream) |

**Note on upstream import paths:** the canonical upstream repository has
migrated to `github.com/x402-foundation/x402`. Some external code snippets
still reference the older `github.com/coinbase/x402` path. PEAC docs use the
current canonical path.

## Network coverage (upstream facilitator reality)

| Network         | `exact` | `upto`           |
| --------------- | ------- | ---------------- |
| Base mainnet    | Yes     | Yes              |
| Base Sepolia    | Yes     | Yes              |
| Polygon mainnet | Yes     | Yes              |
| Solana mainnet  | Yes     | Upstream-pending |
| Solana devnet   | Yes     | Upstream-pending |

Other networks documented upstream for `exact` (for example Avalanche and
additional EVM chains) are flagged here as "upstream supported; not
explicitly tested by PEAC in this release."

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
