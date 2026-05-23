# PEAC and AP2 Composition

**Status:** Informative
**Version:** 0.1
**Applies to:** Operators who record verifiable interaction records
that reference AP2 mandate artifacts (open-checkout mandates and
related mandate kinds).

---

## Why this document exists

AP2 (Agent Payments Protocol) is a specification for delegated
payment mandates between principals and agents. AP2 issue
[#265](https://github.com/google-agentic-commerce/AP2/issues/265)
discusses a derivation rule for `open_mandate_hash`:

```text
open_mandate_hash = sha256_hex(JCS_RFC8785(unsigned open-checkout-mandate body))
```

(lowercase hexadecimal; the hash input is the claims object, not
the JWS compact form). PEAC composes with AP2 by recording
interaction-time observations that reference an existing
mandate; PEAC does not extend AP2 or replace the mandate
mechanism. AP2 normative authority lives outside this repository.

This document records the composition pattern and points to the
repository interop fixtures that exercise it.

## Boundary

- PEAC does not extend AP2 or introduce a parallel authorization
  model.
- PEAC does not mint mandates, sign mandates, or evaluate mandate
  validity.
- PEAC does not normatively compile AP2 mandate semantics into
  `@peac/policy-kit` policy decisions.
- PEAC's repository interop fixtures are intended as additional
  interoperability artifacts, not a change to AP2.

## Composition pattern

The recommended composition has three layers:

1. **Mandate issuance.** A principal and agent issue an unsigned
   open-checkout-mandate body and an accompanying JWS over that
   body, per AP2.
2. **Reference capture.** A PEAC-emitting consumer records the
   mandate by reference. The reference uses the
   `open_mandate_hash` as defined in AP2 issue #265
   (`sha256_hex(JCS_RFC8785(unsigned mandate body))`). PEAC does
   not embed the mandate body itself.
3. **Recording.** The consumer projects the reference into a
   PEAC interaction record. The verifier can reconstruct the
   reference deterministically from the same unsigned body and
   the same derivation rule.

PEAC records references to AP2 mandate artifacts; PEAC does not
extend the AP2 mandate mechanism.

## Verifier guidance

A PEAC verifier that processes an AP2 mandate reference:

- may surface the `open_mandate_hash`, the mandate type
  identifier, and any other observation fields drawn from the
  AP2 surface.
- must not treat the presence of a reference as a substitute for
  verifying the upstream JWS-signed mandate envelope itself.
- must not re-derive the `open_mandate_hash` from a non-JCS
  canonicalization or a non-SHA-256 digest function. The
  derivation in AP2 issue #265 is the only one PEAC recognizes
  for this composition pattern.

## Repository interop fixtures

This repository includes 3 positive and 2 negative interop
fixtures for the `open_mandate_hash` derivation at
[`specs/conformance/interop/ap2-open-mandate-hash/`](../../specs/conformance/interop/ap2-open-mandate-hash/README.md).
Positive fixtures cover baseline, budget-bound, and expiry-bound
mandate shapes. Negative fixtures cover the two most common
composition failure modes: using a non-SHA-256 digest function on
the canonical bytes, and using a non-JCS canonicalization rule on
the input bytes.

These fixtures are scenario-shaped and do not target the
canonicalization edge cases already covered by the
cross-implementation work in AP2 issue #265 (object-key-order,
array-order, optional fields, currency-minor-unit, Unicode NFC
vs NFD). They are intended as additional interoperability
fixtures, not as a replacement for the vector set discussed in
AP2 issue #265.

## Related work

- [AP2 issue #265: v0 conformance vectors for `open_mandate_hash`](https://github.com/google-agentic-commerce/AP2/issues/265)
- [RFC 8785: JSON Canonicalization Scheme (JCS)](https://datatracker.ietf.org/doc/html/rfc8785)
- [`specs/conformance/interop/ap2-open-mandate-hash/README.md`](../../specs/conformance/interop/ap2-open-mandate-hash/README.md)
- [`scripts/verify-interop-vectors.mjs`](../../scripts/verify-interop-vectors.mjs)
