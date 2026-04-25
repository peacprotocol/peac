# Python SDK (v0.13.0)

**Status:** No published Python SDK.

## Decision

PEAC Protocol does not publish a first-party Python SDK at v0.13.0. The supported Python integration shape is API-first against the reference verifier `POST /v1/verify`, using a standard HTTP client (for example `httpx`).

## Reference verifier integration shape

Python callers issue `POST /v1/verify` against a self-hosted reference verifier (or a managed deployment). The request body is `application/json` carrying a compact JWS `interaction-record+jwt` in the `receipt` field; the success body is `application/json`; the error body is `application/problem+json` (RFC 9457). Working examples ship in [`examples/`](../../examples/).

## Cryptographic primitives

For local verification without a reference verifier, Python callers use a standard JOSE / Ed25519 library against the JWS Compact Serialization (RFC 7515) format with `EdDSA` algorithm and `typ: interaction-record+jwt`. PEAC's wire format is documented in [`docs/specs/PROTOCOL-BEHAVIOR.md`](../specs/PROTOCOL-BEHAVIOR.md) and the cross-language JCS parity corpus lives under [`specs/conformance/parity-corpus/`](../../specs/conformance/parity-corpus/).

## Status row

The compatibility classification is `examples_only` in [`docs/COMPATIBILITY_MATRIX.md`](../COMPATIBILITY_MATRIX.md) and in `docs/releases/facts.json` (`sdks.python: "examples_only"`). This is descriptive and does not commit a publication path.

## Change procedure

A change to this classification requires updates to [`docs/COMPATIBILITY_MATRIX.md`](../COMPATIBILITY_MATRIX.md), [`docs/releases/facts.json`](../releases/facts.json), and the release notes for the release in which the change ships.
