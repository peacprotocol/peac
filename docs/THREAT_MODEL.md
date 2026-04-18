# PEAC Protocol threat model

Consolidated threat model for the wire format, the open-source reference
verifier, the MCP server, and the published Layer 4 adapters. Each threat
below lists the mitigation and a test path that exercises it; the
companion verifier [`scripts/verify-trust-artifacts.mjs`](../scripts/verify-trust-artifacts.mjs)
fails CI if any referenced test path does not exist or if any threat row
lacks a test link.

## Scope

In scope:

- Wire format (`typ: interaction-record+jwt`, Wire 0.2; `peac-receipt/0.1`,
  Wire 0.1; archival `peac.receipt/0.9`).
- Signature verification (Ed25519, JWS Compact Serialization, JCS).
- Issuer-config and JWKS resolution.
- Reference verifier ([`apps/api`](../apps/api)).
- MCP server ([`@peac/mcp-server`](../packages/mcp-server)) stdio and
  Streamable HTTP transports.
- Layer 4 commerce mapper boundary
  ([`@peac/adapter-core`](../packages/adapters/core)
  `assertExplicitFinality`).
- Cross-language parity (`packages/schema` and `sdks/go`).

Out of scope:

- Managed Hosted Verify (operated separately under its own threat model).
- Customer-side key custody (bring-your-own-key; see [Key custody and
  tenancy](KEY-CUSTODY-AND-TENANCY.md)).
- Transport-level confidentiality beyond what TLS and RFC 9421 provide.
- Application-level business logic layered on top of PEAC records.

## Trust boundaries

| Boundary                             | Assumption                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| Record issuer ↔ record verifier      | Untrusted over the wire; trust is established by the issuer's JWKS binding     |
| Reference verifier ↔ upstream JWKS   | Untrusted network; SSRF-safe fetch + private-range block                       |
| Caller ↔ `@peac/protocol` public API | Trusted process boundary; caller supplies keys and fixtures                    |
| MCP client ↔ MCP server              | Session-isolated per client; no shared mutable state between clients           |
| Layer 4 mapper ↔ upstream artifact   | Upstream state is never synthesized into finality; see commerce-finality guard |

## Threat catalog

Each row links to a test file that exercises the mitigation. CI enforces
that every link resolves to a tracked path.

### Wire format and signature

| ID        | Threat                                                      | Mitigation                                                                      | Test coverage                                                                                                                                                                  |
| --------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-WIRE-01 | Forged signature                                            | Ed25519 verify (RFC 8032); JWS Compact Serialization (RFC 7515)                 | [`packages/crypto/tests/jws.test.ts`](../packages/crypto/tests/jws.test.ts)                                                                                                    |
| T-WIRE-02 | JOSE header abuse (`jwk`/`x5c`/`x5u`/`jku`)                 | Embedded-key forms rejected on verify                                           | [`packages/crypto/__tests__/jws-wire-02.test.ts`](../packages/crypto/__tests__/jws-wire-02.test.ts)                                                                            |
| T-WIRE-03 | Critical-extension abuse (`crit` / `b64:false` / `zip`)     | Disallowed at the JWS layer                                                     | [`packages/crypto/__tests__/jws.property.test.ts`](../packages/crypto/__tests__/jws.property.test.ts)                                                                          |
| T-WIRE-04 | Wire-version confusion (0.1 ↔ 0.2 cross-claim)              | `typ` header drives dispatch; coherence enforced at verify                      | [`packages/protocol/__tests__/strictness.property.test.ts`](../packages/protocol/__tests__/strictness.property.test.ts)                                                        |
| T-WIRE-05 | Receipt-ref tampering                                       | `receipt_ref = sha256(receipt_jws)` verified at extraction                      | [`packages/schema/__tests__/carrier.test.ts`](../packages/schema/__tests__/carrier.test.ts)                                                                                    |
| T-WIRE-06 | Replay attack                                               | `jti` uniqueness; `iat` / `nbf` / `exp` time bounds; verifier-side replay cache | [`packages/protocol/__tests__/verify-local-order.test.ts`](../packages/protocol/__tests__/verify-local-order.test.ts)                                                          |
| T-WIRE-07 | Canonical-JSON divergence (JCS RFC 8785)                    | Golden vectors; property tests; cross-language parity                           | [`packages/crypto/tests/jcs.test.ts`](../packages/crypto/tests/jcs.test.ts), [`packages/net/node/tests/jcs-property.test.ts`](../packages/net/node/tests/jcs-property.test.ts) |
| T-WIRE-08 | Algorithm confusion / downgrade                             | Ed25519 only; no alg negotiation                                                | [`packages/crypto/tests/golden-vectors.test.ts`](../packages/crypto/tests/golden-vectors.test.ts)                                                                              |
| T-WIRE-09 | Policy-binding forgery (policy claim not bound to issuance) | JCS-based policy digest + three-state policy-binding result                     | [`packages/protocol/__tests__/policy-binding.test.ts`](../packages/protocol/__tests__/policy-binding.test.ts)                                                                  |

