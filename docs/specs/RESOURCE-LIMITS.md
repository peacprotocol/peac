# Resource limits

> **Status:** Normative. Each invariant in this document MUST be enforced
> by every implementation that claims conformance. Each row names a code
> path that enforces the rule today, plus a test that exercises it. CI
> enforces that every linked test path resolves to a tracked file via
> [`scripts/verify-trust-artifacts.mjs`](../../scripts/verify-trust-artifacts.mjs)
> and that the listed constants stay byte-stable through
> [`bash scripts/release/api-surface-lock.sh`](../../scripts/release/api-surface-lock.sh).

Resource limits exist for three reasons: predictable verification cost,
predictable wire size, and explicit denial-of-service surface area.
Limits are deliberately small. Tightening a limit is a roadmap decision;
loosening one is a stability-contract change.

## Invariant table

The reference values below ship at v0.13.0. Each row points at the
authoritative constant; if a future release tightens the value, the
constant is the single source of truth and this row is updated.

### Receipt-content invariants (kernel)

| Invariant                      | Value   | Constant                                                                                                                 | Test                                                                                                                     |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Max nesting depth (JSON)       | 32      | `KERNEL_CONSTRAINTS.MAX_NESTED_DEPTH` ([`packages/schema/src/constraints.ts`](../../packages/schema/src/constraints.ts)) | [`packages/schema/__tests__/constraints.test.ts`](../../packages/schema/__tests__/constraints.test.ts)                   |
| Max array length               | 10,000  | `KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH`                                                                                    | same                                                                                                                     |
| Max object keys                | 1,000   | `KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS`                                                                                     | same                                                                                                                     |
| Max string length (code units) | 65,536  | `KERNEL_CONSTRAINTS.MAX_STRING_LENGTH`                                                                                   | same                                                                                                                     |
| Max total nodes                | 100,000 | `KERNEL_CONSTRAINTS.MAX_TOTAL_NODES`                                                                                     | same                                                                                                                     |
| Clock skew tolerance (seconds) | 60      | `KERNEL_CONSTRAINTS.CLOCK_SKEW_SECONDS`                                                                                  | [`packages/protocol/__tests__/verify-local-order.test.ts`](../../packages/protocol/__tests__/verify-local-order.test.ts) |

These are enforced fail-closed by `validateKernelConstraints()` on
issuance (before signing) and on verification (after JWS decode, before
schema validation). See
[`docs/specs/KERNEL-CONSTRAINTS.md`](KERNEL-CONSTRAINTS.md) for the
enforcement-point detail.

### HTTP-surface invariants (reference verifier)

| Invariant                                  | Value                                 | Constant                                                                                     | Test                                                                                                                   |
| ------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Max request body bytes (`POST /v1/verify`) | 256 KiB                               | `MAX_BODY_SIZE` ([`apps/api/src/verify-v1.ts`](../../apps/api/src/verify-v1.ts))             | [`apps/api/src/verify-v1.test.js`](../../apps/api/src/verify-v1.test.js)                                               |
| Legacy alias header set (every response)   | RFC 9745 + RFC 8594 + RFC 8288        | `LEGACY_VERIFY_DEPRECATION_HEADERS` ([`apps/api/src/index.ts`](../../apps/api/src/index.ts)) | [`apps/api/tests/legacy-verify-alias-headers.test.ts`](../../apps/api/tests/legacy-verify-alias-headers.test.ts)       |
| Legacy alias and canonical parity          | shape-identical                       | `createLegacyVerifyAliasHandler` ([`apps/api/src/index.ts`](../../apps/api/src/index.ts))    | [`apps/api/tests/legacy-verify-alias-pre-sunset.test.ts`](../../apps/api/tests/legacy-verify-alias-pre-sunset.test.ts) |
| Error response Content-Type                | `application/problem+json` (RFC 9457) | `PROBLEM_MEDIA_TYPE` ([`apps/api/src/index.ts`](../../apps/api/src/index.ts))                | [`apps/api/src/errors.test.js`](../../apps/api/src/errors.test.js)                                                     |

The reference verifier enforces the body cap before parsing. Requests
that exceed it return RFC 9457 Problem Details with code
`E_PAYLOAD_TOO_LARGE`. Implementations MUST cap incoming JSON body
size before invoking the JWS decoder.

### Carrier-embed invariants (transport adapters)

