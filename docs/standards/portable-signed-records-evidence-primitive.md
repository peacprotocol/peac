# Portable signed interaction records: an evidence primitive

**Status:** Informative.
**Last checked:** 2026-06-26.

This document defines the portable signed interaction record as an evidence primitive: a single, self-contained
artifact that records what was reported about an interaction, is signed by an issuer, and can be verified across organizational,
vendor, and runtime boundaries. It is a neutral technical reference for the record format and its properties.
For the mapping of this primitive to specific evaluation, audit, transparency, authorization, and security
contexts, see [`docs/interop/PORTABLE-SIGNED-RECORDS-CROSSWALK.md`](../interop/PORTABLE-SIGNED-RECORDS-CROSSWALK.md).

## 1. Definition

A portable signed interaction record is a compact JSON Web Signature (JWS) carrying a canonicalized, signed
statement about a reported interaction. The following properties are fixed by the wire format and the signing and
canonicalization rules used in this repository.

- **Wire format.** The frozen receipt wire format is `peac-receipt/0.1` (frozen until v1.0); the
  version-precision name is Wire 0.2 (`wire_format_version` `0.2`, from `docs/releases/facts.json`). The
  interaction record media identity is `interaction-record+jwt`.
- **Container.** A compact JWS (RFC 7515). The JWS JOSE-header `typ` is `interaction-record+jwt`. `typ` is not an
  HTTP media type: HTTP request and response bodies on the reference verifier are `application/json`, and the
  record field inside is the compact JWS.
- **Signature.** Ed25519 (EdDSA, RFC 8032). Keys are represented as OKP JSON Web Keys (RFC 7517) with
  `kty` `OKP`, `crv` `Ed25519`, and a 32-byte public key.
- **Canonicalization.** RFC 8785 JSON Canonicalization Scheme (JCS). Canonical bytes are produced before signing
  and before hashing, so the signature and any digest are reproducible byte-for-byte.
- **Digests.** SHA-256, in a self-describing `sha256:<hex>` form.
- **Offline verification.** A record verifies with only the issuer's public key: no network call is required when
  a public key or single-key JWKS is supplied. A networked alternative resolves the issuer from the record and
  fetches its published keys.

These facts are drawn from this repository: `docs/releases/facts.json` (released version `0.15.2`,
`wire_format_version` `0.2`), the canonicalization and hashing in `packages/crypto`, and offline verification in
`@peac/protocol` and the `@peac/cli` `peac verify --public-key` path.

## 2. What this primitive is not

PEAC standardizes portable signed interaction records and the verification surfaces around them. It defines how
records are issued, carried, verified, and preserved across organizational, vendor, and runtime boundaries. PEAC
does not standardize the control plane, business logic, policy engine, payment rail, identity provider, or
orchestration layer around those records.

PEAC is the records layer beneath runtime governance. It records what happened; it is not the runtime that
governs, decides, or enforces.

PEAC records portable signed interaction records across systems. PEAC does not replace, govern, orchestrate,
authenticate, settle, monitor, or score those systems.

PEAC must not become: an orchestrator, observability backend, payment rail, auth system, governance engine,
agent runtime, policy-decision engine, workflow manager, task scheduler, monitoring platform.

PEAC defines portable signed records. It does not define the governance, policy, compliance, monitoring, or
assurance process around those records.

## 3. Properties

- **Portable.** The record is a single compact JWS that carries across organizational, vendor, and runtime
  boundaries without a shared runtime.
- **Tamper-evident.** The Ed25519 signature is computed over JCS-canonical bytes; any mutation of the payload
  fails verification.
- **Offline-verifiable.** Verification needs only the issuer's public key; no network call is required.
- **Transport-agnostic.** The record is independent of how it is carried.
- **Multi-carrier.** The same record travels as an HTTP header, inside an MCP `_meta` field, or in A2A metadata
  (Section 4).
- **Record-only.** The primitive observes and records; it does not decide, enforce, or settle.

## 4. Carriers

The record is carried, unchanged, by several transports.

