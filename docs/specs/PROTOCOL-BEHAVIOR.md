# PEAC Protocol Behavior Specification

**Status**: NORMATIVE

**Version**: 0.10.0

**Wire Format**: `peac-receipt/0.1`

---

## 1. Introduction

This document defines the normative behavioral semantics for PEAC receipts. It MUST be read in conjunction with:

- [PEAC-RECEIPT-SCHEMA-v0.1.json](PEAC-RECEIPT-SCHEMA-v0.1.json) - Normative structural schema
- [TEST_VECTORS.md](TEST_VECTORS.md) - Normative conformance tests
- [ERRORS.md](ERRORS.md) - Normative error codes

**Key words**: The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

**Implementation requirement**: Even if a JSON Schema validator does not fully support conditional constraints (if/then), a conformant PEAC implementation MUST enforce all behavioral rules defined in this document procedurally.

---

## 2. Control Chain Validation

### 2.1 Control Block Structure

A `ControlBlock` consists of:

- `chain`: Array of `ControlStep` (MUST be non-empty)
- `decision`: Final decision ("allow", "deny", or "review")
- `combinator`: Chain combinator logic (defaults to "any_can_veto")

### 2.2 Control Chain Validation Algorithm

**Input**: `ControlBlock cb`

**Output**: `ControlValidationResult` or `PEACError`

**Algorithm**:

```
1. Validate chain non-empty:
   IF cb.chain.length == 0:
     RETURN PEACError(
       code: "E_INVALID_CONTROL_CHAIN",
       category: "validation",
       severity: "error",
       retryable: false,
       pointer: "/auth/control/chain",
       remediation: "Control chain MUST contain at least one step"
     )

2. Default combinator:
   IF cb.combinator is absent OR cb.combinator is null:
     SET cb.combinator = "any_can_veto"

3. Validate combinator:
   IF cb.combinator NOT IN ["any_can_veto"]:
     RETURN PEACError(
       code: "E_INVALID_CONTROL_CHAIN",
       category: "validation",
       severity: "error",
       retryable: false,
       pointer: "/auth/control/combinator",
       remediation: "Unknown combinator; v0.9 supports only 'any_can_veto'"
     )

4. Validate each step:
   FOR i = 0 TO cb.chain.length - 1:
     step = cb.chain[i]

     IF step.result NOT IN ["allow", "deny", "review"]:
       RETURN PEACError(
         code: "E_INVALID_CONTROL_CHAIN",
         category: "validation",
         severity: "error",
         retryable: false,
         pointer: "/auth/control/chain/" + i + "/result",
         remediation: "Step result MUST be 'allow', 'deny', or 'review'"
       )

     IF step.engine is empty OR NOT string:
       RETURN PEACError(
         code: "E_INVALID_CONTROL_CHAIN",
         category: "validation",
         severity: "error",
         retryable: false,
         pointer: "/auth/control/chain/" + i + "/engine",
         remediation: "Engine MUST be non-empty string"
       )

5. Compute expected decision (any_can_veto semantics):
   IF cb.combinator == "any_can_veto":
     has_veto = false
     FOR EACH step IN cb.chain:
       IF step.result == "deny":
         has_veto = true
         BREAK

     IF has_veto:
       expected_decision = "deny"
     ELSE:
       expected_decision = "allow"

6. Validate decision consistency:
   IF cb.decision != expected_decision:
     RETURN PEACError(
       code: "E_INVALID_CONTROL_CHAIN",
       category: "validation",
       severity: "error",
       retryable: false,
       pointer: "/auth/control/decision",
       remediation: "Decision '" + cb.decision + "' inconsistent with chain; expected '" + expected_decision + "' for any_can_veto"
     )

7. RETURN ControlValidationResult(
     valid: true,
     decision: cb.decision
   )
```

### 2.3 Any-Can-Veto Semantics

When `combinator == "any_can_veto"`:

- If **any** step in the chain has `result == "deny"`, the final `decision` MUST be `"deny"`
- If **all** steps have `result == "allow"`, the final `decision` MUST be `"allow"`
- The `"review"` result is reserved for future use; v0.9 implementations SHOULD treat it as requiring manual intervention

**Rationale**: This provides multi-party governance where any control engine can veto a transaction, similar to multi-sig or unanimous approval patterns.

### 2.4 Control Purpose (v0.9.16+)

`ControlPurpose` captures what the access is for. It maps external policy dialects (RSL, Content Signals, ai.txt) to a normalized purpose for receipts.

**Well-known purposes**:

| Purpose     | Description                                              |
| ----------- | -------------------------------------------------------- |
| `crawl`     | Web crawling/scraping                                    |
| `index`     | Search engine indexing                                   |
| `train`     | AI/ML model training                                     |
| `inference` | AI/ML inference/generation                               |
| `ai_input`  | RAG/grounding (using content as input to AI) [v0.9.17+]  |
| `ai_index`  | AI-powered search/indexing [v0.9.18+, RSL 1.0 alignment] |
| `search`    | Traditional search indexing [v0.9.17+]                   |