| Invariant                         | Value                   | Constant                                                                                                             | Test                                                                                                                     |
| --------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| A2A carrier embed size            | 64 KiB                  | `A2A_MAX_CARRIER_SIZE` ([`packages/mappings/a2a/src/types.ts`](../../packages/mappings/a2a/src/types.ts))            | [`packages/mappings/a2a/tests/normalizers.test.ts`](../../packages/mappings/a2a/tests/normalizers.test.ts)               |
| MCP `_meta` carrier (compact JWS) | bounded by JWS body cap | per-extension carriers documented in [`docs/specs/EVIDENCE-CARRIER-CONTRACT.md`](EVIDENCE-CARRIER-CONTRACT.md)       | [`packages/mappings/mcp/__tests__/`](../../packages/mappings/mcp/__tests__/)                                             |
| `PEAC-Receipt` HTTP header        | compact JWS only        | `PEAC_RECEIPT_HEADER` ([`packages/kernel/src/carrier.ts`](../../packages/kernel/src/carrier.ts))                     | [`packages/middleware-core/tests/config.test.ts`](../../packages/middleware-core/tests/config.test.ts)                   |
| `receipt_url` fetch response cap  | 64 KiB                  | `DEFAULT_MAX_BYTES` ([`packages/net/node/src/receipt-resolver.ts`](../../packages/net/node/src/receipt-resolver.ts)) | [`packages/net/node/tests/receipt-url-middleware.test.ts`](../../packages/net/node/tests/receipt-url-middleware.test.ts) |

### Network-bearing invariants (resolver path)

These apply to every code path that fetches a remote resource:
issuer-config (`/.well-known/peac-issuer.json`), JWKS, `peac.txt`, and
`receipt_url`. They are enforced by
[`@peac/net-node`](../../packages/net/node/) and
[`@peac/jwks-cache`](../../packages/jwks-cache/).

| Invariant                        | Value     | Constant                                                                                                              | Test                                                                                                                     |
| -------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| net-node fetch timeout (default) | 30,000 ms | `DEFAULT_TIMEOUT_MS` ([`packages/net/node/src/index.ts`](../../packages/net/node/src/index.ts))                       | [`packages/net/node/tests/safe-fetch.test.ts`](../../packages/net/node/tests/safe-fetch.test.ts)                         |
| net-node redirect chain cap      | 5         | `DEFAULT_MAX_REDIRECTS`                                                                                               | same                                                                                                                     |
| `peac.txt` fetch byte cap        | 256 KiB   | `POLICY.maxBytes` ([`packages/kernel/src/constants.ts`](../../packages/kernel/src/constants.ts))                      | [`packages/policy-kit/tests/loader.test.ts`](../../packages/policy-kit/tests/loader.test.ts)                             |
| JWKS fetch timeout               | 5,000 ms  | `VERIFIER_LIMITS.fetchTimeoutMs` ([`packages/kernel/src/constants.ts`](../../packages/kernel/src/constants.ts))       | [`packages/jwks-cache/tests/resolver.test.ts`](../../packages/jwks-cache/tests/resolver.test.ts)                         |
| JWKS keys per response cap       | 100       | `DEFAULT_MAX_KEYS`                                                                                                    | same                                                                                                                     |
| JWKS cache TTL (default)         | 3,600 s   | `DEFAULT_TTL_SECONDS`                                                                                                 | same                                                                                                                     |
| JWKS cache TTL (max)             | 86,400 s  | `MAX_TTL_SECONDS`                                                                                                     | same                                                                                                                     |
| JWKS cache TTL (min)             | 60 s      | `MIN_TTL_SECONDS`                                                                                                     | same                                                                                                                     |
| receipt_url fetch timeout        | 5,000 ms  | `DEFAULT_TIMEOUT_MS` ([`packages/net/node/src/receipt-resolver.ts`](../../packages/net/node/src/receipt-resolver.ts)) | [`packages/net/node/tests/receipt-url-middleware.test.ts`](../../packages/net/node/tests/receipt-url-middleware.test.ts) |

#### Layered network limits

The values above describe a layered contract. `@peac/net-node`
exposes a generous default (`DEFAULT_TIMEOUT_MS = 30,000 ms` and
`DEFAULT_MAX_RESPONSE_BYTES = 2 MiB`) for unrestricted callers.
Verifier-bearing paths (pointer-fetch, JWKS resolution, issuer-config
fetch, `peac.txt` discovery) pass explicit `timeoutMs` and `maxBytes`
options that are tighter than the net-node default. The explicit value
wins; the unrestricted default applies only to callers that do not
supply one.

Implementations MUST NOT relax a verifier-bearing path's explicit cap
to the unrestricted default, even when convenient. The net-node
default exists for callers that manage their own timing and size
guarantees; verifier-bearing fetch paths always pass the explicit
value.

#### Timeout classes

Three timeout classes apply to verifier-bearing and unrestricted
network paths:

