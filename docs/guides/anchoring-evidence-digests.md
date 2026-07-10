# External registration and timestamping of PEAC evidence digests

**Status:** Informative

This guide describes how an operator can register, timestamp, or
checkpoint a PEAC evidence digest using an external transparency service,
an RFC 3161 timestamp authority, a signed repository checkpoint, or
another explicitly documented mechanism. It adds no normative requirement
and no PEAC field. PEAC does not operate a log, a chain, or a timestamp
authority; anchoring is an operator composition.

This guide defines no universal `anchor_ref` field, no external-anchor
record schema, and no canonical digest-only SCITT payload.

## What you can anchor

Three digest forms already produced by PEAC are suitable for external
registration or timestamping. Each is a lowercase `sha256:<hex64>`
string:

- **`receipt_ref`** - the SHA-256 over a record's compact JWS bytes
  (`@peac/schema` `computeReceiptRef`).
- **dispute-bundle `content_hash`** - the SHA-256 over the JCS-canonical
  dispute-bundle manifest (`@peac/audit` `createDisputeBundle` /
  `verifyBundle`).
- **`receipt_merkle_root`** - a commitment over a sorted set of
  `receipt_ref`s (`@peac/audit` `buildReceiptMerkleCommitment`).

## What each mechanism does and does not establish

External registration can establish inclusion, ordering, or time evidence
depending on the chosen mechanism and its trust model. It does not
establish the validity, completeness, authorization, or truth of the
underlying PEAC record; verify the PEAC record independently.

| Mechanism                                                | What the retained proof can establish                                                                                                                                                                                    | What it does not establish                                                                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SCITT Transparency Service (RFC 9943, receipts RFC 9942) | Verified registration or inclusion of the Signed Statement under the service's Registration Policy, accepted Receipt Profile, and applicable VDS algorithm; an inclusion proof shows inclusion in the relevant VDS state | Consistency between multiple VDS states (needs a consistency proof), or the validity/truth of the PEAC record. A signed but invalid or unsupported proof is not successful verification                              |
| RFC 3161 timestamp authority                             | A verified timestamp token provides evidence that the submitted message imprint existed no later than the TSA's `genTime`, interpreted with the token's `accuracy`, accepted TSA policy, and the verifier's trust model  | Meaning, validity, authorization, settlement, or completeness of the PEAC record; and the exact time of the underlying PEAC-recorded interaction (only the latest evidenced existence time of the submitted imprint) |
| Signed git tag                                           | A signer authenticated a repository checkpoint or tag content                                                                                                                                                            | Independent trusted time, append-only history, or public transparency                                                                                                                                                |
| Generic append-only log                                  | Only the inclusion, ordering, consistency, or time properties its specific receipt or proof format defines                                                                                                               | Any generic trusted-time or validity property not present in that proof                                                                                                                                              |

Retain the external proof artifact itself (a SCITT Receipt, an RFC 3161
token, a tag signature, or a log receipt), not only a URL or a
transaction identifier. For long-lived timestamp evidence, retain the TSA
certificate chain, policy identifier, token, and verification material; a
token being present does not make its trust perpetual.

For a signed Git checkpoint, place the digest kind and digest directly in
the signed annotated-tag message, or place them in a committed manifest
reachable from the signed tag. Retain the tag object ID, commit or tree
binding, manifest path, exact serialization, and signature verification
material. A signature over an unrelated repository checkpoint does not
bind the PEAC digest, and Git signing provides no independent trusted
time or generic append-only transparency.

## Digest handling (do not anchor the wrong bytes)

A digest is not encryption. It does not expose the underlying bytes
directly, but low-entropy or guessable inputs may be testable, and the
digest remains a stable correlator across places it is registered.

1. Validate the lowercase `sha256:<64-hex>` reference.
2. Preserve the digest kind (`receipt_ref`, dispute-bundle
   `content_hash`, or `receipt_merkle_root`); do not mix kinds.
   For a Merkle commitment, retain the complete commitment metadata
   (`tree_alg`, `hash_alg`, and `tree_size`) and every inclusion proof
   the relying party needs. The bare root does not identify the tree
   algorithm, set size, or membership path. A valid inclusion proof
   establishes membership under the stated commitment algorithm; it does
   not establish chronology, completeness, privacy, payment finality,
   authorization, or legal validity.
3. For RFC 3161, decode the hex to the raw 32-byte SHA-256 digest and use
   the SHA-256 algorithm identifier in the `MessageImprint`. Use a client
   API that accepts a precomputed message imprint.
