# PEAC Verifier Security Model (NORMATIVE)

Status: NORMATIVE
Version: 0.1
Last-Updated: 2026-02-05

This document defines the security model for PEAC verifiers, including limits, threat mitigations, and operational requirements.

## 1. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

## 2. Verification modes

A PEAC verifier MUST support at least one of these modes:

| Mode            | Description                          | Network Access      |
| --------------- | ------------------------------------ | ------------------- |
| **Client-side** | All verification in browser/client   | May fetch JWKS      |
| **Offline**     | No network access; uses bundled keys | None                |
| **Hosted API**  | Server-side verification service     | Server fetches JWKS |

### 2.1 Client-side verification (RECOMMENDED default)

- All cryptographic operations happen in the client (browser, CLI, SDK)
- JWKS may be fetched from issuer endpoints
- Private receipt data never leaves the client
- RECOMMENDED for maximum privacy

### 2.2 Offline verification

- No network fetches permitted
- Key material must be provided (bundle, local cache, pinned keys)
- Fails if required keys are unavailable
- REQUIRED for dispute resolution workflows

### 2.3 Hosted API verification

- Convenience for programmatic access
- Receipt data is sent to the server
- MUST be clearly labeled as "not private" unless additional privacy measures are implemented
- Useful for CI/CD, monitoring, bulk verification

## 3. Security limits

Verifiers MUST enforce these limits to prevent resource exhaustion and abuse:

### 3.1 Receipt limits

| Limit                 | Default          | Rationale             |
| --------------------- | ---------------- | --------------------- |
| `max_receipt_bytes`   | 262,144 (256 KB) | Memory exhaustion     |
| `max_claims_count`    | 100              | Parser DoS            |
| `max_extension_bytes` | 65,536 (64 KB)   | Extension abuse       |
| `max_string_length`   | 65,536 (64 KB)   | Individual claim size |

### 3.2 JWKS limits

| Limit            | Default        | Rationale           |
| ---------------- | -------------- | ------------------- |
| `max_jwks_bytes` | 65,536 (64 KB) | Resource exhaustion |
| `max_jwks_keys`  | 20             | Key enumeration     |
| `max_key_size`   | 4,096 bytes    | Individual key size |

### 3.3 Network limits

| Limit                | Default          | Rationale           |
| -------------------- | ---------------- | ------------------- |
| `fetch_timeout_ms`   | 5,000            | DoS prevention      |
| `max_redirects`      | 3                | SSRF prevention     |
| `max_response_bytes` | 262,144 (256 KB) | Resource exhaustion |

## 4. SSRF-safe network fetches

Verifiers that perform network fetches MUST implement SSRF protections.

**Scope**: All network fetch rules in this section apply to both:

- JWKS discovery fetches (issuer key resolution)
- Pointer Profile receipt fetches (see TRANSPORT-PROFILES.md)

### 4.1 Required protections

| Protection     | Requirement                                          |
| -------------- | ---------------------------------------------------- |
| HTTPS only     | MUST reject http:// URLs                             |
| No private IPs | MUST block 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 |
| No link-local  | MUST block 169.254.0.0/16, fe80::/10                 |
| No loopback    | MUST block 127.0.0.0/8, ::1                          |
| No file://     | MUST reject file:// and other non-https schemes      |
| DNS rebinding  | SHOULD validate resolved IP before fetch             |

### 4.2 Redirect handling

| Behavior         | Requirement                                 |
| ---------------- | ------------------------------------------- |
| Same-origin      | MAY follow up to `max_redirects`            |
| Cross-origin     | SHOULD reject or require explicit allowlist |
| Scheme downgrade | MUST reject https to http redirects         |

### 4.3 Implementation guidance

```
Algorithm: SSRF-safe fetch
1. Parse URL; reject if not https://
2. Resolve hostname to IP(s)
3. For each IP:
   a. Reject if private, link-local, or loopback
   b. Reject if not globally routable
4. Perform fetch with timeout
5. On redirect:
   a. Increment redirect counter
   b. Reject if counter > max_redirects
   c. Apply steps 1-4 to redirect URL
6. Validate response size <= max_response_bytes
7. Return response or error
```

## 5. Error categories

Verifiers MUST categorize errors to provide actionable feedback:

### 5.1 Stable error codes

| Code                      | Category | Description                             |
| ------------------------- | -------- | --------------------------------------- |
| `ok`                      | Success  | Verification passed                     |
| `receipt_too_large`       | Limit    | Receipt exceeds size limit              |
| `malformed_receipt`       | Parse    | Cannot parse JWS structure              |
| `signature_invalid`       | Crypto   | Signature verification failed           |
| `issuer_not_allowed`      | Policy   | Issuer not in allowlist                 |
| `key_not_found`           | Key      | No matching key in JWKS or pins         |
| `key_fetch_blocked`       | SSRF     | Key discovery blocked by security rules |
| `key_fetch_failed`        | Network  | Key discovery network error             |
| `pointer_fetch_blocked`   | SSRF     | Pointer URL blocked by security rules   |
| `pointer_fetch_failed`    | Network  | Pointer URL fetch network error         |
| `pointer_fetch_too_large` | Limit    | Pointer URL response exceeds size limit |
| `jwks_too_large`          | Limit    | JWKS exceeds size limit                 |
| `jwks_too_many_keys`      | Limit    | JWKS has too many keys                  |
| `expired`                 | Time     | Receipt past expiration                 |
| `not_yet_valid`           | Time     | Receipt not yet valid (iat in future)   |
| `audience_mismatch`       | Claims   | Audience does not match expected        |
| `schema_invalid`          | Schema   | Claims do not match expected schema     |
| `policy_violation`        | Policy   | Other policy check failed               |
| `pointer_digest_mismatch` | Pointer  | Fetched receipt digest mismatch         |
| `pointer_fetch_timeout`   | Pointer  | Pointer URL fetch timed out             |

