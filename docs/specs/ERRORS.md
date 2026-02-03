# PEAC Error Registry

Normative error codes for PEAC Protocol v0.9.

## Format

| Code | Category | Severity | Retryable | HTTP | Description | Remediation |
| ---- | -------- | -------- | --------- | ---- | ----------- | ----------- |

## Validation Errors (400)

| Code                      | Category   | Severity | Retryable | HTTP | Description                                                                 | Remediation                                                                          |
| ------------------------- | ---------- | -------- | --------- | ---- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `E_CONTROL_REQUIRED`      | validation | error    | false     | 400  | Control block required when payment present or enforcement.method==http-402 | Add control{} block to auth context                                                  |
| `E_INVALID_ENVELOPE`      | validation | error    | false     | 400  | Receipt envelope structure is invalid                                       | Ensure envelope has auth, evidence, and meta blocks                                  |
| `E_INVALID_CONTROL_CHAIN` | validation | error    | false     | 400  | Control chain is invalid or inconsistent                                    | Ensure chain is non-empty and decision matches chain results                         |
| `E_INVALID_PAYMENT`       | validation | error    | false     | 400  | Payment evidence is malformed or incomplete                                 | Verify payment has required fields (scheme, reference, amount, currency, asset, env) |
| `E_INVALID_POLICY_HASH`   | validation | error    | false     | 400  | Policy hash does not match policy content                                   | Recompute policy_hash as base64url(sha256(JCS(policy)))                              |
| `E_EXPIRED_RECEIPT`       | validation | error    | false     | 401  | Receipt exp claim is in the past                                            | Use a current receipt                                                                |

## Verification Errors (401)

| Code                  | Category     | Severity | Retryable | HTTP | Description                                            | Remediation                                                     |
| --------------------- | ------------ | -------- | --------- | ---- | ------------------------------------------------------ | --------------------------------------------------------------- |
| `E_INVALID_SIGNATURE` | verification | error    | false     | 401  | JWS signature verification failed                      | Ensure receipt is signed with correct private key and alg=EdDSA |
| `E_SSRF_BLOCKED`      | verification | error    | false     | 403  | SSRF protection blocked request to private/metadata IP | Use only public HTTPS URLs for JWKS/policy endpoints            |
| `E_DPOP_REPLAY`       | verification | error    | false     | 403  | DPoP nonce has already been used                       | Generate a fresh DPoP proof with new nonce                      |
| `E_DPOP_INVALID`      | verification | error    | false     | 403  | DPoP proof is invalid or malformed                     | Ensure DPoP JWT has correct claims (jkt, iat, htm, htu)         |

## Control Errors (403)

| Code               | Category | Severity | Retryable | HTTP | Description             | Remediation                    |
| ------------------ | -------- | -------- | --------- | ---- | ----------------------- | ------------------------------ |
| `E_CONTROL_DENIED` | control  | error    | false     | 403  | Control decision denied | Check control chain for reason |

## Infrastructure Errors (429/502/503)

| Code                    | Category       | Severity | Retryable | HTTP | Description                            | Remediation                                       |
| ----------------------- | -------------- | -------- | --------- | ---- | -------------------------------------- | ------------------------------------------------- |
| `E_JWKS_FETCH_FAILED`   | infrastructure | error    | true      | 502  | Failed to fetch JWKS from issuer       | Retry after delay; check JWKS URL is accessible   |
| `E_POLICY_FETCH_FAILED` | infrastructure | error    | true      | 502  | Failed to fetch policy from policy_uri | Retry after delay; check policy URI is accessible |
| `E_NETWORK_ERROR`       | infrastructure | error    | true      | 502  | Generic network/transport failure      | Retry after delay                                 |
| `E_RATE_LIMITED`        | infrastructure | error    | true      | 429  | Rate limit exceeded                    | Retry after Retry-After header value              |

## HTTP Status Semantics (401 vs 403)

PEAC follows standard HTTP semantics for authentication and authorization errors:

| Status  | Meaning                              | When to Use                                                    | Client Action                      |
| ------- | ------------------------------------ | -------------------------------------------------------------- | ---------------------------------- |
| **401** | Unauthorized (missing/invalid creds) | Attestation missing, expired, not yet valid, signature invalid | Retry with valid attestation       |
| **403** | Forbidden (denied by policy)         | Authenticated but control decision was deny                    | Do not retry with same credentials |

**Key distinction:**

- **401**: "I don't know who you are" or "your credentials are invalid" - client CAN retry with different/renewed credentials
- **403**: "I know who you are, but you're not allowed" - retrying with same identity won't help

## Attestation Temporal Validity (401 Convention)

Attestations (agent identity, attribution, dispute) use **401** for temporal validity errors,
while receipts use **400**. This distinction reflects their different roles:

