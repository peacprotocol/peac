# Hosted Verify API Contract

**Status:** Design artifact (DD-210). Implementation ships separately.

This document defines the API contract for the hosted verification service. Implementations MUST conform to this contract.

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

### POST /v1/issue (provisional)

Issue a signed interaction record. This endpoint is provisional and may ship in a later release than `/v1/verify`.

**Request:**

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

| Code                         | HTTP | Type URI suffix            | Detail                                                                                     |
| ---------------------------- | ---- | -------------------------- | ------------------------------------------------------------------------------------------ |
| `E_INVALID_JWS_FORMAT`       | 400  | `invalid-jws-format`       | Input is not a valid compact JWS. Expected three base64url segments separated by dots.     |
| `E_JWS_MISSING_KID`          | 400  | `missing-kid`              | JWS header is missing a `kid` field. Add a key identifier to the signing key.              |
| `E_JWS_MISSING_TYP`          | 400  | `missing-typ`              | JWS header is missing a `typ` field.                                                       |
| `E_UNSUPPORTED_WIRE_VERSION` | 400  | `unsupported-wire-version` | Wire version is not supported by this endpoint.                                            |
| `E_SIGNATURE_INVALID`        | 422  | `invalid-signature`        | Ed25519 signature does not match the payload and key.                                      |
| `E_ISS_NOT_CANONICAL`        | 422  | `iss-not-canonical`        | The `iss` field must start with `https://` or `did:`.                                      |
| `E_CLAIMS_VALIDATION_FAILED` | 422  | `claims-validation-failed` | Claims do not conform to the expected schema.                                              |
| `E_POLICY_BINDING_FAILED`    | 422  | `policy-binding-failed`    | Policy digest does not match the local policy.                                             |
| `E_JWKS_RESOLUTION_FAILED`   | 502  | `jwks-resolution-failed`   | Could not resolve JWKS for the issuer. Check the issuer's `/.well-known/peac-issuer.json`. |
| `E_ISSUER_DISCOVERY_FAILED`  | 502  | `issuer-discovery-failed`  | Could not fetch issuer configuration.                                                      |
| `E_KEY_NOT_FOUND`            | 404  | `key-not-found`            | No key matching the `kid` was found in the issuer's JWKS.                                  |
| `E_RATE_LIMITED`             | 429  | `rate-limited`             | Request rate exceeded. See `RateLimit-*` headers.                                          |
| `E_PAYLOAD_TOO_LARGE`        | 413  | `payload-too-large`        | JWS exceeds the maximum size for this surface.                                             |

## Issuer and JWKS Handling

Resolution path: `iss` -> `/.well-known/peac-issuer.json` -> `jwks_uri` -> JWKS -> match `kid`.

| Aspect          | Specification                                                         |
| --------------- | --------------------------------------------------------------------- |
| Cache TTL       | 5 minutes (default), configurable per tenant                          |
| SSRF protection | Private IP rejection, no redirects to private ranges, SSRF-safe fetch |
| Timeout         | 5 seconds per upstream request                                        |
| Failure mode    | `E_JWKS_RESOLUTION_FAILED` with issuer URI in `detail`                |

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