### Issuer and JWKS resolution

| ID       | Threat                                                         | Mitigation                                                                                               | Test coverage                                                                                                                                                                                            |
| -------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-RES-01 | SSRF via issuer-config / JWKS fetch                            | HTTPS only; private, loopback, and reserved-range block; IDNA / bracket / IPv4-in-IPv6 expansion blocked | [`packages/net/node/tests/safe-fetch.test.ts`](../packages/net/node/tests/safe-fetch.test.ts), [`packages/net/node/tests/ssrf-expansion.test.ts`](../packages/net/node/tests/ssrf-expansion.test.ts)     |
| T-RES-02 | Slowloris / unbounded fetch time                               | Explicit timeout cap on every network-bearing path                                                       | [`packages/jwks-cache/tests/resolver.test.ts`](../packages/jwks-cache/tests/resolver.test.ts)                                                                                                            |
| T-RES-03 | JWKS cache poisoning / kid substitution                        | Bounded LRU keyed per issuer; `kid` retention with reuse detection                                       | [`packages/jwks-cache/tests/security.test.ts`](../packages/jwks-cache/tests/security.test.ts), [`packages/jwks-cache/tests/cache.test.ts`](../packages/jwks-cache/tests/cache.test.ts)                   |
| T-RES-04 | Redirect-chain attack (cross-origin redirect to private range) | Redirect policy bounded; redirects to blocked ranges rejected                                            | [`packages/net/node/tests/safe-fetch.test.ts`](../packages/net/node/tests/safe-fetch.test.ts)                                                                                                            |
| T-RES-05 | `receipt_url` fetch amplification                              | Semaphore, per-tenant quota, fetch timeout, SSRF-safe                                                    | [`packages/net/node/tests/receipt-url-middleware.test.ts`](../packages/net/node/tests/receipt-url-middleware.test.ts)                                                                                    |
| T-RES-06 | Reference-verifier discovery ambient fetch                     | Discovery constrained to verified resolver paths; no ambient pointer fetch                               | [`packages/protocol/tests/pointer-fetch.test.ts`](../packages/protocol/tests/pointer-fetch.test.ts), [`packages/protocol/tests/jwks-resolver.test.ts`](../packages/protocol/tests/jwks-resolver.test.ts) |

### Verifier resource control

| ID        | Threat                                             | Mitigation                                                                                   | Test coverage                                                                                                                                                                                                                    |
| --------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-VRFY-01 | Oversized record DoS                               | Receipt, per-extension-group, total-extension, nesting-depth, and member-count caps enforced | [`packages/schema/__tests__/constraints.test.ts`](../packages/schema/__tests__/constraints.test.ts), [`packages/schema/__tests__/byte-budget-enforcement.test.ts`](../packages/schema/__tests__/byte-budget-enforcement.test.ts) |
| T-VRFY-02 | Kernel-constraint bypass (pre-signing path)        | `validateKernelConstraints()` enforced in `issue()` before signing and on verify             | [`packages/protocol/tests/issue-constraints.test.ts`](../packages/protocol/tests/issue-constraints.test.ts), [`packages/protocol/tests/verify-constraints.test.ts`](../packages/protocol/tests/verify-constraints.test.ts)       |
| T-VRFY-03 | Issuance path calls network (no-network invariant) | Issuance MUST NOT perform any network I/O                                                    | [`tests/security/no-fetch-audit.test.ts`](../tests/security/no-fetch-audit.test.ts)                                                                                                                                              |
| T-VRFY-04 | Wire 0.2 issuance byte-identity drift              | Property test over canonical JCS + JWS construction                                          | [`packages/protocol/__tests__/issue-wire-02.test.ts`](../packages/protocol/__tests__/issue-wire-02.test.ts)                                                                                                                      |

### MCP server

