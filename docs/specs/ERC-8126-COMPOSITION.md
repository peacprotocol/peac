# PEAC and ERC-8126 Composition

**Status:** Informative
**Version:** 0.1
**Applies to:** Operators who record verifiable interaction records
that reference ERC-8126 attestations posted to an ERC-8004
Validation Registry.

---

## Why this document exists

[ERC-8126](https://eips.ethereum.org/EIPS/eip-8126) is an Ethereum
standards-process document describing a verification surface for
on-chain agents. ERC-8126 references ERC-8004 and is intended to
flow its verification outputs through ERC-8004's Validation
Registry. PEAC composes with ERC-8126 by recording
interaction-time observations that reference an existing
Validation Registry attestation; PEAC does not standardize the
attestation surface itself.

This document records that composition pattern and points to the
repository interop fixtures that exercise it.

## Boundary

- PEAC does not standardize ERC-8126 or ERC-8004.
- PEAC does not host the Validation Registry, post attestations to
  it, or calculate or assign ERC-8126 risk scores.
- PEAC does not impose a verification-type enumeration on
  ERC-8126; the verification-type acronyms (ETV, MCV, SCV, WAV,
  WV, and the optional PDV and QCV) are defined by ERC-8126
  itself.
- PEAC does not require any particular attestation carrier. A
  PEAC interaction record may reference an attestation regardless
  of how that attestation was carried on-chain or off-chain.

## Carrier label used by these fixtures

These fixtures model three carrier examples: JWS compact
serialization, EIP-712 typed data, and an on-chain reference.

The repository interop fixtures cover these three carrier labels
explicitly:

- `jws`
- `eip712`
- `onchain`

This fixture set does not include a COSE-Sign1 vector. This
repository does not include a PEAC COSE carrier implementation.

The repository fixtures are at
[`specs/conformance/interop/erc8126-attestation-format/`](../../specs/conformance/interop/erc8126-attestation-format/README.md).
These fixtures use `attestationFormat` as fixture metadata so a
verifier can distinguish among carrier examples. ERC-8126 and
ERC-8004 define their own registry semantics; this fixture field
is not required by PEAC and is not defined by PEAC.

## Composition pattern

The recommended composition has three layers:

1. **Attestation post.** An ERC-8126-aligned verifier produces a
   verification result and posts an attestation to the
   ERC-8004 Validation Registry. The attestation references the
   chosen carrier.
2. **Reference capture.** A PEAC-emitting consumer records the
   attestation by reference: it stores an opaque
   `attestation_ref` plus a carrier label (if known) and the
   verification-type acronym (if known). PEAC does not embed the
   carrier-specific payload itself.
3. **Recording.** The consumer projects the reference into a
   PEAC interaction record. The verifier reconstructs the
   reference deterministically; no network call to the Validation
   Registry is required at verification time.

PEAC records references to ERC-8126-aligned attestation
artifacts and does not standardize ERC-8126.

## Verifier guidance

A PEAC verifier that processes an ERC-8126 attestation reference:

- may surface the `attestation_ref`, the verification-type
  acronym, and the carrier label in its verification report.
- must not treat the presence of a reference as a substitute for
  upstream verification. A PEAC verifier that wishes to verify
  the underlying attestation must do so through the relevant
  carrier-specific path; PEAC does not embed that verification.
- must not mint a verification-type acronym or invent a carrier
  label not recognized by ERC-8126 or its registered extensions.

## Related work

- [ERC-8126 specification](https://eips.ethereum.org/EIPS/eip-8126)
- [ERC-8004 specification](https://eips.ethereum.org/EIPS/eip-8004)
- [`specs/conformance/interop/erc8126-attestation-format/README.md`](../../specs/conformance/interop/erc8126-attestation-format/README.md)
- [`scripts/verify-interop-vectors.mjs`](../../scripts/verify-interop-vectors.mjs)
