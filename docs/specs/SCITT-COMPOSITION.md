# PEAC and SCITT Composition

**Status:** Informative
**Document version:** 0.2
**Applies to:** Operators registering PEAC interaction records with a
SCITT Transparency Service

SCITT (Supply Chain Integrity, Transparency, and Trust) is defined by
[RFC 9943](https://www.rfc-editor.org/rfc/rfc9943.html) (An Architecture
for Trustworthy and Transparent Digital Supply Chains; Standards Track,
June 2026), with COSE Receipts defined by
[RFC 9942](https://www.rfc-editor.org/rfc/rfc9942.html) (Standards Track,
June 2026).

---

## Why this document exists

SCITT defines a COSE-based architecture in which an Issuer signs a Signed
Statement over a Statement payload, a Client registers it with a
Transparency Service, the Transparency Service applies its Registration
Policy and produces a Receipt, and the Signed Statement together with its
Receipts forms a Transparent Statement. PEAC interaction records use a
JWS-based wire format.

This document describes how the two compose. It is informative; it does
not change the PEAC wire format.

## Boundary

- PEAC interaction records use a JWS-based wire format. This composition
  wraps an existing PEAC record in an external SCITT Signed Statement and
  does not change PEAC's wire format.
- PEAC does not operate a Transparency Service. Deployers run one
  themselves or use an existing Transparency Service operator.
- PEAC does not redefine SCITT terminology. The mapping below reflects
  RFC 9943 and RFC 9942; operators verify against those documents when
  implementing.

## Roles and objects

| SCITT term (RFC 9943 / RFC 9942) | Meaning in this composition                                                                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Statement                        | The application content carried as the COSE_Sign1 payload, or supplied as its detached payload. In the full-record composition described here, the Statement is the compact PEAC interaction record (JWS) bytes.            |
| Signed Statement                 | The RFC 9943 COSE_Sign1 envelope that authenticates the Statement together with the protected-header context.                                                                                                               |
| Issuer (SCITT)                   | The entity that signs the outer SCITT Signed Statement. It is not automatically the PEAC record issuer. The roles and signatures remain distinct even when the same organization or key infrastructure performs both roles. |
| Client                           | The application that registers the Signed Statement with the Transparency Service. The Client may act on behalf of an Issuer and need not be the Issuer.                                                                    |
| Transparency Service             | The service that applies its Registration Policy, adds the Signed Statement to its Verifiable Data Structure (VDS), and produces or makes a Receipt available.                                                              |
| Receipt                          | An RFC 9942 COSE Receipt carrying one or more proofs of VDS properties. An inclusion proof and a consistency proof are distinct proof types.                                                                                |
| Transparent Statement            | The Signed Statement augmented with one or more Receipts in the unprotected `receipts` header parameter (label 394).                                                                                                        |
| Relying Party / verifier         | Can validate the outer SCITT Signed Statement, each Receipt on which it relies, and the embedded compact JWS with its PEAC semantics, independently.                                                                        |

## PEAC issuer identity

The PEAC `iss` payload claim identifies the record issuer. The protected
`kid` header is used to select or reference a verification key according
to the issuer's key-resolution policy. The `iss` payload claim and the
`kid` header identify different things (an identity and a key selector)
and are not the same role.

## SCITT protected header and Subject

- The protected CWT Claims header of the Signed Statement contains the
  outer SCITT `iss` and `sub`.
- The SCITT `sub` identifies the Artifact about which the Statement is
  made. It is not automatically the PEAC issuer, `jti`, `receipt_ref`, or
  `workflow_id`.
- `kid` is required when neither `x5t` nor `x5chain` is present in the
  protected header, per RFC 9943's key-reference rules.
