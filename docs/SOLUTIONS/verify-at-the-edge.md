# Verify PEAC records at the edge

> **Outcome:** Verify portable signed PEAC interaction records inside an edge runtime so a record produced anywhere can be re-verified close to the caller, without depending on the issuer's runtime, the issuer's cloud, or a central hosted service.
>
> **Audience:** Platform operator running a Fetch-compatible or Web-platform edge runtime who needs offline-first verification of records signed elsewhere.
>
> **Time:** About 10 minutes from a clean clone, after confirming the target runtime supports the verifier's required Ed25519/Web Crypto path or an approved local polyfill.

## Outcome

PEAC interaction records are compact JWS values (`typ = interaction-record+jwt`) signed with Ed25519. They are designed to be verifiable offline by any party that holds the issuer's public key. An edge runtime is a useful place to perform that verification when the verifying party is geographically closer to the request than the issuer is, or when the verifier should not have a database, persistent state, or network dependencies beyond an optional JWKS cache.

This recipe shows the generic pattern first. Provider-specific references appear later as examples of the same bounded verification shape.

## When edge verification is appropriate

Edge verification is appropriate when:

- the verifying party already holds the issuer's public key, or can resolve it from a small JWKS document cached at the edge;
- the verifying party wants to reject malformed or unsigned requests before they reach the origin;
- the verifying party tolerates a small CPU budget per request and bounded request size;
- the verifying party needs no persistent state beyond the optional JWKS cache.

Edge verification is **not** appropriate when:

- the verifier needs to run live issuer-config discovery on every request (the full reference verifier image at [`surfaces/reference-verifier/`](../../surfaces/reference-verifier/) is better suited);
- the verifying party needs heavy CPU per request beyond typical edge limits;
- the verifying party needs to write a logging/audit plane local to the verifier (the edge variant is stateless by design).

## What PEAC verifies

- The compact JWS body parses as `interaction-record+jwt` (RFC 7515 + the PEAC profile in [`packages/schema/openapi/verify.yaml`](../../packages/schema/openapi/verify.yaml)).
- The Ed25519 signature is valid for the supplied public key.
- The kernel constraints in [`docs/specs/KERNEL-CONSTRAINTS.md`](../specs/KERNEL-CONSTRAINTS.md) hold (nesting depth, array length, object keys, string length, clock-skew tolerance).
- The schema validates against the registered Wire 0.2 claim model.
- The issuer canonical form (`iss`) parses correctly.

## What PEAC does NOT do

PEAC verifies signed records. PEAC does **not host** the governed runtime, **authorize** the action, **route** agent traffic, **enforce** runtime policy, **operate** payment rails, or **become** an edge platform.

The edge runtime keeps owning request routing, request lifetime, CPU and memory budgets, and any platform-level access control. PEAC adds one bounded check against the record's signature and schema; it does not replace anything the runtime already does.

## Minimal deployment pattern

The generic pattern is the same on every Fetch-compatible edge runtime:

1. The runtime receives an HTTP request that carries a PEAC record (either the compact JWS in a `PEAC-Receipt` header per [`packages/kernel/src/carrier.ts`](../../packages/kernel/src/carrier.ts), or a JSON body containing `{ receipt, public_key, options? }`).
2. The handler caps the request body, at or below the 256 KiB cap the reference verifier uses (`MAX_BODY_SIZE` in [`apps/api/src/verify-v1.ts`](../../apps/api/src/verify-v1.ts); see [`docs/specs/RESOURCE-LIMITS.md`](../specs/RESOURCE-LIMITS.md)).
3. The handler resolves the verification key. The simplest pattern is caller-supplied: the request body carries the public key, and the handler passes it directly to `verifyLocal()`. If the runtime resolves a JWKS, it MUST cap fetch time, response size, and cache TTL per the bounded values in [`docs/specs/RESOURCE-LIMITS.md`](../specs/RESOURCE-LIMITS.md).
4. The handler calls `verifyLocal(jws, publicKey, options)` from `@peac/protocol`.
5. On success, the handler returns the deterministic verification report shape from [`packages/schema/openapi/verify.yaml`](../../packages/schema/openapi/verify.yaml).
6. On failure, the handler returns an RFC 9457 Problem Details response (`Content-Type: application/problem+json`) with a canonical `peac_error_code`.

Provider-specific reference surfaces appear below as examples of the same bounded verification shape.

## Key and JWKS caching

When the verifier resolves the public key from a JWKS instead of receiving it caller-supplied:

- The JWKS fetch timeout SHOULD match the canonical value (`VERIFIER_LIMITS.fetchTimeoutMs` = 5,000 ms; see [`docs/specs/RESOURCE-LIMITS.md`](../specs/RESOURCE-LIMITS.md)).
- The JWKS response SHOULD be capped by `DEFAULT_MAX_KEYS` (100 keys per response).
- The JWKS cache TTL SHOULD respect the bounded range (`MIN_TTL_SECONDS` 60 / `MAX_TTL_SECONDS` 86,400; default 3,600). Some edge platforms expose KV / cache primitives; use them only when they can enforce these bounds.
- The cache MUST NOT silently accept oversized or unbounded responses.

If the edge runtime does not provide a cache primitive that satisfies these bounds cleanly, prefer the caller-supplied key pattern for that runtime.

## Request-size and timeout discipline

These values are not invented for this recipe; they are restated from [`docs/specs/RESOURCE-LIMITS.md`](../specs/RESOURCE-LIMITS.md):

- Request body cap (verifier surface): 256 KiB.
- JWKS fetch timeout: 5,000 ms.
- Node reference-resolver outbound fetch timeout: 30,000 ms. Treat this as source-truth for the Node resolver, not as a required edge-runtime timeout if the edge deployment uses caller-supplied keys.
- Redirect chain cap: 5.

The verifier MUST cap the request body before parsing. The verifier SHOULD reject requests that exceed the cap with `E_PAYLOAD_TOO_LARGE` and an RFC 9457 Problem Details response.

## Provider-specific references

Edge runtime support varies. Verify the target runtime's Web Crypto and request / CPU limits before deployment.

| Runtime / provider                          | Stability class             | Notes                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generic Fetch-compatible edge runtime       | docs-only pattern           | Confirm the runtime supports the verifier's required Ed25519 verification path and that request, CPU, and memory caps match the bounded values above.                                                                                                                                                     |
| Reference verifier (Cloudflare Worker form) | committed reference surface | [`surfaces/reference-verifier/cloudflare/worker.ts`](../../surfaces/reference-verifier/cloudflare/) deploys with `npx wrangler deploy` against the worker config in `cloudflare/wrangler.toml`. The Worker keeps the same verification report shape and RFC 9457 error shape as the full reference image. |
| Reference verifier (Docker compose form)    | committed reference surface | [`surfaces/reference-verifier/`](../../surfaces/reference-verifier/) carries `Dockerfile` and `docker-compose.yml` for a stateful local run with optional JWKS resolution.                                                                                                                                |

The Cloudflare row is one example. PEAC does not endorse, host, or operate any edge provider; the recipe stays generic by design.

## Local smoke test

The repository ships [`surfaces/reference-verifier/smoke.sh`](../../surfaces/reference-verifier/smoke.sh) which exercises the full reference verifier via Docker Compose. It is not an edge-runtime smoke test; it validates that the Docker image responds at `/health` and returns RFC 9457 on a bad payload. Use it as a baseline for what a successful verifier response looks like before adapting the pattern to a specific edge runtime.

A no-network smoke that targets only the edge handler (decode, schema, signature) can be built from `@peac/protocol.verifyLocal()` against committed fixtures and is suitable for any edge-target test suite. See [`packages/protocol/`](../../packages/protocol/) for the public verifier surface.

## Failure modes

An edge variant should return RFC 9457 Problem Details with the same `peac_error_code` style as the full reference verifier. Common failure modes include:

- `E_JWS_INVALID_SIGNATURE` — public key did not verify the compact JWS.
- `E_JWS_TYP_MISMATCH` — JWS header `typ` was not `interaction-record+jwt`.
- `E_KERNEL_CONSTRAINT_VIOLATION` — record violated a kernel constraint (depth / size / clock skew).
- `E_PAYLOAD_TOO_LARGE` — request body exceeded the verifier surface body cap.

The full code list is in the verify OpenAPI contract.

## Where to go next

- [Reference verifier deployment recipes](../../surfaces/reference-verifier/README.md): the canonical self-hosted variants (Docker, Compose, Cloudflare Worker) and the authority-order matrix for the verifier surface.
- [Verify contract (OpenAPI)](../../packages/schema/openapi/verify.yaml): the normative `/v1/verify` request/response shape.
- [Hosted verify contract prose](../HOSTED_VERIFY_CONTRACT.md): the prose restatement of the contract.
- [Resource limits](../specs/RESOURCE-LIMITS.md): the normative invariant table.
- [API record issuance](api-receipt-issuance.md): emit signed records on every HTTP response with Express middleware.
- [Compose runtime governance with portable signed records](agt-peac-composition.md): the runtime-governance composition recipe.