### 5.2 Error severity

| Severity  | Meaning                                 |
| --------- | --------------------------------------- |
| `info`    | Verification passed                     |
| `warning` | Passed with caveats (e.g., near expiry) |
| `error`   | Verification failed                     |

## 6. Verification checks

Verifiers MUST perform these checks in order (reflecting the real dependency chain):

### 6.1 Check order

1. `jws.parse` - Parse JWS structure (header, payload, signature)
2. `limits.receipt_bytes` - Check receipt size against max_receipt_bytes
3. `jws.protected_header` - Validate protected header (alg, typ, kid)
4. `claims.schema_unverified` - Validate claims schema (before signature verification)
5. `issuer.trust_policy` - Check issuer against allowlist/pins (gating before discovery)
6. `issuer.discovery` - Fetch JWKS from issuer (if network mode and not pinned)
7. `key.resolve` - Resolve signing key from JWKS or pins by kid
8. `jws.signature` - Verify Ed25519 signature with resolved key
9. `claims.time_window` - Check iat/exp against clock (only after signature verified)
10. `extensions.limits` - Check extension sizes

### 6.2 Check dependencies

```
jws.parse
  └── limits.receipt_bytes
        └── jws.protected_header
              └── claims.schema_unverified (pre-signature schema check)
                    └── issuer.trust_policy (gating: is issuer allowed?)
                          └── issuer.discovery (if not pinned)
                                └── key.resolve (find key by kid)
                                      └── jws.signature
                                            └── claims.time_window (only after sig verified)
                                                  └── extensions.limits
```

**Rationale**: Schema validation happens twice conceptually:

- `claims.schema_unverified`: Basic structural check before spending resources on key discovery
- After `jws.signature`: Full trust in claims for policy decisions

### 6.3 Short-circuit behavior

Verifiers SHOULD short-circuit on first failure:

- If `parse` fails, skip all subsequent checks
- If `signature_invalid`, skip claims validation
- If `issuer_not_allowed`, skip key discovery

## 7. Verification report

Verifiers MUST produce a deterministic verification report:

### 7.1 Report requirements

- MUST include all checks performed and their status
- MUST include the effective policy used
- MUST include error codes for failures
- MUST be reproducible given same inputs and policy
- MUST NOT include wall-clock time in deterministic mode

### 7.2 Report format

See `VERIFICATION-REPORT-FORMAT.md` for the canonical schema.

## 8. Time handling

### 8.1 Clock tolerance

| Parameter       | Recommended | Notes                      |
| --------------- | ----------- | -------------------------- |
| `iat` tolerance | 60 seconds  | Accept slightly future iat |
| `exp` tolerance | 0 seconds   | No tolerance for expiry    |
| `nbf` tolerance | 60 seconds  | Accept slightly future nbf |

### 8.2 Time source

- Verifiers SHOULD use system time for online verification
- Verifiers MAY accept a reference time for deterministic/offline verification
- Dispute bundles SHOULD include a reference timestamp

## 9. Threat model

### 9.1 In-scope threats

| Threat                  | Mitigation                    |
| ----------------------- | ----------------------------- |
| SSRF via JWKS discovery | Block private IPs, HTTPS only |
| DoS via large receipts  | Size limits                   |
| DoS via many keys       | JWKS key count limit          |
| Replay attacks          | Audience binding, expiry      |
| Signature forgery       | Ed25519 verification          |
| Time manipulation       | Clock tolerance limits        |

### 9.2 Out-of-scope threats

| Threat                  | Rationale               |
| ----------------------- | ----------------------- |
| Compromised issuer key  | Issuer's responsibility |
| Malicious issuer claims | Trust is out-of-band    |
| Network interception    | Assume HTTPS            |

## 10. Implementation checklist

### 10.1 Required

- [ ] Enforce all size limits
- [ ] Implement SSRF protections
- [ ] Support offline verification mode
- [ ] Produce deterministic verification reports
- [ ] Use stable error codes
- [ ] Validate JWS signature before trusting claims

### 10.2 Recommended

- [ ] Support client-side verification (browser)
- [ ] Support trust pinning
- [ ] Provide actionable error messages
- [ ] Log verification attempts (with privacy)
- [ ] Support bulk verification

## 11. Security considerations

### 11.1 Side channels

- Verifiers SHOULD use constant-time comparison for signature bytes
- Verifiers SHOULD NOT leak timing information about key lookup

### 11.2 Error information

- Error messages MUST NOT leak sensitive information
- Verifiers SHOULD distinguish "key not found" from "signature invalid"
- Verifiers MUST NOT return internal stack traces

### 11.3 Caching

- JWKS MAY be cached per issuer with appropriate TTL
- Cached JWKS MUST be invalidated on key rotation signals
- Cache keys MUST include issuer origin and discovery URL

## 12. Conformance

A verifier is conformant if it:

1. Enforces all MUST requirements in this document
2. Passes the PEAC conformance test suite for verifiers
3. Produces verification reports matching the schema
4. Handles all error codes appropriately
