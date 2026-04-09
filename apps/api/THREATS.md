# Hosted Verify Threat-to-Test Traceability

Traceability matrix mapping DD-210 threat vectors to specific tests, budgets, and fail-closed behaviors.

## Threat Matrix

| #   | Threat                            | Budget / Limit                                                                                                                                                                                                                           | Test(s)                                                                          | Fail-Closed Behavior                                                                                 |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| T1  | SSRF via JWKS resolution          | HTTPS-only; private IP rejection; DNS rebinding check; 5s timeout                                                                                                                                                                        | Issuer allowlist test; untrusted issuer returns `E_VERIFY_ISSUER_CONFIG_MISSING` | No outbound fetch for unknown issuers (allowlist-first)                                              |
| T2  | JWKS cache poisoning              | Per-tenant cache isolation; 5-min TTL; `InMemoryCache`                                                                                                                                                                                   | Rate limit isolation test (separate key/IP buckets)                              | Stale cache entry expires; fresh fetch required                                                      |
| T3  | Oversized JWS                     | 256 KB max body (`content-length` check + Zod `.max()`)                                                                                                                                                                                  | `rejects oversized body` test (413)                                              | Returns `E_PAYLOAD_TOO_LARGE`; no parsing attempted                                                  |
| T4  | Pathological JSON (deep nesting)  | Zod strict validation; kernel constraints enforced by `verifyLocal()`                                                                                                                                                                    | Zod strict schema test; constraint violation test                                | Returns `E_CONSTRAINT_VIOLATION` (422)                                                               |
| T5  | `receipt_url` fetch amplification | Issuer discovery disabled by default; allowlist-only JWKS. When discovery is enabled: no explicit semaphore or per-tenant discovery rate limiter in alpha (relies on handler-level rate limit); full budget enforcement is v0.12.9 scope | Untrusted issuer test confirms no fetch when discovery disabled                  | No fetch for non-allowlisted issuers (discovery off); delegated to handler rate limit (discovery on) |
| T6  | Cross-tenant leakage              | Per-key rate limit buckets; `InMemoryCache` keyed by issuer                                                                                                                                                                              | API key vs anonymous rate limit isolation test                                   | No cross-tenant state                                                                                |
| T7  | Log leakage of identity           | Only `receipt_ref` in response; no raw claims in error details                                                                                                                                                                           | Error detail tests confirm no internal paths or claims                           | DID/URL/claims never in error responses                                                              |
| T8  | Retry storms / verifier abuse     | RFC 9333 rate limiting; 100 req/min anonymous; 1000 req/min API key                                                                                                                                                                      | Rate limit enforcement test (429 + Retry-After)                                  | Returns 429 with `RateLimit-*` headers                                                               |
| T9  | Total request timeout             | 10s hard ceiling (handler-level)                                                                                                                                                                                                         | Implicit via JWKS timeout (5s) + verification budget                             | Returns error or closes connection                                                                   |

## Request Budget

| Limit                  | Value        | Enforcement Point                                         |
| ---------------------- | ------------ | --------------------------------------------------------- |
| Raw body size          | 256 KB       | `content-length` header check + Zod `.max(MAX_BODY_SIZE)` |
| JWKS fetch timeout     | 5s           | `@peac/jwks-cache` `timeoutMs` option                     |
| JWKS response size     | 1 MB         | `@peac/jwks-cache` `maxResponseBytes` option              |
| Rate limit (anonymous) | 100 req/min  | `MemoryRateLimitStore` per-IP bucket                      |
| Rate limit (API key)   | 1000 req/min | `MemoryRateLimitStore` per-key bucket                     |
| Max JWKS keys          | 100          | `@peac/jwks-cache` `maxKeys` option                       |

## Log-Only Policy

| Field                                  | Default | Opt-In                      | Never |
| -------------------------------------- | ------- | --------------------------- | ----- |
| `receipt_ref`, HTTP status, error code | Logged  | -                           | -     |
| `iss`, `kid`                           | No      | Future: `PEAC_LOG_ISS=true` | -     |
| Claims, raw JWS, private keys          | -       | -                           | Never |
