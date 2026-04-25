# Hosted Verify API Contract

**Status:** Stable contract. Implemented by `apps/api` (reference verifier).

This document defines the HTTP API contract for the reference verifier. Implementations MUST conform to this contract.

**Truth source for the verifier surface (authority order):** [`packages/schema/openapi/verify.yaml`](../packages/schema/openapi/verify.yaml) is the normative machine-readable contract (OpenAPI 3.1.1). [`apps/api/openapi.yaml`](../apps/api/openapi.yaml) is the app-level spec aligned against it by `pnpm verify:openapi:drift`. This Markdown document restates that contract in prose; it must not drift. Downstream documents - [`surfaces/reference-verifier/README.md`](../surfaces/reference-verifier/README.md) and the integrator kits under [`integrator-kits/`](../integrator-kits/) - restate elements of the contract for integrators and are cross-checked against the OpenAPI source by the same verifier.

## Endpoints

### POST /v1/verify

Verify a signed interaction record.

**Request:**

```json
{
  "receipt": "<compact JWS string>",
  "public_key": "<optional base64url Ed25519 public key>",
  "policy": { "uri": "https://...", "version": "..." }
}
```

| Field        | Type   | Required | Description                                                                              |
| ------------ | ------ | -------- | ---------------------------------------------------------------------------------------- |
| `receipt`    | string | Yes      | Compact JWS (`interaction-record+jwt`)                                                   |
| `public_key` | string | No       | Base64url Ed25519 public key. If omitted, issuer discovery and JWKS resolution are used. |
| `policy`     | object | No       | Policy document for binding verification                                                 |

**Success response (200):**

```json
{
  "verified": true,
  "receipt_ref": "sha256:<hex>",
  "claims": {},
  "warnings": [],
  "policy_binding": "verified",
  "issuer": "https://example.com",
  "kid": "key-1",
  "wire_version": "0.2"
}
```

**Error responses:** RFC 9457 Problem Details.

### Legacy `POST /verify` (deprecated compatibility alias)

The reference verifier keeps `POST /verify` runtime-reachable for callers that have not yet migrated. The alias is **not** documented in the machine-readable OpenAPI contract (the canonical verify operation is `POST /v1/verify`). At runtime the alias:

- Delegates in-process to the canonical `POST /v1/verify` handler and returns the same response shape and status codes.
- Stamps the same security and rate-limit headers as `POST /v1/verify`.
- Additionally stamps RFC 9745 `Deprecation: true`, RFC 8594 `Sunset: Sat, 01 Nov 2026 00:00:00 GMT`, and RFC 8288 `Link: <https://www.peacprotocol.org/docs/migration>; rel="deprecation"` on every response.

Runtime removal is scheduled no earlier than the advertised Sunset date (2026-11-01). New integrations MUST target `POST /v1/verify`; the `POST /api/v1/verify` path is covered by the same alias behavior.

### POST /v1/issue (provisional)

Issue a signed interaction record. This endpoint is provisional and uses a BYO-key model (caller provides an Ed25519 private key seed). The contract is defined in [`HOSTED_ISSUE_CONTRACT.md`](HOSTED_ISSUE_CONTRACT.md). The legacy request model shown below is retained for archival purposes only.

**Request (superseded):**

```json
{
  "claims": { "iss": "https://...", "kind": "evidence", "type": "...", "ext": {} },
  "key_id": "<API key identifier for signing key selection>"
}
```

**Success response (201):**

```json
{
  "receipt": "<compact JWS>",
  "receipt_ref": "sha256:<hex>"
}
```

## Error Taxonomy

All errors use RFC 9457 Problem Details with `type` URIs under `https://www.peacprotocol.org/problems/`.

All error codes below are kernel-canonical (from `specs/kernel/errors.json`). Hosted error catalog implementations MUST use these exact codes.

| Code                             | HTTP | Type URI suffix            | Detail                                                                                     |
| -------------------------------- | ---- | -------------------------- | ------------------------------------------------------------------------------------------ |
| `E_INVALID_FORMAT`               | 400  | `invalid-format`           | Input is not a valid compact JWS. Expected three base64url segments separated by dots.     |
| `E_JWS_MISSING_KID`              | 400  | `missing-kid`              | JWS header is missing a `kid` field. Add a key identifier to the signing key.              |
| `E_UNSUPPORTED_WIRE_VERSION`     | 400  | `unsupported-wire-version` | Wire version is not supported by this endpoint. Accepts `interaction-record+jwt`.          |
| `E_INVALID_SIGNATURE`            | 422  | `invalid-signature`        | Ed25519 signature does not match the payload and key.                                      |
| `E_ISS_NOT_CANONICAL`            | 422  | `iss-not-canonical`        | The `iss` field must start with `https://` or `did:`.                                      |
| `E_CONSTRAINT_VIOLATION`         | 422  | `constraint-violation`     | Claims do not conform to the expected schema or kernel constraints.                        |
| `E_POLICY_BINDING_FAILED`        | 422  | `policy-binding-failed`    | Policy digest does not match the local policy.                                             |
| `E_EXPIRED`                      | 422  | `expired`                  | Receipt has exceeded its expiration time.                                                  |
| `E_NOT_YET_VALID`                | 422  | `not-yet-valid`            | Receipt `nbf` or `iat` time is in the future.                                              |
| `E_JWKS_FETCH_FAILED`            | 502  | `jwks-fetch-failed`        | Could not resolve JWKS for the issuer. Check the issuer's `/.well-known/peac-issuer.json`. |
| `E_VERIFY_ISSUER_CONFIG_MISSING` | 502  | `issuer-config-missing`    | Issuer configuration not found at discovery URL.                                           |
| `E_VERIFY_ISSUER_CONFIG_INVALID` | 502  | `issuer-config-invalid`    | Issuer configuration is malformed.                                                         |
| `E_KEY_NOT_FOUND`                | 400  | `key-not-found`            | No key matching the `kid` was found in the issuer's JWKS.                                  |
| `E_RATE_LIMITED`                 | 429  | `rate-limited`             | Request rate exceeded. See `RateLimit-*` headers.                                          |
| `E_PAYLOAD_TOO_LARGE`            | 413  | `payload-too-large`        | Request body exceeds the maximum size for this surface.                                    |