| ID       | Threat                                         | Mitigation                                                   | Test coverage                                                                                                                                                                                                                              |
| -------- | ---------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-MCP-01 | Cross-client state leak (Streamable HTTP)      | Session-isolated `McpServer` + transport per client          | [`packages/mcp-server/tests/http/session-manager.test.ts`](../packages/mcp-server/tests/http/session-manager.test.ts), [`packages/mcp-server/tests/http/http-transport.test.ts`](../packages/mcp-server/tests/http/http-transport.test.ts) |
| T-MCP-02 | Static-policy bypass (runtime policy mutation) | Static policy loaded at startup; immutable at runtime        | [`packages/mcp-server/tests/infra/policy.test.ts`](../packages/mcp-server/tests/infra/policy.test.ts)                                                                                                                                      |
| T-MCP-03 | Path-traversal via handler input               | Path-safety validation on every file-bearing handler input   | [`packages/mcp-server/tests/infra/path-safety.test.ts`](../packages/mcp-server/tests/infra/path-safety.test.ts)                                                                                                                            |
| T-MCP-04 | Stdout framing bypass (stdio transport)        | Line-buffered stdout fence                                   | [`packages/mcp-server/tests/security/stdout-fence.test.ts`](../packages/mcp-server/tests/security/stdout-fence.test.ts)                                                                                                                    |
| T-MCP-05 | Evidence-carrier size overflow in `_meta`      | Transport-binding size caps; 64 KB embed for MCP / A2A / UCP | [`packages/mcp-server/tests/integration/e2e-smoke.test.ts`](../packages/mcp-server/tests/integration/e2e-smoke.test.ts)                                                                                                                    |

### Commerce mapper boundary

| ID        | Threat                                                 | Mitigation                                                                                 | Test coverage                                                                                                                                                                                                              |
| --------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-CMRC-01 | Mapper synthesizes finality from non-payment artifacts | `assertExplicitFinality` boundary guard; stable code `commerce.finality_synthesis_blocked` | [`packages/adapters/core/tests/finality.test.ts`](../packages/adapters/core/tests/finality.test.ts), [`packages/adapters/core/tests/finality-fixtures.test.ts`](../packages/adapters/core/tests/finality-fixtures.test.ts) |

### Cross-language parity

| ID          | Threat                         | Mitigation                                             | Test coverage                                                                                                                                                                                                                        |
| ----------- | ------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-PARITY-01 | TS / Go wire-output divergence | Shared JCS golden vectors; claim parity property tests | [`tests/parity/core-claims.test.ts`](../tests/parity/core-claims.test.ts), [`specs/conformance/fixtures/go-interaction-record/jcs-golden-vectors.json`](../specs/conformance/fixtures/go-interaction-record/jcs-golden-vectors.json) |

## Mitigation gaps (acknowledged)

These mitigations are in effect but have scheduled follow-ups for a future
release. The stability contract and security operations describe the current
behavior; the scheduled work is planning scope, not a current gap in
shipped behavior.

- Mutation-testing baseline (Stryker for TypeScript; `go-mutesting` for Go).
- Error-code emission audit (classify unused codes in
  [`specs/kernel/errors.json`](../specs/kernel/errors.json)).
- Verifier-policy extraction from `@peac/kernel` into a verifier-owned
  surface.
- Resource-limit invariant table with per-row implementation, test, and
  baseline references.

## Future carrier surfaces (pre-doctrine)

The forthcoming public surfaces listed in the
[Stability contract](STABILITY-CONTRACT.md) pre-doctrine section have not
shipped. Their security contract is pre-declared here so that future
implementation MUST honor the rules on day one.

- **No raw secret capture by default.** Any future CLI or lifecycle record
  carrier defaults to redaction or hashing for `argv`, `stdin`, `stdout`,
  and `stderr`. Raw capture is opt-in and declared by a documented
  `capture_policy` entry.
- **Hash-only default for stream captures.** `stdin` / `stdout` / `stderr`
  are hashed, not stored verbatim, unless the caller explicitly enables
  raw capture under a documented policy.
- **Environment-variable allowlist plus value hashing.** No blanket
  environment dump. Only explicitly-listed variables enter the record,
  and even those are hashed by default.
- **Explicit `argv_mode`.** A shell-string invocation must be recorded as
  such. Hidden shell-expansion ambiguity is rejected.
- **Bounded byte ceilings on command capture.** `argv` bytes, stream
  bytes, and environment-variable reference counts all carry documented
  upper bounds. Exceeding a bound truncates or hashes; it never silently
  drops.
- **Lifecycle records are observational-only.** Approval, evaluation,
  experiment, and workflow records describe what another system
  attested. They never imply PEAC made the decision, scored the runtime,
  enforced the policy, or determined payment finality.

Each rule above becomes a named threat ID with a concrete test file at the
time the corresponding surface is implemented. No public CLI or lifecycle
code ships ahead of this contract.

## Related documents

- [Security considerations](specs/SECURITY-CONSIDERATIONS.md)
- [Verifier security model](specs/VERIFIER-SECURITY-MODEL.md)
- [HTTP transport security](security/HTTP-TRANSPORT-SECURITY.md)
- [OWASP ASI mapping](security/OWASP-ASI-MAPPING.md)
- [SECURITY.md](../SECURITY.md)
- [Security operations](SECURITY-OPERATIONS.md)
- [Key custody and tenancy](KEY-CUSTODY-AND-TENANCY.md)
- [Stability contract](STABILITY-CONTRACT.md)
- [SLO](SLO.md)
- [Trust artifacts](TRUST-ARTIFACTS.md)
