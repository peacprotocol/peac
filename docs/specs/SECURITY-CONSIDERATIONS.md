# Security Considerations

> **Status:** Normative | **Wire Version:** 0.2 (`interaction-record+jwt`)
> **Cross-reference:** `reference/THREAT_MODEL_MCP.md` (MCP-specific threats T1-T10)

This document describes the security properties, trust model, and deployment
guidance for the PEAC protocol. Normative requirements use BCP 14 keywords
(RFC 2119, RFC 8174).

---

## 1. Signing Model

PEAC uses Ed25519 (RFC 8032) as the sole signing algorithm. Algorithm
negotiation is not supported: the `alg` header MUST be `EdDSA`, and verifiers
MUST reject any other value.

**Rationale:** A single-algorithm design eliminates algorithm confusion attacks,
downgrade attacks, and key-type mismatches. Ed25519 provides 128-bit security
with deterministic signatures (no per-signature randomness to leak).

**Implementation:** `@peac/crypto` exports `sign()` and `verify()` using
Ed25519 via the Node.js `node:crypto` module. No fallback algorithms exist.

---

## 2. Verification Trust Model

Verification is caller-driven: `verifyLocal()` requires the caller to provide
the public key as a `Uint8Array`. The protocol does not perform automatic key
discovery, JWKS fetch, or DID resolution.

**Rationale:** Caller-provided keys ensure that verification never triggers
implicit network I/O (DD-55). This prevents SSRF via crafted `iss` claims and
eliminates DNS-based key substitution attacks.

**Key resolution guidance:**

- Verifiers SHOULD resolve keys via `/.well-known/peac-issuer.json` ->
  `jwks_uri` -> JWKS before calling `verifyLocal()`
- Key resolution MUST be performed by Layer 4+ code (`@peac/net-node`) with
  SSRF protection, not by the protocol layer
- DID-based key resolution is deferred to `@peac/adapter-did` (not yet
  implemented)

---

## 3. Transport Security

Evidence carriers enforce per-transport size limits to prevent resource
exhaustion:

| Transport | Embed Limit | Header Limit | Spec   |
| --------- | ----------- | ------------ | ------ |
| MCP       | 64 KB       | N/A          | DD-124 |
| A2A       | 64 KB       | N/A          | DD-125 |
| HTTP      | N/A         | 8 KB         | DD-126 |
| x402      | N/A         | 8 KB         | DD-127 |

CORS is deny-all by default for the MCP server (DD-123). The MCP server binds
to localhost only.

---

## 4. JOSE Hardening

Wire 0.2 enforces strict JOSE header validation (DD-156):

- Embedded key material (`jwk`, `x5c`, `x5u`, `jku`) MUST be rejected
- `crit` header MUST be rejected (no critical extension negotiation)
- `b64: false` MUST be rejected (detached payload not supported)
- `zip` header MUST be rejected (no compression)
- `kid` MUST be present and at most 256 characters
- `typ` MUST be `interaction-record+jwt`
  (`application/interaction-record+jwt` accepted per RFC 7515)
- `alg` MUST be `EdDSA`

**Rationale:** Rejecting embedded keys prevents key injection attacks where an
attacker embeds a key they control in the JWS header. Rejecting `crit` prevents
negotiation-based downgrade. Rejecting `b64: false` prevents payload confusion.

---

## 5. Key Lifecycle

Key management follows the DD-148 five-state FSM:

```text
pending -> active -> rotating -> revoked -> expired
```

- **Rotation:** 30-day overlap window; both old and new keys are valid during
  rotation. `revoked_keys[]` tracks revoked key IDs.
- **kid reuse detection:** Implementations MUST reject reuse of a previously
  revoked `kid` value.
- **Key size:** Ed25519 keys are exactly 32 bytes (public) and 64 bytes
  (private, seed + public). Implementations MUST validate key sizes.

---

## 6. Replay Prevention

Issuers MUST include a unique `jti` (JWT ID) in every receipt. The `jti` value
MUST be generated using UUIDv7 or an equivalent scheme that provides time-based
ordering and collision resistance.

Verifiers SHOULD implement replay detection using a sliding-window cache keyed
by `(iss, jti)`. Cache entries MAY be evicted after a configurable TTL (default:
24 hours).

**Implementation:** `issue()` generates `jti` via `uuidv7()`.
`verifyLocal()` does not enforce replay detection (that is a verifier-side
concern at Layer 4+).

---

## 7. SSRF Prevention

The protocol enforces a strict no-implicit-fetch invariant (DD-55):

- `@peac/kernel`, `@peac/schema`, `@peac/crypto`, and `@peac/adapter-eat`
  contain zero network I/O paths (verified by `tests/security/no-fetch-audit.test.ts`)
- `receipt_url` on `PeacEvidenceCarrier` is a locator hint only (DD-135): it
  MUST NOT trigger automatic fetch
- Callers who choose to fetch `receipt_url` MUST use `@peac/net-node`
  `safeFetch()` with SSRF policy enforcement
- Post-fetch verification: `sha256(receipt_jws) == receipt_ref` (DD-129)

**`@peac/net-node` SSRF defenses:**

- 10-step URL validation pipeline (`validateUrlForSSRF()`)
- RFC 6890-grade IP range classification (15 IPv4 + 5 IPv6 blocked ranges)
- DNS resolution with private IP validation
- Connection-time IP pinning (DNS rebinding defense)
- Redirect chain validation (no redirect to private IPs)
- Scheme enforcement (HTTPS only by default; HTTP blocked unless
  `requireHttps: false`)
- Credential rejection in URLs
- Port allowlisting

---

## 8. PII Minimization

PEAC receipts follow a hash-first design (DD-138):

- Inference receipt payloads contain SHA-256 digests of prompts and completions,
  never raw text
- The `sub` claim uses opaque identifiers (no email, no name)
- The `actor` claim uses binding proofs (DID, attestation hash) rather than
  personal data
- IP addresses in audit evidence are hashed (`sha256(ip)`) or HMAC-keyed for
  tenant isolation

---

## 9. Threat Model Summary

The MCP server threat model (`reference/THREAT_MODEL_MCP.md`) identifies 10
threats (T1-T10) with 9 security invariants:

| Threat                   | Control                             | Design Decision |
| ------------------------ | ----------------------------------- | --------------- |
| T1: Key exfiltration     | No ambient key discovery            | DD-52           |
| T2: Policy tampering     | Static policy, immutable at runtime | DD-53           |
| T3: SSRF via receipt URL | No implicit fetch                   | DD-55           |
| T4: Transport confusion  | Handler-transport separation        | DD-51           |
| T5: Replay attack        | Unique jti, cache guidance          | Spec sec. 20    |
| T6: Algorithm confusion  | Ed25519 only, no negotiation        | DD-156          |
| T7: Key injection        | Reject embedded keys in JWS         | DD-156          |
| T8: Oversized payload    | JWS size cap, transport limits      | DD-124-131      |
| T9: Session confusion    | Per-client McpServer isolation      | DD-119          |
| T10: Stdin/stdout leak   | Line-buffered stdout fence          | DD-58           |

For the complete threat model, mitigations, and test references, see
`reference/THREAT_MODEL_MCP.md`.
