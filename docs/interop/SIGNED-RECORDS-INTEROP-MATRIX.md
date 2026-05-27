# Signed-records interop matrix

**Status:** Informative.
**Last checked:** 2026-05-27T10:53:25Z.
**Scope note:** this matrix records PEAC's neutral interop mappings against adjacent records, attestations, digests, and payment evidence surfaces. Inclusion is descriptive and does not imply endorsement, dependency, or support by either project.

## Scope

This matrix records how PEAC composes with adjacent records, attestations, digests, and payment evidence surfaces. For each row it lists the PEAC-side artifacts (fixtures, packages, composition recipes) and the upstream source anchor (specification URL or official repository).

PEAC records references and observations through committed PEAC fixtures and documented composition recipes. Upstream systems remain responsible for their own runtime behavior, registries, payment flows, validation, and release status.

## Upstream maturity legend

- **stable** — published RFC, final ERC, or equivalent.
- **active draft** — formally iterating in an official venue (e.g., working-group Internet-Draft, official repository on its default branch).
- **Last Call** — standards-track document shown as Last Call by its upstream source at the Last checked timestamp.
- **Draft** — official repository proposal not yet at Last Call.
- **official issue-level proposal** — open issue in an official repository where the technical proposal is still in discussion.

PEAC coverage and upstream maturity are independent dimensions: a row may be backed by PEAC fixtures while its upstream is still an active draft or issue-level proposal.

## Rows

### 1. AP2 `open_mandate_hash`

| Dimension                       | Value                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| 1. PEAC coverage                | Fixture-backed                                                                               |
| 2. Upstream maturity            | **official issue-level proposal** (`google-agentic-commerce/AP2#265`; open as of 2026-05-27) |
| 3. PEAC record shape            | A PEAC interaction record references the AP2 open-checkout-mandate digest                    |
| 4. Canonicalization             | RFC 8785 JCS (shared by both formats for the unsigned mandate body)                          |
| 5. Digest function              | SHA-256                                                                                      |
| 6. Signature scheme             | PEAC: Ed25519 (per kernel); AP2: scheme negotiated at the AP2 layer                          |
| 7. Direction                    | PEAC records a reference to an AP2 mandate digest; AP2 does not depend on PEAC               |
| 8. PEAC-side fixture            | `specs/conformance/interop/ap2-open-mandate-hash/` (positive and negative vectors)           |
| 9. PEAC-side composition recipe | `docs/specs/AP2-COMPOSITION.md`                                                              |
| 10. Upstream source anchor      | `google-agentic-commerce/AP2#265`                                                            |
| Last checked                    | 2026-05-27T10:53:25Z                                                                         |

**Compatibility notes and non-claims.** PEAC's open-mandate-hash interop fixtures preserve the AP2 derivation rule discussed in `google-agentic-commerce/AP2#265`. PEAC does not extend AP2, replace the mandate mechanism, or propose a different derivation rule. Issue #265 is still open; this row cites it as a proposal under discussion, not as a finalized AP2 specification change.

### 2. ERC-8126 attestation references (with ERC-8004 Validation Registry context)

| Dimension                       | Value                                                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. PEAC coverage                | Fixture-backed                                                                                                                                                              |
| 2. Upstream maturity            | ERC-8126: **Last Call** as of 2026-05-27; move-to-final PR open at `ethereum/ERCs#1769`. ERC-8004: **Draft** (created 2025-08-13).                                          |
| 3. PEAC record shape            | A PEAC interaction record references an ERC-8126-aligned attestation artifact; ERC-8004 Validation Registry attestation references are observed in the same fixture surface |
| 4. Canonicalization             | RFC 8785 JCS for JSON attestations; EIP-712 typed data for on-chain attestations (preserved unchanged)                                                                      |
| 5. Digest function              | SHA-256 (JCS path); keccak-256 (EIP-712 path)                                                                                                                               |
| 6. Signature scheme             | Per attestation format (JWS for JSON; secp256k1 EIP-712 for on-chain)                                                                                                       |
| 7. Direction                    | PEAC records a reference to an attestation issued under ERC-8126; PEAC does not issue or validate the attestation                                                           |
| 8. PEAC-side fixture            | `specs/conformance/interop/erc8126-attestation-format/` (positive and negative vectors)                                                                                     |
| 9. PEAC-side composition recipe | `docs/specs/ERC-8126-COMPOSITION.md`                                                                                                                                        |
| 10. Upstream source anchor      | `eips.ethereum.org/EIPS/eip-8126` and `eips.ethereum.org/EIPS/eip-8004`                                                                                                     |
| Last checked                    | 2026-05-27T10:53:25Z                                                                                                                                                        |

**Compatibility notes and non-claims.** PEAC records references to ERC-8126-aligned attestation artifacts; it does not standardize ERC-8126 or define risk values under it. ERC-8004 Validation Registry attestation references are observed in the same fixture surface; PEAC does not implement the Validation Registry. ERC-8126 is in Last Call and ERC-8004 is in Draft; the row reflects the state at the Last checked timestamp above.

### 3. x402 — PEAC-owned surface only

| Dimension                        | Value                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. PEAC coverage                 | Fixture-backed                                                                                                                                                      |
| 2. Upstream maturity             | **official repository, active** (`x402-foundation/x402` default branch `main`)                                                                                      |
| 3. PEAC record shape             | A PEAC interaction record preserves an observation of an x402 payment response or settlement-related response surfaced by a PEAC-owned x402 surface                 |
| 4. Canonicalization              | RFC 8785 JCS for the PEAC record envelope; x402 facilitator response shape is preserved as observed                                                                 |
| 5. Digest function               | SHA-256 for the PEAC record digest                                                                                                                                  |
| 6. Signature scheme              | PEAC: Ed25519 per kernel; x402 settlement signature is preserved as observed                                                                                        |
| 7. Direction                     | PEAC records observations of x402 payment evidence surfaced through PEAC-owned x402 surfaces; PEAC does not execute settlement, hold funds, or act as a facilitator |
| 8. PEAC-side fixture             | `specs/conformance/fixtures/x402/`                                                                                                                                  |
| 9. PEAC-side packages and recipe | `packages/adapters/x402/` (`@peac/adapter-x402`), `packages/rails/x402/` (`@peac/rails-x402`), `docs/SOLUTIONS/cloudflare-x402-peac.md`                             |
| 10. Upstream source anchor       | `x402-foundation/x402` repository                                                                                                                                   |
| Last checked                     | 2026-05-27T10:53:25Z                                                                                                                                                |

**Compatibility notes and non-claims.** PEAC records observations from PEAC-owned x402 surfaces; it does not execute settlement, hold funds, or act as a facilitator. The PEAC record envelope uses `RFC 8785 JCS`. The row anchors to the official upstream repository and to PEAC-owned surfaces only. PEAC-side recipes are implementation guidance only.

## What this matrix does and does not say

PEAC records references and observations through committed PEAC fixtures and documented composition recipes. Upstream systems remain responsible for their own runtime behavior, registries, payment flows, validation, and release status. Inclusion here is descriptive and does not imply endorsement, dependency, or support by either project.

The matrix is informational. Wire format compatibility, normative spec text, and conformance requirements live in `specs/` and `docs/specs/`.

## Verification

Each row lists:

- a committed PEAC-side artifact;
- an upstream source anchor;
- a Last checked timestamp.

The matrix is informational. Normative requirements remain in `specs/` and `docs/specs/`.
