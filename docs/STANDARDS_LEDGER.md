# Standards ledger

> **Status:** Reference catalogue of every external standard PEAC
> Protocol cites or implements. Each row carries an explicit status
> label, a citation site (code path or spec doc), and the role the
> standard plays. This document is descriptive, not aspirational:
> listing a standard here does not imply certification, conformance
> claim, or roadmap commitment.

## Status labels

| Label                      | Meaning                                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Standards Track**        | Approved Standards Track document at IETF (Proposed / Internet Standard) or W3C (Recommendation) or ISO/IEC. Stable reference.                                                |
| **Informational**          | RFC Editor or working-group document published for reference. Not a Standards Track requirement; PEAC may rely on it normatively even when its source track is Informational. |
| **IRTF Informational**     | Document published by an IRTF Research Group. Informational at the RFC Editor; not IETF Standards Track.                                                                      |
| **BCP**                    | IETF Best Current Practice. Operational guidance; binding within IETF stream.                                                                                                 |
| **FIPS**                   | US Federal Information Processing Standard. Standards Track at NIST.                                                                                                          |
| **W3C Recommendation**     | W3C Technical Report at the final stage.                                                                                                                                      |
| **International Standard** | ISO/IEC published standard.                                                                                                                                                   |
| **Regulatory**             | Government regulation. Applicability and enforcement scope per the regulator. Cited for mapping, never for certification.                                                     |
| **Draft / RFC-to-be**      | At RFC Editor AUTH48 or post-IESG approval; RFC number not yet assigned. Status flips to Standards Track or Informational once the RFC is published.                          |
| **Watchlist**              | Tracked by PEAC for future composition. No current implementation, no current normative dependency.                                                                           |

PEAC does not issue conformance certificates for any external
standard. Where a row says "PEAC implements," it means PEAC implements
the cited subset of the standard for the role described in the
"Citation site" column; it does not mean PEAC is certified against the
full document.

## A. Wire format and signing

| Standard                         | Status             | Role in PEAC                                                                                                                                                    | Citation site                                                                                         |
| -------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| RFC 7515 (JWS)                   | Standards Track    | Compact serialization for `peac-receipt/0.1` and `interaction-record+jwt`                                                                                       | [`packages/crypto/src/jws.ts`](../packages/crypto/src/jws.ts)                                         |
| RFC 7517 (JWK)                   | Standards Track    | Embedded-key rejection rule (`E_JWS_EMBEDDED_KEY`); JWKS member shape                                                                                           | [`packages/jwks-cache/src/resolver.ts`](../packages/jwks-cache/src/resolver.ts)                       |
| RFC 7518 (JWA)                   | Standards Track    | Algorithm identifier `EdDSA` (and only that)                                                                                                                    | [`packages/crypto/src/jws.ts`](../packages/crypto/src/jws.ts)                                         |
| RFC 7519 (JWT)                   | Standards Track    | Compact JWT shape with `typ: interaction-record+jwt` (Wire 0.2)                                                                                                 | [`packages/protocol/src/issue.ts`](../packages/protocol/src/issue.ts)                                 |
| RFC 7638 (JWK Thumbprint)        | Standards Track    | `kid` derivation                                                                                                                                                | [`packages/crypto/src/`](../packages/crypto/src/)                                                     |
| RFC 7797 (JWS Unencoded Payload) | Standards Track    | `b64:false` rejection (`E_JWS_B64_REJECTED`)                                                                                                                    | [`packages/crypto/__tests__/jws.property.test.ts`](../packages/crypto/__tests__/jws.property.test.ts) |
| RFC 8032 (Ed25519 / Ed448)       | IRTF Informational | Canonical signature algorithm. Note: RFC 8032 is an IRTF CFRG Informational document, not IETF Standards Track. Its parameters are referenced normatively here. | [`packages/crypto/src/jws.ts`](../packages/crypto/src/jws.ts)                                         |
| RFC 8259 (JSON)                  | Standards Track    | Payload format                                                                                                                                                  | wire format                                                                                           |
| RFC 8725 (JWS / JWT BCP)         | BCP                | Hardening guidance applied at JWS verify                                                                                                                        | [`packages/crypto/src/jws.ts`](../packages/crypto/src/jws.ts)                                         |
| FIPS 186-5                       | FIPS               | NIST FIPS reference for EdDSA parameters                                                                                                                        | reference                                                                                             |

## B. HTTP and API surfaces