- **5,000 ms**: verifier-bearing fetches: JWKS, `peac.txt`,
  pointer-fetch, ssrf-safe-fetch (default). Canonical verifier limit:
  `VERIFIER_LIMITS.fetchTimeoutMs` in
  [`packages/kernel/src/constants.ts`](../../packages/kernel/src/constants.ts).
- **10,000 ms**: issuer-config fetch
  (`/.well-known/peac-issuer.json`). Canonical verifier limit:
  `ISSUER_CONFIG.fetchTimeoutMs` in
  [`packages/kernel/src/constants.ts`](../../packages/kernel/src/constants.ts).
  Slightly more generous than verifier-bearing fetches because
  issuer-config is the discovery anchor for verification.
- **30,000 ms**: unrestricted net-node default for callers that do
  not supply `timeoutMs`. Canonical net-node default:
  `DEFAULT_TIMEOUT_MS` in
  [`packages/net/node/src/index.ts`](../../packages/net/node/src/index.ts).

Every verifier-bearing path supplies an explicit timeout in the 5,000
or 10,000 ms class, so the 30,000 ms default applies only outside the
verification path. Some discovery call sites currently use the
matching literal value; this document records the resource-limit
contract, not a source refactor.

## SSRF policy

The default SSRF policy in
[`packages/net/node/src/ssrf.ts`](../../packages/net/node/src/ssrf.ts)
blocks every private and special-purpose IPv4 range:

- RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
- Loopback (`127.0.0.0/8`).
- Link-local (`169.254.0.0/16`), including the cloud metadata IP
  `169.254.169.254` (AWS, GCE, Azure).
- CGNAT (`100.64.0.0/10`).
- IETF protocol assignments and TEST-NET ranges
  (`192.0.0.0/24`, `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`).
- 6to4 relay anycast (`192.88.99.0/24`).
- Benchmark testing (`198.18.0.0/15`).
- Multicast (`224.0.0.0/4`) and reserved (`240.0.0.0/4`).
- Broadcast (`255.255.255.255`).
- IPv6 loopback (`::1`), unique-local (`fc00::/7`), link-local
  (`fe80::/10`), and IPv4-mapped IPv6 forms.

Hostnames that resolve to any of those ranges via DNS are rejected by
the same check pre-connect. The IDNA / Punycode encoding of a private
literal does not bypass the check.

The same policy applies to issuer-config fetch, JWKS fetch, `peac.txt`
discovery, and `receipt_url` resolution. There is no opt-in toggle for
allowing private ranges in the default deployment shape; opt-in is an
explicit flag (`PEAC_ALLOW_PRIVATE_NET=true`) intended for
self-contained development environments only.

| Invariant                               | Test                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Reject literal private IPv4             | [`packages/net/node/tests/ssrf.test.ts`](../../packages/net/node/tests/ssrf.test.ts)                     |
| Reject literal IPv6 loopback / ULA / LL | [`packages/net/node/tests/ssrf-expansion.test.ts`](../../packages/net/node/tests/ssrf-expansion.test.ts) |
| Reject DNS-resolved private addresses   | [`packages/net/node/tests/ssrf.test.ts`](../../packages/net/node/tests/ssrf.test.ts)                     |
| Reject IDNA-encoded localhost           | same                                                                                                     |
| Cloud-metadata IP detection             | [`packages/jwks-cache/tests/security.test.ts`](../../packages/jwks-cache/tests/security.test.ts)         |

## Cache-isolation policy

JWKS, issuer-config, and policy caches are bounded LRUs in the
reference verifier. The cache key is the full canonical URL (scheme,
host, port, path); cache entries are not shared across hosts and not
keyed by issuer alone, so an issuer cannot poison another issuer's
JWKS by reusing a `kid`. The cache also rejects `kid` reuse across
distinct keys (kid-reuse detection), and a TTL ceiling caps the age of
any cached entry regardless of upstream `Cache-Control: max-age`.

| Invariant                   | Constant / file                                                                                              | Test                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Cache key includes full URL | `buildCacheKey` ([`packages/jwks-cache/src/cache.ts`](../../packages/jwks-cache/src/cache.ts))               | [`packages/jwks-cache/tests/cache.test.ts`](../../packages/jwks-cache/tests/cache.test.ts)       |
| `kid` reuse rejected        | resolver implementation ([`packages/jwks-cache/src/resolver.ts`](../../packages/jwks-cache/src/resolver.ts)) | [`packages/jwks-cache/tests/resolver.test.ts`](../../packages/jwks-cache/tests/resolver.test.ts) |
| TTL ceiling honored         | `MAX_TTL_SECONDS`                                                                                            | same                                                                                             |
| LRU eviction on size cap    | `InMemoryCache`                                                                                              | [`packages/jwks-cache/tests/cache.test.ts`](../../packages/jwks-cache/tests/cache.test.ts)       |

