# UCP HTTP Message Signatures alignment

**Status:** Proposed (design note; no implementation in this change).

This note should land before any v0.15.2 release cut. The implementation correction should land before any release notes claim UCP signing alignment.

`@peac/mappings-ucp` verifies UCP webhook signatures using a `Request-Signature` detached JWS (RFC 7797). The current Universal Commerce Protocol (UCP) specification signs requests and webhooks with RFC 9421 HTTP Message Signatures instead. This note records the gap, fixes the PEAC boundary, and proposes a minimal, non-breaking correction path. It changes no code, schema, wire format, registry, receipt type, extension group, signing envelope, or package export.

## Current repo inventory

The UCP surface in this repository:

- `packages/mappings/ucp/` (published package `@peac/mappings-ucp`, in `scripts/publish-manifest.json`): `verify.ts`, `types.ts`, `bundle.ts`, `mapper.ts`, `evidence.ts`, `carrier.ts`, `util.ts`, `index.ts`; tests under `tests/`.
- `examples/ucp-webhook-express/` (runnable webhook example).
- Docs: `docs/specs/COMMERCE-EVIDENCE.md`, `docs/specs/COMMERCE-INTEGRATION-MATRIX.md`, `docs/specs/INTEROP.md`, `docs/COMPATIBILITY_MATRIX.md`.
- Fixtures: `specs/conformance/fixtures/ucp/`.
- Registry: `specs/kernel/registries.json` (`id: 'ucp'`, `category: 'commerce-protocol'`, `status: 'informational'`).

The verification path models an outdated signing scheme:

- `packages/mappings/ucp/src/verify.ts` parses a detached JWS from a `Request-Signature` header (`parseDetachedJws`), validates `b64:false` per RFC 7797, and verifies the signature over the request body bytes.
- `packages/mappings/ucp/src/types.ts` documents "UCP webhooks use detached JWS (RFC 7797)" and types a `Request-Signature` header value and `b64` parameter.
- `packages/mappings/ucp/README.md` and the `index.ts` JSDoc example read the signature from `req.headers['request-signature']`.

Public exports affected by the signing model: `verifyUcpWebhookSignature`, `parseDetachedJws`, `findSigningKey`, and the types `ParsedDetachedJws`, `UcpJwsHeader`, `B64Mode`, `VerifyUcpWebhookOptions`, `VerifyUcpWebhookResult`. The order-mapping exports (`mapUcpOrderToReceipt`, evidence, bundle helpers) do not depend on the signing model and are out of scope.

The repository already ships an RFC 9421 implementation, `@peac/http-signatures` (`base.ts`, `parser.ts`, `verify.ts`, `types.ts`); `packages/worker-shared/src/verification.ts` already reads a `Signature-Input` header. A correction can reuse this surface rather than add a second RFC 9421 implementation.

## Current UCP signing model (primary source)

Per the UCP specification at `https://ucp.dev/specification/signatures/`:

- UCP signs and verifies messages with RFC 9421 HTTP Message Signatures.
- Required headers: `Signature-Input` (signed components, including `keyid`) and `Signature`. `Content-Digest` (RFC 9530) is required when a body is present and is computed over the raw body bytes, binding the body without JSON canonicalization. `UCP-Agent` is signed when present; `Idempotency-Key` participates for state-changing methods.
- Keys are published in the `signing_keys` array of the party profile at `/.well-known/ucp` as JWKs with a `kid`; the `Signature-Input` `keyid` selects the key by matching `kid`.
- Algorithms: P-256 / `ES256` MUST be supported; P-384 / `ES384` is OPTIONAL. Ed25519 is not specified for the wire layer.
- Webhook notifications MUST be signed and use the same RFC 9421 mechanism (`Signature-Input` / `Signature` / `Content-Digest`); there is no `Request-Signature` detached-JWS or RFC 7797 scheme.

A separate, application-layer detached signature over JCS (RFC 8785) exists only for AP2 payment mandates, not for the HTTP request/webhook layer.

## Gap

The repository verifies a `Request-Signature` detached JWS (RFC 7797) that the current UCP specification does not define. UCP request and webhook integrity is now an RFC 9421 HTTP Message Signature over raw bytes with an RFC 9530 `Content-Digest`. A receiver following the current UCP spec sends `Signature-Input` / `Signature` / `Content-Digest`, which the current PEAC verifier does not consume. The order/evidence mapping is unaffected; only the signature-observation path is stale.

## PEAC boundary

- PEAC records, binds, and verifies PEAC records. It observes and binds the facts of a UCP signature; it does not become the UCP authentication, authorization, payment, or order-execution layer.
- PEAC reads UCP signature components, the `Content-Digest`, the signing key id, and the profile identity, and may bind those observed facts into a signed PEAC record's metadata for portability.
- PEAC does not assert UCP conformance and does not re-sign or settle UCP messages. A failed or absent UCP signature is recorded as an observation, not a PEAC trust decision about UCP.

## Compatibility constraint

`@peac/mappings-ucp` is a published package, so the `Request-Signature` / RFC 7797 verification functions and their types are public API. The correction is additive and deprecation-based, not a removal:

- Add an RFC 9421 verification path; keep the existing `Request-Signature` functions exported and working, marked deprecated, with a documented removal horizon per `docs/STABILITY-CONTRACT.md`.
- No silent fallback between the two schemes: callers select the path explicitly, and a missing or malformed signature for the selected scheme is reported, never quietly downgraded.

## Public-surface naming (decide before implementation)

The RFC 9421 verification is a new exported entry point. The legacy export stays and is deprecated.

| Candidate                       | Pros                                                                           | Cons                                                | Verdict                |
| ------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- | ---------------------- |
| `verifyUcpHttpSignature`        | Clear RFC 9421 / HTTP Message Signature scope; works for requests and webhooks | New export                                          | **Preferred**          |
| `verifyUcpMessageSignature`     | Standards-adjacent wording                                                     | Less obvious to HTTP developers                     | Acceptable alternative |
| `verifyUcpWebhookHttpSignature` | Very explicit for webhook use                                                  | Too narrow; UCP uses the same model beyond webhooks | Reject                 |
| `verifyUcpWebhookSignatureV2`   | Avoids rename ambiguity                                                        | Versioned-API smell                                 | Reject                 |
| `verifyUcpSignature`            | Short                                                                          | Too broad; hides the scheme distinction             | Reject                 |

Recommended new export:

```ts
verifyUcpHttpSignature(...)
```

Legacy export remains, deprecated:

```ts
verifyUcpWebhookSignature(...) // deprecated: legacy Request-Signature / RFC 7797 path
```

No silent fallback between the two.

## Recommended implementation plan (separate, small PRs; each design-note-gated)

- **PR-UCP-1 (correction):** add `verifyUcpHttpSignature` in `@peac/mappings-ucp` reusing `@peac/http-signatures`: consume `Signature-Input` / `Signature`, verify `Content-Digest` (RFC 9530) over raw bytes, resolve the key by matching the `Signature-Input` `keyid` to a `signing_keys[].kid` JWK from the supplied profile, accept ES256 (required) / ES384 (optional). Add conformance fixtures + unit tests under `specs/conformance/fixtures/ucp/` (valid request, missing `Signature-Input`, missing `Content-Digest` for a body, digest mismatch, unsupported algorithm, `keyid` not found, mismatched `UCP-Agent` / signer profile). No live network in tests; mocked profile + deterministic fixtures. The legacy `verifyUcpWebhookSignature` stays exported and working, marked deprecated.
- **PR-UCP-2 (docs/example):** update `examples/ucp-webhook-express/`, `packages/mappings/ucp/README.md`, the `index.ts` JSDoc, and `docs/specs/COMMERCE-EVIDENCE.md` to use the RFC 9421 path and mark the `Request-Signature` / RFC 7797 path deprecated. Add a spec-drift guard pinning the verified UCP signing reference, mirroring `scripts/verify-spec-drift.mjs`.
- **PR-UCP-3 (optional, only if needed):** record the observed UCP signature facts (RFC 9421 components, `Content-Digest`, `keyid`, profile identity, event type, result metadata) into an existing PEAC record using existing record types and extensions; no new receipt type or extension group unless a later note proves `org.peacprotocol/payment` / `org.peacprotocol/commerce` and example-local namespaces are insufficient.

## Non-goals

- No new receipt type, extension group, schema, wire version, signing envelope, registry entry, or package API beyond an additive RFC 9421 verification entry point.
- PEAC does not become a UCP verifier-of-record, an authorization or payment system, or an order-execution surface.
- No removal of the existing `Request-Signature` path in the first correction; removal follows a documented deprecation horizon.
- No AP2 mandate mapping in this scope (the JCS-detached mandate layer is a separate, later note).

## Security considerations

- Verify the `Content-Digest` against the raw request body bytes; do not canonicalize the JSON before digesting, matching UCP's raw-byte binding.
- Cover the signed-component set: the verification must reflect exactly the components named in `Signature-Input`, including the `Content-Digest` and any signed `UCP-Agent`, and must not treat an unsigned component as bound.
- Bind the key id and profile identity: select the key strictly by `keyid` to `signing_keys[].kid` from the resolved `/.well-known/ucp` profile; reject an unknown `keyid`.
- Never log raw signature material, credentials, or full request bodies; record digests and minimal normalized facts only.
- No silent fallback to the legacy `Request-Signature` / RFC 7797 format; the scheme is explicit and a verification failure is surfaced.
- Profile resolution must reuse a host-allowlisted, no-live-network-in-tests path; treat the profile fetch as untrusted input.

## Open questions

- Confirm whether UCP requires any signed component beyond `Content-Digest` and `UCP-Agent` for webhook delivery before pinning the conformance fixtures.
- Confirm the deprecation horizon for the `Request-Signature` path against `docs/STABILITY-CONTRACT.md` before implementation.
- Confirm whether recording observed UCP signature facts fits the existing `org.peacprotocol/payment` / `org.peacprotocol/commerce` shapes plus an example-local namespace, with no registry change.

## References

- UCP signing specification: `https://ucp.dev/specification/signatures/`
- RFC 9421 (HTTP Message Signatures), RFC 9530 (Digest Fields), RFC 8941 (Structured Field Values), RFC 7517 (JWK).