| Standard                           | Status          | Role in PEAC                                                                  | Citation site                                                                             |
| ---------------------------------- | --------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| RFC 9110 (HTTP Semantics)          | Standards Track | General header semantics                                                      | [`apps/api/src/`](../apps/api/src/)                                                       |
| RFC 9421 (HTTP Message Signatures) | Standards Track | `@peac/http-signatures` profile                                               | [`packages/http-signatures/`](../packages/http-signatures/)                               |
| RFC 9449 (DPoP)                    | Standards Track | Sender-constrained tokens; optional composition                               | [`docs/specs/AGENT-IDENTITY.md`](specs/AGENT-IDENTITY.md)                                 |
| RFC 9457 (Problem Details)         | Standards Track | Reference verifier error response shape                                       | [`apps/api/src/errors.ts`](../apps/api/src/errors.ts)                                     |
| RFC 9651 (Structured Fields)       | Standards Track | `Content-Usage` and content-signal header parsing                             | [`packages/mappings/content-signals/`](../packages/mappings/content-signals/)             |
| RFC 9745 (Deprecation Header)      | Informational   | Endpoint lifecycle signaling on legacy `/verify` alias                        | [`apps/api/src/index.ts`](../apps/api/src/index.ts) (`LEGACY_VERIFY_DEPRECATION_HEADERS`) |
| RFC 8594 (Sunset Header)           | Informational   | Endpoint retirement-horizon signaling on legacy `/verify` alias               | same                                                                                      |
| RFC 8288 (Web Linking)             | Standards Track | `rel="deprecation"` Link header on the legacy alias                           | same                                                                                      |
| RFC 9333 (Rate-Limit Headers)      | Standards Track | `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` on `/v1/verify` | [`apps/api/src/verify-v1.ts`](../apps/api/src/verify-v1.ts)                               |

PEAC treats RFC 9745 and RFC 8594 as operational signaling
conventions even though their source track is Informational; both are
widely deployed and their semantics are stable.

## C. Discovery and metadata

| Standard                                         | Status                              | Role in PEAC                                                                                   | Citation site                                                                                      |
| ------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| RFC 8615 (Well-Known URIs)                       | Standards Track                     | `/.well-known/peac-issuer.json`, `/.well-known/peac.txt`, `/.well-known/agent-card.json` paths | [`docs/specs/PEAC-ISSUER.md`](specs/PEAC-ISSUER.md), [`docs/specs/PEAC-TXT.md`](specs/PEAC-TXT.md) |
| RFC 9728 (OAuth 2.0 Protected Resource Metadata) | Standards Track                     | Issuer-discovery alignment for protected-resource metadata                                     | [`docs/specs/PEAC-ISSUER.md`](specs/PEAC-ISSUER.md)                                                |
| RFC 3986 (URI Generic Syntax)                    | Standards Track                     | Issuer URL canonical form                                                                      | [`packages/protocol/src/`](../packages/protocol/src/)                                              |
| RFC 4648 (base64url)                             | Standards Track                     | JWS encoding                                                                                   | [`packages/crypto/src/base64url.ts`](../packages/crypto/src/base64url.ts)                          |
| RFC 4122 / RFC 9562 (UUIDs)                      | Standards Track                     | `jti` generation                                                                               | [`packages/kernel/src/ids/`](../packages/kernel/src/ids/)                                          |
| RFC 3339 (timestamps)                            | Standards Track / Proposed Standard | `iat` / `nbf` / `exp` formatting in records                                                    | wire format                                                                                        |

## D. Canonicalization and Informational dependencies

| Standard                       | Status               | Role in PEAC                                                                                                                                                                                                    | Citation site                                                                                                                |
| ------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| RFC 8785 (JCS)                 | Informational        | Canonical JSON for claim digest, policy digest, document digest. PEAC relies on RFC 8785 normatively even though its source track is Informational; the cross-language parity corpus pins byte-stable behavior. | [`packages/crypto/src/jcs.ts`](../packages/crypto/src/jcs.ts), [`docs/specs/DOCUMENT-BINDING.md`](specs/DOCUMENT-BINDING.md) |
| RFC 2119 + RFC 8174 (BCP 14)   | BCP                  | MUST / SHOULD / MAY key-words across PEAC specs                                                                                                                                                                 | spec convention                                                                                                              |
| RFC 1035 (DNS)                 | Internet Standard    | Hostname semantics                                                                                                                                                                                              | reference                                                                                                                    |
| RFC 1918 / RFC 4193 / RFC 6890 | BCP / IS / Reference | Private and special-purpose IP-range definitions used by SSRF policy                                                                                                                                            | [`packages/net/node/src/ssrf.ts`](../packages/net/node/src/ssrf.ts)                                                          |

## E. Identity and supporting standards

| Standard                    | Status             | Role in PEAC                       | Citation site                                                                 |
| --------------------------- | ------------------ | ---------------------------------- | ----------------------------------------------------------------------------- |
| W3C DID Core 1.0            | W3C Recommendation | `did:` prefix support in `iss`     | [`docs/specs/DID-RESOLUTION-PROFILE.md`](specs/DID-RESOLUTION-PROFILE.md)     |
| W3C VC Data Model           | W3C Recommendation | Watchlist; not on the current wire | watchlist                                                                     |
| RFC 9309 (Robots Exclusion) | Internet Standard  | Content-usage signals resolver     | [`packages/mappings/content-signals/`](../packages/mappings/content-signals/) |

