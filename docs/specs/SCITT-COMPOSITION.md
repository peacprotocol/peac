# PEAC and SCITT Composition

**Status:** Informative
**Version:** 0.1
**Applies to:** Operators planning to expose PEAC interaction records
through a SCITT-style transparency log
([draft-ietf-scitt-architecture](https://datatracker.ietf.org/doc/draft-ietf-scitt-architecture/);
nearing publication at the time of writing (2026-04). Check
Datatracker for the current state before relying on the wire shape).

---

## Why this document exists

SCITT (Supply Chain Integrity, Transparency, and Trust) defines a
COSE_Sign1-based transparency-log architecture for "signed
statements" with "receipts" and "transparent statements." PEAC ships
JWS-based interaction records on the wire today.

This document describes how the two compose. It is informative; it
does not change the PEAC wire format.

## Boundary

- PEAC does not switch its wire-format default to COSE/CBOR.
  COSE/CBOR remains experimental in PEAC; the v0.13.x reboot covers
  any wire-codec evolution under its own gates.
- PEAC does not host a transparency log. SCITT-aware deployers
  operate the log themselves or use an existing operator.
- PEAC does not redefine SCITT terminology. The mapping below
  reflects the SCITT architecture draft; operators MUST verify
  against the latest draft when implementing.

## Term mapping

| SCITT term            | PEAC analogue                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Signed Statement      | A PEAC interaction record (JWS) is the natural "Statement" payload. The signing identity is the issuer in the JOSE header.     |
| Receipt               | Currently SCITT-specific; PEAC verifier reports are the closest local analogue but are not byte-equivalent to a SCITT receipt. |
| Transparent Statement | A SCITT log entry containing the PEAC record + the SCITT receipt for that record.                                              |
| Issuer                | The PEAC issuer (same identity surfaced via `kid` and `iss`).                                                                  |
| Verifier              | A SCITT verifier MAY accept the PEAC record as the wrapped Statement. PEAC `verifyLocal()` is independent.                     |

## Composition pattern

The recommended composition has three steps:

1. **Issue.** The operator issues a PEAC interaction record via
   `issue()`. The record is a compact JWS with `typ:
interaction-record+jwt`.
2. **Wrap.** The operator wraps the JWS as the payload of a SCITT
   Signed Statement. The SCITT signing identity MAY be the same as
   the PEAC issuer; it MAY also be a separate transparency-service
   identity.
3. **Append.** The Signed Statement is submitted to a SCITT-style
   log. The log returns a SCITT Receipt; the operator stores both as
   a Transparent Statement.

PEAC verification (`verifyLocal()`) and SCITT verification are
independent. A consumer MAY check the PEAC signature without ever
touching the SCITT log; a consumer MAY check the SCITT receipt
without parsing the PEAC record.

## What this composition does NOT claim

- It does not add a new wire field to PEAC.
- It does not claim that a SCITT receipt is a PEAC verifier report.
- It does not claim that a PEAC verifier report is a SCITT receipt.
- It does not change PEAC's policy or terms binding semantics. Those
  remain on the PEAC record per
  [docs/specs/DOCUMENT-BINDING.md](DOCUMENT-BINDING.md).

## Cross-references

- [docs/specs/DOCUMENT-BINDING.md](DOCUMENT-BINDING.md): per-
  representation envelope binding semantics.
- [docs/specs/VERIFICATION-REPORT-FORMAT.md](VERIFICATION-REPORT-FORMAT.md):
  PEAC verifier report shape (distinct from SCITT receipts).
- [docs/specs/X402-PROFILE.md](X402-PROFILE.md): commerce composition.

## References

- [`draft-ietf-scitt-architecture`](https://datatracker.ietf.org/doc/draft-ietf-scitt-architecture/):
  current draft at the time of writing (2026-04). Check Datatracker
  for the latest revision before implementation.
- [RFC 9052: CBOR Object Signing and Encryption (COSE)](https://www.rfc-editor.org/rfc/rfc9052.html).
- [RFC 8392: CWT Claims](https://www.rfc-editor.org/rfc/rfc8392.html).
- [RFC 7515: JSON Web Signature (JWS)](https://www.rfc-editor.org/rfc/rfc7515.html):
  the PEAC signing format used by `issue()`.
