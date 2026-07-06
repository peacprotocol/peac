# Paid Resource Evidence

**Status:** Informative

This document adds no normative requirement to the wire format and no field to
any record. It describes how PEAC's existing record shape composes to carry
evidence for a paid-resource interaction, using the x402 offer/receipt
extension as the primary demonstrated binding. The same composition applies
equally to other payment-observation profiles (paymentauth, MPP, UCP): the
pattern is protocol-neutral, not x402-specific.

## Purpose

A paid-resource interaction (an agent or client paying to access a resource
behind a 402 challenge) produces several distinct artifacts: the offer terms
the resource advertised, the signed receipt a facilitator or payer returned,
and, optionally, upstream protocol-extension data attached to the settlement
response. PEAC records what happened without settling the payment, pricing
the resource, or verifying the payment scheme's own invariants. This document
describes the record composition and the privacy posture for the artifacts
it preserves.

## Record Composition

A paid-resource record is the existing `org.peacprotocol/payment` record
shape (see [COMMERCE-EVIDENCE.md](COMMERCE-EVIDENCE.md) for the commerce
extension fields), optionally bound to an upstream artifact via
`upstream_artifact_digest`. No new record type or extension group is
introduced by this document; see [X402-PROFILE.md](X402-PROFILE.md) and
[X402-V2-PROFILE.md](X402-V2-PROFILE.md) for the normative x402 mapping this
document describes the evidence posture around.

## Offer-Terms Digest (Verifier-Report-Only)

A publisher's advertised offer terms may be bound into a verifier report via
a digest, following the same document-binding pattern used for policy
documents (see [DOCUMENT-BINDING.md](DOCUMENT-BINDING.md)). This binding is
report-only: it surfaces in the verifier's output for the caller's own
comparison and is never stamped into the signed record itself.

## Payment-Artifact Preservation in Proofs

Per the x402 offer/receipt profile (`peac-x402-offer-receipt/0.2`), the raw
signed offer and signed receipt artifacts are preserved verbatim under
`proofs.x402` (never mutated, never reconstructed). When a settlement
response also carries upstream protocol-extension data (an `extensions` bag,
which may embed a signed receipt via the offer-receipt extension, or
unrelated sibling extensions this adapter does not interpret), that data is
preserved under `proofs.x402` using a privacy-hardened default:

- A stable content digest, `settlementExtensionsDigest`
  (`sha256:<64 lowercase hex>`, computed over the RFC 8785 JCS
  canonicalization of the `extensions` object), is added whenever a
  settlement `extensions` object is present.
- The raw `extensions` bag is preserved under `settlementExtensions` only
  when the caller opts in, as a canonical JSON clone (derived from the
  bounded RFC 8785 JCS bytes, not the caller's original object reference or
  byte serialization); it is omitted by default.

`settlementExtensionsDigest` is an **integrity/correlation** handle, not
anonymization: two records that preserve the same upstream settlement
extensions share the same digest. It does not redact, hash away, or make
unlinkable anything about the underlying data; it is a stable equality check
a verifier can use to confirm two records reference the same settlement
extension content without needing the raw bytes.

## Privacy and Redaction

The settlement `extensions` bag is upstream protocol-extension data and MAY
carry payer- or resource-correlating material that the adapter does not
otherwise interpret. Because of this, raw preservation is opt-in only
(`preserveRawSettlementExtensions`); the default posture stores only the
digest. Raw settlement headers or transport-level artifacts are never
embedded in signed evidence, regardless of this opt-in: the preservation
described here is scoped strictly to the settlement response body's
`extensions` object, and only within the unsigned `proofs` bundle, never
within signed record fields.

## Idempotency and Replay

A paid-resource record carries the same `(iss, jti)` uniqueness guarantee as
any PEAC record. Deployers that need bounded online replay defense for
paid-resource records can apply the same optional acceptance policy described
in [REPLAY-GUARD-PROFILE.md](REPLAY-GUARD-PROFILE.md); that guidance is
unchanged and unaffected by this document.

## Issuer Roles

The issuer of a paid-resource record is whichever party signs it (typically
the resource server, gateway, or an intermediary observing the settlement).
This document does not assign or require a specific issuer role; it
describes the evidence shape once a record is issued, not who is authorized
to issue it.

## Non-Goals

PEAC does not, through this evidence composition or any other:

- Settle payments, execute transfers, or move funds.
- Price resources or determine what should be charged.
- Gate access to a resource or make an authorization decision.
- Verify scheme-specific payment invariants (single-use, time bounds,
  recipient binding, facilitator binding, or settled-vs-authorized amount
  correctness). Those remain the responsibility of the upstream payment
  protocol and its facilitator surfaces.
- Detect bots or fraud.
- Run a marketplace, checkout flow, or payment rail.
- Claim any partnership, endorsement, or provider relationship with any
  payment scheme, facilitator, or vendor.

## Cross-References

- [X402-PROFILE.md](X402-PROFILE.md) - normative x402 offer/receipt mapping
- [X402-V2-PROFILE.md](X402-V2-PROFILE.md) - normative x402 v2 mapping
- [COMMERCE-EVIDENCE.md](COMMERCE-EVIDENCE.md) - commerce extension fields
  and rail neutrality
- [DOCUMENT-BINDING.md](DOCUMENT-BINDING.md) - document digest and binding
  helpers
- [REPLAY-GUARD-PROFILE.md](REPLAY-GUARD-PROFILE.md) - optional online
  replay defense