## F. API contracts

| Standard      | Status       | Decision at v0.13.0                                                                                                                                                                                             | Citation site                                                                                                                        |
| ------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| OpenAPI 3.1.x | OpenAPI Spec | Public contract for `POST /v1/verify`, `POST /v1/issue`, `GET /v1/issuer-health` is OpenAPI 3.1.1                                                                                                               | [`packages/schema/openapi/verify.yaml`](../packages/schema/openapi/verify.yaml), [`apps/api/openapi.yaml`](../apps/api/openapi.yaml) |
| OpenAPI 3.2.0 | OpenAPI Spec | Deferred. v0.13.0 stays on OpenAPI 3.1.x for tooling-compatibility reasons. A patch-level move within 3.1.x is allowed; a move to 3.2.0 requires a separate roadmap decision once tooling adoption is verified. | [`docs/decisions/openapi-version.md`](decisions/openapi-version.md) (planned)                                                        |

`pnpm verify:openapi:drift` ([`scripts/verify-openapi-drift.mjs`](../scripts/verify-openapi-drift.mjs))
enforces that `packages/schema/openapi/verify.yaml` and
`apps/api/openapi.yaml` agree on the shared `/v1/verify` contract and
that downstream surfaces (integrator kits, deployment recipes) restate
the contract consistently.

## G. Experimental cryptography (not on the current wire)

| Standard                        | Status          | PEAC stance                                                                                                                               |
| ------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| RFC 9052 (COSE_Sign1)           | Standards Track | Watchlist. No implementation commitment. A future codec is gated on benchmarks-on-real-workloads, tooling maturity, and migration safety. |
| RFC 9053 (COSE Algorithms)      | Standards Track | Pairs with RFC 9052; watchlist                                                                                                            |
| RFC 8949 (CBOR)                 | Standards Track | Pairs with RFC 9052; watchlist                                                                                                            |
| RFC 8392 (CWT)                  | Standards Track | Pairs with RFC 9052; watchlist                                                                                                            |
| FIPS 204 (ML-DSA, post-quantum) | FIPS            | Watchlist. No v0.13.x implementation scope. Any design spike happens in research tracks; no delivery commitment.                          |

The current wire format is JWS Compact Serialization with Ed25519.
There is no algorithm negotiation surface and no plan to introduce
COSE/CBOR as a default in the v0.13.x line.

## H. Trust-chain transparency

| Standard / draft                                          | Status            | PEAC stance                                                                                                                                      |
| --------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| IETF SCITT Architecture (`draft-ietf-scitt-architecture`) | Draft / RFC-to-be | Informative composition target. No wire change is planned until the document publishes and a reference-implementation maturity bar is satisfied. | See [`docs/specs/SCITT-COMPOSITION.md`](specs/SCITT-COMPOSITION.md) for the composition note. |

## I. Regulatory references

These rows describe how PEAC artifacts can be used as evidence for
regulatory mappings. They are not certification claims and they are
not enforced by PEAC.

| Reference                         | Status                         | PEAC role                                            | Citation site                                                                               |
| --------------------------------- | ------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| EU AI Act (Annex IV transparency) | Regulatory                     | Mapping doc; applicability horizon 2026-08-02 onward | [`docs/compliance/EU-AI-ACT-ANNEX-IV-MAPPING.md`](compliance/EU-AI-ACT-ANNEX-IV-MAPPING.md) |
| EU CRA                            | Regulatory                     | Cyber-resilience applicability where scoped          | reference                                                                                   |
| ISO/IEC 42001:2023 Clause 8       | International Standard         | AI management system operational controls            | [`docs/compliance/ISO-42001-MAPPING.md`](compliance/ISO-42001-MAPPING.md)                   |
| NIST AI RMF 1.0                   | Informational (non-regulatory) | Voluntary framework; cited in compliance prose       | reference                                                                                   |

## Maintenance discipline

Adding a new standard reference to this ledger requires:

1. A row with the correct status label.
2. A citation site (code path or spec doc) that demonstrates where
   PEAC implements or relies on the standard. References without an
   implementation site MUST go in the **Watchlist** section.
3. A test or fixture (where applicable) that proves the
   implementation behavior.

Updating a status (for example when an RFC-to-be publishes) requires:

1. Updating the row in this document.
2. Updating any in-code comments or spec-doc references that named
   the document by draft name.
3. A note in [`CHANGELOG.md`](../CHANGELOG.md) under "Changed".

Removing a row requires explicit roadmap approval; standards are kept
listed even when their PEAC role is purely historical, with a status
note explaining the historical role.
