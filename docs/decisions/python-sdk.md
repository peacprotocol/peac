# Python SDK: go / no-go decision

**Decision:** no-go.
**Maintenance owner:** none at this time.
**Decision date:** 2026-04-20 (published with v0.12.13).
**Status:** closed for the v0.12.13 release window; reopen only on the explicit signal below.

## Context

The question is whether PEAC Protocol should publish a first-party Python SDK alongside the TypeScript packages under `packages/` and the Go SDK under `sdks/go/`. A first-party SDK implies a versioned published package on PyPI with parity for issuance, verification, and JCS canonicalization.

## Decision

no-go for v0.12.13 and for the v0.13.x release line.

A first-party Python SDK is not shipped. Python consumers integrate with PEAC through one of the following already-available paths:

- **Reference verifier HTTP surface.** Any Python application can call `POST /v1/verify` against `apps/api` (or a Hosted Verify deployment) using the OpenAPI 3.1.1 contract at [`packages/schema/openapi/verify.yaml`](../../packages/schema/openapi/verify.yaml). The contract returns RFC 9457 Problem Details on errors and is language-independent.
- **`PEAC-Receipt` header consumption.** Python clients that receive a PEAC receipt as an HTTP header handle it like any other JWS; existing Python JWT / JOSE libraries plus the issuer discovery path at `/.well-known/peac-issuer.json` are sufficient to verify offline.
- **MCP tool-call records.** Python MCP clients reading `_meta` keys (`org.peacprotocol/receipt_ref`, `org.peacprotocol/receipt_jws`) can extract the JWS and verify it the same way.
- **Commerce evidence bundles.** Python audit pipelines consume bundles via the serialized JSON format documented in [`docs/specs/COMMERCE-EVIDENCE.md`](../specs/COMMERCE-EVIDENCE.md); no SDK is required to read or validate a bundle.

## Why no-go

Three signals weighed against shipping a first-party Python SDK at this release window.

- **No maintenance owner.** A first-party SDK published on PyPI takes ongoing maintenance: security patches, dependency updates, parity tests against the TypeScript and Go implementations, and release coordination. No named individual or team has committed to owning Python SDK maintenance. Publishing without a maintenance owner creates a supply-chain risk (stale package, unpatched dependencies) that outweighs the integration convenience.
- **No demand threshold met.** Python integration requests captured in `docs/case-studies/distribution-submissions.md` and the v0.12.13 release notes count zero external parties requiring a first-party Python SDK as a gating blocker. The existing reference-verifier HTTP path and MCP tool-call path cover every requested integration.
- **HTTP and JOSE paths are sufficient today.** The reference verifier exposes every needed operation over HTTP with a stable OpenAPI contract. Python's `cryptography`, `pyjwt`, and `httpx` together cover offline JWS verification plus issuer discovery. A first-party SDK would not unlock functionality that cannot be reached through those paths; it would only reduce integration friction marginally.

## Minimum parity target (if reopened)

If and when the decision is reopened, the initial public Python SDK MUST cover, at minimum:

- `issue()` parity with `@peac/protocol.issue()`: claims validation, Ed25519 signing per RFC 8032, `typ: interaction-record+jwt` JWS serialization, `iat` handling, and `receipt_ref` computation.
- `verify_local()` parity with `@peac/protocol.verifyLocal()`: signature verification, kernel-constraint enforcement, three-state policy-binding check, and the 16 error codes plus 6 warning codes per `docs/specs/ERRORS.md`.
- JCS canonicalization parity: the same byte-identical output as `@peac/crypto.canonicalize()` and `sdks/go/jcs.go`, verified against the shared corpus at [`specs/conformance/parity-corpus/jcs-extended/`](../../specs/conformance/parity-corpus/jcs-extended/).
- Parity conformance: every fixture under `specs/conformance/` MUST pass on the Python side; any drift is a stop-the-line release blocker.
- Cross-language parity test harness: a test suite analogous to `packages/crypto/tests/jcs.parity-extended.test.ts` and `sdks/go/jcs_parity_extended_test.go` that reads the shared corpus and asserts byte-identical output.

Hosted-verify calling and managed-service wrappers are NOT in the minimum parity target; they can land after the core primitives are stable.

## Reopen condition

The decision is reopened by a single external signal, recorded in a release note's external-proof section:

- **A named maintenance owner commits publicly to ongoing Python SDK maintenance** (security patches, parity tests, release coordination) for at least four release windows, AND **a documented integrator workflow requiring Python-native issuance or local verification is captured as a case study** under `docs/case-studies/`.

Either signal alone does not reopen the decision. Both are required because the failure mode of publishing a Python SDK without a maintenance owner (stale cryptographic dependencies, unpatched JOSE parsers) is worse than not publishing at all.

## Related documents

- [Hosted Verify contract](../HOSTED_VERIFY_CONTRACT.md) - HTTP surface Python consumers call today.
- [OpenAPI 3.1.1 contract](../../packages/schema/openapi/verify.yaml) - language-independent contract.
- [Wire 0.2 specification](../specs/WIRE-0.2.md) - wire format any JWS-capable language can produce or consume.
- [JCS parity corpus](../../specs/conformance/parity-corpus/jcs-extended/) - byte-identical cross-language canonicalization fixtures.
- [Case studies](../case-studies/README.md) - where a Python-native integration would be recorded.
- [External audit scope](../external-audit-scope.md) - the audit target does not include a Python SDK.

---

Signed-off-by: PEAC maintainers, 2026-04-20, for v0.12.13 release cycle.
