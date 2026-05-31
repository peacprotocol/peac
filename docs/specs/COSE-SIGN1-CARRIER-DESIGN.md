# COSE-Sign1 Carrier Design Note

**Status:** Informative. Design note only.

This note describes a possible future COSE-Sign1 carrier option for PEAC signed
records. It does not change runtime behavior, wire behavior, verification
semantics, package exports, or dependencies. No COSE carrier is implemented by
this note.

## 1. Current state

PEAC signed records use the existing compact JWS carrier. The record-core codec
abstraction lives at `packages/protocol/src/_internal/record-core/codec/`, with
the canonical codec in `jws-jwt.ts`. The codec layer is internal: its types (for
example `CodecHeader` with `typ`, `alg`, `kid`, and the raw protected header) are
never re-exported from `@peac/protocol`, and a dist-leak gate asserts they stay
internal.

The HTTP body remains `application/json` (or the `PEAC-Receipt` header), and the
carried record is a compact JWS whose JOSE header `typ` is
`interaction-record+jwt`. None of that changes here.

## 2. Motivation

- Signing-envelope agility: keep the carrier layer pluggable so it is not
  permanently coupled to a single serialization.
- Compatibility with standards-adjacent signed-envelope review: COSE-Sign1 is a
  widely reviewed signed-envelope structure, and a documented carrier path makes
  PEAC easier to evaluate against that family.
- Carrier optionality: allow a future second carrier without disturbing the
  record-first model.

## 3. Non-goals

- No production COSE carrier defined by this note.
- No migration of existing records.
- No breaking change to the wire format or public API.
- No new trust model and no change to how verification decides validity.
- No transaction-processing or commerce behavior of any kind.

## 4. Carrier boundary

A COSE-Sign1 carrier would be an additional internal codec alongside the JWS
codec, selected at the codec layer only. It would be a carrier option, not a
replacement for PEAC record semantics.

PEAC semantics remain record-first regardless of carrier:

1. Issue a signed record.
2. Bind the signed record to referenced content using the digest rules defined
   for that carrier.
3. Preserve the signed record across organizational, vendor, and runtime
   boundaries.
4. Verify it offline with the issuer public key.

For the current compact JWS carrier, existing `receipt_ref` behavior remains
unchanged. A COSE-Sign1 carrier would need its own explicit digest input rule
before implementation, including whether the digest covers the COSE envelope
bytes, the semantic payload bytes, or another canonical byte sequence. This note
does not define that rule.

A COSE carrier would carry the same PEAC record semantics under a different
envelope; it would not introduce new fields, new authority, or a different
validity model.

## 5. Fixture acceptance criteria (for any future implementation)

Acceptance fixtures would be required before any implementation is considered.
Positive fixtures must pin:

- A deterministic record payload (stable, canonical payload bytes).
- The protected header set and its required members.
- The algorithm identifier rules (which signature algorithms are accepted).
- The exact verification inputs (payload bytes, protected header, signature,
  public key).
- The COSE_Sign1 payload mode: embedded or detached.
- The protected-header byte string used for verification.
- The external AAD value, including whether it is the empty byte string.
- The COSE signing structure bytes used by the verifier.
- The content-type or equivalent carrier identifier, if one is used.

Negative fixtures must cover at least:

- Malformed protected headers.
- Altered payload bytes.
- Invalid signature.
- Wrong or missing content type.
- Unsupported algorithm identifier.
- Mismatched external AAD.
- Detached-payload mismatch, if detached payloads are allowed.
- Malformed CBOR or non-deterministic CBOR where deterministic encoding is
  required.
- Header algorithm mismatch between the protected header and the verifier
  expectation.

These mirror the determinism and negative-case discipline already used by the
existing carrier and conformance vectors.

## 6. Deferral

Implementation is out of scope for this note and requires a separate reviewed
change. This matches the standards ledger, which lists the COSE family as
watchlist with no implementation commitment: a future codec is gated on
benchmarks against real workloads, tooling maturity, and migration safety.

## 7. Standards references

The following are the relevant primary references for a COSE-Sign1 carrier.
Confirm exact section requirements against the primary sources before any
implementation.

- RFC 9052: CBOR Object Signing and Encryption (COSE), including the COSE_Sign1
  structure.
- RFC 9053: COSE Algorithms.
- RFC 8949: Concise Binary Object Representation (CBOR).

See also `docs/STANDARDS_LEDGER.md` for the current status classification of
these references within PEAC.