- **HTTP header.** The `PEAC-Receipt` header carries the compact JWS.
- **MCP `_meta`.** The keys `org.peacprotocol/receipt_ref` and `org.peacprotocol/receipt_jws` carry the
  reference and the record.
- **A2A metadata.** `metadata[extensionURI]` carries a list of carriers.
- **Reference binding.** `receipt_ref` is `sha256(receipt_jws)`, verified at extraction.

Transport size guidance: embedded carriers (MCP, A2A, UCP) allow up to 64 KB; header carriers (ACP, x402, HTTP)
allow up to 8 KB.

## 5. How the primitive composes

The same primitive records what each adjacent system reported, without governing, settling, authenticating, or
scoring that system. Each context below has a PEAC-owned worked example or recipe; the
[crosswalk](../interop/PORTABLE-SIGNED-RECORDS-CROSSWALK.md) holds the per-context mapping.

- **Agent actions** - [`examples/agent-action-records/`](../../examples/agent-action-records/) records observed
  agent actions as signed records.
- **Evaluation runs** - [`docs/SOLUTIONS/eval-platform-records.md`](../SOLUTIONS/eval-platform-records.md) exports
  a reported evaluation result as a signed record.
- **Open-model use** - [`examples/open-model-inference-records/`](../../examples/open-model-inference-records/)
  records an open-model inference call independently of any model project.
- **Agentic-commerce execution** - [`examples/mpp-payment-record/`](../../examples/mpp-payment-record/) and
  [`examples/commerce-mandate-records/`](../../examples/commerce-mandate-records/) record execution evidence after
  an authorization or mandate exists.
- **MCP tool calls** - [`examples/mcp-tool-call/`](../../examples/mcp-tool-call/) records a tool call as a
  portable record.
- **Gateway decisions** - [`examples/mcp-gateway-receipts/`](../../examples/mcp-gateway-receipts/) records a
  gateway's tool-call decision, including denials, as evidence.
- **Audit and transparency** - [`docs/SOLUTIONS/regulatory-audit-trail.md`](../SOLUTIONS/regulatory-audit-trail.md)
  and [`docs/interop/SIGNED-RECORDS-INTEROP-MATRIX.md`](../interop/SIGNED-RECORDS-INTEROP-MATRIX.md) preserve and
  compose records for later review.

Each example uses an existing registered record type; this document introduces no new type.

## 6. Repository facts at last check

As facts from this repository at the last-checked date: released version `0.15.2`; wire format version `0.2`;
`36` published packages; a conformance corpus of `290` requirement identifiers across `32` sections
(`docs/releases/facts.json`); registries version `0.6.0` (`specs/kernel/registries.json`).

## 7. References

Primary standards (verify current status at the source):

- RFC 8785 - JSON Canonicalization Scheme (JCS): <https://www.rfc-editor.org/rfc/rfc8785>
- RFC 8032 - Edwards-Curve Digital Signature Algorithm (EdDSA): <https://www.rfc-editor.org/rfc/rfc8032>
- RFC 7517 - JSON Web Key (JWK): <https://www.rfc-editor.org/rfc/rfc7517>
- RFC 7515 - JSON Web Signature (JWS): <https://www.rfc-editor.org/rfc/rfc7515>
- RFC 9421 - HTTP Message Signatures (relevant where a record is bound to an HTTP message):
  <https://www.rfc-editor.org/rfc/rfc9421>
- RFC 9530 - Digest Fields (relevant where a digest is carried on an HTTP message):
  <https://www.rfc-editor.org/rfc/rfc9530>

In-repository references:

- [`docs/interop/PORTABLE-SIGNED-RECORDS-CROSSWALK.md`](../interop/PORTABLE-SIGNED-RECORDS-CROSSWALK.md) - the
  per-context mapping.
- [`docs/interop/SIGNED-RECORDS-INTEROP-MATRIX.md`](../interop/SIGNED-RECORDS-INTEROP-MATRIX.md) - composition
  shapes with adjacent records and attestations.