### 2.5 RSL to CAL Mapping (v0.9.17+, updated v0.9.18)

RSL (Robots Specification Layer) 1.0 usage tokens can be mapped to PEAC `ControlPurpose` values using the `@peac/mappings-rsl` package.

**RSL 1.0 Specification**: [rslstandard.org/rsl](https://rslstandard.org/rsl)

**Mapping Table**:

| RSL Token  | CAL ControlPurpose                            | Notes                       |
| ---------- | --------------------------------------------- | --------------------------- |
| `all`      | `['train', 'ai_input', 'ai_index', 'search']` | All usage types             |
| `ai-all`   | `['train', 'ai_input', 'ai_index']`           | All AI usage types          |
| `ai-train` | `['train']`                                   | AI/ML model training        |
| `ai-input` | `['ai_input']`                                | RAG/grounding               |
| `ai-index` | `['ai_index']`                                | AI-powered search/indexing  |
| `search`   | `['search']`                                  | Traditional search indexing |

**Note**: RSL 1.0 uses `ai-index`, not `ai-search`. Previous versions of PEAC used `ai_search` which has been removed in v0.9.18.

**Semantics**:

- Mapping is **many-to-many**: RSL `ai-all` and `all` expand to multiple purposes
- Unknown RSL tokens SHOULD log a warning but MUST NOT cause validation failure
- Reverse mapping is **partial**: CAL purposes without RSL equivalents (`crawl`, `index`, `inference`) return `null`

**Example**:

```
Input: ["ai-train", "ai-input"]
Output: { purposes: ["train", "ai_input"], unknownTokens: [] }

Input: ["ai-all"]
Output: { purposes: ["train", "ai_input", "ai_index"], unknownTokens: [] }

Input: ["all"]
Output: { purposes: ["train", "ai_input", "ai_index", "search"], unknownTokens: [] }

Input: ["ai-train", "future-token"]
Output: { purposes: ["train"], unknownTokens: ["future-token"] }
```

---

## 3. Control Requirements

### 3.1 When Control is Required

A `ControlBlock` MUST be present in `auth.control` when:

1. **Payment present**: `evidence.payment` is defined, OR
2. **HTTP 402 enforcement**: `auth.enforcement.method == "http-402"`, OR
3. **Future protocols**: Certain AP2/TAP/ACP enforcement profiles (to be specified)

**Algorithm**: Control Requirement Check

```
Input: PEACEnvelope envelope
Output: boolean (control_required)

IF envelope.evidence.payment is present:
  RETURN true

IF envelope.auth.enforcement is present AND envelope.auth.enforcement.method == "http-402":
  RETURN true

RETURN false
```

### 3.2 Validation

When a receipt is validated:

```
IF ControlRequirementCheck(envelope) == true:
  IF envelope.auth.control is absent:
    RETURN PEACError(
      code: "E_CONTROL_REQUIRED",
      category: "validation",
      severity: "error",
      retryable: false,
      pointer: "/auth/control",
      remediation: "Control block MUST be present when payment exists or enforcement.method is 'http-402'"
    )
```

### 3.3 Optional Control

Control MAY be present even when not required, for example:

- Free-tier access policies
- Rate limiting without payment
- Audit trails for non-monetary operations

---

## 4. Temporal Validity

### 4.1 Issued At (iat)

- `auth.iat` MUST be a Unix timestamp in seconds (not milliseconds)
- `auth.iat` SHOULD be less than or equal to current time
- Verifiers SHOULD allow ±60 seconds clock skew tolerance

### 4.2 Expiration (exp)

- `auth.exp` MUST be a Unix timestamp in seconds
- `auth.exp` MUST be greater than or equal to `auth.iat`
- Verifiers MUST reject receipts where `current_time > auth.exp`
- Verifiers SHOULD allow ±60 seconds clock skew tolerance

### 4.3 Validation Algorithm

```
Input: AuthContext auth, current_time (Unix seconds)
Output: boolean or PEACError

clock_skew = 60  // seconds

IF auth.exp is present:
  IF auth.exp < auth.iat:
    RETURN PEACError(
      code: "E_INVALID_ENVELOPE",
      category: "validation",
      severity: "error",
      retryable: false,
      pointer: "/auth/exp",
      remediation: "Expiration (exp) MUST be >= issued at (iat)"
    )

  IF current_time > (auth.exp + clock_skew):
    RETURN PEACError(
      code: "E_EXPIRED_RECEIPT",
      category: "validation",
      severity: "error",
      retryable: false,
      pointer: "/auth/exp",
      remediation: "Receipt has expired; use a current receipt"
    )

IF auth.iat > (current_time + clock_skew):
  RETURN PEACError(
    code: "E_INVALID_ENVELOPE",
    category: "validation",
    severity: "error",
    retryable: false,
    pointer: "/auth/iat",
    remediation: "Issued at (iat) is in the future"
  )

RETURN true
```

---

## 5. Policy Binding

### 5.1 Policy Hash Computation

The `policy_hash` field binds a receipt to a specific policy document using deterministic hashing.

**Algorithm**: Compute Policy Hash

```
Input: policy (JSON object or document)
Output: policy_hash (string)

1. Canonicalize policy using JCS (RFC 8785):
   canonical_json = JCS(policy)

2. Compute SHA-256 digest:
   digest = SHA256(canonical_json)

3. Encode as base64url (RFC 4648 Section 5):
   policy_hash = base64url(digest)

RETURN policy_hash
```

**Requirements**:

- JCS canonicalization MUST follow RFC 8785 exactly
- SHA-256 MUST produce 256-bit (32-byte) digest
- base64url encoding MUST use URL-safe alphabet without padding

### 5.2 Policy Fetch and Verification

Verifiers MUST:

1. Fetch policy from `auth.policy_uri`
2. Apply SSRF protections (see Section 6)
3. Parse fetched content as JSON
4. Compute `policy_hash` from fetched policy
5. Compare with `auth.policy_hash`

**Algorithm**: Verify Policy Binding

```
Input: auth.policy_uri, auth.policy_hash
Output: policy (JSON) or PEACError

1. Fetch policy:
   policy_content = SecureFetch(auth.policy_uri)  // See Section 6

2. Parse as JSON:
   TRY:
     policy = JSON.parse(policy_content)
   CATCH parse_error:
     RETURN PEACError(
       code: "E_POLICY_FETCH_FAILED",
       category: "infrastructure",
       severity: "error",
       retryable: true,
       remediation: "Policy document is not valid JSON"
     )

3. Compute hash:
   computed_hash = ComputePolicyHash(policy)

4. Verify:
   IF computed_hash != auth.policy_hash:
     RETURN PEACError(
       code: "E_INVALID_POLICY_HASH",
       category: "validation",
       severity: "error",
       retryable: false,
       pointer: "/auth/policy_hash",
       remediation: "Policy hash does not match policy content; expected " + computed_hash
     )

5. RETURN policy
```

---

## 6. SSRF Protection

**Status**: NORMATIVE

All URL fetches (policy_uri, JWKS URIs, etc.) MUST implement SSRF protection to prevent attackers from using verifiers as proxies to internal networks or metadata endpoints.

### 6.1 Scheme Validation

**REQUIRED**:

- MUST accept: `https://`
- MAY accept: `http://` ONLY for localhost/127.0.0.1 in development/test environments
- MUST reject: `file://`, `ftp://`, `gopher://`, `data://`, and all other schemes

### 6.2 IP Address Blocking

Verifiers MUST block requests to:

**Private IPv4 ranges**:

- 10.0.0.0/8
- 172.16.0.0/12
- 192.168.0.0/16
- 127.0.0.0/8 (loopback, except localhost in dev)

**Link-local**:

- 169.254.0.0/16 (IPv4)
- fe80::/10 (IPv6)

**Metadata endpoints**:

- 169.254.169.254 (AWS, GCP, Azure metadata)
- fd00::/8 (IPv6 unique local)

**Private IPv6**:

- fc00::/7 (unique local addresses)
- ::1 (loopback)

### 6.3 DNS Resolution and Rebinding Protection

**Algorithm**: Secure Fetch with SSRF Protection

```
Input: url (string)
Output: content (string) or PEACError

1. Parse URL:
   TRY:
     parsed = URL.parse(url)
   CATCH parse_error:
     RETURN PEACError(
       code: "E_INVALID_ENVELOPE",
       category: "validation",
       remediation: "Invalid URL format"
     )

2. Validate scheme:
   IF parsed.scheme == "http":
     IF parsed.hostname NOT IN ["localhost", "127.0.0.1", "::1"]:
       RETURN PEACError(
         code: "E_SSRF_BLOCKED",
         category: "verification",
         severity: "error",
         retryable: false,
         remediation: "HTTP URLs only allowed for localhost; use HTTPS"
       )
   ELSE IF parsed.scheme != "https":
     RETURN PEACError(
       code: "E_SSRF_BLOCKED",
       category: "verification",
       remediation: "Only HTTPS URLs allowed"
     )

3. Resolve hostname to IP:
   ip_addresses = DNS.resolve(parsed.hostname)

4. Check each resolved IP:
   FOR EACH ip IN ip_addresses:
     IF ip IN blocked_ip_ranges:  // See Section 6.2
       RETURN PEACError(
         code: "E_SSRF_BLOCKED",
         category: "verification",
         severity: "error",
         retryable: false,
         remediation: "SSRF protection blocked request to private/metadata IP: " + ip,
         details: {
           blocked_ip: ip,
           hostname: parsed.hostname
         }
       )

5. Fetch with timeout:
   TRY:
     content = HTTP.get(url, {
       connect_timeout: 5000,  // 5 seconds
       total_timeout: 10000,   // 10 seconds
       follow_redirects: false  // Do not follow redirects automatically
     })
   CATCH network_error:
     RETURN PEACError(
       code: "E_POLICY_FETCH_FAILED",  // or E_JWKS_FETCH_FAILED
       category: "infrastructure",
       severity: "error",
       retryable: true,
       remediation: "Network error fetching resource"
     )

6. RETURN content
```

### 6.4 Caching

Verifiers SHOULD cache fetched policies and JWKS to reduce network requests and SSRF exposure:

- Cache key: `policy_hash` for policies, `issuer` for JWKS
- Cache TTL: Respect `Cache-Control` headers, maximum 3600 seconds (1 hour)
- Cache MUST be invalidated if fetch fails with SSRF error

---

## 7. DPoP Verification

When `auth.binding.method == "dpop"`, verifiers MUST validate the DPoP proof of possession.

### 7.1 DPoP JWT Structure

DPoP proof is a JWT sent in the `DPoP` HTTP header:

**Required claims**:

- `typ`: MUST be `"dpop+jwt"`
- `alg`: Signing algorithm (e.g., `ES256`, `EdDSA`)
- `jwk`: Public key (JWK format)
- `jkt`: Key thumbprint (SHA-256 hash of JWK, base64url-encoded)
- `iat`: Issued at (Unix seconds)
- `htm`: HTTP method (POST, GET, etc.)
- `htu`: HTTP URI (without query string or fragment)
- `nonce`: Server-issued nonce (if server requires nonce)

### 7.2 DPoP Verification Algorithm

```
Input: dpop_jwt (string), http_method (string), http_uri (string), server_nonce (string or null)
Output: boolean or PEACError

1. Parse DPoP JWT:
   TRY:
     header = JWT.decode_header(dpop_jwt)
     claims = JWT.decode_payload(dpop_jwt)  // Do NOT verify signature yet
   CATCH parse_error:
     RETURN PEACError(
       code: "E_DPOP_INVALID",
       category: "verification",
       severity: "error",
       retryable: false,
       remediation: "DPoP proof is not a valid JWT"
     )

2. Validate header:
   IF header.typ != "dpop+jwt":
     RETURN PEACError(
       code: "E_DPOP_INVALID",
       remediation: "DPoP JWT MUST have typ='dpop+jwt'"
     )

3. Extract public key:
   public_key = header.jwk

4. Verify signature:
   TRY:
     JWT.verify(dpop_jwt, public_key, header.alg)
   CATCH verification_error:
     RETURN PEACError(
       code: "E_DPOP_INVALID",
       remediation: "DPoP signature verification failed"
     )

5. Validate jkt (key thumbprint):
   computed_jkt = base64url(SHA256(JCS(public_key)))
   IF claims.jkt != computed_jkt:
     RETURN PEACError(
       code: "E_DPOP_INVALID",
       remediation: "DPoP jkt does not match public key thumbprint",
       details: {
         expected_jkt: computed_jkt,
         provided_jkt: claims.jkt
       }
     )

6. Validate iat (issued at):
   current_time = UnixTime()
   IF claims.iat < (current_time - 60) OR claims.iat > (current_time + 60):
     RETURN PEACError(
       code: "E_DPOP_INVALID",
       remediation: "DPoP iat is outside acceptable window (±60 seconds)"
     )

7. Validate htm (HTTP method):
   IF claims.htm != http_method:
     RETURN PEACError(
       code: "E_DPOP_INVALID",
       remediation: "DPoP htm '" + claims.htm + "' does not match request method '" + http_method + "'"
     )

8. Validate htu (HTTP URI):
   normalized_uri = NormalizeURI(http_uri)  // Remove query and fragment
   IF claims.htu != normalized_uri:
     RETURN PEACError(
       code: "E_DPOP_INVALID",
       remediation: "DPoP htu does not match request URI"
     )

9. Validate nonce (if required):
   IF server_nonce is not null:
     IF claims.nonce != server_nonce:
       RETURN PEACError(
         code: "E_DPOP_INVALID",
         remediation: "DPoP nonce does not match server-issued nonce"
       )

10. Check nonce replay (L3 or L4):
    IF NonceAlreadyUsed(claims.nonce):
      RETURN PEACError(
        code: "E_DPOP_REPLAY",
        category: "verification",
        severity: "error",
        retryable: false,
        remediation: "DPoP nonce has already been used"
      )

    RecordNonce(claims.nonce, ttl=60)  // 60 second TTL

11. RETURN true
```

### 7.3 Nonce Replay Protection

**L3 (Single-Node)**:

- Maintain in-memory cache of used nonces
- Use LRU eviction or TTL-based expiration (60 seconds)
- Suitable for single-instance verifiers

**L4 (Distributed)**:

- Use distributed cache (Redis, Memcached) with TTL
- Partition by verifier cluster or shard by nonce hash
- Suitable for horizontally-scaled verifiers

**Nonce format**:

- Server generates: Random 128-bit value, base64url-encoded
- Issued via: `WWW-Authenticate: DPoP error="use_dpop_nonce", error_description="..."`
- TTL: 60 seconds

### 7.4 HTTP Message Signatures (RFC 9421)

**Status**: NORMATIVE (v0.9.18+)

When `auth.binding.method == "http-signature"`, verifiers MUST validate HTTP Message Signatures per RFC 9421.

PEAC surfaces (e.g., Cloudflare Worker, Next.js middleware) implement signature verification for agent protocols like Visa TAP (Trusted Agent Protocol).

**Required Parameters**:

- `@method`: HTTP method
- `@authority`: Request host
- `@request-target`: Request path + query
- `content-digest`: SHA-256 digest of request body (if present)
- `content-length`: Request body length (if present)
- `content-type`: Request content type (if present)

**TAP-Specific Tags** (covered components):

| Tag        | Components Covered                                                    |
| ---------- | --------------------------------------------------------------------- |
| `peac-all` | `@method`, `@authority`, `@request-target`, body headers (if present) |
| `peac-min` | `@method`, `@authority` only                                          |

**Verification Algorithm**:

```text
Input: request, signature_input (Signature-Input header), signature (Signature header)
Output: boolean or PEACError

1. Parse Signature-Input header:
   TRY:
     params = parse_structured_field(signature_input)
   CATCH parse_error:
     RETURN PEACError(
       code: "E_TAP_SIGNATURE_INPUT_MALFORMED",
       category: "validation",
       severity: "error"
     )

2. Extract keyid from params:
   keyid = params.keyid
   IF keyid is absent:
     RETURN PEACError(code: "E_TAP_KEY_NOT_FOUND")

3. Verify temporal validity:
   created = params.created
   expires = params.expires

   // TAP hard limit: 8-minute window
   IF (expires - created) > 480:
     RETURN PEACError(code: "E_TAP_WINDOW_TOO_LARGE")

   current_time = UnixTime()
   clock_skew = 60  // seconds

   IF current_time < (created - clock_skew):
     RETURN PEACError(code: "E_TAP_TIME_INVALID")

   IF current_time > (expires + clock_skew):
     RETURN PEACError(code: "E_TAP_TIME_INVALID")

4. Fetch public key via JWKS:
   key = JWKS.fetch(issuer, keyid)
   IF key is null:
     RETURN PEACError(code: "E_TAP_KEY_NOT_FOUND")

5. Construct signature base:
   base = construct_signature_base(request, params.components)

6. Verify Ed25519 signature:
   valid = Ed25519.verify(base, signature, key)
   IF NOT valid:
     RETURN PEACError(code: "E_TAP_SIGNATURE_INVALID")

7. Check replay (if nonce present):
   IF params.nonce is present:
     IF NonceAlreadyUsed(issuer, keyid, params.nonce):
       RETURN PEACError(code: "E_TAP_REPLAY_DETECTED")
     RecordNonce(issuer, keyid, params.nonce, ttl=480)

8. RETURN true
```

**Fail-Closed Semantics**:

- Unknown TAP tags MUST be rejected (no silent acceptance)
- Missing issuer allowlist MUST reject all requests (configuration required)
- Replay protection MUST be enforced when nonce is present

**Reference Implementations**:

- `@peac/http-signatures`: RFC 9421 signature creation/verification
- `@peac/worker-cloudflare`: Cloudflare Worker TAP verifier
- `@peac/middleware-nextjs`: Next.js Edge middleware TAP verifier

---

## 8. Privacy and PII Constraints

### 8.1 Subject Identifier (auth.sub)

The `sub` claim MUST identify an **agent, client, or service account**, NOT a human user.

**Requirements**:

- `sub` MUST identify automated agents, service accounts, or applications
- `sub` SHOULD NOT contain human personally identifiable information (PII)
- `sub` SHOULD use stable, pseudonymous identifiers

**Examples**:

- COMPLIANT: `"agent:example-researcher-v1"`
- COMPLIANT: `"service:payment-processor-prod-us-west"`
- COMPLIANT: `"client:mobile-app-installation-abc123"`
- NON-COMPLIANT: `"user:john.doe@example.com"` (human email)
- NON-COMPLIANT: `"customer:+1-555-1234"` (phone number)
- NON-COMPLIANT: `"patient:SSN-123-45-6789"` (government ID)

**Rationale**:

- PEAC receipts are designed for agent-to-agent interactions in automated systems
- Receipts may be logged, archived, shared for audit, or transmitted across organizational boundaries
- Avoiding PII simplifies compliance with GDPR, CCPA, HIPAA, and similar regulations

### 8.2 Personal Data Handling

Implementers SHOULD avoid including personal data anywhere in PEAC receipts.

**If personal data is necessary** (strongly discouraged):

- Use `meta.redactions` to mark fields that can be redacted
- Use `meta.privacy_budget.k_anonymity` for aggregation hints
- Document data handling in implementation-specific privacy policies
- Consult legal counsel for regulatory compliance

### 8.3 Vendor-Specific Data Placement

Vendor-specific or implementation-specific data MUST NOT appear in normative top-level fields.

**Allowed locations**:

- `evidence.payment.evidence` - Payment rail-specific details
- `evidence.extra` - Protocol-specific evidence
- `meta.debug` - Non-normative debugging information

**Prohibited locations**:

- Top-level fields in `auth`, `evidence`, `meta`
- Top-level fields in `evidence.payment` (use nested `evidence` instead)
- Error codes or error messages (vendor details go in `error.details`)

### 8.4 Subject Profile Privacy (v0.9.16+)

`SubjectProfile` and `SubjectProfileSnapshot` are OPTIONAL catalogue structures for identifying actors (human, org, or agent) in PEAC interactions. Implementations MAY omit subject profiles entirely for anonymous access, purely technical subjects, or when identity context is not relevant to policy evaluation.

**Design Philosophy**:

`SubjectProfile` is intentionally minimal. It provides an identity hook, NOT a comprehensive identity record. Detailed identity attributes belong in external identity providers (IdPs), directories, or IAM systems.

**Requirements**:

- `id` MUST be a stable, unique identifier but SHOULD NOT contain PII directly
- `type` classifies the subject (human, org, agent) for policy purposes
- `labels` if present SHOULD NOT contain PII; use abstract tags like `["premium", "verified"]`
- `metadata` SHOULD NOT store sensitive PII; prefer opaque references to external systems

**Privacy Guidance**:

1. **Use opaque identifiers**: Prefer `"user:abc123"` over `"user:john.doe@example.com"`

2. **Delegate to external IdPs**: Store detailed identity attributes in your IdP/directory system and reference them by opaque ID in PEAC profiles

3. **Minimize captured_at granularity**: `SubjectProfileSnapshot.captured_at` records when the profile was observed; log only what is needed for audit

4. **Avoid metadata bloat**: The `metadata` field is for application-specific attributes, not PII storage; if you must store identity claims, encrypt or hash them

**Examples**:

- COMPLIANT: `{ "id": "agent:crawler-v2", "type": "agent", "labels": ["indexer"] }`
- COMPLIANT: `{ "id": "org:acme-12345", "type": "org" }`
- NON-COMPLIANT: `{ "id": "user:john.doe@example.com", "type": "human", "metadata": { "ssn": "123-45-6789" } }`

**Rationale**:

Subject profiles may appear in receipts that are logged, archived, or shared across organizational boundaries. Keeping profiles minimal and PII-free simplifies regulatory compliance (GDPR, CCPA, HIPAA) and reduces data breach impact.

**Compliance Documentation**:

Implementations MUST document their retention and minimization policies for `SubjectProfileSnapshot` logs as part of their own compliance program. This documentation SHOULD specify retention periods, access controls, and deletion procedures.

### 8.5 Subject Binding in Receipts (v0.9.17+)

`SubjectProfileSnapshot` MAY be included in PEAC envelopes to capture identity context at the point of receipt issuance. This enables policy evaluation and audit trails without modifying the signed JWS payload.

**Placement**:

`subject_snapshot` is placed at `auth.subject_snapshot` in the `PEACEnvelope` structure:

```typescript
interface AuthContext {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp?: number;
  rid: string;
  policy_hash: string;
  policy_uri: string;
  // ... other auth fields ...
  subject_snapshot?: SubjectProfileSnapshot; // v0.9.17+
}
```

**Rationale for auth-level placement**:

- Consistent with envelope structure (`{ auth, evidence?, meta? }`)
- Auth-related fields stay in the auth block
- Avoids top-level key sprawl
- Not inside JWS claims (keeps cryptographic surface small)

**Validation Behavior**:

1. If `subject_snapshot` is ABSENT:
   - Behave exactly as before
   - No validation failure
   - Receipt issuance and verification proceed normally

2. If `subject_snapshot` is PRESENT:
   - Schema validation: Validate against `SubjectProfileSnapshotSchema`
   - Privacy check (advisory): Log warning if `id` looks like PII (email/phone)
   - No external lookups: Do not fetch from IdP or directory
   - Pass-through: Include in envelope, return in verify response

**Security Note**:

`subject_snapshot` is envelope metadata outside JWS claims. It is NOT automatically tamper-evident. The existing `auth.sub` (opaque ID) provides the cryptographic binding if needed. If strong binding is required in the future, options include adding a `subject_snapshot_hash` field to JWS claims or including in an envelope-level binding mechanism.

**Wire Format**:

Wire format `peac-receipt/0.1` is unchanged. `subject_snapshot` is envelope-level metadata, not part of the signed JWS payload.

---

## 9. Invariant Enforcement

**CRITICAL**: Implementations MUST enforce all behavioral rules defined in this document, even if the JSON Schema validator does not fully support conditional constraints (`if/then`).

**Minimum validation steps**:

1. **Structural validation**: Validate against JSON Schema
2. **Control chain validation**: Run algorithm from Section 2.2
3. **Control requirements**: Check Section 3.1 invariants
4. **Temporal validity**: Check Section 4.3
5. **Policy binding**: Verify Section 5.2 (if policy verification required)
6. **SSRF protection**: Apply Section 6 when fetching URLs
7. **DPoP verification**: Run algorithm from Section 7.2 (if DPoP binding present)

Implementations MAY skip certain validations (e.g., policy fetch) if operating in "envelope-only" mode, but MUST document which validations are performed vs. deferred.

---

## 10. Future Extensions

This specification (v0.9) defines minimal semantics for initial deployment. Future versions may add:

- Additional combinators (`all_must_allow`, `majority`, `unanimous`)
- Multi-payment semantics (`evidence.payments[]`)
- Receipt chaining (`parent_rid`, `supersedes_rid`, `delegation_chain`)
- Policy schema (currently informational)
- Additional transport bindings (HTTP Message Signatures, etc.)

Reserved fields (e.g., `payments[]`, chaining fields) are present in the schema but have no normative semantics in v0.9.x. Implementations MUST NOT rely on reserved fields for correctness.

---

## 11. Conformance

An implementation is **conformant with PEAC v0.9** if it:

1. Validates receipts according to PEAC-RECEIPT-SCHEMA-v0.1.json
2. Enforces all behavioral rules in this document
3. Passes all normative test vectors in TEST_VECTORS.md
4. Returns errors using codes from ERRORS.md

---

## 12. HTTP Header Semantics (v0.9.24+)

This section defines the normative behavior for PEAC HTTP headers.

### 12.1 Canonical Header Names

PEAC uses the following HTTP headers. All names follow RFC 6648 (no `X-` prefix for new headers).

| Header                 | Direction | Description                          |
| ---------------------- | --------- | ------------------------------------ |
| `PEAC-Receipt`         | Response  | JWS-encoded receipt                  |
| `PEAC-Purpose`         | Request   | Declared purpose(s) of access        |
| `PEAC-Purpose-Applied` | Response  | Purpose enforced by server           |
| `PEAC-Purpose-Reason`  | Response  | Reason for enforcement decision      |
| `DPoP`                 | Request   | Proof of possession token (RFC 9449) |

**Canonical source**: `specs/kernel/constants.json`

### 12.2 PEAC-Purpose Request Header

The `PEAC-Purpose` header declares the requester's intended use of the resource.

**Format**:

```
PEAC-Purpose: train
PEAC-Purpose: train, search
PEAC-Purpose: user_action
```

**Parsing Rules (MUST)**:

1. Split on commas (`,`)
2. Trim optional whitespace (OWS) around tokens
3. Lowercase all tokens
4. Drop empty tokens
5. Deduplicate (preserve first occurrence)
6. Preserve input order (no sorting)
7. Preserve unknown tokens (normalized) - never reject by default

**Algorithm**:

```
Input: header_value (string)
Output: purposes (string[])

1. Split header_value by ','
2. For each token:
   a. Trim leading/trailing whitespace
   b. Convert to lowercase
   c. If empty after trim, skip
3. Deduplicate (keep first occurrence)
4. Return array in input order
```

**Canonical Purpose Tokens**:

| Token         | Description                    |
| ------------- | ------------------------------ |
| `train`       | Model training data collection |
| `search`      | Traditional search indexing    |
| `user_action` | Agent acting on user behalf    |
| `inference`   | Runtime inference / RAG        |
| `index`       | Content indexing (store)       |

**Internal-Only Tokens** (never valid on wire):

| Token        | Description                       |
| ------------ | --------------------------------- |
| `undeclared` | Applied when header missing/empty |

**Extension Tokens**:

- Format: `namespace:purpose` (lowercase, colon-separated)
- Examples: `cf:ai_crawler`, `vendor:custom_purpose`
- MUST be preserved and forwarded even if unknown

### 12.3 Missing or Empty PEAC-Purpose

When `PEAC-Purpose` header is **missing or empty**:

- Internal state: `purpose_declared: []` (empty array)
- Receipt claim: `purpose_reason: "undeclared_default"`
- Server applies default policy based on profile

When `PEAC-Purpose: undeclared` is **explicitly sent**:

- **400 Bad Request** - `undeclared` is not a valid wire token
- Rationale: Prevents gaming by explicitly declaring "undeclared"

### 12.4 Multi-Purpose Semantics

When multiple purposes are declared:

```
PEAC-Purpose: train, search
```

**Server Behavior**:

- Choose ONE `purpose_enforced` for the access decision
- MUST be one of the declared known purposes, OR
- A more restrictive known purpose (downgrade)

**Receipt Claims**:

- `purpose_declared`: Array of all declared purposes (e.g., `["train", "search"]`)
- `purpose_enforced`: Single token enforced (e.g., `"train"`)
- `purpose_reason`: Enum explaining enforcement (e.g., `"allowed"`)

### 12.5 Unknown Purpose Tokens

Unknown tokens (not in canonical list, not registered extensions):

- MUST be preserved and forwarded (for forward-compatibility)
- MAY be recorded in receipt metadata or logs
- MUST NOT affect policy evaluation unless explicitly understood
- Implementations SHOULD warn on unknown tokens but MUST NOT reject

**Security Rationale**: Unknown tokens cannot become an accidental bypass surface.

### 12.6 PEAC-Purpose-Applied Response Header

The `PEAC-Purpose-Applied` header indicates which purpose was enforced.

**Format**:

```
PEAC-Purpose-Applied: train
```

- Single token (matches `purpose_enforced` in receipt)
- MUST be present when `PEAC-Purpose` was sent

### 12.7 PEAC-Purpose-Reason Response Header

The `PEAC-Purpose-Reason` header explains why the enforced purpose differs from declared.

**Format**:

```
PEAC-Purpose-Reason: allowed
PEAC-Purpose-Reason: undeclared_default
```

**Reason Values**:

| Value                | Description                                  |
| -------------------- | -------------------------------------------- |
| `allowed`            | Purpose permitted as declared (happy path)   |
| `constrained`        | Allowed with rate limits applied             |
| `denied`             | Purpose rejected by policy                   |
| `downgraded`         | More restrictive purpose applied             |
| `undeclared_default` | No purpose declared, default applied         |
| `unknown_preserved`  | Unknown purpose token, preserved but flagged |

### 12.8 Cache Guidance

If response behavior varies by `PEAC-Purpose`:

- Server MUST emit `Vary: PEAC-Purpose`
- Caching layers MUST respect this header for correct cache invalidation

**Example**:

```http
HTTP/1.1 200 OK
PEAC-Purpose-Applied: train
PEAC-Purpose-Reason: allowed
Vary: PEAC-Purpose
```

### 12.9 Limits (RECOMMENDED)

These limits are RECOMMENDED for implementation safety, not wire constraints:

| Limit                 | Value | Rationale                           |
| --------------------- | ----- | ----------------------------------- |
| Max tokens per header | 8     | Prevent abuse                       |
| Max chars per token   | 48    | Reasonable namespace:purpose length |

Implementations SHOULD warn when limits are exceeded but MAY accept larger values.

---

## 13. Version History

- **v0.9.18**: TAP + HTTP Message Signatures + Schema Normalization
  - HTTP Message Signatures (RFC 9421): Section 7.4 normative verification algorithm
  - TAP (Trusted Agent Protocol) support via `@peac/mappings-tap`
  - Reference surfaces: `@peac/worker-cloudflare`, `@peac/middleware-nextjs`
  - Schema normalization: `toCoreClaims()` for cross-mapping parity (see SCHEMA-NORMALIZATION.md)
  - RSL 1.0 alignment: `ai-index` token (not `ai-search`), `all` token support
  - Canonical flow examples in `examples/` directory

- **v0.9.17**: RSL Alignment + Subject Binding
  - Extended `ControlPurpose` with RSL usage tokens: `ai_input`, `search`
  - Added `@peac/mappings-rsl` package for RSL to CAL mapping
  - Lenient handling: unknown RSL tokens log warning but do not cause validation failure
  - Subject Binding: Optional `subject_snapshot` on `auth` block for identity context at issuance
  - Section 8.5 documents placement, validation behavior, and security considerations
- **v0.9.16 (2025-12-07)**: Control Abstraction Layer (CAL) semantics, PaymentEvidence extensions, Subject Profile Catalogue
  - CAL: `ControlPurpose` (crawl, index, train, inference), `ControlLicensingMode` (subscription, pay_per_crawl, pay_per_inference), any_can_veto combinator lattice
  - PaymentEvidence: `aggregator` field for marketplace/platform identifiers, `splits[]` array for multi-party payment allocation with invariants (party required, amount or share required)
  - Subject Profile: `SubjectProfile` and `SubjectProfileSnapshot` optional catalogues for actor identity (human, org, agent); Section 8.4 privacy guidance
- **v0.9.15 (2025-01-18)**: Initial normative behavior specification with control chain, SSRF protection, DPoP verification, and privacy constraints
