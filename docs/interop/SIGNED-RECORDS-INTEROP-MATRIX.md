# Signed-records interop matrix

**Status:** Informative.
**Last checked:** 2026-05-27T10:53:25Z.

This matrix records how PEAC composes with adjacent records, attestations, digests, and payment evidence surfaces. For each row it lists the upstream source, the upstream status at the Last checked timestamp, the PEAC-side artifacts that already exist in this repository, the composition shape, and the boundary between PEAC and the upstream system.

PEAC records references and observations through committed PEAC artifacts and documented composition recipes. Upstream systems remain responsible for their own runtime behavior, registries, payment flows, validation, and release status. Inclusion is descriptive and does not imply endorsement, dependency, or support by either project.

## Rows

### 1. AP2 `open_mandate_hash`

| Field                           | Value                                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream source                 | `google-agentic-commerce/AP2#265`                                                                                                                                                                                                                                   |
| Upstream status at Last checked | Open issue proposing v0 conformance vectors for `open_mandate_hash`                                                                                                                                                                                                 |
| PEAC artifact                   | `specs/conformance/interop/ap2-open-mandate-hash/` (positive and negative vectors); `docs/specs/AP2-COMPOSITION.md`                                                                                                                                                 |
| Composition                     | A PEAC interaction record references the AP2 open-checkout-mandate digest. Canonicalization is RFC 8785 JCS over the unsigned mandate body; digest is SHA-256. PEAC signs its own envelope with Ed25519; the AP2 mandate signature scheme is negotiated at AP2.     |
| Boundary                        | PEAC records a reference to an AP2 mandate digest. PEAC does not extend AP2, replace the mandate mechanism, or propose a different derivation rule. Issue #265 is still open; this row cites it as a proposal under discussion, not as a finalized AP2 spec change. |
| Last checked                    | 2026-05-27T10:53:25Z                                                                                                                                                                                                                                                |

### 2. ERC-8126 attestation references (with ERC-8004 Validation Registry context)

| Field                           | Value                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream source                 | `eips.ethereum.org/EIPS/eip-8126` and `eips.ethereum.org/EIPS/eip-8004`                                                                                                                                                                                                                                                                                             |
| Upstream status at Last checked | ERC-8126 is in Last Call as of 2026-05-27 with a move-to-final pull request open at `ethereum/ERCs#1769`. ERC-8004 is a Draft created 2025-08-13.                                                                                                                                                                                                                   |
| PEAC artifact                   | `specs/conformance/interop/erc8126-attestation-format/` (positive and negative vectors); `docs/specs/ERC-8126-COMPOSITION.md`                                                                                                                                                                                                                                       |
| Composition                     | A PEAC interaction record references an ERC-8126-aligned attestation artifact, and ERC-8004 Validation Registry attestation references are observed in the same fixture surface. Canonicalization is RFC 8785 JCS for JSON attestations and EIP-712 typed data for on-chain attestations (preserved unchanged); digests are SHA-256 (JCS) and keccak-256 (EIP-712). |
| Boundary                        | PEAC records a reference to an attestation issued under ERC-8126. PEAC does not issue or validate the attestation, does not standardize ERC-8126, does not define risk values under it, and does not implement the Validation Registry.                                                                                                                             |
| Last checked                    | 2026-05-27T10:53:25Z                                                                                                                                                                                                                                                                                                                                                |

### 3. x402 — PEAC-owned surface only

| Field                           | Value                                                                                                                                                                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream source                 | `x402-foundation/x402` repository (default branch `main`)                                                                                                                                                                                                                                            |
| Upstream status at Last checked | Active official repository                                                                                                                                                                                                                                                                           |
| PEAC artifact                   | `specs/conformance/fixtures/x402/`; `packages/adapters/x402/` (`@peac/adapter-x402`); `packages/rails/x402/` (`@peac/rails-x402`); `docs/SOLUTIONS/cloudflare-x402-peac.md`                                                                                                                          |
| Composition                     | A PEAC interaction record preserves an observation of an x402 payment response or settlement-related response surfaced by a PEAC-owned x402 surface. The PEAC record envelope uses RFC 8785 JCS and SHA-256; the x402 facilitator response shape and settlement signature are preserved as observed. |
| Boundary                        | PEAC records observations from PEAC-owned x402 surfaces. PEAC does not execute settlement, hold funds, or act as a facilitator. This row anchors to the official upstream repository and to PEAC-owned surfaces only; PEAC-side recipes are implementation guidance only.                            |
| Last checked                    | 2026-05-27T10:53:25Z                                                                                                                                                                                                                                                                                 |

### 4. SCITT working group

| Field                           | Value                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream source                 | SCITT working group (`datatracker.ietf.org/wg/scitt/`); `draft-ietf-scitt-architecture`                                                                                                                                                                                                                                                         |
| Upstream status at Last checked | Working group active; `draft-ietf-scitt-architecture-22` dated 2026-05-26.                                                                                                                                                                                                                                                                      |
| PEAC artifact                   | `docs/specs/SCITT-COMPOSITION.md`                                                                                                                                                                                                                                                                                                               |
| Composition                     | A PEAC interaction record (compact JWS, `typ: interaction-record+jwt`) is the natural Signed-Statement payload for a SCITT-style transparency log. A SCITT log entry then carries the PEAC record plus the SCITT receipt as a Transparent Statement. PEAC verification (`verifyLocal()`) and SCITT verification remain independent.             |
| Boundary                        | PEAC does not host a transparency log, issue SCITT receipts, switch its wire-format default to COSE/CBOR, redefine SCITT terminology, or imply endorsement by the SCITT working group. Operators planning to expose PEAC records through a SCITT-style log MUST verify against the current architecture draft before relying on the wire shape. |
| Last checked                    | 2026-05-28T03:15:00Z                                                                                                                                                                                                                                                                                                                            |

## What this matrix does and does not say

PEAC records references and observations through committed PEAC artifacts and documented composition recipes. Upstream systems remain responsible for their own runtime behavior, registries, payment flows, validation, and release status. Inclusion here is descriptive and does not imply endorsement, dependency, or support by either project.

The matrix is informational. Wire format compatibility, normative spec text, and conformance requirements live in `specs/` and `docs/specs/`.

## Verification

Each row lists:

- a committed PEAC-side artifact;
- an upstream source anchor;
- a Last checked timestamp.

This matrix is informational. Normative requirements remain in `specs/` and `docs/specs/`.