## How these limits compose

A successful `POST /v1/verify` end-to-end flow burns through several
caps in sequence; a malformed request stops at the first violated cap
and returns RFC 9457 Problem Details:

1. HTTP body size cap (256 KiB) — request rejected before parsing.
2. JWS decode — rejects compact-serialization shape violations and
   unsupported `typ` / `alg` headers.
3. Kernel constraints — depth / array / string / nodes / object-keys
   caps applied to the decoded claim object before schema parse.
4. Schema parse — Zod schemas reject unknown extensions or shape drift.
5. Signature verify — Ed25519 against a key resolved through:
   - `iss` -> `/.well-known/peac-issuer.json` (timeout 5,000 ms,
     SSRF-checked) -> `jwks_uri` -> JWKS (timeout 5,000 ms, max 100
     keys, TTL 60-86,400 s, SSRF-checked).
   - or a caller-supplied `public_key` (no network).
6. Temporal validity — `iat` / `nbf` / `exp` against current time
   with 60 s skew tolerance.
7. Optional report assembly — same SSRF and timeout caps for any
   resolver-bearing extension.

Each layer's limit is independent and additive. Implementations MUST
NOT skip any layer's cap.

## Connections to adjacent surfaces

- **MCP server** (`@peac/mcp-server`): tool-call responses can carry a
  receipt under `_meta.org.peacprotocol/receipt_jws`. The receipt must
  satisfy the kernel constraints; the MCP carrier itself does not add
  a new size cap beyond what the JWS body imposes. See
  [`docs/specs/MCP-EVIDENCE-PROFILE.md`](MCP-EVIDENCE-PROFILE.md).
- **A2A mappings**: agent cards declare carrier sizes; observations
  attached to A2A messages must fit within `A2A_MAX_CARRIER_SIZE`. See
  [`docs/specs/A2A-RECEIPT-PROFILE.md`](A2A-RECEIPT-PROFILE.md).
- **x402 / payment evidence**: rail adapters never synthesize finality
  from non-payment artifacts. The mapper-boundary guard
  `assertExplicitFinality` raises a structured error
  (`commerce.finality_synthesis_blocked`) on any attempt to do so. See
  [`docs/specs/COMMERCE-EVIDENCE.md`](COMMERCE-EVIDENCE.md).
- **Discovery and JWKS**: `peac.txt`, issuer-config, and JWKS fetches
  share the same SSRF policy, redirect cap, and timeout class. JWKS
  responses also pass through the kid-reuse detection and key-count
  caps. See [`docs/specs/PEAC-ISSUER.md`](PEAC-ISSUER.md) and
  [`docs/specs/PEAC-TXT.md`](PEAC-TXT.md).
- **Header-carrier surfaces**: the `PEAC-Receipt` HTTP header carries
  a compact JWS only. Per-RFC HTTP-header byte budgets apply
  externally; PEAC does not introduce a separate header-byte cap.
  The reference verifier (`apps/api`) does not currently define a
  PEAC-managed app-level header-byte budget; header-size rejection is
  left to the runtime / parser / deployment layer (Node's HTTP server
  exposes `maxHeaderSize`; current Node documentation lists the
  default at 16 KiB, but deployment hosts may differ). A request body
  is the sized payload that PEAC enforces, capped at 256 KiB by
  `MAX_BODY_SIZE` in [`apps/api/src/verify-v1.ts`](../../apps/api/src/verify-v1.ts).

## Tightening process

A future release MAY tighten any limit in this document. Tightening is
a stability-contract change; the new value MUST be:

1. Recorded in this document with the new value and the constant path.
2. Wired into the constant in source.
3. Guarded by a test that asserts the new ceiling.
4. Captured in [`CHANGELOG.md`](../../CHANGELOG.md) under "Changed".

A future release MUST NOT loosen any limit in this document without an
explicit roadmap decision recorded in
[`docs/STABILITY-CONTRACT.md`](../STABILITY-CONTRACT.md). Loosening is
a stability classification flip and follows the same lifecycle as a
public-API breaking change.

## Out of scope

- Per-tenant or per-customer rate limits in managed deployments. The
  managed Hosted Verify instance carries its own rate-limit policy;
  the open-source reference verifier ships with a generic
  `RateLimit-*` (RFC 9333) header set documented in
  [`docs/HOSTED_VERIFY_CONTRACT.md`](../HOSTED_VERIFY_CONTRACT.md).
- Application-level business invariants layered on top of PEAC
  records. PEAC records are observational; applications enforce their
  own quotas above this layer.
- TLS-level limits (record size, fragment policy). Those are the
  domain of the TLS implementation and are not specified here.