4. Do not submit the UTF-8 bytes of the string `"sha256:<hex>"` as though
   they were the raw digest, and do not let a client API hash the digest a
   second time unless that second hash is explicitly intended and
   documented.
5. If an external service wraps or re-hashes the value, retain the exact
   encoding and transformation description needed to reproduce it.

## RFC 3161 verification checklist

When verifying a timestamp token, check all of the following per the
verifier's policy:

- the token's `messageImprint` algorithm and digest bytes exactly match
  the submitted imprint;
- if the request included a nonce, the returned token contains the same
  nonce value; if no nonce was used, the verifier applies an explicit
  trusted local-time and response-window policy;
- the CMS signature verifies;
- the token signer is bound to its certificate through `SigningCertificate`
  / `ESSCertID` or `SigningCertificateV2` / `ESSCertIDv2` (defined in RFC
  5035; required by RFC 5816 whenever an algorithm other than SHA-1 is
  used), preferring the v2 form for algorithm agility;
- the certificate path, validity, status, TSA policy, and trust-anchor
  acceptance are acceptable under the verifier's policy;
- the signing certificate carries `id-kp-timeStamping` as its sole
  Extended Key Usage value, marked critical (RFC 3161);
- archival verification retains the token, relevant certificate and
  trust material, policy identifier, and any revocation or validation
  evidence required by the verifier's long-term-validation policy.

## SCITT registration patterns

Two patterns compose PEAC with a SCITT Transparency Service (see
[PEAC and SCITT Composition](../specs/SCITT-COMPOSITION.md), RFC 9943 /
RFC 9942):

- **Full-record registration.** Place the compact PEAC JWS in the
  Statement payload of the RFC 9943 Signed Statement.
- **Digest-only registration.** Use an operator-defined Statement payload
  that binds the digest and its kind, then authenticate it as an RFC 9943
  Signed Statement.

An inclusion proof shows registration in the relevant VDS state; it does
not by itself show consistency or non-equivocation, which require the
corresponding proof type or service mechanism. Before registration,
assess the Transparency Service's privacy and security posture; a digest
hides bytes but remains a correlator, so submit only the minimum digest
and type context the mechanism requires.

## Related COSE composition

[RFC 9921](https://www.rfc-editor.org/rfc/rfc9921.html) defines COSE
header parameters for carrying RFC 3161 timestamp tokens, with two
distinct constructions:

- **COSE, Then Timestamp (CTT):** timestamps the COSE signature-related
  value after the COSE signature is produced.
- **Timestamp, Then COSE (TTC):** timestamps the payload before the COSE
  signature is produced.

They bind different inputs and provide different evidence; a TTC payload
timestamp must not be interpreted as proof of the COSE signature's
creation time. This is relevant only when an external COSE composition
carries an RFC 3161 token; it does not change PEAC's JWS wire format.

[ERC-8126 / ERC-8004](../specs/ERC-8126-COMPOSITION.md) attestation
references are a related composition surface, not a general anchoring
route. PEAC records references to external attestations; it does not
define, validate, or operate the external registry or chain. Do not treat
it as generic digest anchoring.

## Boundary

PEAC does not anchor, host a log, operate a chain, or run a timestamp
authority in its core. Anchoring is an operator composition: an operator
submits a PEAC digest to a service it or a third party operates. The
anchor's assurances are those of the chosen mechanism; they do not
replace independent verification of each PEAC record.

## References

- [PEAC and SCITT Composition](../specs/SCITT-COMPOSITION.md)
- [When not to use PEAC](../WHEN_NOT_TO_USE_PEAC.md)
- [RFC 9943 (SCITT Architecture)](https://www.rfc-editor.org/rfc/rfc9943.html),
  [RFC 9942 (COSE Receipts)](https://www.rfc-editor.org/rfc/rfc9942.html)
- [RFC 3161 (Time-Stamp Protocol)](https://www.rfc-editor.org/rfc/rfc3161.html),
  [RFC 5816 (ESSCertIDv2 Update for RFC 3161)](https://www.rfc-editor.org/rfc/rfc5816.html)
  (updates RFC 3161),
  [RFC 5035 (ESSCertIDv2 / SigningCertificateV2)](https://www.rfc-editor.org/rfc/rfc5035.html),
  [RFC 9921 (RFC 3161 tokens in COSE)](https://www.rfc-editor.org/rfc/rfc9921.html)