- X.509-based profiles have the additional certificate-reference and
  path-validation requirements defined by
  [RFC 9360](https://www.rfc-editor.org/rfc/rfc9360.html).
- The outer SCITT claims are independent of the embedded PEAC claims.
- This composition does not define a universal mapping from PEAC `iss`,
  `jti`, `receipt_ref`, or `workflow_id` to the SCITT `iss` or `sub`.
  Operators document their own Subject mapping so that statements about
  the same artifact can be correlated consistently.

## Media types

- When transferred as a SCITT Signed Statement, the outer serialized
  object uses `application/scitt-statement+cose`.
- The COSE protected Content Type header identifies the Statement
  payload, not the outer envelope.
- In the full-record composition described here, the embedded compact
  PEAC JWS payload uses `application/jose` (with the JOSE
  `typ: interaction-record+jwt`).
- A separately transferred SCITT Receipt uses
  `application/scitt-receipt+cose`.
- This document registers no new PEAC or SCITT media type. Registered
  media-type semantics follow
  [RFC 6838](https://www.rfc-editor.org/rfc/rfc6838.html).

## Composition pattern

1. A PEAC issuer issues the compact PEAC interaction record (JWS) via
   `issue()` (`typ: interaction-record+jwt`).
2. A SCITT Issuer creates the outer COSE_Sign1 Signed Statement over that
   payload. The SCITT Issuer can be the PEAC issuer or a separate
   composition component.
3. A Client registers the Signed Statement with a Transparency Service.
4. The Transparency Service applies its Registration Policy, registers
   the Signed Statement in its VDS, and produces or makes a Receipt
   available.
5. Receipt availability can be synchronous or asynchronous depending on
   the service and its API.
6. The Client adds one or more Receipts to the Signed Statement's
   unprotected `receipts` header to form a Transparent Statement.
7. A Relying Party can validate the Signed Statement, each Receipt on
   which it relies, and the embedded PEAC record, independently. A
   relying party's acceptance policy determines which of these it
   requires.

## Transparent Statement and Receipt verification

- Receipts are attached through an unprotected header. Attaching a
  Receipt does not alter or extend the Issuer's signature on the Signed
  Statement. Each Receipt therefore has to be verified independently
  under an accepted Transparency Service identity and Receipt Profile.
- Receipt verification includes the COSE signature, the Receipt Profile
  and VDS algorithm, and every inclusion or consistency proof on which
  the relying party depends. A valid Receipt signature over an invalid or
  unsupported proof is not successful verification.

## Assurance

- An inclusion proof demonstrates registration in a particular VDS state.
  It does not establish consistency between different VDS states.
  Append-only and non-equivocation assurance requires the applicable
  consistency proof and/or the relevant auditor and Transparency Service
  mechanisms.
- Registration time is recorded by the Transparency Service when it adds
  the Signed Statement to its VDS. It is an assertion made under the
  Transparency Service identity, Registration Policy, and
  Receipt-verification model; it is not independent trusted time.
- SCITT registration does not by itself establish the PEAC verification
  result or the truth of the embedded record's claims. Verify the PEAC
  record independently.

## Full-record and digest-only composition

The full-record pattern places the compact PEAC JWS bytes in the SCITT
Statement payload.

RFC 9943 also permits a Statement over a hash of external content. This
document does not define a canonical digest-only SCITT payload, Subject
mapping, or media type for PEAC. Operators using that pattern document
the digest kind, algorithm, source bytes, serialization, and retrieval
binding needed to reproduce and verify it.

## Privacy

Before registration, the Issuer and Client should assess whether the
Transparency Service's privacy and security posture is appropriate for
the submitted Signed Statement. Review any private, confidential, or
Personally Identifiable Information (PII) before submission. Signing or
hashing content does not make it confidential.

## What this composition does not claim

- It does not add a new wire field to PEAC.
- It does not claim that a SCITT Receipt is a PEAC verifier report, or
  that a PEAC verifier report is a SCITT Receipt.
- It does not change PEAC's policy or terms binding semantics. Those
  remain on the PEAC record per
  [docs/specs/DOCUMENT-BINDING.md](DOCUMENT-BINDING.md).

## Cross-references

- [docs/specs/DOCUMENT-BINDING.md](DOCUMENT-BINDING.md): per-representation
  envelope binding semantics.
- [docs/specs/VERIFICATION-REPORT-FORMAT.md](VERIFICATION-REPORT-FORMAT.md):
  PEAC verifier report shape (distinct from SCITT Receipts).
- [docs/specs/X402-PROFILE.md](X402-PROFILE.md): commerce composition.

## References

- [RFC 9943: An Architecture for Trustworthy and Transparent Digital
  Supply Chains](https://www.rfc-editor.org/rfc/rfc9943.html) (SCITT
  architecture; Standards Track, June 2026).
- [RFC 9942: CBOR Object Signing and Encryption (COSE)
  Receipts](https://www.rfc-editor.org/rfc/rfc9942.html) (Standards
  Track, June 2026).
- [RFC 9597: CBOR Web Token (CWT) Claims in COSE
  Headers](https://www.rfc-editor.org/rfc/rfc9597.html).
- [RFC 9360: CBOR Object Signing and Encryption (COSE): Header Parameters
  for Carrying and Referencing X.509
  Certificates](https://www.rfc-editor.org/rfc/rfc9360.html).
- [RFC 9052: CBOR Object Signing and Encryption (COSE)](https://www.rfc-editor.org/rfc/rfc9052.html).
- [RFC 6838: Media Type Specifications and Registration
  Procedures](https://www.rfc-editor.org/rfc/rfc6838.html).
- [RFC 8392: CWT Claims](https://www.rfc-editor.org/rfc/rfc8392.html).
- [RFC 7515: JSON Web Signature (JWS)](https://www.rfc-editor.org/rfc/rfc7515.html):
  the PEAC signing format used by `issue()`.