| Credential Type | Temporal Error                               | HTTP Status | Rationale                                                                  |
| --------------- | -------------------------------------------- | ----------- | -------------------------------------------------------------------------- |
| Receipt         | E_EXPIRED, E_NOT_YET_VALID                   | 400         | Receipts are data objects - temporal issues are validation failures        |
| Attestation     | `E_{TYPE}_EXPIRED`, `E_{TYPE}_NOT_YET_VALID` | 401         | Attestations are credentials - temporal issues are authentication failures |

**Affected error codes:**

- `E_IDENTITY_NOT_YET_VALID`, `E_IDENTITY_EXPIRED` (401)
- `E_ATTRIBUTION_NOT_YET_VALID`, `E_ATTRIBUTION_EXPIRED` (401)
- `E_DISPUTE_NOT_YET_VALID`, `E_DISPUTE_EXPIRED` (401)

This convention treats attestations as token-like credentials that authenticate the presenter.
An expired or not-yet-valid attestation is analogous to an expired OAuth token - an auth failure (401),
not a format error (400).

### WWW-Authenticate Header (RFC 9110 Requirement)

Per [RFC 9110 Section 15.5.2](https://www.rfc-editor.org/rfc/rfc9110#section-15.5.2), 401 responses
**MUST** include a `WWW-Authenticate` header with at least one authentication challenge.

PEAC defines the `PEAC-Attestation` authentication scheme for attestation-based authentication:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: PEAC-Attestation realm="peac", attestation_type="identity"
Content-Type: application/problem+json

{
  "type": "https://www.peacprotocol.org/errors#E_IDENTITY_EXPIRED",
  "title": "Identity Attestation Expired",
  "status": 401,
  "detail": "The agent identity attestation has expired.",
  "instance": "/api/resource/123"
}
```

### WWW-Authenticate Parameters

Parameters follow [RFC 9110 auth-param syntax](https://www.rfc-editor.org/rfc/rfc9110#section-11.2):
`parameter = token "=" ( token / quoted-string )`.

| Parameter           | Required | Type          | Values                               | Description                      |
| ------------------- | -------- | ------------- | ------------------------------------ | -------------------------------- |
| `realm`             | Yes      | quoted-string | `"peac"`                             | Fixed realm identifier           |
| `attestation_type`  | Yes      | token         | `identity`, `attribution`, `dispute` | Attestation type required/failed |
| `error`             | No       | token         | Error code (e.g., `expired`)         | Machine-readable error category  |
| `error_description` | No       | quoted-string | Human-readable message               | Explanation for debugging        |

**Example challenges:**

```http
# Missing agent identity attestation
WWW-Authenticate: PEAC-Attestation realm="peac", attestation_type=identity

# Expired identity attestation
WWW-Authenticate: PEAC-Attestation realm="peac", attestation_type=identity, error=expired, error_description="Attestation expired at 2026-01-06T12:00:00Z"

# Invalid signature on attribution attestation
WWW-Authenticate: PEAC-Attestation realm="peac", attestation_type=attribution, error=invalid_signature

# Dispute attestation not yet valid
WWW-Authenticate: PEAC-Attestation realm="peac", attestation_type=dispute, error=not_yet_valid
```

**Error tokens (for `error` parameter):**

| Token               | Meaning                         |
| ------------------- | ------------------------------- |
| `missing`           | No attestation provided         |
| `expired`           | Attestation `exp` in the past   |
| `not_yet_valid`     | Attestation `iat` in the future |
| `invalid_signature` | Signature verification failed   |
| `invalid_format`    | Malformed attestation structure |
| `key_unknown`       | Signing key not found           |
| `key_expired`       | Signing key expired             |
| `key_revoked`       | Signing key revoked             |

Implementations MUST include the `WWW-Authenticate` header when returning 401 for attestation errors.
Failure to include this header violates HTTP semantics and may cause interoperability issues.

See also: [Error Catalog](../api/error-catalog.md) for RFC 9457 response format.

## Error Response Format

All errors MUST be returned in this JSON structure:

```json
{
  "code": "E_CONTROL_REQUIRED",
  "category": "validation",
  "severity": "error",
  "retryable": false,
  "http_status": 400,
  "pointer": "/auth/control",
  "remediation": "Add control{} block when payment{} is present",
  "details": {
    "payment_present": true,
    "control_present": false
  }
}
```

### Fields

- **code** (string, required): Error code from registry
- **category** (string, required): `validation` | `verification` | `infrastructure` | `control` | `attribution` | `identity` | `dispute`
- **severity** (string, required): `error` | `warning`
- **retryable** (boolean, required): Whether client should retry
- **http_status** (number, optional): Suggested HTTP status code
- **pointer** (string, optional): RFC 6901 JSON Pointer to problematic field
- **remediation** (string, optional): Human-readable fix guidance
- **details** (object, optional): Implementation-specific error context

## Adding New Error Codes

To add a new error code:

1. Choose a unique code following pattern `E_{CATEGORY}_{SPECIFIC}`
2. Add to this registry table
3. Add to `packages/schema/src/errors.ts` ERROR_CODES constant
4. Add test vectors demonstrating the error
5. Document in relevant package README

## Interaction Evidence Validation Semantics (v0.10.7+)

The `InteractionEvidenceV01` extension uses layered error codes with specific validation precedence.
These semantics are normative for conformant implementations.

### Error Code Layers

| Prefix            | Layer              | Meaning                                              |
| ----------------- | ------------------ | ---------------------------------------------------- |
| `E_INTERACTION_*` | Profile validation | Schema/format errors in the interaction extension    |
| `W_INTERACTION_*` | Warnings           | Non-fatal issues (valid but potentially problematic) |

### Validation Precedence (Normative)

Validators MUST check in this order, returning the first error encountered:

1. **Type check**: Input must be a plain object (not null, not array)
2. **Required fields**: `interaction_id`, `kind`, `executor.platform`, `started_at`
3. **Field format**: Regex patterns, length limits, datetime parsing
4. **Reserved prefixes**: `peac.*` and `org.peacprotocol.*` kinds not in registry
5. **Target consistency**: `tool.*` requires `tool` field; `http.*`/`fs.*` requires `resource.uri`
6. **Timing invariants**: `completed_at >= started_at`
7. **Error detail requirement**: `result.status=error` requires `error_code` or extensions

### Semantic Decisions (Normative)

These validation behaviors are intentional and stable:

| Input                              | Error Code                         | Rationale                              |
| ---------------------------------- | ---------------------------------- | -------------------------------------- |
| `Array.isArray(input)`             | `E_INTERACTION_INVALID_FORMAT`     | Arrays are objects but not valid input |
| `kind: ""`                         | `E_INTERACTION_MISSING_KIND`       | Empty string is semantically missing   |
| `started_at: "not-a-date"`         | `E_INTERACTION_MISSING_STARTED_AT` | Unparseable datetime is unusable       |
| `completed_at < started_at`        | `E_INTERACTION_INVALID_TIMING`     | Relational timing constraint violation |
| `resource: {}` for `http.*`/`fs.*` | `E_INTERACTION_MISSING_TARGET`     | Must have meaningful `uri` field       |

**Key distinction**: `E_INTERACTION_INVALID_TIMING` is reserved exclusively for relational
constraints between fields (e.g., `completed_at` before `started_at`). Format/parsing
errors use `E_INTERACTION_MISSING_*` codes.

### Interaction Error Codes

| Code                                  | HTTP | Description                                     |
| ------------------------------------- | ---- | ----------------------------------------------- |
| `E_INTERACTION_INVALID_FORMAT`        | 400  | Input is not a valid object                     |
| `E_INTERACTION_MISSING_ID`            | 400  | Missing or empty `interaction_id`               |
| `E_INTERACTION_MISSING_KIND`          | 400  | Missing or empty `kind`                         |
| `E_INTERACTION_INVALID_KIND_FORMAT`   | 400  | Kind fails format validation                    |
| `E_INTERACTION_KIND_RESERVED`         | 400  | Kind uses reserved prefix not in registry       |
| `E_INTERACTION_MISSING_EXECUTOR`      | 400  | Missing `executor` or `executor.platform`       |
| `E_INTERACTION_MISSING_STARTED_AT`    | 400  | Missing or unparseable `started_at`             |
| `E_INTERACTION_INVALID_TIMING`        | 400  | `completed_at < started_at`                     |
| `E_INTERACTION_MISSING_TARGET`        | 400  | Kind requires target field not present          |
| `E_INTERACTION_INVALID_DIGEST`        | 400  | Digest value not 64 lowercase hex               |
| `E_INTERACTION_INVALID_DIGEST_ALG`    | 400  | Unknown digest algorithm                        |
| `E_INTERACTION_MISSING_RESULT`        | 400  | Output present but no `result.status`           |
| `E_INTERACTION_MISSING_ERROR_DETAIL`  | 400  | Error status without `error_code` or extensions |
| `E_INTERACTION_INVALID_EXTENSION_KEY` | 400  | Extension key not properly namespaced           |

### Interaction Warning Codes

| Code                              | Description                                 |
| --------------------------------- | ------------------------------------------- |
| `W_INTERACTION_KIND_UNREGISTERED` | Kind not in well-known registry             |
| `W_INTERACTION_MISSING_TARGET`    | No tool or resource field (non-strict kind) |

## Version History

- **v0.10.7**: Added Interaction Evidence error codes and validation semantics
- **v0.9.15**: Initial error registry with structured error model