**Notes:**

- `E_INVALID_JWS_FORMAT` (from DD-210 draft) replaced with kernel-canonical `E_INVALID_FORMAT`.
- `E_SIGNATURE_INVALID` replaced with `E_INVALID_SIGNATURE` (kernel naming).
- `E_JWKS_RESOLUTION_FAILED` replaced with `E_JWKS_FETCH_FAILED` (kernel naming).
- `E_ISSUER_DISCOVERY_FAILED` replaced with existing `E_VERIFY_ISSUER_CONFIG_MISSING` / `E_VERIFY_ISSUER_CONFIG_INVALID` (no new umbrella code).
- `E_CLAIMS_VALIDATION_FAILED` replaced with `E_CONSTRAINT_VIOLATION` (kernel naming).
- `E_JWS_MISSING_TYP` removed; covered by `E_UNSUPPORTED_WIRE_VERSION` (missing typ = unsupported version).
- `E_PAYLOAD_TOO_LARGE` is new; added to `specs/kernel/errors.json` in v0.12.8.
- `E_EXPIRED` and `E_NOT_YET_VALID` added (existed in kernel, missing from original contract).

## Issuer and JWKS Handling

Resolution path: `iss` -> `/.well-known/peac-issuer.json` -> `jwks_uri` -> JWKS -> match `kid`.

| Aspect          | Specification                                                         |
| --------------- | --------------------------------------------------------------------- |
| Cache TTL       | 5 minutes (default), configurable per tenant                          |
| SSRF protection | Private IP rejection, no redirects to private ranges, SSRF-safe fetch |
| Timeout         | 5 seconds per upstream request                                        |
| Failure mode    | `E_JWKS_FETCH_FAILED` with issuer URI in `detail`                     |

## Authentication and Tenancy

| Aspect             | Specification                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Auth method        | `Authorization: Bearer <api-key>`                                                                    |
| Tenant isolation   | Per-API-key; no cross-tenant state, logs, or cache                                                   |
| Rate limiting      | Configurable per key; default 100 req/min                                                            |
| Rate limit headers | `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` per draft-ietf-httpapi-ratelimit-headers |

## Privacy and Retention

| Aspect                | Default                                   |
| --------------------- | ----------------------------------------- |
| JWS logging           | `receipt_ref` only; full JWS never logged |
| Identity fields       | DID/URL opt-in logging only               |
| Log retention         | 30 days                                   |
| Receipt ref retention | 90 days                                   |
| Bundle exports        | Tenant-controlled                         |

## Threat Mitigations

| Threat                            | Mitigation                                                            | Budget                                      |
| --------------------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| SSRF via JWKS                     | SSRF-safe fetch, private IP rejection, no redirects to private ranges | Existing `@peac/protocol` posture           |
| JWKS cache poisoning              | TTL-bound cache, key-pinning option                                   | Cache TTL: 5 min default                    |
| Oversized JWS                     | Reject above surface size budget                                      | 64 KB (MCP/A2A), 8 KB (HTTP header)         |
| Pathological input                | Iterative JSON validation, depth/size limits from kernel constraints  | Existing kernel constraint enforcement      |
| `receipt_url` fetch amplification | Semaphore, per-tenant quota, timeout                                  | Max 5 concurrent, 5s timeout, 10/min/tenant |
| Cross-tenant leakage              | Per-API-key isolation, no shared state                                | Strict tenant isolation                     |
| Log leakage                       | Default: log `receipt_ref` only                                       | Aligned with privacy defaults               |
| Retry storms                      | Per-tenant rate limiting, circuit breaker on upstream JWKS            | 100 req/min default                         |
| Timeout ceiling                   | Hard ceiling on verification time                                     | 10 seconds                                  |

## Response Headers

All responses include:

| Header                   | Value                                            |
| ------------------------ | ------------------------------------------------ |
| `Content-Type`           | `application/json` or `application/problem+json` |
| `X-Content-Type-Options` | `nosniff`                                        |
| `Cache-Control`          | `no-store`                                       |
| `RateLimit-Limit`        | Current rate limit                               |
| `RateLimit-Remaining`    | Remaining requests in window                     |
| `RateLimit-Reset`        | Seconds until rate limit resets                  |

## Related documents

- [Trust artifacts](TRUST-ARTIFACTS.md)
- [Verifier security model](specs/VERIFIER-SECURITY-MODEL.md)
- [Stability contract](STABILITY-CONTRACT.md)
- [Threat model](THREAT_MODEL.md)
- [Compliance mappings](compliance/README.md)
- [Reference verifier recipes](../surfaces/reference-verifier/README.md)
